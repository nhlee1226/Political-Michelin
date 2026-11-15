/**
 * 열린국회정보 국회의원 본회의 표결정보(nojepdqqaweusdfbi) 응답 → bill_votes 행 (DB·네트워크 없이 동작하는 순수 함수)
 * 응답 필드 이름이 바뀌면 VOTE_FIELD 만 고치면 됩니다. 원본 샘플은 raw_responses 의 assembly:votes 에 저장됩니다.
 */

export const VOTE_FIELD = {
  billId: "BILL_ID",
  monaCd: "MONA_CD",
  name: "HG_NM",
  result: "RESULT_VOTE_MOD", // 찬성 / 반대 / 기권 / 불참
  date: "VOTE_DATE", // '20261001 144959'
} as const;

/** bill_votes.result 에 들어갈 수 있는 값 (스키마의 check 제약과 같음) */
export const VOTE_RESULTS = ["찬성", "반대", "기권", "불참"] as const;
export type VoteResult = (typeof VOTE_RESULTS)[number];

/**
 * 본회의 표결이 있는 처리 결과(bills.proc_result).
 * 대안반영폐기·수정안반영폐기·철회·폐기는 본회의에서 따로 표결하지 않아 표결 API 에 데이터가 없음 (2026-11 표본 확인)
 */
export const VOTED_RESULTS = ["원안가결", "수정가결", "부결"];

export type VoteItem = Record<string, string | number | null | undefined>;

export interface VoteRow {
  billId: string;
  monaCd: string;
  result: VoteResult;
  voteDate: string;
}

/** '20261001 144959', '2026-10-01 14:49:59', '20261001' → '2026-10-01' */
export function voteDate(raw: unknown): string | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(raw ?? "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const isResult = (s: string): s is VoteResult => (VOTE_RESULTS as readonly string[]).includes(s);

/**
 * 한 법안의 표결 응답 → bill_votes 행
 * - members 에 없는 의원(MONA_CD)은 외래키 때문에 넣을 수 없어 건너뜀 (임기 중 사퇴·의원직 상실 등)
 * - 다른 법안 줄, 찬성·반대·기권·불참 이외 값, 날짜 없는 줄은 건너뜀
 * - 같은 의원이 두 번 나오면 나중 날짜 하나만 (한 번의 upsert 에 같은 키가 두 번 들어가면 오류)
 */
export function toVoteRows(billId: string, items: VoteItem[], knownMembers: Set<string>) {
  const byMember = new Map<string, VoteRow>();
  const unknownMembers = new Map<string, string>(); // MONA_CD → 이름 (안내용)
  let invalid = 0;

  for (const it of items) {
    const itemBill = String(it[VOTE_FIELD.billId] ?? "").trim();
    const monaCd = String(it[VOTE_FIELD.monaCd] ?? "").trim();
    const result = String(it[VOTE_FIELD.result] ?? "").trim();
    const date = voteDate(it[VOTE_FIELD.date]);
    if ((itemBill && itemBill !== billId) || !monaCd || !date || !isResult(result)) {
      invalid++;
      continue;
    }
    if (!knownMembers.has(monaCd)) {
      unknownMembers.set(monaCd, String(it[VOTE_FIELD.name] ?? "").trim());
      continue;
    }
    const prev = byMember.get(monaCd);
    if (!prev || prev.voteDate <= date) byMember.set(monaCd, { billId, monaCd, result, voteDate: date });
  }
  return { rows: [...byMember.values()], unknownMembers, invalid };
}
