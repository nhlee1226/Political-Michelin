/**
 * 정치 용어 설명 — 본문 속 [[용어]] 툴팁(glossary-text.tsx)이 씀.
 * 국가 구조 백과사전(encyclopedia/state-structure.ts)에 있는 기관·용어는 그 설명을 쓰고 칸 id 를 함께 돌려줘
 * 툴팁에서 백과사전으로 이어지게 한다. 없는 말(필리버스터 등)은 기존 GLOSSARY 설명.
 */
import { findByTerm } from "./encyclopedia/state-structure";
import { GLOSSARY } from "./mock-data";

export interface GlossaryEntry {
  desc: string;
  /** 백과사전 칸 id — 있으면 /encyclopedia?node=<id> 로 연결 */
  nodeId?: string;
}

export function glossaryEntry(term: string): GlossaryEntry | undefined {
  const node = findByTerm(term);
  if (node) return { desc: node.desc, nodeId: node.id };
  const desc = GLOSSARY[term];
  return desc ? { desc } : undefined;
}
