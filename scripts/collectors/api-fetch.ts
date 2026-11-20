/**
 * 기관 API 호출 공통 창구 — 열린국회정보·선관위(공공데이터포털)·KOSIS 수집기의 fetch 가 모두 여기를 지나감.
 *   1) 기관별 호출 수를 셈 → 자동 수집 스케줄러(scripts/auto/run.ts)가 collect_log 에 기록해서 인증키 하루 한도를 지킴
 *   2) 기관별 최소 호출 간격을 지킴 (src/lib/collect-schedule.ts 의 minIntervalMs, 예: KOSIS 분당 200회 → 0.3초)
 *   3) 스케줄러가 정해 준 이번 실행 최대 호출 수(COLLECT_CALL_LIMIT)에 닿으면 더 부르지 않고 멈춤
 *   4) 기관이 '하루 한도 초과'로 답하면 표시 → 스케줄러가 그 기관을 한국 자정까지 쉬게 함
 * 손으로 실행할 때(npm run collect:*)는 환경변수가 없으므로 1)·2)만 동작하고 그 밖은 예전과 같음.
 */
import { writeFileSync } from "node:fs";
import { AGENCIES, type AgencyId } from "../../src/lib/collect-schedule";

/** 이번 실행 최대 호출 수에 닿아서 멈춤 (오류가 아니라 한도를 지키려고 멈춘 것) */
export class CallLimitError extends Error {}

const counts: Partial<Record<AgencyId, number>> = {};
const lastCallAt: Partial<Record<AgencyId, number>> = {};
let quotaHit: AgencyId | null = null;
let capHit = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 지금까지 기관별 호출 수 */
export function callCounts(): Partial<Record<AgencyId, number>> {
  return { ...counts };
}

/** 스케줄러가 읽는 파일에 기록 (수집기가 도중에 죽어도 그때까지의 호출 수는 남음) */
function flush() {
  const file = process.env.COLLECT_CALLS_FILE;
  if (file) writeFileSync(file, JSON.stringify({ counts, quotaHit, capHit }));
}

/** 공공데이터포털은 한도 초과를 HTTP 200 + XML(returnReasonCode 22)로 알려 줌 */
const QUOTA_TEXT = /LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS|일일 호출 허용량/;

async function looksLikeQuotaError(res: Response): Promise<boolean> {
  if (res.status === 429) return true;
  if ((res.headers.get("content-type") ?? "").includes("json")) return false;
  try {
    return QUOTA_TEXT.test(await res.clone().text());
  } catch {
    return false;
  }
}

export async function apiFetch(agency: AgencyId, url: string, init?: RequestInit): Promise<Response> {
  // 기관이 이미 '하루 한도 초과'로 답했으면 더 불러도 같은 답이므로 바로 멈춤
  if (quotaHit === agency) throw new CallLimitError(`${AGENCIES[agency].name}: 오늘 하루 호출 한도를 넘었다는 답을 받아 더 부르지 않음`);
  const used = counts[agency] ?? 0;
  const limit = process.env.COLLECT_AGENCY === agency ? Number(process.env.COLLECT_CALL_LIMIT) : NaN;
  if (Number.isFinite(limit) && used >= limit) {
    capHit = true;
    flush();
    throw new CallLimitError(`${AGENCIES[agency].name}: 이번 실행 최대 호출 ${limit}회를 다 써서 멈춤 (다음 회차에 이어서)`);
  }

  const wait = AGENCIES[agency].minIntervalMs - (Date.now() - (lastCallAt[agency] ?? 0));
  if (wait > 0) await sleep(wait);
  lastCallAt[agency] = Date.now();
  counts[agency] = used + 1;
  flush();

  const res = await fetch(url, init);
  if (await looksLikeQuotaError(res)) {
    quotaHit = agency;
    flush();
  }
  return res;
}
