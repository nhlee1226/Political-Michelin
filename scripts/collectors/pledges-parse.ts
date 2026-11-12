/**
 * 선관위 선거공약 정보(ElecPrmsInfoInqireService) 응답 → election_pledges 행 (DB·네트워크 없이 동작하는 순수 함수)
 * 응답은 후보 1명당 한 줄이고, 공약이 prmsOrdN·prmsRealmNameN·prmsTitleN·prmmContN (N = 1~10) 칸에 나뉘어 옵니다.
 * 분야·제목·내용은 원문 그대로(앞뒤 공백·줄바꿈 포함) 저장하고, 빈 문자열만 null 로 바꿉니다.
 */
import { num, type Item } from "./nec-parse";

/** API 가 주는 공약 칸 수 */
export const PLEDGE_SLOTS = 10;

export const PLEDGE_FIELD = {
  candidate: "cnddtId",
  count: "prmsCnt", // 공약 개수
  ord: "prmsOrd", // + N
  realm: "prmsRealmName", // + N
  title: "prmsTitle", // + N
  content: "prmmCont", // + N  (API 표기 그대로: prms 가 아니라 prmm)
} as const;

export interface PledgeRow {
  sgId: string;
  sgTypecode: string;
  huboid: string;
  pledgeNo: number;
  realm: string | null;
  title: string | null;
  content: string | null;
}

/** 원문 그대로, 비어 있으면 null (trim 하지 않음) */
const original = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const filled = (s: string | null) => s !== null && s.trim() !== "";

/**
 * 후보 1명의 응답 줄 → 공약 행
 * - 제목·내용이 모두 빈 칸은 건너뜀
 * - 순번은 prmsOrdN, 비어 있으면 칸 번호 N
 * - 한 후보 안에서 순번이 겹치면 오류 (조용히 덮어쓰지 않음)
 * - declared: 응답의 공약 개수(prmsCnt). 저장한 수보다 크면 10칸을 넘는 공약이 있다는 뜻
 */
export function pledgesFromItem(
  it: Item,
  cand: { sgId: string; sgTypecode: string; huboid: string },
): { rows: PledgeRow[]; declared: number | null } {
  const rows: PledgeRow[] = [];
  const seen = new Set<number>();
  for (let n = 1; n <= PLEDGE_SLOTS; n++) {
    const title = original(it[`${PLEDGE_FIELD.title}${n}`]);
    const content = original(it[`${PLEDGE_FIELD.content}${n}`]);
    if (!filled(title) && !filled(content)) continue;

    const ord = num(it[`${PLEDGE_FIELD.ord}${n}`]);
    const pledgeNo = ord !== null && Number.isInteger(ord) && ord > 0 ? ord : n;
    if (seen.has(pledgeNo)) throw new Error(`후보 ${cand.huboid}: 공약 순번 ${pledgeNo} 이 두 번 나옵니다 (raw_responses 의 nec:pledges 확인)`);
    seen.add(pledgeNo);

    rows.push({ ...cand, pledgeNo, realm: original(it[`${PLEDGE_FIELD.realm}${n}`]), title, content });
  }
  return { rows, declared: num(it[PLEDGE_FIELD.count]) };
}
