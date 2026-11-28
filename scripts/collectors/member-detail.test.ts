/**
 * 정치인 상세 수집·입력 변환 테스트 (DB·네트워크·API 키 없이).  실행: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cosponsorNames, memberProfile, num, parseCsv, recordRows } from "./member-detail-parse";

test("공동발의자: 쉼표·의원·괄호·가운뎃점 표기", () => {
  assert.deepEqual(cosponsorNames("홍길동,김철수,이영희"), ["홍길동", "김철수", "이영희"]);
  assert.deepEqual(cosponsorNames("홍길동의원 김철수의원"), ["홍길동", "김철수"]);
  assert.deepEqual(cosponsorNames("홍길동(더불어민주당)·김철수(국민의힘), 홍길동"), ["홍길동", "김철수"]);
  assert.deepEqual(cosponsorNames(""), []);
  assert.deepEqual(cosponsorNames(null), []);
  assert.deepEqual(cosponsorNames("Kim, 김"), []);
});

test("인적사항: 빈 값은 null, 홈페이지에 http 붙임", () => {
  const p = memberProfile({ TEL_NO: " 02-784-1234 ", E_MAIL: "", HOMEPAGE: "www.example.kr", MEM_TITLE: "[학력]\r\n서울대" });
  assert.equal(p.tel, "02-784-1234");
  assert.equal(p.email, null);
  assert.equal(p.homepage, "http://www.example.kr");
  assert.equal(p.career, "[학력]\n서울대");
  assert.equal(memberProfile({ HOMEPAGE: "없음" }).homepage, null);
});

test("CSV: 따옴표 안 쉼표·줄바꿈, BOM, 빈 줄", () => {
  const rows = parseCsv('﻿name,year,total\r\n"홍길동",2025,"1,234"\n\n김철수,2025,"여러\n줄"\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: "홍길동", year: "2025", total: "1,234" });
  assert.equal(rows[1].total, "여러\n줄");
});

test("숫자: 쉼표·단위 글자 허용", () => {
  assert.equal(num("1,234"), 1234);
  assert.equal(num("-500원"), -500);
  assert.equal(num(""), null);
  assert.equal(num("abc"), null);
});

test("기록 행: 의원 찾기·검증", () => {
  const resolve = (m?: string, n?: string) => (m === "M1" ? "M1" : n === "홍길동" ? "M2" : null);
  const att = recordRows(
    "attendance",
    [
      { name: "홍길동", kind: "본회의", period: "제418회", attended: "9", total: "10" },
      { name: "없는사람", kind: "본회의", period: "제418회", attended: "9", total: "10" },
      { mona_cd: "M1", kind: "본회의", period: "제418회", attended: "11", total: "10" },
      { mona_cd: "M1", kind: "소위", period: "제418회", attended: "1", total: "10" },
    ],
    resolve,
  );
  assert.equal(att.values.length, 1);
  assert.deepEqual(att.values[0], { monaCd: "M2", kind: "본회의", period: "제418회", attended: 9, total: 10, sourceUrl: null });
  assert.deepEqual(att.issues.map((i) => i.line), [3, 4, 5]);

  const assets = recordRows("assets", [{ mona_cd: "M1", year: "2025", total: "1,500,000", debts: "-200" }], resolve);
  assert.equal(assets.values[0].total, 1500000);
  assert.equal(assets.values[0].debts, -200);
  assert.equal(assets.values[0].realEstate, null);

  const funds = recordRows("funds", [{ mona_cd: "M1", year: "2025", income: "100", expense: "" }], resolve);
  assert.equal(funds.values.length, 0);
  assert.match(funds.issues[0].reason, /빈 칸: expense/);
});
