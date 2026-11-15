/**
 * 선관위(공공데이터포털) 제9회 전국동시지방선거(2026-06-03) 당선인 → elections, election_candidates
 *   시·도지사(3) · 구·시·군의 장(4) · 교육감(11)
 *
 * 실행: npm run collect:local      (.env.local 의 DATA_GO_KR_KEY = Decoding 키)
 * 먼저 공통코드 API 로 sgId·선거종류가 맞는지 확인하고, 선거 이름도 거기서 가져옵니다.
 * 당선인만 저장합니다(낙선 후보·개표결과는 수집하지 않음). 다시 실행해도 덮어쓰기라 중복이 쌓이지 않습니다.
 * 22대 총선(collect:nec)과 별개입니다. 대시보드·뉴스 수집기는 국회의원선거(sgTypecode 2)만 보므로 영향이 없습니다.
 *
 * 시도 연결: regions 의 시도 이름으로 연결. 2026년에 생긴 '전남광주통합특별시'처럼 regions 에 없는 시도는
 * region_code 를 비워 둡니다(광주·전남 중 하나로 임의 연결하지 않음).
 */
import { sql } from "drizzle-orm";
import { electionCandidates, elections } from "../../src/db/schema";
import { db, regionLookup, run, saveRaw } from "./common";
import { fetchAll, NEC_API } from "./nec-api";
import { buildCandidates } from "./nec-parse";

const SG_ID = "20260603";
const TYPES = [
  { sgTypecode: "3", label: "시·도지사" },
  { sgTypecode: "4", label: "구·시·군의 장" },
  { sgTypecode: "11", label: "교육감" },
];

/** '20260603' → '2026-06-03' */
const isoDate = (yyyymmdd: unknown) => {
  const s = String(yyyymmdd ?? "");
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
};

run(async () => {
  // 1) 공통코드로 sgId·선거종류 확인 (0 = 선거 전체 이름)
  const codes = await fetchAll(NEC_API.sgCodes, {});
  const code = (t: string) => codes.find((c) => String(c.sgId) === SG_ID && String(c.sgTypecode) === t);
  const whole = code("0");
  const missing = TYPES.filter((t) => !code(t.sgTypecode)).map((t) => `${t.sgTypecode}(${t.label})`);
  const electionDate = isoDate(whole?.sgVotedate);
  if (!whole || !electionDate || missing.length) {
    throw new Error(`공통코드에 sgId ${SG_ID} 의 선거 정보가 없습니다${missing.length ? ` — 없는 선거종류: ${missing.join(", ")}` : ""}`);
  }
  console.log(`공통코드 확인: sgId ${SG_ID} = ${whole.sgName} (투표일 ${electionDate})`);

  const lookup = await regionLookup();

  for (const t of TYPES) {
    const el = { sgId: SG_ID, sgTypecode: t.sgTypecode };
    const name = `${whole.sgName}(${code(t.sgTypecode)!.sgName})`; // 제9회 전국동시지방선거(시·도지사선거)

    const winners = await fetchAll(NEC_API.winners, el);
    await saveRaw("nec:winners", el, winners);
    const rows = buildCandidates([], winners, el, lookup); // 후보자 목록 없이 당선인만으로 행을 만듦

    await db.transaction(async (tx) => {
      // election_candidates 가 elections 를 참조하므로 선거 행을 먼저
      await tx
        .insert(elections)
        .values({ ...el, name, electionDate })
        .onConflictDoUpdate({
          target: [elections.sgId, elections.sgTypecode],
          set: { name: sql`excluded.name`, electionDate: sql`excluded.election_date` },
        });
      if (rows.length === 0) return;
      await tx
        .insert(electionCandidates)
        .values(rows)
        .onConflictDoUpdate({
          target: [electionCandidates.sgId, electionCandidates.sgTypecode, electionCandidates.huboid],
          set: {
            name: sql`excluded.name`,
            hanjaName: sql`excluded.hanja_name`,
            partyName: sql`excluded.party_name`,
            giho: sql`excluded.giho`,
            gender: sql`excluded.gender`,
            birthday: sql`excluded.birthday`,
            age: sql`excluded.age`,
            sdName: sql`excluded.sd_name`,
            sggName: sql`excluded.sgg_name`,
            wiwName: sql`excluded.wiw_name`,
            regionCode: sql`excluded.region_code`,
            job: sql`excluded.job`,
            edu: sql`excluded.edu`,
            career1: sql`excluded.career1`,
            career2: sql`excluded.career2`,
            status: sql`excluded.status`,
            votes: sql`excluded.votes`,
            voteRate: sql`excluded.vote_rate`,
            isWinner: sql`excluded.is_winner`,
            updatedAt: sql`now()`,
          },
        });
    });

    console.log(`■ ${name}: 당선인 ${rows.length}명 저장 (API ${winners.length}건)`);
    const noRegion = rows.filter((r) => !r.regionCode);
    if (noRegion.length) {
      const list = noRegion.map((r) => `${r.sdName} ${r.name}`).join(", ");
      console.log(`  [확인] regions 에 없는 시도라 시도 코드를 비워 둔 당선인 ${noRegion.length}명: ${list}`);
    }
  }
});
