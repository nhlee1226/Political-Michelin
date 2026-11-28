/**
 * 국가 구조 백과사전 내용 검수 표 → docs/encyclopedia-review.md
 * 실행: npm run encyclopedia:review   (데이터: src/lib/encyclopedia/state-structure.ts)
 * 칸마다 위치·이름·설명·근거 법을 한 줄로 보여 줘, 사람이 법 원문과 대조하기 쉽게 한다.
 */
import { writeFileSync } from "node:fs";
import { AS_OF, STATE_ROOT, type OrgNode } from "../src/lib/encyclopedia/state-structure";

/** 아직 법 원문과 대조하지 못한 칸 → 표에 ⚠ 표시 */
const UNVERIFIED: Record<string, string> = {
  "standing-committees": "상임위 17개 이름은 위키백과(2026-06) 기준, 국회법 제37조 원문 미대조",
  kcc: "대통령 소속 여부를 설치법 원문으로 미확인",
  kasa: "과학기술정보통신부 소속(우주항공청법) 원문 미확인",
  naacc: "국토교통부 소속 원문 미확인",
  saemangeum: "국토교통부 소속 원문 미확인",
};

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const rows: string[] = [];
const walk = (node: OrgNode, path: string[], parentFlag?: string) => {
  const flag = UNVERIFIED[node.id] ?? parentFlag;
  rows.push(`| ${rows.length + 1} | ${cell(path.join(" › ") || "—")} | **${cell(node.name)}** | ${cell(node.desc)} | ${cell(node.law)} | ${flag ? `⚠ ${cell(flag)}` : ""} |`);
  for (const c of node.children ?? []) walk(c, [...path, node.name], UNVERIFIED[node.id] && node.id === "standing-committees" ? flag : undefined);
};
walk(STATE_ROOT, []);

const out = `# 국가 구조 백과사전 — 내용 검수 표

${AS_OF} 기준 · 칸 ${rows.length}개 · 자동 생성(\`npm run encyclopedia:review\`) — 이 파일을 직접 고치지 말고 \`src/lib/encyclopedia/state-structure.ts\` 를 고친 뒤 다시 만드세요.

확인 기준: 행정부는 정부조직법(법률 제21491호, 2026-10-02 시행) 원문으로 대조함. ⚠ 표시는 아직 원문과 대조하지 못한 칸.

| # | 위치 | 이름 | 설명 | 근거 | 확인 |
|---|---|---|---|---|---|
${rows.join("\n")}
`;
writeFileSync("docs/encyclopedia-review.md", out);
console.log(`docs/encyclopedia-review.md: 칸 ${rows.length}개 (⚠ ${rows.filter((r) => r.includes("⚠")).length}개)`);
