/**
 * 선관위(공공데이터포털) → 후보·득표수·득표율·투표율
 *   election_candidates  후보자 정보 + 당선인 정보(득표수·득표율) + 개표결과(낙선 후보 득표수)
 *   election_districts   선거구별 선거인수·투표수·유효/무효표
 *   election_turnout     시도·구시군 투표율
 *   parties              후보 정당명 임시 등록 (열린국회정보 연동 전까지, 이미 있는 정당은 건드리지 않음)
 *
 * 실행: npm run collect:nec      (.env.local 의 DATA_GO_KR_KEY = Decoding 키)
 * 지난 선거 결과는 바뀌지 않으므로 한 번 실행하면 됩니다(자동 수집에 넣지 않음). 다시 실행해도 덮어쓰기라 안전.
 * 응답 필드 이름이 다르면 raw_responses 의 nec:* 원본을 보고 nec-parse.ts 의 FIELD 만 고치면 됩니다.
 */
import { sql } from "drizzle-orm";
import { electionCandidates, electionDistricts, electionTurnout, parties, regions } from "../../src/db/schema";
import { db, env, regionLookup, run, saveRaw, sleep } from "./common";
import {
  ELECTIONS,
  applyCounts,
  buildCandidates,
  buildTurnout,
  partiesFromCandidates,
  type Item,
} from "./nec-parse";

const BASE = "https://apis.data.go.kr/9760000";
const API = {
  candidates: "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire",
  winners: "WinnerInfoInqireService2/getWinnerInfoInqire",
  counts: "VoteXmntckInfoInqireService2/getXmntckSttusInfoInqire",
  turnout: "VoteXmntckInfoInqireService2/getVoteSttusInfoInqire",
};

/** 공공데이터포털 목록 API 를 끝까지 읽음 */
async function fetchAll(path: string, params: Record<string, string>): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      serviceKey: env("DATA_GO_KR_KEY"),
      resultType: "json",
      pageNo: String(page),
      numOfRows: "500",
      ...params,
    });
    const text = await (await fetch(`${BASE}/${path}?${q}`, { signal: AbortSignal.timeout(30_000) })).text();
    let res;
    try {
      res = JSON.parse(text).response;
    } catch {
      /* 키 오류는 XML 로 옴 */
    }
    if (!res?.header) throw new Error(`${path} 응답: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    if (res.header.resultCode !== "INFO-00") {
      if (res.header.resultCode === "INFO-03") break; // 데이터 없음
      throw new Error(`${path}: ${JSON.stringify(res.header)}`);
    }
    const raw = res.body?.items?.item ?? [];
    const batch: Item[] = Array.isArray(raw) ? raw : [raw];
    items.push(...batch);
    if (batch.length === 0 || items.length >= Number(res.body.totalCount ?? 0)) break;
    await sleep(100);
  }
  return items;
}

/** 전체 조회가 비면 시도별로 다시 물어봄 (시도명이 필수인 오퍼레이션 대비) */
async function fetchAllOrBySido(path: string, params: Record<string, string>, sidoNames: string[]) {
  const all = await fetchAll(path, params).catch(() => [] as Item[]);
  if (all.length) return all;
  const bySido: Item[] = [];
  for (const sdName of sidoNames) bySido.push(...(await fetchAll(path, { ...params, sdName })));
  return bySido;
}

/** 실패해도 다른 단계는 계속 (어느 단계가 왜 빠졌는지만 출력) */
async function optional<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.log(`[건너뜀] ${label}: ${e instanceof Error ? e.message : e}`);
    return fallback;
  }
}

const chunks = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

run(async () => {
  const lookup = await regionLookup();
  const sidoNames = (await db.select({ name: regions.name }).from(regions).orderBy(regions.code)).map((r) => r.name);

  for (const el of ELECTIONS) {
    const params = { sgId: el.sgId, sgTypecode: el.sgTypecode };
    console.log(`■ ${el.name}`);

    const winners = await fetchAll(API.winners, params);
    await saveRaw("nec:winners", params, winners);
    const candidateItems = await optional("후보자 정보", () => fetchAllOrBySido(API.candidates, params, sidoNames), []);
    if (candidateItems.length) await saveRaw("nec:candidates", params, candidateItems);
    const countItems = await optional("개표결과", () => fetchAllOrBySido(API.counts, params, sidoNames), []);
    if (countItems.length) await saveRaw("nec:counts", params, countItems);
    // 투표율은 지역구 선거에 없으면 비례대표(7) 선거로 대신 (같은 날 같은 투표율)
    const turnoutItems = await optional(
      "투표결과",
      async () => {
        const own = await fetchAllOrBySido(API.turnout, params, sidoNames);
        return own.length ? own : fetchAllOrBySido(API.turnout, { ...params, sgTypecode: "7" }, sidoNames);
      },
      [],
    );
    if (turnoutItems.length) await saveRaw("nec:turnout", params, turnoutItems);

    const candidates = buildCandidates(candidateItems, winners, el, lookup);
    const { districts, matched } = applyCounts(candidates, countItems, el, lookup);
    const turnout = buildTurnout(turnoutItems, el, lookup);

    await db.transaction(async (tx) => {
      const ps = partiesFromCandidates(candidates);
      if (ps.length) await tx.insert(parties).values(ps).onConflictDoNothing();

      for (const part of chunks(candidates, 500)) {
        await tx
          .insert(electionCandidates)
          .values(part)
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
      }
      if (districts.length) {
        await tx
          .insert(electionDistricts)
          .values(districts)
          .onConflictDoUpdate({
            target: [electionDistricts.sgId, electionDistricts.sgTypecode, electionDistricts.sdName, electionDistricts.sggName],
            set: {
              regionCode: sql`excluded.region_code`,
              electors: sql`excluded.electors`,
              voters: sql`excluded.voters`,
              validVotes: sql`excluded.valid_votes`,
              invalidVotes: sql`excluded.invalid_votes`,
              abstentions: sql`excluded.abstentions`,
              updatedAt: sql`now()`,
            },
          });
      }
      if (turnout.length) {
        await tx
          .insert(electionTurnout)
          .values(turnout)
          .onConflictDoUpdate({
            target: [electionTurnout.sgId, electionTurnout.sgTypecode, electionTurnout.sdName, electionTurnout.wiwName],
            set: {
              regionCode: sql`excluded.region_code`,
              electors: sql`excluded.electors`,
              voters: sql`excluded.voters`,
              turnout: sql`excluded.turnout`,
              updatedAt: sql`now()`,
            },
          });
      }
    });

    const winnersSaved = candidates.filter((c) => c.isWinner).length;
    const withVotes = candidates.filter((c) => c.votes !== null).length;
    const sidoTurnout = turnout.filter((t) => t.wiwName === "").length;
    console.log(
      `  후보 ${candidates.length}명(당선 ${winnersSaved}) · 득표수 있는 후보 ${withVotes}명(개표결과 연결 ${matched}) · 선거구 ${districts.length}곳 · 시도 투표율 ${sidoTurnout}곳`,
    );
    const noRegion = candidates.filter((c) => !c.regionCode).length;
    if (noRegion) console.log(`  [확인] 시도 코드를 못 찾은 후보 ${noRegion}명 — raw_responses 의 nec:* 에서 시도명 표기를 확인하세요.`);
  }
});
