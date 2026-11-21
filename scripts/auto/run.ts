/**
 * 기관별 자동 수집 스케줄러 — 손으로 npm run collect:* 를 돌리지 않아도 데이터가 알아서 최신으로 유지되게 하는 백엔드.
 *
 *   npm run auto                          # 때가 됐고 오늘 호출 한도가 남은 수집기만 실행 (GitHub Actions 가 매시간 실행)
 *   npm run auto -- --dry                 # 실행하지 않고 계획만 보기 (무엇이 언제 도는지, 기관별 오늘 호출 수)
 *   npm run auto -- --only assembly       # 한 기관만 (assembly | data_go_kr | kosis)
 *   npm run auto -- --job votes           # 이 작업만 지금 실행 (주기는 무시, 하루 호출 한도 검사는 그대로)
 *   npm run auto -- --only kosis --force  # 그 기관 작업 전부 지금 실행
 *
 * 흐름
 *   1) collect_log 표 준비(없으면 만듦) → 작업별 마지막 성공 시각, 기관별 오늘 쓴 호출 수 읽기
 *   2) 작업마다 decide(): 인증키 있음? 기관이 오늘 한도 초과로 답했나? 앞 단계 실패? 주기가 됐나? 오늘 남은 호출이 충분한가?
 *   3) 실행할 작업은 수집기를 별도 프로세스로 띄우고 "이번 최대 호출 수"를 넘겨 줌 (scripts/collectors/api-fetch.ts 가 지킴)
 *   4) 호출 수·결과를 collect_log 에 기록하고, 요약 표를 화면(그리고 GitHub Actions Summary)에 남김
 * 기관·작업·주기·한도 정의는 src/lib/collect-schedule.ts 한 곳에만 있음.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENCIES,
  AGENCY_ORDER,
  JOBS,
  decide,
  everyText,
  remainingCalls,
  retryAfterMin,
  type AgencyId,
  type Decision,
  type Job,
} from "../../src/lib/collect-schedule";
import { db, run } from "../collectors/common";
import { closeStaleRuns, ensureCollectLog, finishRun, loadState, startRun } from "./log";

const JOB_TIMEOUT_MS = 15 * 60_000;

interface Options {
  dry: boolean;
  force: boolean;
  only: AgencyId | null;
  job: string | null;
}

function readOptions(argv = process.argv.slice(2), env = process.env): Options {
  const value = (flag: string) => {
    const i = argv.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
    if (i < 0) return null;
    return argv[i].includes("=") ? argv[i].split("=")[1] : (argv[i + 1] ?? null);
  };
  // GitHub Actions 의 Run workflow 입력값은 환경변수로 들어옴 (AUTO_ONLY, AUTO_FORCE)
  const onlyRaw = value("--only") ?? (env.AUTO_ONLY && env.AUTO_ONLY !== "all" ? env.AUTO_ONLY : null);
  if (onlyRaw && !(onlyRaw in AGENCIES)) throw new Error(`--only 는 ${AGENCY_ORDER.join(" | ")} 중 하나 (받은 값: ${onlyRaw})`);
  const job = value("--job");
  if (job && !JOBS.some((j) => j.id === job)) throw new Error(`--job 은 ${JOBS.map((j) => j.id).join(" | ")} 중 하나 (받은 값: ${job})`);
  return {
    dry: argv.includes("--dry"),
    force: argv.includes("--force") || env.AUTO_FORCE === "true",
    only: onlyRaw as AgencyId | null,
    job,
  };
}

/** 예약 실행 / Run workflow 버튼 / 내 PC */
function triggerName(env = process.env): string {
  if (env.GITHUB_EVENT_NAME === "schedule") return "schedule";
  if (env.GITHUB_EVENT_NAME) return "button";
  return "local";
}

/** 키 값이 출력·기록에 섞여 들어가지 않게 지움 */
function redact(text: string): string {
  let out = text;
  for (const name of [...AGENCY_ORDER.map((a) => AGENCIES[a].keyEnv), "DATABASE_URL"]) {
    const v = process.env[name]?.trim();
    if (v && v.length >= 6) out = out.split(v).join("***");
  }
  return out;
}

const hasKey = (a: AgencyId) => !!process.env[AGENCIES[a].keyEnv]?.trim();

/** '11/21 04:00' (한국 시간) */
function kst(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000).toISOString();
  return `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))} ${k.slice(11, 16)}`;
}

interface ChildResult {
  code: number | null;
  calls: number;
  quotaHit: boolean;
  capHit: boolean;
  lastLine: string;
}

/** 수집기를 별도 프로세스로 실행 (한 수집기가 죽어도 다른 기관은 계속) */
function runCollector(job: Job, cap: number): Promise<ChildResult> {
  const file = join(tmpdir(), `collect-${job.id}-${process.pid}-${Date.now()}.json`);
  const args = job.args?.(cap) ?? [];
  console.log(`  ▶ ${job.name} — ${job.script} ${args.join(" ")} (이번 최대 ${cap}회)`);
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, ["--import", "tsx", job.script, ...args], {
      env: { ...process.env, COLLECT_AGENCY: job.agency, COLLECT_CALL_LIMIT: String(cap), COLLECT_CALLS_FILE: file },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let lastLine = "";
    let failLine = "";
    const onData = (buf: Buffer) => {
      for (const line of buf.toString("utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        const safe = redact(line);
        console.log(`    │ ${safe}`);
        lastLine = safe.trim();
        if (safe.startsWith("[실패]")) failLine = safe.trim();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      failLine = `[실패] ${JOB_TIMEOUT_MS / 60_000}분 안에 끝나지 않아 멈춤`;
      child.kill("SIGTERM");
    }, JOB_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      let stats = { counts: {} as Record<string, number>, quotaHit: null as string | null, capHit: false };
      if (existsSync(file)) {
        try {
          stats = JSON.parse(readFileSync(file, "utf8"));
        } catch {
          /* 쓰는 도중 멈춘 경우: 호출 수 0 으로 봄 */
        }
        rmSync(file, { force: true });
      }
      resolveResult({
        code,
        calls: stats.counts[job.agency] ?? 0,
        quotaHit: stats.quotaHit === job.agency,
        capHit: stats.capHit,
        lastLine: failLine || lastLine,
      });
    });
  });
}

interface Row {
  job: Job;
  result: string;
  calls: number | null;
  next: string;
}

run(async () => {
  const opt = readOptions();
  const now = new Date();
  const trigger = triggerName();

  await ensureCollectLog(db);
  if (!opt.dry) await closeStaleRuns(db, now);
  const state = await loadState(db, now);
  const used = new Map(state.usedToday);

  const jobs = JOBS.filter((j) => (!opt.only || j.agency === opt.only) && (!opt.job || j.id === opt.job));
  console.log(
    `■ 자동 수집 ${kst(now)} (${trigger}${opt.dry ? ", 계획만" : ""}${opt.force ? ", 강제" : ""}) — 작업 ${jobs.length}개` +
      (opt.only ? ` · 기관 ${opt.only}` : "") +
      (opt.job ? ` · 작업 ${opt.job}` : ""),
  );

  const failedThisRound = new Set<string>();
  const rows: Row[] = [];
  let failures = 0;

  for (const job of jobs) {
    const agency = AGENCIES[job.agency];
    const history = state.history.get(job.id) ?? { lastOkAt: null, lastAt: null, lastStatus: null };
    const d: Decision = decide(job, {
      hasKey: hasKey(job.agency),
      agencyBlocked: state.blockedToday.has(job.agency),
      failedThisRound,
      history,
      usedToday: used.get(job.agency) ?? 0,
      now,
      force: opt.force || opt.job === job.id,
    });

    if (!d.run) {
      rows.push({ job, result: `건너뜀: ${d.reason}`, calls: null, next: d.nextAt ? kst(d.nextAt) : "—" });
      continue;
    }
    if (opt.dry) {
      rows.push({ job, result: `실행 예정: ${d.reason}`, calls: null, next: "지금" });
      continue;
    }

    console.log(`\n[${agency.name}] ${job.name}: ${d.reason}`);
    const id = await startRun(db, { job: job.id, agency: job.agency, trigger });
    const r = await runCollector(job, d.cap);
    const status = r.quotaHit ? "quota" : r.code === 0 ? "ok" : "failed";
    const message = r.capHit && status !== "ok" ? `이번 최대 호출 ${d.cap}회에 닿아 멈춤 — ${r.lastLine}` : r.lastLine;
    await finishRun(db, id, { status, calls: r.calls, message });
    used.set(job.agency, (used.get(job.agency) ?? 0) + r.calls);

    if (status !== "ok") {
      failedThisRound.add(job.id);
      if (status === "failed") failures++;
      if (status === "quota") state.blockedToday.add(job.agency);
    }
    const label = status === "ok" ? "✅ 성공" : status === "quota" ? "⚠️ 기관 하루 한도 초과" : "❌ 실패";
    const next =
      status === "ok"
        ? kst(new Date(Date.now() + job.everyMin * 60_000))
        : status === "quota"
          ? "한국 자정 뒤"
          : `${retryAfterMin(job) / 60}시간 뒤 다시`;
    rows.push({ job, result: `${label}: ${message}`, calls: r.calls, next });
  }

  // ── 요약 ──
  const agencyLines = AGENCY_ORDER.map((a) => {
    const ag = AGENCIES[a];
    const u = used.get(a) ?? 0;
    const usable = Math.floor(ag.dailyLimit * ag.safety);
    return {
      a,
      text: `${ag.name}: 오늘 ${u.toLocaleString("ko-KR")} / ${usable.toLocaleString("ko-KR")}회 (하루 한도 ${ag.dailyLimit.toLocaleString("ko-KR")}회의 ${Math.round(ag.safety * 100)}%, 남은 ${remainingCalls(ag, u).toLocaleString("ko-KR")}회)${hasKey(a) ? "" : " · 인증키 없음"}`,
    };
  });
  console.log(`\n■ 기관별 오늘 호출 (한국 자정에 초기화)`);
  for (const l of agencyLines) console.log(`  ${l.text}`);
  console.log(`■ 작업별 결과`);
  for (const r of rows) {
    console.log(`  [${AGENCIES[r.job.agency].name}] ${r.job.name} (${everyText(r.job.everyMin)}마다): ${r.result}${r.calls !== null ? ` · 호출 ${r.calls}회` : ""} · 다음 ${r.next}`);
  }

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
    appendFileSync(
      summaryFile,
      `### 기관별 자동 수집 (${kst(now)} KST, ${trigger}${opt.force ? ", 강제" : ""})\n\n` +
        `| 기관 | 오늘 호출 / 자동 수집 몫 | 하루 한도(토큰) | 성향 |\n|---|---|---|---|\n` +
        AGENCY_ORDER.map((a) => {
          const ag = AGENCIES[a];
          const u = used.get(a) ?? 0;
          return `| ${ag.name}${hasKey(a) ? "" : " (인증키 없음)"} | ${u} / ${Math.floor(ag.dailyLimit * ag.safety)} | ${ag.dailyLimit.toLocaleString("ko-KR")} — ${cell(ag.limitNote)} | ${cell(ag.character)} |`;
        }).join("\n") +
        `\n\n| 기관 | 작업 | 주기 | 결과 | 호출 | 다음 예정 |\n|---|---|---|---|---|---|\n` +
        rows
          .map((r) => `| ${AGENCIES[r.job.agency].name} | ${r.job.name} | ${everyText(r.job.everyMin)} | ${cell(r.result)} | ${r.calls ?? "—"} | ${r.next} |`)
          .join("\n") +
        "\n",
    );
  }

  if (failures) throw new Error(`실패한 작업 ${failures}개 — 위 로그를 확인하세요 (다음 회차에 다시 시도합니다)`);
});
