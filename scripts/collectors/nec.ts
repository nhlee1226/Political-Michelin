/**
 * 선관위(공공데이터포털) → regions.seats(지역구 의석 수), regions.turnout(투표율)
 * 실행: npx tsx scripts/collectors/nec.ts      (.env.local 의 DATA_GO_KR_KEY = Decoding 키)
 *
 * 22대 총선(2024-04-10) 결과라 값이 바뀌지 않습니다. 한 번만 실행하면 되고 자동 수집에는 넣지 않습니다.
 * 응답 필드 이름이 다르면 raw_responses 테이블의 원본을 보고 FIELD 만 고치면 됩니다.
 */
import { env, regionLookup, saveRaw, sql } from "./common";

const BASE = "https://apis.data.go.kr/9760000";
const ELECTION = { sgId: "20240410", sgTypecode: "2" }; // 22대 국회의원선거, 지역구

const FIELD = {
  sido: "sdName", // 시도명 (예: 서울특별시)
  wiw: "wiwName", // 구시군명 (시도 합계 줄은 비어 있거나 '합계')
  electors: "totSunsu", // 총 선거인수
  voters: "totTusu", // 총 투표자수
} as const;

type Item = Record<string, string | number | null>;

/** 공공데이터포털 목록 API를 끝까지 읽음 */
async function fetchAll(path: string, extra: Record<string, string> = {}): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      serviceKey: env("DATA_GO_KR_KEY").trim(), resultType: "json", pageNo: String(page), numOfRows: "500", ...ELECTION, ...extra,
    });
    const text = await (await fetch(`${BASE}/${path}?${q}`)).text();
    let res;
    try { res = JSON.parse(text).response; } catch { /* 키 오류는 XML 로 옴 */ }
    if (!res?.header) throw new Error(`${path} 응답: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    if (res.header.resultCode !== "INFO-00") {
      if (res.header.resultCode === "INFO-03") break; // 데이터 없음 (첫 페이지면 빈 목록)
      throw new Error(`${path}: ${JSON.stringify(res.header)}`);
    }
    const raw = res.body?.items?.item ?? [];
    const batch: Item[] = Array.isArray(raw) ? raw : [raw];
    items.push(...batch);
    if (batch.length === 0 || items.length >= Number(res.body.totalCount ?? 0)) break;
  }
  return items;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** 시도별 투표율: 시도 합계 줄이 있으면 그 줄, 없으면 구시군 줄을 더해서 계산 */
export function turnoutBySido(rows: Item[]): Map<string, number> {
  const groups = new Map<string, { total?: Item; parts: Item[] }>();
  for (const r of rows) {
    const sido = String(r[FIELD.sido] ?? "").trim();
    if (!sido) continue;
    const g = groups.get(sido) ?? { parts: [] };
    const wiw = String(r[FIELD.wiw] ?? "").trim();
    if (!wiw || wiw === "합계") g.total = r;
    else g.parts.push(r);
    groups.set(sido, g);
  }
  const out = new Map<string, number>();
  for (const [sido, g] of groups) {
    const src = g.total ? [g.total] : g.parts;
    const electors = src.reduce((n, r) => n + num(r[FIELD.electors]), 0);
    const voters = src.reduce((n, r) => n + num(r[FIELD.voters]), 0);
    if (electors > 0) out.set(sido, Math.round((1000 * voters) / electors) / 10);
  }
  return out;
}

const VOTE_STATUS = "VoteXmntckInfoInqireService2/getVoteSttusInfoInqire";

/** 투표현황은 한 번에 안 나오면 시도별로, 그래도 없으면 비례대표(7) 선거로 다시 물어봄 (투표율은 같음) */
async function fetchVoteStatus(sidoNames: string[]): Promise<Item[]> {
  for (const sgTypecode of ["2", "7"]) {
    const all = await fetchAll(VOTE_STATUS, { sgTypecode });
    if (all.length) return all;
    const bySido: Item[] = [];
    for (const sdName of sidoNames) bySido.push(...(await fetchAll(VOTE_STATUS, { sgTypecode, sdName })));
    if (bySido.length) return bySido;
  }
  return [];
}

async function main() {
  const lookup = await regionLookup();
  const sidoNames = (await sql<{ name: string }[]>`select name from regions order by code`).map((r) => r.name);

  const winners = await fetchAll("WinnerInfoInqireService2/getWinnerInfoInqire");
  await saveRaw("nec:winners", ELECTION, winners);
  let votes: Item[] = [];
  try {
    votes = await fetchVoteStatus(sidoNames);
    await saveRaw("nec:vote_status", ELECTION, votes);
  } catch (e) {
    console.log(`[건너뜀] 투표율: ${e instanceof Error ? e.message : e}`); // 투표율이 안 돼도 의석 수는 저장
  }
  if (votes.length === 0) console.log("[건너뜀] 투표율: 선관위 투표현황에 22대 총선 데이터가 없어요. 의석 수만 저장합니다.");

  const code = (sido: unknown) => lookup.get(String(sido ?? "").trim()) ?? null;

  const seats = new Map<string, number>();
  for (const w of winners) {
    const c = code(w[FIELD.sido]);
    if (c) seats.set(c, (seats.get(c) ?? 0) + 1);
  }
  const turnout = new Map<string, number>();
  for (const [sido, t] of turnoutBySido(votes)) {
    const c = code(sido);
    if (c) turnout.set(c, t);
  }

  for (const [c, n] of seats) await sql`update regions set seats = ${n} where code = ${c}`;
  for (const [c, t] of turnout) await sql`update regions set turnout = ${t} where code = ${c}`;
  const totalSeats = [...seats.values()].reduce((a, b) => a + b, 0);
  console.log(`지역구 당선인 ${winners.length}명 → 시도 ${seats.size}곳 의석 ${totalSeats}석, 투표율 ${turnout.size}곳 저장 완료`);
  if (seats.size < 17 || (votes.length > 0 && turnout.size < 17)) console.log("[확인] 17곳이 안 채워졌어요. raw_responses 의 nec:* 원본에서 시도명 표기를 확인하세요.");
}

if (process.argv[1]?.endsWith("nec.ts")) {
  main()
    .catch((e) => {
      console.error("[실패]", e.message ?? e);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
