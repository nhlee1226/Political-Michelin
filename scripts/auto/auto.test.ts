/**
 * 기관별 자동 수집 규칙 테스트 (DB·네트워크·API 키 없이 실행).  실행: npm test
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  AGENCIES,
  AGENCY_ORDER,
  JOBS,
  SLACK_MIN,
  decide,
  dueState,
  everyText,
  remainingCalls,
  startOfKstDay,
  type Job,
  type JobHistory,
} from "../../src/lib/collect-schedule";
import { apiFetch, CallLimitError, callCounts } from "../collectors/api-fetch";

const job = (id: string) => JOBS.find((j) => j.id === id)!;
const at = (iso: string) => new Date(iso);
const never: JobHistory = { lastOkAt: null, lastAt: null, lastStatus: null };
const ctx = (over: Partial<Parameters<typeof decide>[1]> = {}) => ({
  hasKey: true,
  agencyBlocked: false,
  failedThisRound: new Set<string>(),
  history: never,
  usedToday: 0,
  now: at("2026-11-20T03:00:00Z"),
  force: false,
  ...over,
});

test("작업 목록: 기관·수집기 파일·앞 단계 순서·호출 수가 맞게 정의됨", () => {
  const ids = new Set<string>();
  for (const j of JOBS) {
    assert.ok(!ids.has(j.id), `작업 id 중복: ${j.id}`);
    assert.ok(AGENCIES[j.agency], `없는 기관: ${j.agency}`);
    assert.ok(existsSync(j.script), `수집기 파일 없음: ${j.script}`);
    assert.ok(j.estCalls <= j.maxCalls, `${j.id}: 예상 호출이 최대보다 큼`);
    for (const d of j.after ?? []) assert.ok(ids.has(d), `${j.id} 의 앞 단계 ${d} 가 먼저 나와야 함`);
    ids.add(j.id);
  }
  for (const a of AGENCY_ORDER) assert.ok(JOBS.some((j) => j.agency === a), `${a} 에 작업이 없음`);
});

test("한국 날짜 0시: UTC 15시 이후는 다음 날", () => {
  assert.equal(startOfKstDay(at("2026-11-20T14:59:00Z")).toISOString(), "2026-11-19T15:00:00.000Z");
  assert.equal(startOfKstDay(at("2026-11-20T15:00:00Z")).toISOString(), "2026-11-20T15:00:00.000Z");
});

test("주기: 기록이 없으면 처음 실행, 주기 전이면 대기, 주기가 되면 실행 (몇 분 이른 깨움 허용)", () => {
  const members = job("members"); // 하루
  const now = at("2026-11-20T03:00:00Z");
  assert.equal(dueState(members, never, now).due, true);

  const ok = (iso: string): JobHistory => ({ lastOkAt: at(iso), lastAt: at(iso), lastStatus: "ok" });
  const early = dueState(members, ok("2026-11-19T12:00:00Z"), now);
  assert.equal(early.due, false);
  assert.equal(early.nextAt.toISOString(), "2026-11-20T12:00:00.000Z");

  const slackOk = new Date(now.getTime() - (24 * 60 - SLACK_MIN + 1) * 60_000).toISOString();
  assert.equal(dueState(members, ok(slackOk), now).due, true);
});

test("실패하면 주기와 2시간 중 짧은 쪽만큼 기다렸다 다시 시도", () => {
  const nec = job("nec"); // 30일 주기 → 2시간 뒤 재시도
  const failed = (iso: string): JobHistory => ({ lastOkAt: at("2026-11-01T00:00:00Z"), lastAt: at(iso), lastStatus: "failed" });
  assert.equal(dueState(nec, failed("2026-11-20T02:00:00Z"), at("2026-11-20T03:00:00Z")).due, false);
  assert.equal(dueState(nec, failed("2026-11-20T00:30:00Z"), at("2026-11-20T03:00:00Z")).due, true);
});

test("남은 호출: 하루 한도 × 안전 비율 − 오늘 쓴 수, 0 아래로 안 내려감", () => {
  const a = AGENCIES.data_go_kr; // 10,000 × 0.8
  assert.equal(remainingCalls(a, 0), 8000);
  assert.equal(remainingCalls(a, 7990), 10);
  assert.equal(remainingCalls(a, 9000), 0);
});

test("decide: 인증키 없음 → 기관 한도 초과 → 앞 단계 실패 → 주기 → 남은 호출 순서로 막음", () => {
  const bills = job("bills");
  assert.match((decide(bills, ctx({ hasKey: false })) as { reason: string }).reason, /인증키 없음 \(ASSEMBLY_API_KEY\)/);
  assert.match((decide(bills, ctx({ agencyBlocked: true })) as { reason: string }).reason, /하루 한도 초과/);
  assert.match((decide(bills, ctx({ failedThisRound: new Set(["members"]) })) as { reason: string }).reason, /앞 단계\(members\)/);

  const fresh: JobHistory = { lastOkAt: at("2026-11-20T02:00:00Z"), lastAt: at("2026-11-20T02:00:00Z"), lastStatus: "ok" };
  assert.equal(decide(bills, ctx({ history: fresh })).run, false);

  const usable = Math.floor(AGENCIES.assembly.dailyLimit * AGENCIES.assembly.safety);
  const low = decide(bills, ctx({ usedToday: usable - bills.estCalls + 1 }));
  assert.equal(low.run, false);
  assert.match((low as { reason: string }).reason, /오늘 남은 호출/);
});

test("decide: force 는 주기만 무시하고 하루 한도는 지킴, cap 은 최대 호출과 남은 호출 중 작은 값", () => {
  const votes = job("votes");
  const fresh: JobHistory = { lastOkAt: at("2026-11-20T02:00:00Z"), lastAt: at("2026-11-20T02:00:00Z"), lastStatus: "ok" };
  const forced = decide(votes, ctx({ history: fresh, force: true }));
  assert.deepEqual(forced.run && forced.cap, votes.maxCalls);

  const usable = Math.floor(AGENCIES.assembly.dailyLimit * AGENCIES.assembly.safety);
  const tight = decide(votes, ctx({ force: true, usedToday: usable - 50 }));
  assert.deepEqual(tight.run && tight.cap, 50);

  const blocked = decide(votes, ctx({ force: true, usedToday: usable }));
  assert.equal(blocked.run, false);
});

test("표결 수집 인자: 새 법안만, 재시도 몫을 빼서 법안 수 제한", () => {
  assert.deepEqual(job("votes").args!(400), ["--new-only", "--limit", "200"]);
  assert.deepEqual(job("votes").args!(1), ["--new-only", "--limit", "1"]);
});

test("주기 표기", () => {
  assert.equal(everyText(24 * 60), "하루");
  assert.equal(everyText(7 * 24 * 60), "7일");
  assert.equal(everyText(120), "2시간");
  assert.equal(everyText(45), "45분");
});

test("apiFetch: 기관별로 세고, 최대 호출에 닿으면 멈추고, 한도 초과 응답을 표시함", async () => {
  const dir = mkdtempSync(join(tmpdir(), "apifetch-"));
  const file = join(dir, "calls.json");
  const realFetch = globalThis.fetch;
  const replies: Response[] = [
    new Response('{"ok":true}', { headers: { "content-type": "application/json" } }),
    new Response('{"ok":true}', { headers: { "content-type": "application/json" } }),
    new Response(
      "<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>",
      { headers: { "content-type": "text/xml" } },
    ),
  ];
  globalThis.fetch = (async () => replies.shift()!) as typeof fetch;
  Object.assign(process.env, { COLLECT_AGENCY: "data_go_kr", COLLECT_CALL_LIMIT: "3", COLLECT_CALLS_FILE: file });
  try {
    await apiFetch("data_go_kr", "https://example.test/a");
    await apiFetch("data_go_kr", "https://example.test/b");
    let saved = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(saved.counts.data_go_kr, 2);
    assert.equal(saved.quotaHit, null);

    const res = await apiFetch("data_go_kr", "https://example.test/c");
    assert.match(await res.text(), /returnReasonCode>22/); // 본문은 수집기가 그대로 읽을 수 있음
    saved = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(saved.quotaHit, "data_go_kr");

    // 한도 초과 답을 받은 뒤에는 네트워크로 나가지 않고 바로 멈춤
    await assert.rejects(apiFetch("data_go_kr", "https://example.test/d"), /하루 호출 한도를 넘었다는 답/);
    assert.equal(callCounts().data_go_kr, 3); // 멈춘 호출은 세지 않음

    // 다른 기관: 이번 실행 최대 호출(COLLECT_CALL_LIMIT)에 닿으면 멈춤
    Object.assign(process.env, { COLLECT_AGENCY: "kosis", COLLECT_CALL_LIMIT: "1" });
    globalThis.fetch = (async () => new Response("[]", { headers: { "content-type": "application/json" } })) as typeof fetch;
    await apiFetch("kosis", "https://example.test/k1");
    await assert.rejects(apiFetch("kosis", "https://example.test/k2"), CallLimitError);
    assert.equal(callCounts().kosis, 1);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).capHit, true);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.COLLECT_AGENCY;
    delete process.env.COLLECT_CALL_LIMIT;
    delete process.env.COLLECT_CALLS_FILE;
  }
});

/** 타입 확인용: 작업 정의가 Job 모양을 따름 */
const _typed: Job[] = JOBS;
void _typed;
