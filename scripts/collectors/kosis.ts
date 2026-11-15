/**
 * KOSIS(국가통계포털) 시도별 지표 → region_indicators
 *   주민등록인구 · 고령인구비율(65세 이상 비율) · 재정자립도  (통계표 번호는 kosis-parse.ts 의 INDICATORS)
 * 실행: npm run collect:kosis      (.env.local 의 KOSIS_API_KEY)
 *
 * 지표마다 17개 시도 모두 값이 있는 가장 최근 연도 하나를 저장합니다. 그 연도에 전남광주통합특별시가 따로 나오면
 * 그 연도는 건너뛰고 이전 연도를 씁니다. KOSIS 시도 코드는 regions 코드와 달라 시도 이름으로 연결합니다.
 * 다시 실행해도 (시도, 지표, 연도) 덮어쓰기라 중복이 쌓이지 않습니다.
 */
import { sql } from "drizzle-orm";
import { regionIndicators, regions } from "../../src/db/schema";
import { db, run, saveRaw, sleep } from "./common";
import { kosisGet } from "./kosis-api";
import { INDICATORS, MERGED_SIDO, pickLatestYear, sidoNameMap, type KosisRow } from "./kosis-parse";

const YEARS_BACK = 5; // 올해 포함 최근 몇 년을 받아서 그중 최신 연도를 고를지

run(async () => {
  const rs = await db.select({ code: regions.code, name: regions.name }).from(regions).orderBy(regions.code);
  if (rs.length !== 17) throw new Error(`regions 가 ${rs.length}개입니다 (17개 필요). 먼저 npm run db:seed`);
  const names = sidoNameMap(rs);

  const thisYear = new Date().getFullYear();
  for (const [i, ind] of INDICATORS.entries()) {
    if (i > 0) await sleep(300);
    const params = {
      method: "getList",
      orgId: ind.orgId,
      tblId: ind.tblId,
      itmId: ind.itmId,
      objL1: "ALL",
      prdSe: "Y",
      startPrdDe: String(thisYear - YEARS_BACK + 1),
      endPrdDe: String(thisYear),
    };
    const rows = await kosisGet<KosisRow[]>("Param/statisticsParameterData.do", params);
    // 시도 줄만 원본 보관 (전국·시군구 제외) — 키는 params 에 없음
    const sidoRows = rows.filter((r) => names.has(r.C1_NM.trim()) || MERGED_SIDO.test(r.C1_NM));
    await saveRaw(`kosis:${ind.tblId}`, params, sidoRows);

    const picked = pickLatestYear(rows, rs);
    for (const s of picked.skipped) console.log(`  [건너뜀] ${ind.name} ${s.year}년: ${s.reason}`);
    if (picked.year === null) {
      console.log(`■ ${ind.name}: 17개 시도가 모두 있는 연도가 최근 ${YEARS_BACK}년 안에 없어 저장하지 않음`);
      continue;
    }

    const values = [...picked.values].map(([regionCode, v]) => ({
      regionCode,
      indicator: ind.name,
      year: picked.year!,
      value: v.value,
      unit: v.unit ?? "",
      sourceOrgId: ind.orgId,
      sourceTblId: ind.tblId,
    }));
    const noUnit = values.filter((v) => !v.unit).length;
    if (noUnit) throw new Error(`${ind.name}: 단위(UNIT_NM)가 없는 값 ${noUnit}개 — raw_responses 의 kosis:${ind.tblId} 확인`);

    await db
      .insert(regionIndicators)
      .values(values)
      .onConflictDoUpdate({
        target: [regionIndicators.regionCode, regionIndicators.indicator, regionIndicators.year],
        set: {
          value: sql`excluded.value`,
          unit: sql`excluded.unit`,
          sourceOrgId: sql`excluded.source_org_id`,
          sourceTblId: sql`excluded.source_tbl_id`,
          updatedAt: sql`now()`,
        },
      });
    console.log(`■ ${ind.name} (${ind.orgId}/${ind.tblId} ${ind.tblName}): ${picked.year}년 ${values.length}개 시도 저장, 단위 ${values[0].unit}`);
  }
});
