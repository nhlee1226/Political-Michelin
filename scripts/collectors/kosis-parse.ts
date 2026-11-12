/**
 * KOSIS(국가통계포털) 시도 지표 → region_indicators 행 (DB·네트워크 없이 동작하는 순수 함수)
 * 통계표 번호는 KOSIS 통합검색 API(statisticsSearch.do)로 찾은 것 (2026-11 확인, 모두 e-지방지표 시도/시/군/구 표).
 */
import { num } from "./nec-parse";

export interface Indicator {
  name: string; // region_indicators.indicator
  orgId: string;
  tblId: string;
  tblName: string; // KOSIS 통계표 이름 (안내용)
  itmId: string; // 표 안의 항목
}

export const INDICATORS: Indicator[] = [
  { name: "주민등록인구", orgId: "101", tblId: "DT_1YL20651E", tblName: "주민등록인구(시도/시/군/구)", itmId: "T20" }, // 계(명)
  { name: "고령인구비율", orgId: "101", tblId: "DT_1YL20631", tblName: "고령인구비율(시도/시/군/구)", itmId: "T10" }, // 65세 이상 ÷ 전체 × 100 (%)
  { name: "재정자립도", orgId: "101", tblId: "DT_1YL20921", tblName: "재정자립도(시도/시/군/구)", itmId: "T20" }, // 세입과목 개편 후 (%)
];

/** 2026-07 출범, regions 에 없는 시도. 이 이름으로 값이 따로 나온 연도는 쓰지 않음 */
export const MERGED_SIDO = /전남광주/;

/** KOSIS 통계자료 응답 한 줄 (필요한 필드만) */
export interface KosisRow {
  C1: string; // KOSIS 행정구역 코드 (regions 코드와 다름)
  C1_NM: string; // 행정구역 이름
  PRD_DE: string; // 연도
  DT: string | null; // 값
  UNIT_NM?: string;
}

/** 옛 이름 → 지금 regions 이름 */
const OLD_NAMES: Record<string, string> = { 강원도: "강원특별자치도", 전라북도: "전북특별자치도" };

/**
 * 시도 정식 이름 → regions 코드. 짧은 이름('광주')은 쓰지 않음 — 경기도 '광주시' 같은 시군구와 섞이지 않게.
 * KOSIS 표에 따라 광주광역시·전라남도가 '전남광주통합특별시' 아래 칸으로 들어가 있어도 이름으로 찾으면 됨.
 */
export function sidoNameMap(regions: { code: string; name: string }[]): Map<string, string> {
  const m = new Map(regions.map((r) => [r.name, r.code]));
  for (const [old, now] of Object.entries(OLD_NAMES)) if (m.has(now)) m.set(old, m.get(now)!);
  return m;
}

/**
 * 17개 시도 모두 값이 있는 가장 최근 연도를 고름.
 * - 그 연도에 전남광주통합특별시 값이 따로 나오면 건너뜀 (regions 와 맞출 수 없음)
 * - 같은 연도에 같은 시도가 두 번 나오면 오류
 */
export function pickLatestYear(rows: KosisRow[], regions: { code: string; name: string }[]) {
  const byName = sidoNameMap(regions);
  const skipped: { year: string; reason: string }[] = [];
  const years = [...new Set(rows.map((r) => r.PRD_DE))].sort().reverse();

  for (const year of years) {
    const inYear = rows.filter((r) => r.PRD_DE === year && num(r.DT) !== null);
    const merged = inYear.find((r) => MERGED_SIDO.test(r.C1_NM));
    if (merged) {
      skipped.push({ year, reason: `${merged.C1_NM} 값이 따로 나옴(${merged.DT}) — 광주·전남으로 나눌 수 없음` });
      continue;
    }
    const values = new Map<string, { value: number; unit: string | null }>();
    for (const r of inYear) {
      const code = byName.get(r.C1_NM.trim());
      if (!code) continue; // 전국·시군구
      if (values.has(code)) throw new Error(`${year}년 ${r.C1_NM} 값이 두 번 나옵니다`);
      values.set(code, { value: num(r.DT)!, unit: r.UNIT_NM?.trim() || null });
    }
    const missing = regions.filter((r) => !values.has(r.code)).map((r) => r.name);
    if (missing.length) {
      skipped.push({ year, reason: `값 없는 시도 ${missing.length}곳 (${missing.join(", ")})` });
      continue;
    }
    return { year: Number(year), values, skipped };
  }
  return { year: null, values: new Map<string, { value: number; unit: string | null }>(), skipped };
}
