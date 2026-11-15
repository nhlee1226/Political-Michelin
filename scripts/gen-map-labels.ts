/**
 * 지도 시·도 이름 위치 계산 → src/lib/korea-map-labels.ts 생성
 * 실행: npx tsx scripts/gen-map-labels.ts   (korea-map-data.ts 를 다시 만들었을 때만)
 * 계산이 1~2초 걸려서 브라우저에서 하지 않고 미리 만들어 둡니다.
 * ------------------------------------------------------------------
 *  - 큰 시·도: 가장 큰 조각(주변 섬 제외) 안에서 경계와 가장 먼 점(polylabel).
 *    그 안에 들어 있는 다른 시(광주·대전·서울 등)는 구멍으로 빼고 계산.
 *    이름 상자가 경계에 닿으면 그 근처에서 경계에 닿지 않는 가장 가까운 점으로 옮김.
 *  - 작은 시(서울·부산·대구·인천·광주·대전·울산·세종): 시 바깥 가까운 빈 곳에 이름을 두고 가는 선으로 연결.
 *    이름끼리, 이름과 어떤 시·도 경계도 겹치지 않는 자리 중 가장 가까운 곳.
 * 좌표계는 korea-map-data 의 viewBox(MAP_WIDTH × MAP_HEIGHT) 그대로.
 */
import { writeFileSync } from "node:fs";
import { MAP_HEIGHT, MAP_WIDTH, REGION_PATHS } from "../src/lib/korea-map-data";

type Pt = [number, number];
type Ring = Pt[];

export const SMALL_CITIES = ["11", "21", "22", "23", "24", "25", "26", "29"];

/** 이름 상자 크기 (선택 시 그리는 알약 모양과 같은 크기 → 선택돼도 겹치지 않음) */
export const LABEL_W = 34;
export const LABEL_H = 16;

export interface RegionLabel {
  code: string;
  /** 시·도 안의 기준점 (작은 시는 연결선 시작점, 이슈 급상승 점 위치) */
  anchor: { x: number; y: number };
  /** 이름 상자 가운데 */
  x: number;
  y: number;
  /** 작은 시: 바깥에 둔 이름 → 연결선 끝점 (이름 상자 가장자리) */
  leader: { x: number; y: number } | null;
}

/* ── 기하 도우미 ── */

function parseRings(d: string): Ring[] {
  return d
    .split(/[Mm]/)
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/[Zz]/g, "")
        .split(/[Ll]/)
        .filter(Boolean)
        .map((xy) => xy.split(",").map(Number) as Pt),
    );
}

function ringArea(r: Ring) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

function inRing(x: number, y: number, r: Ring) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist2(px: number, py: number, a: Pt, b: Pt) {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** 다각형(바깥 고리 + 구멍) 안이면 +, 밖이면 − 인 경계까지 거리 */
function signedDist(x: number, y: number, poly: Ring[]) {
  let inside = false;
  let min = Infinity;
  for (const r of poly) {
    if (inRing(x, y, r)) inside = !inside;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) min = Math.min(min, segDist2(x, y, r[i], r[j]));
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}

/** polylabel (Mapbox 알고리즘): 경계에서 가장 먼 내부 점 */
function polylabel(poly: Ring[], precision = 0.5): { x: number; y: number; d: number } {
  const outer = poly[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const size = Math.min(maxX - minX, maxY - minY);
  type Cell = { x: number; y: number; h: number; d: number; max: number };
  const cell = (x: number, y: number, h: number): Cell => {
    const d = signedDist(x, y, poly);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const queue: Cell[] = [];
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) queue.push(cell(x + size / 2, y + size / 2, size / 2));
  // 처음 후보: 넓이 중심
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  while (queue.length) {
    queue.sort((a, b) => b.max - a.max);
    const c = queue.shift()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const h = c.h / 2;
    queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return { x: best.x, y: best.y, d: best.d };
}

/* ── 상자 충돌 ── */

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const boxAt = (x: number, y: number, pad = 0): Box => ({
  x0: x - LABEL_W / 2 - pad,
  y0: y - LABEL_H / 2 - pad,
  x1: x + LABEL_W / 2 + pad,
  y1: y + LABEL_H / 2 + pad,
});
const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function segHitsBox(a: Pt, b: Pt, box: Box) {
  // 끝점이 상자 안
  const inBox = (p: Pt) => p[0] >= box.x0 && p[0] <= box.x1 && p[1] >= box.y0 && p[1] <= box.y1;
  if (inBox(a) || inBox(b)) return true;
  // 상자 네 변과 교차 (Liang–Barsky)
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, a[0] - box.x0) && clip(dx, box.x1 - a[0]) && clip(-dy, a[1] - box.y0) && clip(dy, box.y1 - a[1]);
}

/* ── 계산 ── */

const RINGS: Record<string, Ring[]> = Object.fromEntries(Object.entries(REGION_PATHS).map(([c, d]) => [c, parseRings(d)]));
const ALL_EDGES: [Pt, Pt][] = Object.values(RINGS).flatMap((rings) =>
  rings.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]] as [Pt, Pt])),
);
const mainRing = (code: string) => RINGS[code].reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));

const boxClear = (box: Box) => !ALL_EDGES.some(([a, b]) => segHitsBox(a, b, box));
const inMap = (box: Box) => box.x0 >= 2 && box.y0 >= 2 && box.x1 <= MAP_WIDTH - 2 && box.y1 <= MAP_HEIGHT - 2;

function computeLabels(): Record<string, RegionLabel> {
  const codes = Object.keys(REGION_PATHS);
  const anchors: Record<string, { x: number; y: number; d: number }> = {};

  // 1) 기준점: 가장 큰 조각 안, 그 안에 든 다른 시·도는 구멍으로
  for (const c of codes) {
    const outer = mainRing(c);
    // 꼭짓점의 90% 이상이 안쪽이면 그 안에 든 시 (경계를 같이 쓰는 이웃은 꼭짓점 하나가 경계 위에 걸려도 제외)
    const holes = codes
      .filter((o) => o !== c)
      .map(mainRing)
      .filter((r) => r.filter(([x, y]) => inRing(x, y, outer)).length >= r.length * 0.9);
    anchors[c] = polylabel([outer, ...holes]);
  }

  const placed: Box[] = [];
  const out: Record<string, RegionLabel> = {};

  // 2) 큰 시·도: 기준점에 두되 상자가 경계에 닿으면 가장 가까운 빈 자리로
  for (const c of codes.filter((c) => !SMALL_CITIES.includes(c))) {
    const a = anchors[c];
    const outer = mainRing(c);
    let pos = { x: a.x, y: a.y };
    if (!boxClear(boxAt(a.x, a.y))) {
      search: for (let r = 2; r <= 40; r += 2) {
        for (let k = 0; k < 24; k++) {
          const t = (k / 24) * Math.PI * 2;
          const x = a.x + r * Math.cos(t);
          const y = a.y + r * Math.sin(t);
          const box = boxAt(x, y);
          if (inRing(x, y, outer) && boxClear(box)) {
            pos = { x, y };
            break search;
          }
        }
      }
    }
    placed.push(boxAt(pos.x, pos.y, 1.5));
    out[c] = { code: c, anchor: { x: a.x, y: a.y }, x: pos.x, y: pos.y, leader: null };
  }

  // 3) 작은 시: 바깥 가까운 빈 곳 (경계·다른 이름과 겹치지 않는 가장 가까운 자리), 작은 시끼리는 큰 것부터
  const smalls = SMALL_CITIES.filter((c) => RINGS[c]).sort((a, b) => ringArea(mainRing(b)) - ringArea(mainRing(a)));
  for (const c of smalls) {
    const a = anchors[c];
    let best: { x: number; y: number; score: number } | null = null;
    for (let r = 14; r <= 90 && !best; r += 3) {
      for (let k = 0; k < 32; k++) {
        const t = (k / 32) * Math.PI * 2;
        const x = a.x + r * Math.cos(t);
        const y = a.y + r * Math.sin(t);
        const box = boxAt(x, y);
        if (!inMap(box) || !boxClear(box) || placed.some((p) => boxesOverlap(p, box))) continue;
        // 연결선이 다른 이름 상자를 지나가지 않게
        const hitsLabel = placed.some((p) => segHitsBox([a.x, a.y], [x, y], p));
        if (hitsLabel) continue;
        const score = r; // 같은 반지름 안에서는 처음 찾은 방향
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    const pos = best ?? { x: a.x, y: a.y - 18 };
    placed.push(boxAt(pos.x, pos.y, 1.5));
    // 연결선 끝: 기준점 → 상자 가운데 방향으로 상자 가장자리
    const dx = a.x - pos.x;
    const dy = a.y - pos.y;
    const s = Math.min(Math.abs((LABEL_W / 2) / (dx || 1e-9)), Math.abs((LABEL_H / 2) / (dy || 1e-9)));
    out[c] = { code: c, anchor: { x: a.x, y: a.y }, x: pos.x, y: pos.y, leader: { x: pos.x + dx * s, y: pos.y + dy * s } };
  }
  return out;
}

/** 이름끼리·이름과 경계 겹침, 지도 밖 */
function labelProblems(labels: Record<string, RegionLabel>) {
  const list = Object.values(labels);
  const problems: string[] = [];
  list.forEach((l, i) => {
    const box = boxAt(l.x, l.y);
    if (!boxClear(box)) problems.push(`${l.code}: 경계와 겹침`);
    if (!inMap(box)) problems.push(`${l.code}: 지도 밖`);
    list.slice(i + 1).forEach((m) => {
      if (boxesOverlap(box, boxAt(m.x, m.y))) problems.push(`${l.code}↔${m.code}: 이름 겹침`);
    });
  });
  return problems;
}

/* ── 생성 ── */

const labels = computeLabels();
const problems = labelProblems(labels);
// 기준점이 자기 시·도 안에 있는지 (가장 큰 조각 기준)
for (const l of Object.values(labels)) {
  if (!inRing(l.anchor.x, l.anchor.y, mainRing(l.code))) problems.push(`${l.code}: 기준점이 시·도 밖`);
  if (!l.leader && !inRing(l.x, l.y, mainRing(l.code))) problems.push(`${l.code}: 이름이 시·도 밖`);
}
if (problems.length) {
  console.error("이름 배치 문제:", problems);
  process.exit(1);
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const rows = Object.values(labels)
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((l) => {
    const leader = l.leader ? `{ x: ${r1(l.leader.x)}, y: ${r1(l.leader.y)} }` : "null";
    return `  "${l.code}": { anchor: { x: ${r1(l.anchor.x)}, y: ${r1(l.anchor.y)} }, x: ${r1(l.x)}, y: ${r1(l.y)}, leader: ${leader} },`;
  });

const file = `// AUTO-GENERATED by scripts/gen-map-labels.ts from korea-map-data.ts. Do not edit by hand.
// 시·도 이름 위치: 큰 시·도는 가장 큰 조각 안 경계에서 가장 먼 점(polylabel), 작은 시는 바깥 빈 곳 + 연결선.

/** 이름 상자 크기 (선택 시 알약 모양과 같은 크기) */
export const LABEL_W = ${LABEL_W};
export const LABEL_H = ${LABEL_H};

export interface RegionLabel {
  /** 시·도 안의 기준점 (작은 시는 연결선 시작점, 이슈 급상승 점 위치) */
  anchor: { x: number; y: number };
  /** 이름 상자 가운데 */
  x: number;
  y: number;
  /** 작은 시: 바깥에 둔 이름까지 연결선 끝점 (이름 상자 가장자리), 큰 시·도는 null */
  leader: { x: number; y: number } | null;
}

export const REGION_LABELS: Record<string, RegionLabel> = {
${rows.join("\n")}
};
`;
writeFileSync(new URL("../src/lib/korea-map-labels.ts", import.meta.url), file);
console.log(`src/lib/korea-map-labels.ts 생성 (${rows.length}개 시·도, 겹침 없음)`);
