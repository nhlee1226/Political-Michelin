/**
 * 용어 설명이 백과사전 데이터를 먼저 쓰는지 테스트.  실행: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { glossaryEntry } from "./glossary";
import { findPath } from "./encyclopedia/state-structure";
import { GLOSSARY } from "./mock-data";

test("백과사전에 있는 말은 백과사전 설명 + 칸 id", () => {
  const e = glossaryEntry("상임위원회");
  assert.equal(e?.nodeId, "standing-committees");
  assert.equal(e?.desc, findPath("standing-committees")?.at(-1)?.desc);
});

test("백과사전에 없는 말은 기존 용어 설명, 칸 id 없음", () => {
  const e = glossaryEntry("필리버스터");
  assert.equal(e?.desc, GLOSSARY["필리버스터"]);
  assert.equal(e?.nodeId, undefined);
});

test("어디에도 없는 말은 undefined", () => {
  assert.equal(glossaryEntry("없는말"), undefined);
});
