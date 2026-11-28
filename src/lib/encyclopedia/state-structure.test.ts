/**
 * 국가 구조 백과사전 데이터·트리 함수 테스트 (DB·네트워크 없이).  실행: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { STATE_ROOT, allNodes, defaultExpanded, findByTerm, findPath, visibleIds } from "./state-structure";

const nodes = allNodes();

test("id 는 모두 다르고 영문 소문자·숫자·하이픈", () => {
  const ids = nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/, id);
});

test("모든 칸에 이름·설명·근거 법", () => {
  for (const n of nodes) {
    assert.ok(n.name.trim(), n.id);
    assert.ok(n.desc.trim().length >= 10, `${n.id} 설명이 너무 짧음`);
    assert.ok(n.law.trim(), `${n.id} 근거 법 없음`);
  }
});

test("첫 층은 입법·행정·사법·헌법재판소·선관위·지방자치", () => {
  assert.equal(STATE_ROOT.id, "korea");
  assert.deepEqual(
    STATE_ROOT.children?.map((n) => n.id),
    ["legislature", "executive", "judiciary", "const-court", "nec", "local"],
  );
});

test("행정각부 19개, 정부조직법 제29조 순서", () => {
  const ministries = findPath("ministries")?.at(-1);
  assert.deepEqual(
    ministries?.children?.map((n) => n.name),
    [
      "재정경제부", "과학기술정보통신부", "교육부", "외교부", "통일부", "법무부", "국방부", "행정안전부", "국가보훈부",
      "문화체육관광부", "농림축산식품부", "산업통상부", "보건복지부", "기후에너지환경부", "고용노동부", "성평등가족부",
      "국토교통부", "해양수산부", "중소벤처기업부",
    ],
  );
});

test("2025-10 정부조직 개편 전 이름은 칸 이름에 없음", () => {
  const old = ["기획재정부", "검찰청", "환경부", "여성가족부", "산업통상자원부", "통계청", "특허청", "방송통신위원회", "기획재정위원회", "환경노동위원회", "여성가족위원회"];
  for (const n of nodes) assert.ok(!old.includes(n.name), `옛 이름: ${n.name}`);
});

test("상임위원회 17개", () => {
  assert.equal(findPath("standing-committees")?.at(-1)?.children?.length, 17);
});

test("findPath: 루트부터 그 칸까지, 없는 id 는 null", () => {
  assert.deepEqual(findPath("pm")?.map((n) => n.name), ["대한민국(헌법)", "행정부", "국무총리"]);
  assert.equal(findPath("xyz"), null);
  assert.equal(findPath(""), null);
});

test("findByTerm: 이름이나 다른 이름으로 찾기", () => {
  assert.equal(findByTerm("상임위원회")?.id, "standing-committees");
  assert.equal(findByTerm("국정감사"), undefined);
});

test("visibleIds: 펼친 칸의 자식만 깊이 우선으로", () => {
  const first = ["korea", "legislature", "executive", "judiciary", "const-court", "nec", "local"];
  assert.deepEqual(visibleIds(STATE_ROOT, defaultExpanded()), first);
  const opened = visibleIds(STATE_ROOT, new Set(["korea", "executive"]));
  const i = opened.indexOf("executive");
  assert.deepEqual(opened.slice(i, i + 3), ["executive", "president", "pm"]);
  assert.equal(opened.at(-1), "local");
  assert.deepEqual(visibleIds(STATE_ROOT, new Set()), ["korea"]);
});
