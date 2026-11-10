/**
 * 선관위(공공데이터포털 9760000) 응답 → 테이블 행 변환 (DB·네트워크 없이 동작하는 순수 함수)
 * 응답 필드 이름이 실제와 다르면 FIELD 만 고치면 됩니다. 원본은 raw_responses 의 nec:* 에 저장됩니다.
 */

/** 수집 대상 선거. 다른 선거를 추가하려면 여기에 한 줄 추가 후 db:seed → collect:nec */
export const ELECTIONS = [
  { sgId: "20240410", sgTypecode: "2", name: "제22대 국회의원선거(지역구)", electionDate: "2024-04-10" },
];

export type Item = Record<string, string | number | null | undefined>;

export const FIELD = {
  // 후보자·당선인 공통
  huboid: "huboid",
  name: "name",
  hanjaName: "hanjaName",
  party: "jdName",
  giho: "giho",
  gender: "gender",
  birthday: "birthday",
  age: "age",
  sido: "sdName",
  sgg: "sggName",
  wiw: "wiwName",
  job: "job",
  edu: "edu",
  career1: "career1",
  career2: "career2",
  status: "status",
  // 당선인
  votes: "dugsu",
  voteRate: "dugyul",
  // 투표결과(투표율)
  electors: "totSunsu",
  voters: "totTusu",
  turnout: "Turnout",
  // 개표결과 (선거구 합계 + 후보별 hbjNN/jdNN/dugsuNN)
  cntElectors: "sunsu",
  cntVoters: "tusu",
  cntValid: "yutusu",
  cntInvalid: "mutusu",
  cntAbstain: "gigwonsu",
} as const;

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

export const num = (v: unknown): number | null => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 시도 합계 줄인지 (구시군명이 비었거나 '합계') */
const isTotalRow = (wiw: unknown) => {
  const s = str(wiw);
  return !s || s === "합계";
};

export interface CandidateRow {
  sgId: string;
  sgTypecode: string;
  huboid: string;
  name: string;
  hanjaName: string | null;
  partyName: string | null;
  giho: string | null;
  gender: string | null;
  birthday: string | null;
  age: number | null;
  sdName: string;
  sggName: string;
  wiwName: string | null;
  regionCode: string | null;
  job: string | null;
  edu: string | null;
  career1: string | null;
  career2: string | null;
  status: string | null;
  votes: number | null;
  voteRate: number | null;
  isWinner: boolean;
}

type Election = { sgId: string; sgTypecode: string };
type Lookup = Map<string, string>;

function toCandidate(it: Item, el: Election, lookup: Lookup): CandidateRow | null {
  const huboid = str(it[FIELD.huboid]);
  const name = str(it[FIELD.name]);
  const sdName = str(it[FIELD.sido]);
  const sggName = str(it[FIELD.sgg]);
  if (!huboid || !name || !sdName || !sggName) return null;
  return {
    ...el,
    huboid,
    name,
    hanjaName: str(it[FIELD.hanjaName]),
    partyName: str(it[FIELD.party]),
    giho: str(it[FIELD.giho]),
    gender: str(it[FIELD.gender]),
    birthday: str(it[FIELD.birthday]),
    age: num(it[FIELD.age]),
    sdName,
    sggName,
    wiwName: str(it[FIELD.wiw]),
    regionCode: lookup.get(sdName) ?? null,
    job: str(it[FIELD.job]),
    edu: str(it[FIELD.edu]),
    career1: str(it[FIELD.career1]),
    career2: str(it[FIELD.career2]),
    status: str(it[FIELD.status]),
    votes: null,
    voteRate: null,
    isWinner: false,
  };
}

/**
 * 후보자 목록 + 당선인 목록 → 후보 행.
 * 당선인은 득표수·득표율(dugsu·dugyul)을 갖고 있으므로 그 값으로 덮어씀.
 * 후보자 API 가 실패해도 당선인만으로 행을 만듦.
 */
export function buildCandidates(candidates: Item[], winners: Item[], el: Election, lookup: Lookup): CandidateRow[] {
  const byId = new Map<string, CandidateRow>();
  for (const it of candidates) {
    const row = toCandidate(it, el, lookup);
    if (row) byId.set(row.huboid, row);
  }
  for (const it of winners) {
    const w = toCandidate(it, el, lookup);
    if (!w) continue;
    const row = byId.get(w.huboid) ?? w;
    row.isWinner = true;
    row.votes = num(it[FIELD.votes]) ?? row.votes;
    row.voteRate = num(it[FIELD.voteRate]) ?? row.voteRate;
    byId.set(w.huboid, row);
  }
  return [...byId.values()];
}

export interface DistrictRow {
  sgId: string;
  sgTypecode: string;
  sdName: string;
  sggName: string;
  regionCode: string | null;
  electors: number | null;
  voters: number | null;
  validVotes: number | null;
  invalidVotes: number | null;
  abstentions: number | null;
}

/** 선거구(sggName)별로 합계 줄이 있으면 그 줄, 없으면 구시군 줄을 더함 */
function totalsBy(rows: Item[], key: (r: Item) => string | null, sum: (rows: Item[]) => Item): Map<string, Item> {
  const groups = new Map<string, { total?: Item; parts: Item[] }>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const g = groups.get(k) ?? { parts: [] };
    if (isTotalRow(r[FIELD.wiw])) g.total = r;
    else g.parts.push(r);
    groups.set(k, g);
  }
  return new Map([...groups].map(([k, g]) => [k, g.total ?? sum(g.parts)]));
}

/** 더하면 안 되는 비율 필드 (합계 줄에서는 다시 계산) */
const RATE_FIELDS = new Set<string>([FIELD.turnout, FIELD.voteRate]);
/** 숫자가 아닌 필드 (이름·정당명·코드) */
const TEXT_FIELD = /^(hbj|jd)\d+$|^(sgId|sgTypecode|sdName|sggName|wiwName|num|vrOrder)$/i;

/** 숫자 필드를 모두 더한 줄 하나 (문자 필드는 첫 줄 값, 비율·일부만 있는 값은 비움) */
function sumRows(rows: Item[]): Item {
  const keys = new Set(rows.flatMap((r) => Object.keys(r)));
  const out: Item = { ...rows[0] };
  for (const k of keys) {
    if (TEXT_FIELD.test(k)) continue;
    if (RATE_FIELDS.has(k)) {
      out[k] = null;
      continue;
    }
    const values = rows.map((r) => num(r[k]));
    out[k] = values.every((v) => v !== null) ? values.reduce<number>((a, b) => a + b!, 0) : null;
  }
  out[FIELD.wiw] = "합계";
  return out;
}

/** 시도 칸까지 '합계'인 줄(선거구마다 한 줄씩 더 오는 중복 합계 줄)은 버림 */
const dropSidoTotal = (rows: Item[]) => rows.filter((r) => str(r[FIELD.sido]) !== "합계");

const sggKey = (r: Item) => {
  const sd = str(r[FIELD.sido]);
  const sgg = str(r[FIELD.sgg]);
  return sd && sgg ? `${sd}|${sgg}` : null;
};

/**
 * 개표결과(선거구×구시군, 후보별 hbjNN·jdNN·dugsuNN) →
 *  - 선거구 합계 행(election_districts)
 *  - 후보 득표수·득표율 보완 (이름이 같은 후보에 연결, 당선인 API 값이 있으면 유지)
 */
export function applyCounts(
  candidates: CandidateRow[],
  countRows: Item[],
  el: Election,
  lookup: Lookup,
): { districts: DistrictRow[]; matched: number } {
  const totals = totalsBy(dropSidoTotal(countRows), sggKey, sumRows);
  const districts: DistrictRow[] = [];
  let matched = 0;

  const bySgg = new Map<string, CandidateRow[]>();
  for (const c of candidates) {
    const k = `${c.sdName}|${c.sggName}`;
    bySgg.set(k, [...(bySgg.get(k) ?? []), c]);
  }

  for (const [k, t] of totals) {
    const [sdName, sggName] = k.split("|");
    const valid = num(t[FIELD.cntValid]);
    districts.push({
      ...el,
      sdName,
      sggName,
      regionCode: lookup.get(sdName) ?? null,
      electors: num(t[FIELD.cntElectors]),
      voters: num(t[FIELD.cntVoters]),
      validVotes: valid,
      invalidVotes: num(t[FIELD.cntInvalid]),
      abstentions: num(t[FIELD.cntAbstain]),
    });

    const inSgg = bySgg.get(k) ?? [];
    for (const key of Object.keys(t)) {
      const m = /^hbj(\d+)$/i.exec(key);
      if (!m) continue;
      const raw = str(t[key]);
      const votes = num(t[`dugsu${m[1]}`]);
      if (!raw || votes === null) continue;
      const name = raw.split(/\s+/).pop()!; // '정당명 이름' 으로 오는 경우 대비
      const party = str(t[`jd${m[1]}`]);
      const hits = inSgg.filter((c) => c.name === name && (!party || !c.partyName || c.partyName === party));
      if (hits.length !== 1) continue; // 동명이인·없는 이름은 연결하지 않음
      const c = hits[0];
      matched++;
      c.votes ??= votes;
      if (c.voteRate === null && valid) c.voteRate = round2((100 * votes) / valid);
    }
  }
  return { districts, matched };
}

export interface TurnoutRow {
  sgId: string;
  sgTypecode: string;
  sdName: string;
  wiwName: string;
  regionCode: string | null;
  electors: number;
  voters: number;
  turnout: number | null;
}

/** 투표결과 → 시도 합계 줄(wiwName '') + 구시군 줄. 시도 합계가 없으면 구시군을 더해 만듦 */
export function buildTurnout(rows: Item[], el: Election, lookup: Lookup): TurnoutRow[] {
  rows = dropSidoTotal(rows);
  const out: TurnoutRow[] = [];
  const toRow = (r: Item, wiwName: string): TurnoutRow | null => {
    const sdName = str(r[FIELD.sido]);
    const electors = num(r[FIELD.electors]);
    const voters = num(r[FIELD.voters]);
    if (!sdName || !electors || voters === null) return null;
    return {
      ...el,
      sdName,
      wiwName,
      regionCode: lookup.get(sdName) ?? null,
      electors,
      voters,
      turnout: num(r[FIELD.turnout]) ?? round2((100 * voters) / electors),
    };
  };

  for (const r of rows) {
    if (isTotalRow(r[FIELD.wiw])) continue;
    const row = toRow(r, str(r[FIELD.wiw])!);
    if (row) out.push(row);
  }
  const sidoTotals = totalsBy(rows, (r) => str(r[FIELD.sido]), sumRows);
  for (const t of sidoTotals.values()) {
    const row = toRow(t, "");
    if (row) {
      // 합계 줄의 원천 투표율이 없으면 직접 계산
      row.turnout = num(t[FIELD.turnout]) ?? round2((100 * row.voters) / row.electors);
      out.push(row);
    }
  }
  return out;
}

/** 중립 팔레트 (실제 상징색 아님). 의석 많은 순으로 앞 색부터 */
export const NEUTRAL_COLORS = ["#14a894", "#8b6fe8", "#b87d0f", "#3b82c4", "#c2577a", "#6b7280"];

/** 정당이 아닌 표기 (정당 사전·색 배정에서 제외, 회색) */
export const INDEPENDENT = "무소속";
const INDEPENDENT_COLOR = NEUTRAL_COLORS[NEUTRAL_COLORS.length - 1];

/** 정당명 목록(의석 많은 순) → 중립 팔레트 색. 무소속은 항상 회색 */
export function assignColors(namesBySeats: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  for (const name of namesBySeats) {
    if (name === INDEPENDENT) out.set(name, INDEPENDENT_COLOR);
    else out.set(name, NEUTRAL_COLORS[Math.min(i++, NEUTRAL_COLORS.length - 2)]);
  }
  return out;
}

/** 후보 정당명 → parties 행 (당선인 수 순으로 색 배정) */
export function partiesFromCandidates(rows: CandidateRow[]) {
  const seats = new Map<string, number>();
  for (const r of rows) {
    if (!r.partyName) continue;
    seats.set(r.partyName, (seats.get(r.partyName) ?? 0) + (r.isWinner ? 1 : 0));
  }
  const ordered = [...seats.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([name]) => name);
  const colors = assignColors(ordered);
  return ordered.map((name) => ({
    id: name,
    name,
    short: name.length > 5 ? name.slice(0, 5) : name,
    color: colors.get(name)!,
    source: "nec",
  }));
}
