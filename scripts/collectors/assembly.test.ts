/**
 * 법안 처리 단계·국회 일정 순수 함수 테스트 (DB·네트워크·API 키 없이).  실행: npm test
 * 응답 값은 열린국회정보 필드 형식을 흉내 낸 예시입니다.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { billStage, isClosed, type BillDates } from "../../src/lib/bill-stage";
import { isoDate, kstDate, scheduleDays, toScheduleRows } from "./schedule-parse";

const bill = (d: Partial<BillDates>): BillDates => ({
  propose_date: "2026-09-01",
  committee_date: null,
  cmt_present_date: null,
  cmt_proc_date: null,
  cmt_proc_result: null,
  law_submit_date: null,
  law_present_date: null,
  law_proc_date: null,
  law_proc_result: null,
  proc_date: null,
  proc_result: null,
  ...d,
});

test("법안 단계: 발의만 → 발의, 진행 중", () => {
  const s = billStage(bill({}));
  assert.equal(s.reached, 0);
  assert.equal(s.status, "발의");
  assert.equal(s.closed, false);
  assert.equal(s.tone, "active");
  assert.deepEqual(s.latest, { date: "2026-09-01", text: "발의" });
});

test("법안 단계: 소관위 회부·상정 → 소관위 심사 중", () => {
  const s = billStage(bill({ committee_date: "2026-09-03", cmt_present_date: "2026-10-10" }));
  assert.equal(s.reached, 1);
  assert.equal(s.status, "소관위 심사 중");
  assert.equal(s.latest?.text, "소관위 상정");
});

test("법안 단계: 법사위 처리까지 → 본회의 대기", () => {
  const s = billStage(
    bill({
      committee_date: "2026-09-03",
      cmt_present_date: "2026-10-10",
      cmt_proc_date: "2026-10-20",
      cmt_proc_result: "수정가결",
      law_submit_date: "2026-10-21",
      law_present_date: "2026-11-10",
      law_proc_date: "2026-11-12",
      law_proc_result: "수정가결",
    }),
  );
  assert.equal(s.reached, 2);
  assert.equal(s.status, "본회의 대기");
  assert.equal(s.closed, false);
  assert.deepEqual(s.latest, { date: "2026-11-12", text: "법사위 수정가결" });
  assert.deepEqual(
    s.events.map((e) => e.text),
    ["발의", "소관위 회부", "소관위 상정", "소관위 수정가결", "법사위 회부", "법사위 상정", "법사위 수정가결"],
  );
});

test("법안 단계: 본회의 가결 → 끝, 좋은 색", () => {
  const s = billStage(bill({ committee_date: "2026-09-03", law_proc_date: "2026-11-12", proc_date: "2026-11-20", proc_result: "원안가결" }));
  assert.equal(s.reached, 3);
  assert.equal(s.status, "원안가결");
  assert.equal(s.closed, true);
  assert.equal(s.tone, "good");
  assert.deepEqual(s.latest, { date: "2026-11-20", text: "본회의 원안가결" });
});

test("법안 단계: 대안반영폐기는 위원회 단계에서 끝나고 '반영'으로 봄, 부결은 나쁜 색", () => {
  const alt = billStage(bill({ committee_date: "2026-09-03", cmt_proc_date: "2026-10-20", cmt_proc_result: "대안반영폐기" }));
  assert.equal(alt.reached, 1);
  assert.equal(alt.closed, true);
  assert.equal(alt.status, "소관위 대안반영폐기");
  assert.equal(alt.tone, "good");
  const no = billStage(bill({ committee_date: "2026-09-03", law_proc_date: "2026-11-12", proc_date: "2026-11-20", proc_result: "부결" }));
  assert.equal(no.reached, 3);
  assert.equal(no.tone, "bad");
});

test("법안 단계: 처리결과 '계류'·빈 값은 진행 중", () => {
  assert.equal(isClosed({ proc_result: "계류", cmt_proc_result: null, law_proc_result: null }), false);
  assert.equal(isClosed({ proc_result: " ", cmt_proc_result: null, law_proc_result: null }), false);
  assert.equal(isClosed({ proc_result: "철회", cmt_proc_result: null, law_proc_result: null }), true);
});

test("국회 일정: 날짜 형식 통일·요청한 날만·내용 없는 줄과 중복 제거", () => {
  assert.equal(isoDate("2026.11.24"), "2026-11-24");
  assert.equal(isoDate("20261124"), "2026-11-24");
  assert.equal(isoDate(""), null);
  const rows = toScheduleRows(
    [
      { SCH_DT: "2026-11-24", SCH_TM: "10:00", SCH_KIND: "본회의", SCH_CN: " 제431회 국회(정기회)\n제12차 본회의 ", CMIT_NM: null, EV_PLC: "본회의장" },
      { SCH_DT: "2026-11-24", SCH_TM: "10:00", SCH_KIND: "본회의", SCH_CN: "제431회 국회(정기회) 제12차 본회의", EV_PLC: "본회의장" },
      { SCH_DT: "2026-11-24", SCH_TM: "14:00", SCH_KIND: "위원회", SCH_CN: "전체회의", CMIT_NM: "법제사법위원회" },
      { SCH_DT: "2026-11-25", SCH_KIND: "위원회", SCH_CN: "다른 날 일정" },
      { SCH_DT: "2026-11-24", SCH_KIND: "세미나", SCH_CN: "" },
    ],
    "2026-11-24",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "제431회 국회(정기회) 제12차 본회의");
  assert.equal(rows[0].place, "본회의장");
  assert.equal(rows[1].committee, "법제사법위원회");
});

test("국회 일정: 한국 날짜 기준 3일 전 ~ 14일 뒤", () => {
  assert.equal(kstDate(new Date("2026-11-22T15:30:00Z")), "2026-11-23"); // 한국 0시 30분
  const days = scheduleDays("2026-11-22", 3, 14);
  assert.equal(days.length, 18);
  assert.equal(days[0], "2026-11-19");
  assert.equal(days[days.length - 1], "2026-12-06");
});
