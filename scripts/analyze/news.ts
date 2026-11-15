/**
 * 뉴스 편향 분석 → news_analysis(점수) + news_evidence(근거) + api_usage(비용)
 *
 *   npm run analyze:news              # 예산 안에서 최대 15건
 *   npm run analyze:news -- 50        # 이번 실행 최대 건수 지정 (예산이 먼저 막으면 그 전에 멈춤)
 *
 * 흐름: 정당·여야 기사 중 아직 안 한 최신 기사 → 본문 가져오기(저장 안 함) → Claude 가 근거 추출
 *      → 원문에 없는 근거 버림 → 규칙으로 점수 계산 → 저장. 호출마다 비용을 api_usage 에 기록.
 * 예산: budget.ts — 충전액을 기간 전체 총액으로 보고 하루 몫을 넘지 않게 함. 기사 1건 전에 매번 확인.
 * 끝나면 비용과 Supabase DB 잔여 용량(storage.ts)을 보고. GitHub Actions 에서는 실행 화면 Summary 에도 표로 남김.
 * 분석 버전(MODEL_VERSION)이 바뀌면 예전 버전으로 분석된 기사도 다시 분석한다.
 */
import { appendFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { apiUsage, newsAnalysis, newsArticles, newsEvidence } from "../../src/db/schema";
import { db, env, run, sleep } from "../collectors/common";
import { fetchBody } from "./body";
import { allowance, estimateNext, readBudget, startOfKstDay } from "./budget";
import { extractEvidence, MODEL, MODEL_VERSION, type Usage } from "./claude";
import { score } from "./score";
import { readLimitBytes, storageLine, storageReport } from "./storage";

const DEFAULT_MAX = 15;
/** 제목에 정당·여야 표현이 있는 기사만 (비용을 정치 기사에만 쓰기 위해) */
const POLITICAL_TITLE = "(민주당|국민의힘|국힘|조국혁신당|개혁신당|진보당|정의당|여당|야당|與|野|여야|대통령실|원내대표)";

async function spentSince(from: Date): Promise<number> {
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${apiUsage.costUsd}), 0)::float8` })
    .from(apiUsage)
    .where(gte(apiUsage.createdAt, from));
  return r.s;
}

async function recentCosts(): Promise<number[]> {
  const rows = await db
    .select({ c: apiUsage.costUsd })
    .from(apiUsage)
    .where(eq(apiUsage.model, MODEL))
    .orderBy(desc(apiUsage.createdAt))
    .limit(20);
  return rows.map((r) => r.c);
}

async function logUsage(newsId: string, u: Usage, note: string) {
  await db.insert(apiUsage).values({
    newsId,
    model: u.model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    costUsd: u.costUsd,
    note,
  });
}

run(async () => {
  env("ANTHROPIC_API_KEY");
  const max = Number(process.argv[2]) || DEFAULT_MAX;
  const budget = readBudget();

  const todo = await db
    .select({ id: newsArticles.id, url: newsArticles.url, title: newsArticles.title, summary: newsArticles.summary })
    .from(newsArticles)
    .leftJoin(newsAnalysis, eq(newsAnalysis.newsId, newsArticles.id))
    .where(
      and(
        sql`${newsArticles.title} ~ ${POLITICAL_TITLE}`,
        or(isNull(newsAnalysis.newsId), ne(newsAnalysis.modelVersion, MODEL_VERSION)),
      ),
    )
    .orderBy(desc(newsArticles.publishedAt))
    .limit(max);

  const count = { done: 0, noBody: 0, unassessable: 0, failed: 0 };
  let spentRun = 0;
  let stopReason = todo.length ? "" : "분석할 정당·여야 기사가 없음";

  for (const a of todo) {
    // 기사 1건마다 예산 확인: 다음 1건 예상 비용을 오늘 몫이 감당할 수 있을 때만 진행
    const now = new Date();
    const [spentTotal, spentToday, costs] = await Promise.all([
      spentSince(budget.from),
      spentSince(startOfKstDay(now)),
      recentCosts(),
    ]);
    const left = allowance(budget, spentTotal, spentToday, now);
    const next = estimateNext(costs);
    if (left.stop || left.todayUsd < next) {
      stopReason = left.stop ?? `오늘 몫이 부족함 (남은 $${left.todayUsd.toFixed(4)} < 예상 $${next.toFixed(4)})`;
      break;
    }

    const fetched = await fetchBody(a.url);
    if (!fetched.body) count.noBody++;

    let result;
    try {
      result = await extractEvidence({ title: a.title, summary: a.summary, body: fetched.body });
    } catch (e) {
      // 키·권한·잔액 오류는 모든 기사에서 똑같이 실패하므로 바로 멈춤. 그 밖(한도·일시 오류)은 SDK 재시도 뒤이므로 이 기사만 건너뜀
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw e;
      if (e instanceof Anthropic.BadRequestError && /credit|balance/i.test(e.message)) throw new Error(`API 잔액 부족: ${e.message}`);
      if (!(e instanceof Anthropic.APIError)) throw e;
      result = { ok: false as const, reason: `API ${e.status ?? "연결"} 오류`, usage: null };
    }
    if (result.usage) {
      spentRun += result.usage.costUsd;
      await logUsage(a.id, result.usage, result.ok ? "ok" : result.reason);
    }
    if (!result.ok) {
      count.failed++;
      console.log(`  [건너뜀] ${a.title.slice(0, 40)} — ${result.reason}`);
      continue;
    }

    const s = score(result.evidence, { assessable: result.assessable, hasBody: !!fetched.body });
    if (s.lean === null) count.unassessable++;
    const analysis = { bias: s.bias, lean: s.lean, confidence: s.confidence, biasSignals: s.signals, modelVersion: MODEL_VERSION };
    const evidence = result.evidence;

    await db.transaction(async (tx) => {
      await tx
        .insert(newsAnalysis)
        .values({ newsId: a.id, ...analysis })
        .onConflictDoUpdate({ target: newsAnalysis.newsId, set: { ...analysis, analyzedAt: new Date() } });
      await tx.delete(newsEvidence).where(eq(newsEvidence.newsId, a.id));
      if (evidence.length) await tx.insert(newsEvidence).values(evidence.map((e) => ({ newsId: a.id, ...e })));
    });
    count.done++;
    console.log(`  ${s.lean === null ? "판단 불가" : (s.lean > 0 ? "+" : "") + s.lean} · $${result.usage.costUsd.toFixed(4)} · ${a.title.slice(0, 40)}`);
    await sleep(300); // 언론사 서버·API 과호출 방지
  }

  const now = new Date();
  const [spentTotal, spentToday, storage] = await Promise.all([
    spentSince(budget.from),
    spentSince(startOfKstDay(now)),
    measureStorage().catch((e) => (console.log("  (DB 용량 계산 실패:", e instanceof Error ? e.message : e, ")"), null)),
  ]);
  const left = allowance(budget, spentTotal, spentToday, now);
  console.log(
    `✅ ${MODEL_VERSION} 분석 ${count.done}건 저장 (판단 불가 ${count.unassessable}건, 본문 없이 ${count.noBody}건) · 건너뜀 ${count.failed}건` +
      `\n   이번 실행 $${spentRun.toFixed(4)} · 오늘 $${spentToday.toFixed(4)} (오늘 남은 몫 $${left.todayUsd.toFixed(4)})` +
      ` · 기간 누적 $${spentTotal.toFixed(4)} / $${budget.totalUsd}` +
      (stopReason ? `\n   멈춘 이유: ${stopReason}` : "") +
      (storage ? `\n   ${storageLine(storage)}` : ""),
  );

  // GitHub Actions 실행 화면(Summary)에도 같은 보고를 표로 남김
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const rows = [
      ["분석", `${count.done}건 (판단 불가 ${count.unassessable}, 본문 없이 ${count.noBody}, 건너뜀 ${count.failed})`],
      ["이번 실행 비용", `$${spentRun.toFixed(4)}`],
      ["오늘 비용 / 남은 몫", `$${spentToday.toFixed(4)} / $${left.todayUsd.toFixed(4)}`],
      // until 은 한국 날짜 0시 → UTC 로 찍으면 하루 전 날짜가 나와서 한국 날짜로 표시
      ["기간 누적 / 예산", `$${spentTotal.toFixed(4)} / $${budget.totalUsd} (${new Date(budget.until.getTime() + 9 * 3600_000).toISOString().slice(0, 10)} 0시에 멈춤)`],
      ...(stopReason ? [["멈춘 이유", stopReason]] : []),
      ...(storage
        ? [
            ["Supabase DB", `${storage.usedMb.toFixed(1)} / ${storage.limitMb.toFixed(0)} MB (${storage.usedPct.toFixed(1)}%)`],
            ["남은 용량", `${storage.freeMb.toFixed(1)} MB`],
            ["하루 증가 / 남은 날", `+${storage.mbPerDay.toFixed(1)} MB / ${storage.daysLeft === null ? "증가 없음" : `약 ${storage.daysLeft}일`}`],
            ...(storage.warning ? [["⚠️ 경고", storage.warning]] : []),
          ]
        : []),
    ];
    appendFileSync(
      summaryFile,
      `### 뉴스 편향 분석 (${MODEL_VERSION})\n\n| 항목 | 값 |\n|---|---|\n${rows.map(([k, v]) => `| ${k} | ${v} |`).join("\n")}\n`,
    );
  }
});

/** Supabase DB 잔여 용량: 전체 크기, 기사와 함께 늘어나는 표 크기, 최근 7일 하루 평균 신규 기사 수 */
async function measureStorage() {
  const [r] = await db.execute<{ db: string; news: string; articles: number; week: number }>(sql`
    select pg_database_size(current_database())::text as db,
           (pg_total_relation_size('news_articles') + pg_total_relation_size('news_mentions')
            + pg_total_relation_size('news_analysis') + pg_total_relation_size('news_evidence'))::text as news,
           (select count(*)::int from news_articles) as articles,
           (select count(*)::int from news_articles where collected_at > now() - interval '7 days') as week`);
  return storageReport({
    dbBytes: Number(r.db),
    limitBytes: readLimitBytes(),
    newsBytes: Number(r.news),
    articleCount: r.articles,
    articlesPerDay: r.week / 7,
  });
}
