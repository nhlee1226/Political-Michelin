/**
 * 법안 처리 단계 계산 — 열린국회정보 '의원 발의법률안'의 단계별 날짜(bills 표)로 "지금 어디까지 왔는지"를 정함.
 * 서버(/api/bills)와 테스트가 함께 쓰는 순수 함수. 판단은 날짜·처리결과 원천 표기만 보고, 정당·의원과 무관.
 *
 * 단계: 발의 → 소관위(소관 상임위원회 심사) → 법사위(체계·자구 심사) → 본회의(의결)
 * 실시간 표결 진행 상황과 공포일은 이 데이터에 없음 → 마지막 단계는 본회의 가결·부결까지.
 */
export const BILL_STEPS = ["발의", "소관위", "법사위", "본회의"] as const;

export interface BillDates {
  propose_date: string | null;
  committee_date: string | null; // 소관위 회부
  cmt_present_date: string | null; // 소관위 상정
  cmt_proc_date: string | null; // 소관위 처리
  cmt_proc_result: string | null;
  law_submit_date: string | null; // 법사위 회부
  law_present_date: string | null; // 법사위 상정
  law_proc_date: string | null; // 법사위 처리
  law_proc_result: string | null;
  proc_date: string | null; // 본회의 의결
  proc_result: string | null;
}

export type BillTone = "active" | "good" | "bad" | "neutral";

export interface BillStage {
  /** 가장 멀리 간 단계 (BILL_STEPS 번호) */
  reached: 0 | 1 | 2 | 3;
  /** 지금 상태 한 줄 (예: 법사위 심사 중, 본회의 대기, 원안가결) */
  status: string;
  /** 처리가 끝났는지 (가결·부결·폐기·철회 등) */
  closed: boolean;
  tone: BillTone;
  /** 날짜순 단계 기록 */
  events: { date: string; text: string }[];
  /** 가장 최근 단계 */
  latest: { date: string; text: string } | null;
}

const has = (s: string | null | undefined): s is string => !!s && s.trim() !== "";
const VOTED = /가결|부결/;
const ENDED = /폐기|철회/;

/** 본회의 처리결과가 있으면 끝난 법안 ('계류'는 아직 진행 중) */
export function isClosed(d: Pick<BillDates, "proc_result" | "cmt_proc_result" | "law_proc_result">): boolean {
  if (has(d.proc_result) && d.proc_result.trim() !== "계류") return true;
  return ENDED.test(d.cmt_proc_result ?? "") || ENDED.test(d.law_proc_result ?? "");
}

export function billStage(d: BillDates): BillStage {
  const closed = isClosed(d);
  const finalResult = has(d.proc_result) && d.proc_result.trim() !== "계류" ? d.proc_result.trim() : null;

  const steps: [string | null, string][] = [
    [d.propose_date, "발의"],
    [d.committee_date, "소관위 회부"],
    [d.cmt_present_date, "소관위 상정"],
    [d.cmt_proc_date, `소관위 ${d.cmt_proc_result?.trim() || "의결"}`],
    [d.law_submit_date, "법사위 회부"],
    [d.law_present_date, "법사위 상정"],
    [d.law_proc_date, `법사위 ${d.law_proc_result?.trim() || "의결"}`],
    [d.proc_date, finalResult && !VOTED.test(finalResult) ? finalResult : `본회의 ${finalResult ?? "의결"}`],
  ];
  // 날짜순 (같은 날이면 단계 순서 유지)
  const events = steps
    .map(([date, text], i) => ({ date: date ?? "", text, i }))
    .filter((e) => e.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i)
    .map(({ date, text }) => ({ date, text }));

  const reached: BillStage["reached"] =
    (finalResult && VOTED.test(finalResult)) || (has(d.proc_date) && !finalResult)
      ? 3
      : has(d.law_submit_date) || has(d.law_present_date) || has(d.law_proc_date)
        ? 2
        : has(d.committee_date) || has(d.cmt_present_date) || has(d.cmt_proc_date)
          ? 1
          : 0;

  let status: string;
  if (finalResult) status = finalResult;
  else if (closed) status = ENDED.test(d.law_proc_result ?? "") ? `법사위 ${d.law_proc_result!.trim()}` : `소관위 ${d.cmt_proc_result!.trim()}`;
  else if (reached === 3) status = "본회의 의결";
  else if (reached === 2) status = has(d.law_proc_date) ? "본회의 대기" : has(d.law_present_date) ? "법사위 심사 중" : "법사위 회부";
  else if (reached === 1) status = has(d.cmt_proc_date) ? "법사위 회부 대기" : has(d.cmt_present_date) ? "소관위 심사 중" : "소관위 회부";
  else status = "발의";

  const tone: BillTone = !closed ? "active" : /가결|대안반영/.test(status) ? "good" : /부결|폐기|철회/.test(status) ? "bad" : "neutral";

  return { reached, status, closed, tone, events, latest: events.at(-1) ?? null };
}
