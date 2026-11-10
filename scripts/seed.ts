/**
 * 기준 데이터 넣기 (여러 번 실행해도 안전).  실행: npm run db:seed
 *  - 시도 17개 (코드·이름은 지도 GeoJSON·mock-data 와 동일)
 *  - 수집 대상 선거 목록
 * 가상(mock) 정치인·지지도는 DB 에 넣지 않습니다. 화면은 실데이터가 없는 항목만 mock 으로 보여줍니다.
 */
import { sql } from "drizzle-orm";
import { db, run } from "./collectors/common";
import { elections, regions } from "../src/db/schema";
import { ELECTIONS } from "./collectors/nec-parse";

const REGIONS = [
  ["11", "서울특별시", "서울"],
  ["21", "부산광역시", "부산"],
  ["22", "대구광역시", "대구"],
  ["23", "인천광역시", "인천"],
  ["24", "광주광역시", "광주"],
  ["25", "대전광역시", "대전"],
  ["26", "울산광역시", "울산"],
  ["29", "세종특별자치시", "세종"],
  ["31", "경기도", "경기"],
  ["32", "강원특별자치도", "강원"],
  ["33", "충청북도", "충북"],
  ["34", "충청남도", "충남"],
  ["35", "전북특별자치도", "전북"],
  ["36", "전라남도", "전남"],
  ["37", "경상북도", "경북"],
  ["38", "경상남도", "경남"],
  ["39", "제주특별자치도", "제주"],
] as const;

run(async () => {
  await db
    .insert(regions)
    .values(REGIONS.map(([code, name, short]) => ({ code, name, short })))
    .onConflictDoUpdate({ target: regions.code, set: { name: sql`excluded.name`, short: sql`excluded.short` } });

  await db
    .insert(elections)
    .values(ELECTIONS)
    .onConflictDoUpdate({
      target: [elections.sgId, elections.sgTypecode],
      set: { name: sql`excluded.name`, electionDate: sql`excluded.election_date` },
    });

  console.log(`✅ 시도 ${REGIONS.length}개, 선거 ${ELECTIONS.length}건 저장`);
});
