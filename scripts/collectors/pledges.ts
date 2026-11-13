/**
 * 선관위(공공데이터포털) 선거공약 정보 → election_pledges
 * 대상: election_candidates 에 저장된 제9회 지방선거 당선인 (시·도지사 3 · 구·시·군의 장 4 · 교육감 11) — 먼저 collect:local
 * 실행: npm run collect:pledges      (.env.local 의 DATA_GO_KR_KEY = Decoding 키)
 *
 * 공약 분야·제목·내용은 API 원문 그대로 저장합니다(요약·정리하지 않음).
 * 다시 실행해도 (후보, 순번) 단위로 덮어써서 중복이 쌓이지 않습니다.
 * 22대 총선 국회의원(sgTypecode 2)은 당선인으로 시험했을 때 공약 데이터가 없어(INFO-03, 2026-11 확인) 대상에서 뺐습니다.
 */
import { and, eq, sql } from "drizzle-orm";
import { electionCandidates, electionPledges } from "../../src/db/schema";
import { db, run, saveRaw, sleep } from "./common";
import { fetchAll, NEC_API } from "./nec-api";
import type { Item } from "./nec-parse";
import { PLEDGE_FIELD, pledgesFromItem, type PledgeRow } from "./pledges-parse";

const SG_ID = "20260603";
const TYPES = [
  { sgTypecode: "3", label: "시·도지사" },
  { sgTypecode: "4", label: "구·시·군의 장" },
  { sgTypecode: "11", label: "교육감" },
];
const WAIT_MS = 100; // API 호출 사이 대기

const chunks = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

run(async () => {
  let total = 0;
  for (const t of TYPES) {
    const cands = await db
      .select({ huboid: electionCandidates.huboid, name: electionCandidates.name, sggName: electionCandidates.sggName })
      .from(electionCandidates)
      .where(
        and(
          eq(electionCandidates.sgId, SG_ID),
          eq(electionCandidates.sgTypecode, t.sgTypecode),
          eq(electionCandidates.isWinner, true),
        ),
      )
      .orderBy(electionCandidates.huboid);
    if (cands.length === 0) {
      console.log(`■ ${t.label}: 저장된 당선인이 없습니다. 먼저 npm run collect:local 을 실행하세요.`);
      continue;
    }

    const rows: PledgeRow[] = [];
    const samples: Item[] = [];
    const noData: string[] = [];
    const moreThanSaved: string[] = []; // 응답의 공약 개수(prmsCnt)가 저장한 수보다 많음
    for (const [i, c] of cands.entries()) {
      if (i > 0) await sleep(WAIT_MS);
      const items = (await fetchAll(NEC_API.pledges, { sgId: SG_ID, sgTypecode: t.sgTypecode, cnddtId: c.huboid })).filter(
        (it) => String(it[PLEDGE_FIELD.candidate] ?? c.huboid) === c.huboid, // 다른 후보 줄이 섞여 오면 버림
      );
      if (items.length === 0) {
        noData.push(`${c.sggName} ${c.name}`);
        continue;
      }
      if (samples.length < 3) samples.push(items[0]);
      // 후보 1명 = 응답 1줄 (여러 줄이 와도 첫 줄만, 같은 순번이 두 번 들어가지 않게)
      const r = pledgesFromItem(items[0], { sgId: SG_ID, sgTypecode: t.sgTypecode, huboid: c.huboid });
      rows.push(...r.rows);
      if (r.declared !== null && r.declared > r.rows.length) moreThanSaved.push(`${c.sggName} ${c.name}(${r.declared}개 중 ${r.rows.length}개)`);
    }

    if (samples.length) await saveRaw("nec:pledges", { sgId: SG_ID, sgTypecode: t.sgTypecode, sample: 3 }, samples); // 필드 확인용 샘플만
    await db.transaction(async (tx) => {
      for (const part of chunks(rows, 500)) {
        await tx
          .insert(electionPledges)
          .values(part)
          .onConflictDoUpdate({
            target: [electionPledges.sgId, electionPledges.sgTypecode, electionPledges.huboid, electionPledges.pledgeNo],
            set: { realm: sql`excluded.realm`, title: sql`excluded.title`, content: sql`excluded.content`, updatedAt: sql`now()` },
          });
      }
    });

    total += rows.length;
    console.log(`■ ${t.label}: 당선인 ${cands.length}명 중 공약 있는 ${cands.length - noData.length}명, 공약 ${rows.length}개 저장`);
    if (noData.length) console.log(`  공약 데이터가 없는 당선인 ${noData.length}명: ${noData.join(", ")}`);
    if (moreThanSaved.length) console.log(`  [확인] 공약 개수가 저장한 수보다 많은 당선인: ${moreThanSaved.join(", ")}`);
  }
  console.log(`공약 총 ${total}개 저장`);
});
