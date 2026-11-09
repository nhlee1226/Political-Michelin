/**
 * 선관위(공공데이터포털) 22대 총선 → Supabase
 *   코드정보   → nec_elections(선거 코드), nec_districts(선거구)
 *   당선인 정보 → nec_winners(지역구 254 + 비례 46), regions.seats(시도별 지역구 의석)
 *   투·개표 정보 → nec_vote_status(시도·구시군 투표율), regions.turnout
 * 실행: npx tsx scripts/collectors/nec.ts      (.env.local 의 DATA_GO_KR_KEY = Decoding 키)
 *
 * 먼저 setup-db(표 만들기)와 collect:members(의원 300명)를 해 두면 당선인이 의원과 연결됩니다.
 * 총선 결과라 값이 바뀌지 않습니다. 한 번만 실행하면 되고, 다시 실행해도 같은 줄을 덮어씁니다.
 * 하나가 실패해도(예: 코드정보 활용신청 안 됨) 나머지는 계속 저장합니다.
 */
import { env, regionLookup, saveRaw, sql } from "./common";

const BASE = "https://apis.data.go.kr/9760000";
const SG_ID = "20240410"; // 22대 국회의원선거
const DISTRICT = "2"; // 지역구
const PROPORTIONAL = "7"; // 비례대표

type Item = Record<string, string | number | null>;

/** 공공데이터포털 목록 API를 끝까지 읽음 */
async function fetchAll(path: string, params: Record<string, string>): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ serviceKey: env("DATA_GO_KR_KEY").trim(), resultType: "json", pageNo: String(page), numOfRows: "500", ...params });
    const text = await (await fetch(`${BASE}/${path}?${q}`)).text();
    let res;
    try { res = JSON.parse(text).response; } catch { /* 키 오류는 XML 로 옴 */ }
    if (!res?.header) throw new Error(`${path} 응답: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    if (res.header.resultCode !== "INFO-00") {
      if (res.header.resultCode === "INFO-03") break; // 데이터 없음
      throw new Error(`${path}: ${JSON.stringify(res.header)}`);
    }
    const raw = res.body?.items?.item ?? [];
    const batch: Item[] = Array.isArray(raw) ? raw : [raw];
    items.push(...batch);
    if (batch.length === 0 || items.length >= Number(res.body.totalCount ?? 0)) break;
  }
  return items;
}

const str = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const num = (v: unknown) => {
  const s = String(v ?? "").replace(/[,%\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const ymd = (v: unknown) => {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
};
/** 같은 키가 두 번 오면 마지막 것만 (upsert 가 한 줄을 두 번 고치면 오류) */
function uniqueBy<T>(rows: T[], key: (r: T) => string): T[] {
  return [...new Map(rows.map((r) => [key(r), r])).values()];
}

/** 시도별 투표율: 시도 합계 줄이 있으면 그 줄, 없으면 구시군 줄을 더해서 계산 */
export function turnoutBySido(rows: Item[]): Map<string, number> {
  const groups = new Map<string, { total?: Item; parts: Item[] }>();
  for (const r of rows) {
    const sido = str(r.sdName);
    if (!sido) continue;
    const g = groups.get(sido) ?? { parts: [] };
    const wiw = str(r.wiwName);
    if (!wiw || wiw === "합계") g.total = r;
    else g.parts.push(r);
    groups.set(sido, g);
  }
  const out = new Map<string, number>();
  for (const [sido, g] of groups) {
    const src = g.total ? [g.total] : g.parts;
    const electors = src.reduce((n, r) => n + (num(r.totSunsu) ?? 0), 0);
    const voters = src.reduce((n, r) => n + (num(r.totTusu) ?? 0), 0);
    if (electors > 0) out.set(sido, Math.round((1000 * voters) / electors) / 10);
  }
  return out;
}

const VOTE_STATUS = "VoteXmntckInfoInqireService2/getVoteSttusInfoInqire";

/** 투표현황: 한 번에 안 나오면 시도별로, 그래도 없으면 비례대표(7) 선거로 (투표율은 같음) */
async function fetchVoteStatus(sidoNames: string[]): Promise<{ rows: Item[]; sgTypecode: string }> {
  for (const sgTypecode of [DISTRICT, PROPORTIONAL]) {
    const all = await fetchAll(VOTE_STATUS, { sgId: SG_ID, sgTypecode });
    if (all.length) return { rows: all, sgTypecode };
    const bySido: Item[] = [];
    for (const sdName of sidoNames) bySido.push(...(await fetchAll(VOTE_STATUS, { sgId: SG_ID, sgTypecode, sdName })));
    if (bySido.length) return { rows: bySido, sgTypecode };
  }
  return { rows: [], sgTypecode: DISTRICT };
}

const failed: string[] = [];
async function step(name: string, fn: () => Promise<string>) {
  try {
    console.log(`[성공] ${name}: ${await fn()}`);
  } catch (e) {
    failed.push(name);
    console.log(`[건너뜀] ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  const lookup = await regionLookup();
  const code = (sido: unknown) => lookup.get(String(sido ?? "").trim()) ?? null;
  const sidoNames = (await sql<{ name: string }[]>`select name from regions order by code`).map((r) => r.name);

  // 1) 코드정보: 선거 코드
  await step("선거 코드", async () => {
    const rows = await fetchAll("CommonCodeService/getCommonSgCodeList", {});
    const values = uniqueBy(
      rows.filter((r) => str(r.sgId) && str(r.sgTypecode)).map((r) => ({
        sg_id: str(r.sgId)!, sg_typecode: str(r.sgTypecode)!, sg_name: str(r.sgName), sg_votedate: ymd(r.sgVotedate),
      })),
      (v) => `${v.sg_id}|${v.sg_typecode}`,
    );
    if (values.length) {
      await sql`insert into nec_elections ${sql(values, "sg_id", "sg_typecode", "sg_name", "sg_votedate")}
        on conflict (sg_id, sg_typecode) do update set sg_name = excluded.sg_name, sg_votedate = excluded.sg_votedate`;
    }
    return `${values.length}건 (nec_elections)`;
  });

  // 2) 코드정보: 22대 지역구 선거구
  await step("선거구 코드", async () => {
    const rows = await fetchAll("CommonCodeService/getCommonSggCodeList", { sgId: SG_ID, sgTypecode: DISTRICT });
    const grouped = new Map<string, Item[]>();
    for (const r of rows) {
      if (!str(r.sdName) || !str(r.sggName)) continue;
      const k = `${str(r.sdName)}|${str(r.sggName)}`;
      grouped.set(k, [...(grouped.get(k) ?? []), r]);
    }
    const values = [...grouped.values()].map((g) => ({
      sg_id: SG_ID, sg_typecode: DISTRICT, sido: str(g[0].sdName)!, sgg_name: str(g[0].sggName)!,
      wiw_name: [...new Set(g.map((r) => str(r.wiwName)).filter(Boolean))].join(", ") || null,
      region_code: code(g[0].sdName), sgg_jungsu: num(g[0].sggJungsu), s_order: num(g[0].sOrder),
    }));
    if (values.length) {
      await sql`insert into nec_districts ${sql(values, "sg_id", "sg_typecode", "sido", "sgg_name", "wiw_name", "region_code", "sgg_jungsu", "s_order")}
        on conflict (sg_id, sg_typecode, sido, sgg_name) do update set wiw_name = excluded.wiw_name, region_code = excluded.region_code,
          sgg_jungsu = excluded.sgg_jungsu, s_order = excluded.s_order`;
    }
    return `${values.length}곳 (nec_districts)`;
  });

  // 3) 당선인 정보: 지역구 + 비례대표, 시도별 의석 수
  const members = await sql<{ mona_cd: string; name: string; region_code: string | null; elect_type: string | null }[]>`
    select mona_cd, name, region_code, elect_type from members`;
  /** 이름 + (지역구면 시도) 가 딱 한 명일 때만 연결 */
  const memberKey = (name: string, region: string | null) => `${name}|${region ?? "비례"}`;
  const byKey = new Map<string, string | null>();
  for (const m of members) {
    const k = memberKey(m.name, m.elect_type === "비례대표" ? null : m.region_code);
    byKey.set(k, byKey.has(k) ? null : m.mona_cd);
  }

  let districtWinners: Item[] = [];
  for (const sgTypecode of [DISTRICT, PROPORTIONAL]) {
    const label = sgTypecode === DISTRICT ? "지역구 당선인" : "비례대표 당선인";
    await step(label, async () => {
      const rows = await fetchAll("WinnerInfoInqireService2/getWinnerInfoInqire", { sgId: SG_ID, sgTypecode });
      await saveRaw(`nec:winners:${sgTypecode}`, { sgId: SG_ID, sgTypecode }, rows);
      if (sgTypecode === DISTRICT) districtWinners = rows;
      let linked = 0;
      const values = uniqueBy(
        rows.filter((r) => str(r.huboid) && str(r.name)).map((r) => {
          const region = sgTypecode === DISTRICT ? code(r.sdName) : null;
          const mona = byKey.get(memberKey(str(r.name)!, region)) ?? null;
          if (mona) linked++;
          return {
            sg_id: SG_ID, sg_typecode: sgTypecode, huboid: str(r.huboid)!, name: str(r.name)!, party_name: str(r.jdName),
            sido: str(r.sdName), sgg_name: str(r.sggName), wiw_name: str(r.wiwName), region_code: region,
            giho: str(r.giho), gender: str(r.gender), age: num(r.age), job: str(r.job), edu: str(r.edu),
            career1: str(r.career1), career2: str(r.career2), votes: num(r.dugsu), vote_rate: num(r.dugyul), mona_cd: mona,
          };
        }),
        (v) => v.huboid,
      );
      if (values.length) {
        await sql`insert into nec_winners ${sql(values, "sg_id", "sg_typecode", "huboid", "name", "party_name", "sido", "sgg_name", "wiw_name",
          "region_code", "giho", "gender", "age", "job", "edu", "career1", "career2", "votes", "vote_rate", "mona_cd")}
          on conflict (sg_id, sg_typecode, huboid) do update set name = excluded.name, party_name = excluded.party_name, sido = excluded.sido,
            sgg_name = excluded.sgg_name, wiw_name = excluded.wiw_name, region_code = excluded.region_code, giho = excluded.giho,
            gender = excluded.gender, age = excluded.age, job = excluded.job, edu = excluded.edu, career1 = excluded.career1,
            career2 = excluded.career2, votes = excluded.votes, vote_rate = excluded.vote_rate, mona_cd = excluded.mona_cd, updated_at = now()`;
      }
      return `${values.length}명, 국회 의원과 연결 ${linked}명 (nec_winners)`;
    });
  }

  await step("시도별 의석 수", async () => {
    if (!districtWinners.length) throw new Error("지역구 당선인을 못 받아서 건너뜀");
    const seats = new Map<string, number>();
    for (const w of districtWinners) {
      const c = code(w.sdName);
      if (c) seats.set(c, (seats.get(c) ?? 0) + 1);
    }
    for (const [c, n] of seats) await sql`update regions set seats = ${n} where code = ${c}`;
    return `시도 ${seats.size}곳, ${[...seats.values()].reduce((a, b) => a + b, 0)}석 (regions.seats)`;
  });

  // 4) 투·개표 정보: 투표현황
  await step("투표 현황", async () => {
    const { rows, sgTypecode } = await fetchVoteStatus(sidoNames);
    if (!rows.length) throw new Error("선관위 투표현황에 22대 총선 데이터가 없어요");
    await saveRaw("nec:vote_status", { sgId: SG_ID, sgTypecode }, rows);
    const values = uniqueBy(
      rows.filter((r) => str(r.sdName)).map((r) => {
        const electors = num(r.totSunsu);
        const voters = num(r.totTusu);
        return {
          sg_id: SG_ID, sg_typecode: sgTypecode, sido: str(r.sdName)!, wiw_name: str(r.wiwName) ?? "합계", region_code: code(r.sdName),
          electors, voters, turnout: electors && voters != null ? Math.round((1000 * voters) / electors) / 10 : null,
        };
      }),
      (v) => `${v.sido}|${v.wiw_name}`,
    );
    await sql`insert into nec_vote_status ${sql(values, "sg_id", "sg_typecode", "sido", "wiw_name", "region_code", "electors", "voters", "turnout")}
      on conflict (sg_id, sg_typecode, sido, wiw_name) do update set region_code = excluded.region_code, electors = excluded.electors,
        voters = excluded.voters, turnout = excluded.turnout`;
    const turnout = new Map<string, number>();
    for (const [sido, t] of turnoutBySido(rows)) {
      const c = code(sido);
      if (c) turnout.set(c, t);
    }
    for (const [c, t] of turnout) await sql`update regions set turnout = ${t} where code = ${c}`;
    return `${values.length}줄 (nec_vote_status), 시도 투표율 ${turnout.size}곳 (regions.turnout)`;
  });

  if (failed.length) {
    console.log(`\n건너뛴 것: ${failed.join(", ")}. 위 [건너뜀] 줄을 캡처해서 보내주세요.`);
    if (failed.includes("지역구 당선인")) process.exitCode = 1;
  } else {
    console.log("\n선관위 데이터 저장 완료");
  }
}

if (process.argv[1]?.endsWith("nec.ts")) {
  main()
    .catch((e) => {
      console.error("[실패]", e.message ?? e);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
