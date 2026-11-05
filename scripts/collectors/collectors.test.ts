/**
 * 수집기 순수 함수 테스트 (DB·네트워크·API 키 없이 실행).  실행: npm test
 * 선관위 응답은 공공데이터포털 문서 형식을 흉내 낸 예시 값입니다.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDictionary, findMentions } from "./mentions";
import { clean, cleanUrl } from "./naver-api";
import { applyCounts, buildCandidates, buildTurnout, partiesFromCandidates, type Item } from "./nec-parse";
import { detectRegion } from "./region";

const el = { sgId: "20240410", sgTypecode: "2" };
const lookup = new Map([
  ["서울특별시", "11"],
  ["서울", "11"],
  ["부산광역시", "21"],
]);

const cand = (huboid: string, name: string, jdName: string, sggName: string, sdName = "서울특별시"): Item => ({
  huboid,
  name,
  jdName,
  sdName,
  sggName,
  wiwName: sggName.replace(/[갑을병]$/, ""),
  giho: huboid.slice(-1),
});

test("후보 + 당선인: 당선 표시와 득표수·득표율(문자열·콤마)이 들어감", () => {
  const rows = buildCandidates(
    [cand("1001", "가나다", "정당갑", "종로구"), cand("1002", "라마바", "정당을", "종로구")],
    [{ ...cand("1001", "가나다", "정당갑", "종로구"), dugsu: "45,123", dugyul: "52.31" }],
    el,
    lookup,
  );
  assert.equal(rows.length, 2);
  const w = rows.find((r) => r.huboid === "1001")!;
  assert.equal(w.isWinner, true);
  assert.equal(w.votes, 45123);
  assert.equal(w.voteRate, 52.31);
  assert.equal(w.regionCode, "11");
  assert.equal(rows.find((r) => r.huboid === "1002")!.isWinner, false);
});

test("후보자 API 가 비어도 당선인만으로 행을 만듦", () => {
  const rows = buildCandidates([], [{ ...cand("2001", "사아자", "정당갑", "해운대구갑", "부산광역시"), dugsu: 100, dugyul: 50 }], el, lookup);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].regionCode, "21");
});

test("개표결과: 구시군 줄을 합산해 선거구 합계 + 낙선 후보 득표수·득표율 계산", () => {
  const rows = buildCandidates(
    [cand("1001", "가나다", "정당갑", "종로구"), cand("1002", "라마바", "정당을", "종로구")],
    [{ ...cand("1001", "가나다", "정당갑", "종로구"), dugsu: "600", dugyul: "60.00" }],
    el,
    lookup,
  );
  const counts: Item[] = [
    { sdName: "서울특별시", sggName: "종로구", wiwName: "종로구", sunsu: "800", tusu: "550", yutusu: "540", mutusu: "10", hbj01: "가나다", jd01: "정당갑", dugsu01: "330", hbj02: "라마바", jd02: "정당을", dugsu02: "210" },
    { sdName: "서울특별시", sggName: "종로구", wiwName: "중구", sunsu: "700", tusu: "460", yutusu: "460", mutusu: "0", hbj01: "가나다", jd01: "정당갑", dugsu01: "270", hbj02: "라마바", jd02: "정당을", dugsu02: "190" },
  ];
  const { districts, matched } = applyCounts(rows, counts, el, lookup);
  assert.equal(districts.length, 1);
  assert.deepEqual(
    { electors: districts[0].electors, voters: districts[0].voters, valid: districts[0].validVotes },
    { electors: 1500, voters: 1010, valid: 1000 },
  );
  assert.equal(matched, 2);
  const loser = rows.find((r) => r.huboid === "1002")!;
  assert.equal(loser.votes, 400);
  assert.equal(loser.voteRate, 40);
  // 당선인 API 값은 유지
  assert.equal(rows.find((r) => r.huboid === "1001")!.votes, 600);
});

test("개표결과: 합계 줄이 있으면 그 줄만 쓰고, 동명이인은 연결하지 않음", () => {
  const rows = buildCandidates(
    [cand("1", "홍길동", "정당갑", "강남구갑"), cand("2", "홍길동", "정당을", "강남구갑")],
    [],
    el,
    lookup,
  );
  const counts: Item[] = [
    { sdName: "서울특별시", sggName: "강남구갑", wiwName: "합계", yutusu: "100", hbj01: "홍길동", dugsu01: "60", hbj02: "홍길동", dugsu02: "40" },
    { sdName: "서울특별시", sggName: "강남구갑", wiwName: "강남구", yutusu: "999", hbj01: "홍길동", dugsu01: "999" },
  ];
  const { districts, matched } = applyCounts(rows, counts, el, lookup);
  assert.equal(districts[0].validVotes, 100);
  assert.equal(matched, 0);
  assert.ok(rows.every((r) => r.votes === null));
});

test("투표율: 시도 합계 줄이 없으면 구시군을 더해 계산", () => {
  const rows = buildTurnout(
    [
      { sdName: "서울특별시", wiwName: "종로구", totSunsu: "1,000", totTusu: "700", Turnout: "70.0" },
      { sdName: "서울특별시", wiwName: "중구", totSunsu: "1000", totTusu: "600" },
      { sdName: "부산광역시", wiwName: "합계", totSunsu: "2000", totTusu: "1300", Turnout: "65.00" },
    ],
    el,
    lookup,
  );
  const seoul = rows.find((r) => r.sdName === "서울특별시" && r.wiwName === "")!;
  assert.equal(seoul.electors, 2000);
  assert.equal(seoul.voters, 1300);
  assert.equal(seoul.turnout, 65);
  assert.equal(rows.find((r) => r.sdName === "서울특별시" && r.wiwName === "중구")!.turnout, 60);
  assert.equal(rows.find((r) => r.sdName === "부산광역시" && r.wiwName === "")!.turnout, 65);
});

test("정당: 당선인 많은 순으로 중립 팔레트 색 배정", () => {
  const rows = buildCandidates(
    [cand("1", "a", "정당을", "x"), cand("2", "b", "정당갑", "y"), cand("3", "c", "정당갑", "z")],
    [cand("2", "b", "정당갑", "y"), cand("3", "c", "정당갑", "z")],
    el,
    lookup,
  );
  const ps = partiesFromCandidates(rows);
  assert.deepEqual(ps.map((p) => p.id), ["정당갑", "정당을"]);
  assert.equal(ps[0].color, "#14a894");
  assert.equal(partiesFromCandidates(buildCandidates([cand("9", "d", "무소속", "w")], [], el, lookup))[0].color, "#6b7280");
});

test("지역 판별: 제목 가중치, 헷갈리는 표기 제외", () => {
  assert.equal(detectRegion("부산 시민들 반발", "서울에서도"), "21");
  assert.equal(detectRegion("경기 침체 우려", null), null);
  assert.equal(detectRegion("세종대왕 동상", null), null);
  assert.equal(detectRegion("경기도의회 예산안", null), "31");
});

test("언급: 동명이인·짧은 표기는 빼고, 같은 대상은 한 번만", () => {
  const dict = buildDictionary([
    { kind: "party", ref: "정당갑당", label: "정당갑당", terms: ["정당갑당", "갑당"] },
    { kind: "candidate", ref: "x:1", label: "홍길동", terms: ["홍길동"] },
    { kind: "candidate", ref: "x:2", label: "홍길동", terms: ["홍길동"] },
    { kind: "candidate", ref: "x:3", label: "김철수", terms: ["김철수"] },
  ]);
  assert.equal(dict.has("갑당"), false); // 두 글자
  assert.equal(dict.has("홍길동"), false); // 동명이인
  const hits = findMentions("정당갑당 김철수 의원, 정당갑당 대표와 회동 (홍길동 동석)", dict);
  assert.deepEqual(hits.map((h) => h.ref).sort(), ["x:3", "정당갑당"]);
});

test("네이버 응답 정리: 태그·엔티티(이름·숫자) 제거", () => {
  assert.equal(clean("<b>국회</b> &quot;예산&quot; &amp; 법안&#39;s &#x41;"), '국회 "예산" & 법안\'s A');
});

test("URL 정리: utm_* 와 #해시 제거", () => {
  assert.equal(cleanUrl("https://a.kr/x?id=1&utm_source=n#top"), "https://a.kr/x?id=1");
  assert.equal(cleanUrl(""), null);
});
