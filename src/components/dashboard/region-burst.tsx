"use client";

/**
 * RegionBurst — Map View 지역 클릭 "설계" 연출
 * ------------------------------------------------------------------
 * 커서들이 상자를 그리고 글자를 채워 넣는 과정이 보이게 의원 카드를 만든다. 1x 기준 약 3초.
 *  0단계 (0~0.3s)  지도 그림 영역에만 옅은 파란 모눈, 선택 시도 경계를 점선이 한 바퀴(지도 SVG 쪽),
 *                  지역 가운데 "+"
 *  1단계           카드마다 0.2s 간격: 커서가 "+"에서 카드 왼쪽 위로 휘어진 경로로 날아감(0.35s), 빗금 꼬리
 *  2단계 (0.35s)   커서가 오른쪽 아래로 끌며 와이어프레임 상자가 커짐, 크기 배지 숫자, 모눈 끝까지 정렬선, 스냅
 *  3단계 (0.5s)    뼈대 막대 → 태그 → 이름 타자(글자당 40ms, 잔상) → 정당 → 지역구 → 발의 숫자·별
 *  4단계 (0.3s)    지역 가운데 ↔ 카드 점선, 배지·정렬선 사라짐, 커서는 모서리에서 살랑
 *
 * 모든 움직임은 하나의 시간 값 t(MotionValue, ms)에서 계산한다. setTimeout 이 없어서 멈춘 뒤 뒤늦게 글자가
 * 써지는 일이 없고, t 를 0 으로 되돌리면(0.3s) 글자 → 상자 → 커서 순서로 거꾸로 걷힌다. 2x 는 t 를 두 배로 재생.
 *
 * 보여줄 의원(정당은 기준에 넣지 않음): 그 지역 지역구 의원 중
 *  ① useNews(지역, 50) 제목·요약에 이름이 나온 횟수 ② 대표발의 수 ③ 이름순, 최대 6명. 나머지는 마지막 카드 아래 "+N명" 칩.
 * 자리: 지도 카드 안, 선택 시도 도형·플로팅 패널([data-map-obstacle])·시도 이름·진행 바·다른 카드와 겹치지 않는 곳 중
 *       바다·지도 바깥 빈 곳을 먼저. 카드 면적 합은 지도 카드의 40% 이하.
 */
import * as React from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import { MAP_HEIGHT, MAP_WIDTH, REGION_PATHS } from "@/lib/korea-map-data";
import { LABEL_H, LABEL_W, REGION_LABELS } from "@/lib/korea-map-labels";
import {
  NO_PARTY_COLOR,
  useNews,
  useParties,
  usePoliticians,
  useRegion,
  type ApiNews,
  type ApiParty,
  type ApiPoliticianList,
  type ApiRegionDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const WIRE = "#4d90fe"; // 와이어프레임 파랑
/** 커서 6색 (나오는 순서대로) — /api/parties 의 정당 색(청록·보라·파랑·겨자·장미·회색)과 색상환에서 떨어진 색 */
const CURSOR_COLORS = ["#ff6b4a", "#e3f04a", "#7ee25a", "#3fe0d9", "#c77dff", "#ff4fd8"];

const CARD_W = 172;
const CARD_H = 60;
const CHIP_W = 64;
const CHIP_H = 24;
const CHIP_GAP = 10; // 마지막 카드와 칩 사이
const MAX_CARDS = 6;
const GAP = 8;
const BAR_W = 400; // 진행 바 자리 (배치 계산용, 실제 폭 ≈ 390px)
const BAR_H = 32;

/* ── 시간표 (ms, 1x) ── */
const T0 = 300; // 0단계
const STAGGER = 200; // 카드마다 출발 간격
const K = {
  fly: 350, // 1단계 끝
  draw: 700, // 2단계 끝 = 스냅
  tag: 800,
  name: 760, // 이름 타자 시작
  perChar: 40,
  party: 880,
  dist: 930,
  num: 980,
  numEnd: 1180,
  stars: 1030,
  starGap: 50,
  link: 1200, // 4단계
  end: 1500,
};
const CHIP_END = 1000;
const COLLAPSE = 0.3; // s, 걷기

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

interface Pt {
  x: number;
  y: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/* ── 지도 기하 (Map3D 와 공유) ── */

/** 선택 시도의 가장 큰 조각 (경계 점선이 한 바퀴 도는 경로) */
const ringCache = new Map<string, string>();
export function mainRingPath(code: string) {
  const hit = ringCache.get(code);
  if (hit) return hit;
  const rings = (REGION_PATHS[code] ?? "").split("M").filter(Boolean).map((s) => "M" + s);
  const area = (d: string) => {
    const p = d.replace(/[MZ]/g, "").split("L").map((xy) => xy.split(",").map(Number));
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
    return Math.abs(a);
  };
  const best = rings.reduce((a, b) => (area(b) > area(a) ? b : a), rings[0] ?? "");
  ringCache.set(code, best);
  return best;
}

/** 지역 가운데 "+" (지도 viewBox 좌표). 큰 시·도는 이름이 기준점 위에 있어 조금 아래로 */
export function designCenter(code: string): Pt | null {
  const l = REGION_LABELS[code];
  if (!l) return null;
  return { x: l.anchor.x, y: l.anchor.y + (l.leader ? 0 : 13) };
}

/** 땅 마스크 (viewBox 1px 단위). code 를 주면 그 시도만 */
const maskCache = new Map<string, Uint8Array>();
function getMask(code: string | null) {
  const key = code ?? "*";
  const hit = maskCache.get(key);
  if (hit || typeof document === "undefined") return hit ?? null;
  const w = Math.ceil(MAP_WIDTH);
  const h = Math.ceil(MAP_HEIGHT);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // 화면에 보이는 땅 = 윗면 + 3D 옆면(아래·왼쪽으로 최대 12px 두께, Map3D 의 EXT) + 해안 여백
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  for (const d of code ? [REGION_PATHS[code]] : Object.values(REGION_PATHS)) {
    if (!d) continue;
    const path = new Path2D(d);
    for (const k of [0, 4, 8, 12]) {
      ctx.setTransform(1, 0, 0, 1, -0.75 * k, k);
      ctx.fill(path);
      ctx.stroke(path);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  maskCache.set(key, mask);
  return mask;
}

/* ── 연출 시간 제어 ── */

export interface DesignRun {
  code: string;
  id: number;
}
export interface DesignController {
  t: MotionValue<number>;
  run: DesignRun | null;
  speed: 1 | 2;
  reduce: boolean;
  /** 지역 클릭: 같은 지역이면 무시(다시 보기로만 재생), 다른 지역이면 지금 것을 걷고 새로 */
  request: (code: string) => void;
  close: () => void;
  replay: () => void;
  setSpeed: (s: 1 | 2) => void;
  /** 카드 자리가 정해지면 RegionBurst 가 부름 (run 마다 한 번) */
  start: (id: number, total: number) => void;
}

export function useDesignRun(): DesignController {
  const reduce = !!useReducedMotion();
  const t = useMotionValue(0);
  const [run, setRun] = React.useState<DesignRun | null>(null);
  const [speed, setSpeedState] = React.useState<1 | 2>(1);
  const s = React.useRef({
    anim: null as { stop: () => void } | null,
    total: 0,
    speed: 1 as 1 | 2,
    collapsing: false,
    pending: null as string | null,
    id: 0,
    run: null as DesignRun | null,
    started: -1,
  });

  const api = React.useMemo(() => {
    const st = s.current;
    const stop = () => {
      st.anim?.stop();
      st.anim = null;
    };
    const playFrom = (from: number) => {
      stop();
      if (reduce) return t.set(st.total); // 설계 과정 없이 완성된 카드
      t.set(from);
      if (from < st.total) st.anim = animate(t, st.total, { duration: (st.total - from) / 1000 / st.speed, ease: "linear" });
    };
    const show = (code: string | null) => {
      st.run = code ? { code, id: ++st.id } : null;
      st.started = -1;
      t.set(0);
      setRun(st.run);
    };
    /** 지금 연출을 바로 멈추고 t → 0 으로 걷은 뒤(0.3s) next 를 보여줌. 걷는 중 또 누르면 마지막 것만 */
    const collapseTo = (next: string | null) => {
      st.pending = next;
      if (st.collapsing) return;
      stop();
      if (reduce || t.get() <= 0) return show(next);
      st.collapsing = true;
      st.anim = animate(t, 0, {
        duration: COLLAPSE / st.speed,
        ease: [0.4, 0, 1, 1],
        onComplete: () => {
          st.collapsing = false;
          st.anim = null;
          show(st.pending);
        },
      });
    };
    return {
      stop,
      request(code: string) {
        if (!st.collapsing && st.run?.code === code) return;
        if (!st.run && !st.collapsing) return show(code);
        collapseTo(code);
      },
      close() {
        if (st.run || st.collapsing) collapseTo(null);
      },
      replay() {
        if (st.run && !st.collapsing && st.started === st.run.id) playFrom(0);
      },
      setSpeed(sp: 1 | 2) {
        st.speed = sp;
        setSpeedState(sp);
        if (!st.collapsing && st.anim && t.get() < st.total) playFrom(t.get()); // 남은 부분을 새 속도로
      },
      start(id: number, total: number) {
        if (st.run?.id !== id || st.started === id) return;
        st.started = id;
        st.total = total;
        playFrom(0);
      },
    };
  }, [reduce, t]);

  React.useEffect(() => api.stop, [api]);

  return { t, run, speed, reduce, request: api.request, close: api.close, replay: api.replay, setSpeed: api.setSpeed, start: api.start };
}

/** t 에서 계산한 몇 개의 정수 (글자 수·숫자 등). 값이 바뀔 때만 다시 그림 */
function useStep(t: MotionValue<number>, f: (v: number) => number[]) {
  const ref = React.useRef(f);
  React.useLayoutEffect(() => {
    ref.current = f;
  });
  const [state, setState] = React.useState(() => f(t.get()));
  useMotionValueEvent(t, "change", (v) => {
    const next = ref.current(v);
    setState((p) => (p.length === next.length && p.every((x, i) => x === next[i]) ? p : next));
  });
  return state;
}

/* ── 의원 고르기 · 자리 정하기 ── */

interface Member {
  monaCd: string;
  name: string;
  party: string;
  color: string;
  district: string | null;
  term: number | null;
  bills: number;
  stars: number | null;
  articles: number; // 이름이 나온 기사 수
  mentions: number; // 이름이 나온 횟수 (순서 기준)
}

function rankMembers(code: string, detail: ApiRegionDetail, news: ApiNews[] | undefined, list: ApiPoliticianList | undefined, parties: ApiParty[] | undefined): Member[] {
  const articles = (news ?? []).filter((n) => n.region_code === code).map((n) => `${n.headline} ${n.summary ?? ""}`);
  const stars = new Map(list?.rows.map((p) => [p.mona_cd, p.stars ?? null]));
  // 정당 이름·색은 parties 표 그대로 (usePartyLookup 과 같은 규칙)
  const partyById = new Map(parties?.map((p) => [p.id, p]));
  return detail.politicians
    .map((p) => {
      const hits = articles.map((txt) => txt.split(p.name).length - 1);
      const party = p.party_id ? partyById.get(p.party_id) : undefined;
      return {
        monaCd: p.mona_cd,
        name: p.name,
        party: party?.name ?? p.party_id ?? "—",
        color: party?.color ?? NO_PARTY_COLOR,
        district: p.district,
        term: p.term,
        bills: p.bills_proposed,
        stars: stars.get(p.mona_cd) ?? null,
        mentions: hits.reduce((a, b) => a + b, 0),
        articles: hits.filter((h) => h > 0).length,
      };
    })
    .sort((a, b) => b.mentions - a.mentions || b.bills - a.bills || a.name.localeCompare(b.name, "ko"));
}

/** 화면 사각형 r 중 마스크(땅)에 걸리는 비율 (nx × ny 격자로 표본) */
function landFrac(mask: Uint8Array | null, map: Rect, r: Rect, nx: number, ny: number) {
  if (!mask) return 0;
  const mw = Math.ceil(MAP_WIDTH);
  let hit = 0;
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= ny; j++) {
      const mx = ((r.x + (r.w * i) / nx - map.x) / map.w) * MAP_WIDTH;
      const my = ((r.y + (r.h * j) / ny - map.y) / map.h) * MAP_HEIGHT;
      if (mx >= 0 && my >= 0 && mx < MAP_WIDTH && my < MAP_HEIGHT && mask[Math.floor(my) * mw + Math.floor(mx)]) hit++;
    }
  return hit / ((nx + 1) * (ny + 1));
}

/** 진행 바: 지도 그림 영역 아래 가운데에서 시작해, 땅(제주 등)·패널을 가리지 않는 가장 가까운 가로 위치 */
function placeBar(root: Rect, map: Rect, obstacles: Rect[]): Pt {
  const land = getMask(null);
  const y = Math.min(map.y + map.h + 6, root.h - BAR_H - 4);
  const mid = map.x + map.w / 2;
  let best: { x: number; land: number } | null = null;
  for (let d = 0; d <= root.w / 2; d += 10)
    for (const cx of d ? [mid + d, mid - d] : [mid]) {
      const r = { x: cx - BAR_W / 2, y, w: BAR_W, h: BAR_H };
      if (r.x < 6 || r.x + r.w > root.w - 6 || obstacles.some((o) => overlap(o, r, 6))) continue;
      const l = landFrac(land, map, { x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 }, 32, 3);
      if (l === 0) return { x: cx, y };
      if (!best || l < best.land) best = { x: cx, land: l }; // 빈 자리가 없으면 땅을 가장 덜 가리는 곳
    }
  return { x: best?.x ?? mid, y };
}

/** 지역 가운데에서 가까운 빈 자리부터. 선택 시도는 가리지 않고, 땅(지도)도 되도록 피함. 칩은 마지막 카드 바로 아래 */
function placeAll(count: number, needChip: boolean, root: Rect, map: Rect, center: Pt, obstacles: Rect[], code: string) {
  const land = getMask(null);
  const sel = getMask(code);
  const frac = (mask: Uint8Array | null, r: Rect, nx: number, ny: number) => landFrac(mask, map, r, nx, ny);
  const placed: Rect[] = [];
  const blocked = (r: Rect) =>
    // 위쪽은 태그(MP · N선)·커서 높이만큼 더 띄움
    r.x < 14 ||
    r.y < 22 ||
    r.x + r.w > root.w - 6 ||
    r.y + r.h > root.h - 6 ||
    obstacles.some((o) => overlap(o, r, 4)) ||
    placed.some((p) => overlap(p, r, GAP)) ||
    frac(sel, r, 8, 4) > 0;
  const findSpot = (w: number, h: number): Rect | null => {
    let best: { r: Rect; score: number } | null = null;
    const maxR = Math.hypot(root.w, root.h);
    for (let rad = 60; rad < maxR; rad += 12) {
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const r = { x: center.x + rad * Math.cos(a) - w / 2, y: center.y + rad * Math.sin(a) - h / 2, w, h };
        if (blocked(r)) continue;
        const score = rad + frac(land, r, 4, 2) * 600; // 바다·지도 바깥 빈 곳 우선
        if (!best || score < best.score) best = { r, score };
      }
      if (best && rad > best.score) break; // 더 멀리 가도 점수가 좋아질 수 없음
    }
    return best?.r ?? null;
  };

  const cards: Rect[] = [];
  let chip: Rect | null = null;
  for (let i = 0; i < count; i++) {
    if (i === count - 1 && needChip) {
      // 마지막 카드 + 그 아래 칩을 한 덩어리로
      const both = findSpot(CARD_W, CARD_H + CHIP_GAP + CHIP_H);
      if (both) {
        cards.push({ x: both.x, y: both.y, w: CARD_W, h: CARD_H });
        chip = { x: both.x, y: both.y + CARD_H + CHIP_GAP, w: CHIP_W, h: CHIP_H };
        placed.push(both);
        break;
      }
    }
    const r = findSpot(CARD_W, CARD_H);
    if (!r) break;
    cards.push(r);
    placed.push(r);
  }
  if (!chip && (needChip || cards.length < count)) {
    const last = cards[cards.length - 1];
    const under = last && { x: last.x, y: last.y + CARD_H + CHIP_GAP, w: CHIP_W, h: CHIP_H };
    chip = under && !blocked(under) ? under : findSpot(CHIP_W, CHIP_H);
  }
  return { cards, chip };
}

/* ── 그리는 요소 ── */

function Cursor({ color }: { color: string }) {
  return (
    <svg width="14" height="17" viewBox="0 0 14 17" className="drop-shadow">
      <path d="M1 1 L1 14.5 L4.6 11 L7.4 16 L9.6 15 L6.9 10 L12 10 Z" fill={color} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

/** 0단계: 지도 그림 영역의 모눈 */
function DesignStage({ t, map, root }: { t: MotionValue<number>; map: Rect; root: Rect }) {
  const fade = useTransform(t, [0, T0], [0, 1]);
  const top = Math.max(map.y, 0);
  const bottom = Math.min(map.y + map.h, root.h);
  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{
        x: map.x,
        y: top,
        width: map.w,
        height: bottom - top,
        opacity: fade,
        backgroundImage: `linear-gradient(to right, rgb(77 144 254 / 0.055) 1px, transparent 1px), linear-gradient(to bottom, rgb(77 144 254 / 0.055) 1px, transparent 1px)`,
        backgroundSize: "8px 8px",
        backgroundPosition: `0 ${map.y - top}px`,
      }}
    />
  );
}

/** 지나간 자리의 빗금 한 줄 */
function TrailMark({ t, S, k, at, color }: { t: MotionValue<number>; S: number; k: number; at: (p: number) => Pt; color: string }) {
  const lag = 0.085 * (k + 1);
  const q = (v: number) => easeOut(seg(v - S, 0, K.fly)) - lag;
  const x = useTransform(t, (v) => at(Math.max(0, q(v))).x);
  const y = useTransform(t, (v) => at(Math.max(0, q(v))).y);
  const opacity = useTransform(t, (v) => (q(v) <= 0 ? 0 : (0.8 - k * 0.12) * (1 - seg(v - S, K.fly * 0.7 + k * 25, K.fly + 120 + k * 25))));
  return <motion.span className="absolute left-0 top-0 h-[1.5px] w-[8px] rounded-full" style={{ x, y, opacity, rotate: -50, background: color }} />;
}

/**
 * 카드·칩 공통 그리기: 커서 비행 → 상자 끌기(크기 배지·정렬선) → 스냅(모서리 점·깜빡임) → (카드) 점선 연결
 * children 은 상자 안 내용, 누르기는 연출 도중에도 받음
 */
function DraftFrame({
  t,
  S,
  idx,
  rect,
  center,
  color,
  label,
  rulers,
  tag,
  link,
  onClick,
  ariaLabel,
  ariaExpanded,
  children,
}: {
  t: MotionValue<number>;
  S: number;
  idx: number;
  rect: Rect;
  center: Pt;
  color: string;
  label: string;
  rulers: { top: number; left: number };
  tag?: string;
  link?: boolean;
  onClick: () => void;
  ariaLabel: string;
  ariaExpanded?: boolean;
  children: React.ReactNode;
}) {
  // 1단계 경로: "+" → 카드 왼쪽 위, 살짝 휘어짐 (순서마다 반대쪽으로)
  const P0 = { x: rect.x, y: rect.y };
  const dx = P0.x - center.x;
  const dy = P0.y - center.y;
  const sign = idx % 2 ? -1 : 1;
  const Q = { x: (center.x + P0.x) / 2 - dy * 0.28 * sign, y: (center.y + P0.y) / 2 + dx * 0.28 * sign };
  const bez = (p: number): Pt => ({
    x: (1 - p) ** 2 * center.x + 2 * (1 - p) * p * Q.x + p * p * P0.x,
    y: (1 - p) ** 2 * center.y + 2 * (1 - p) * p * Q.y + p * p * P0.y,
  });
  const drawP = (v: number) => easeInOut(seg(v - S, K.fly, K.draw));
  const cursorAt = (v: number): Pt => {
    const s = v - S;
    if (s < K.fly) return bez(easeOut(clamp01(s / K.fly)));
    const d = drawP(v);
    return { x: P0.x + rect.w * d, y: P0.y + rect.h * d }; // 2단계: 오른쪽 아래로 끌기
  };

  const cx = useTransform(t, (v) => cursorAt(v).x - 1);
  const cy = useTransform(t, (v) => cursorAt(v).y - 1);
  const cursorOpacity = useTransform(t, [S, S + 60], [0, 1]);

  // 2단계: 상자 (transform scale 로 0 → 카드 크기), 스냅 때 한 번 깜빡
  const scale = useTransform(t, drawP);
  const boxOpacity = useTransform(t, (v) => {
    const s = v - S;
    if (s < K.fly) return 0;
    if (s >= K.draw && s < K.draw + 40) return 0.35;
    if (s >= K.draw + 80 && s < K.draw + 110) return 0.6;
    return 1;
  });
  const corner = useTransform(t, [S + K.draw, S + K.draw + 50, S + K.draw + 90], [0, 1.5, 1]);
  const badgeX = useTransform(t, (v) => rect.x + (rect.w * drawP(v)) / 2);
  const badgeY = useTransform(t, (v) => rect.y + rect.h * drawP(v) + 5);
  const badgeOpacity = useTransform(t, [S + K.fly, S + K.fly + 40, S + K.link, S + K.link + 100], [0, 1, 1, 0]);
  const [bw, bh] = useStep(t, (v) => [Math.round(rect.w * drawP(v)), Math.round(rect.h * drawP(v))]);

  // 정렬선: 상자 모서리에서 모눈 위·왼쪽 끝까지 뻗었다가 사라짐
  const grow = (v: number) => easeOut(seg(v - S, K.fly, K.fly + 140));
  const alignY2 = useTransform(t, (v) => rect.y + (rulers.top - rect.y) * grow(v));
  const alignX2 = useTransform(t, (v) => rect.x + (rulers.left - rect.x) * grow(v));
  const alignOpacity = useTransform(t, [S + K.fly, S + K.fly + 60, S + K.draw, S + K.draw + 160], [0, 0.7, 0.7, 0]);

  // 4단계: 지역 가운데 ↔ 카드 점선
  const E = { x: Math.max(rect.x, Math.min(center.x, rect.x + rect.w)), y: Math.max(rect.y, Math.min(center.y, rect.y + rect.h)) };
  const linkP = (v: number) => easeOut(seg(v - S, K.link, K.end));
  const linkX2 = useTransform(t, (v) => center.x + (E.x - center.x) * linkP(v));
  const linkY2 = useTransform(t, (v) => center.y + (E.y - center.y) * linkP(v));
  const linkOpacity = useTransform(t, (v) => (linkP(v) > 0 ? 0.8 : 0));

  const tagOpacity = useTransform(t, [S + K.draw, S + K.tag], [0, 1]);
  const tagScale = useTransform(t, [S + K.draw, S + K.tag], [0.8, 1]);
  const clickable = useTransform(t, (v) => (v - S >= K.fly ? "auto" : "none"));

  return (
    <>
      <svg className="absolute inset-0 size-full overflow-visible">
        <motion.line x1={rect.x} y1={rect.y} x2={rect.x} y2={alignY2} stroke={WIRE} strokeWidth="1" strokeDasharray="2 3" style={{ opacity: alignOpacity }} />
        <motion.line x1={rect.x} y1={rect.y} x2={alignX2} y2={rect.y} stroke={WIRE} strokeWidth="1" strokeDasharray="2 3" style={{ opacity: alignOpacity }} />
        {link && (
          <motion.line x1={center.x} y1={center.y} x2={linkX2} y2={linkY2} stroke={WIRE} strokeWidth="1" strokeDasharray="3 3" style={{ opacity: linkOpacity }} />
        )}
      </svg>

      {/* 상자 */}
      <motion.div
        className="absolute left-0 top-0 bg-card"
        style={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale, originX: 0, originY: 0, opacity: boxOpacity, border: `1px solid ${WIRE}` }}
      />
      {/* 모서리 사각점 */}
      {[
        [rect.x, rect.y],
        [rect.x + rect.w, rect.y],
        [rect.x, rect.y + rect.h],
        [rect.x + rect.w, rect.y + rect.h],
      ].map(([px, py]) => (
        <motion.span
          key={`${px}-${py}`}
          className="absolute left-0 top-0 size-[5px] bg-card"
          style={{ x: px - 2.5, y: py - 2.5, scale: corner, border: `1px solid ${WIRE}` }}
        />
      ))}
      {tag && (
        <motion.span
          className="absolute left-0 top-0 px-1 font-mono text-[9px] leading-[14px] text-white"
          style={{ x: rect.x - 0.5, y: rect.y - 15, opacity: tagOpacity, scale: tagScale, originX: 0, originY: 1, background: WIRE }}
        >
          {tag}
        </motion.span>
      )}

      {/* 내용 (누르면 상세 — 연출 도중에도) */}
      <motion.button
        type="button"
        data-burst-keep
        onClick={onClick}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        className="absolute left-0 top-0 overflow-hidden text-left"
        style={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h, pointerEvents: clickable }}
      >
        {children}
      </motion.button>

      {/* 크기 배지 */}
      <motion.div className="absolute left-0 top-0" style={{ x: badgeX, y: badgeY, opacity: badgeOpacity }}>
        <span className="block -translate-x-1/2 whitespace-nowrap px-1 font-mono text-[9px] leading-[14px] text-white tabular" style={{ background: WIRE }}>
          {bw} × {bh}
        </span>
      </motion.div>

      {/* 빗금 꼬리 + 커서 + 이름표 */}
      {[0, 1, 2, 3].map((k) => (
        <TrailMark key={k} t={t} S={S} k={k} at={bez} color={color} />
      ))}
      <motion.div className="absolute left-0 top-0" style={{ x: cx, y: cy, opacity: cursorOpacity }}>
        <div className="pm-wiggle relative">
          <Cursor color={color} />
          <span
            className="absolute left-[12px] top-[13px] whitespace-nowrap rounded-[3px] px-1 font-mono text-[8.5px] font-semibold leading-[13px] text-[#0d0f12]"
            style={{ background: color }}
          >
            {label}
          </span>
        </div>
      </motion.div>
    </>
  );
}

/** 글자 하나씩 + 흐린 잔상, 끝에 깜빡이는 "|" (자리는 처음부터 전체 글자만큼 잡아 둠) */
function Typed({ text, count, caret }: { text: string; count: number; caret: boolean }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="invisible">{text}</span>
      <span className="absolute inset-0">
        {[...text].slice(0, count).map((c, i) => (
          <span key={i} className="relative">
            {c}
            <span aria-hidden className="pm-ghost">
              {c}
            </span>
          </span>
        ))}
        {caret && (
          <span className="pm-caret font-normal" style={{ color: WIRE }}>
            |
          </span>
        )}
      </span>
    </span>
  );
}

function Skeleton({ opacity, className }: { opacity: MotionValue<number>; className: string }) {
  return <motion.span className={cn("absolute left-0 rounded-sm bg-white/10", className)} style={{ opacity }} />;
}

/** 3단계: 카드 내용 채우기 */
function CardContent({ t, S, m }: { t: MotionValue<number>; S: number; m: Member }) {
  const len = [...m.name].length;
  const [chars, caret, bills, lit] = useStep(t, (v) => {
    const s = v - S;
    const typed = s < K.name ? 0 : Math.min(len, Math.floor((s - K.name) / K.perChar) + 1);
    const caretOn = s >= K.name && s < K.name + len * K.perChar + 240 ? 1 : 0;
    const n = Math.round(m.bills * easeOut(seg(s, K.num, K.numEnd)));
    const stars = s < K.stars ? 0 : Math.min(m.stars ?? 0, Math.floor((s - K.stars) / K.starGap) + 1);
    return [typed, caretOn, n, stars];
  });
  // 뼈대 막대: 스냅 직후 생기고, 진짜 내용이 들어오는 순간 사라짐
  const sk = (from: number) => (v: number) => seg(v - S, K.draw, K.draw + 50) * (1 - seg(v - S, from, from + 90));
  const nameBar = useTransform(t, sk(K.name));
  const partyBar = useTransform(t, sk(K.party));
  const distBar = useTransform(t, sk(K.dist));
  const numBar = useTransform(t, sk(K.num));
  const party = useTransform(t, [S + K.party, S + K.party + 100], [0, 1]);
  const dist = useTransform(t, [S + K.dist, S + K.dist + 100], [0, 1]);
  const num = useTransform(t, [S + K.num, S + K.num + 80], [0, 1]);

  return (
    <span className="block px-2 py-1.5" style={{ width: CARD_W, height: CARD_H }}>
      <span className="relative flex h-[17px] items-center gap-1.5">
        <Skeleton className="top-[5px] h-[7px] w-[44px]" opacity={nameBar} />
        <span className="text-[12px] font-semibold text-ink">
          <Typed text={m.name} count={chars} caret={!!caret} />
        </span>
        <span className="relative flex min-w-0 items-center text-[10px] text-ink-2">
          <Skeleton className="top-[2px] h-[6px] w-[48px]" opacity={partyBar} />
          <motion.span className="flex min-w-0 items-center gap-1" style={{ opacity: party }}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: m.color }} />
            <span className="truncate">{m.party}</span>
          </motion.span>
        </span>
      </span>
      <span className="relative block h-[14px]">
        <Skeleton className="top-[4px] h-[6px] w-[96px]" opacity={distBar} />
        <motion.span className="block truncate text-[10px] text-ink-3" style={{ opacity: dist }}>
          {m.district ?? "—"}
        </motion.span>
      </span>
      <span className="relative block h-[14px]">
        <Skeleton className="top-[4px] h-[6px] w-[118px]" opacity={numBar} />
        <motion.span className="block truncate text-[10px] text-ink-2 tabular" style={{ opacity: num }}>
          발의 {bills}건 ·{" "}
          {m.stars ? (
            [0, 1, 2].slice(0, m.stars).map((k) => (
              <span key={k} className={k < lit ? "text-lime" : "text-white/15"}>
                ★
              </span>
            ))
          ) : (
            <span className="text-ink-3">—</span>
          )}
          {m.articles > 0 && <> · 기사 {m.articles}건</>}
        </motion.span>
      </span>
    </span>
  );
}

function ChipContent({ t, S, text }: { t: MotionValue<number>; S: number; text: string }) {
  const len = [...text].length;
  const [chars, caret] = useStep(t, (v) => {
    const s = v - S;
    return [s < K.name ? 0 : Math.min(len, Math.floor((s - K.name) / K.perChar) + 1), s >= K.name && s < K.name + len * K.perChar + 200 ? 1 : 0];
  });
  return (
    <span className="grid size-full place-items-center font-mono text-[11px] text-ink-2">
      <Typed text={text} count={chars} caret={!!caret} />
    </span>
  );
}

/** 진행 상태 바 (지도 그림 영역 아래 가운데) */
function ProgressBar({
  t,
  total,
  layerTimes,
  count,
  at,
  speed,
  onReplay,
  onSpeed,
  onClose,
}: {
  t: MotionValue<number>;
  total: number;
  layerTimes: number[];
  count: number;
  at: Pt;
  speed: 1 | 2;
  onReplay: () => void;
  onSpeed: (s: 1 | 2) => void;
  onClose: () => void;
}) {
  const [done, finished] = useStep(t, (v) => [layerTimes.filter((x) => x <= v).length, v >= total ? 1 : 0]);
  const opacity = useTransform(t, [0, 150], [0, 1]);
  const progress = useTransform(t, (v) => (total ? clamp01(v / total) : 1));
  return (
    <motion.div data-burst-keep className="pointer-events-auto absolute left-0 top-0" style={{ x: at.x, y: at.y, opacity }}>
      <div
        className={cn(
          "glass-strong flex h-8 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full py-1 pl-2 pr-1 text-[11px] text-ink-2 transition-opacity duration-300",
          finished && "opacity-60 hover:opacity-100 focus-within:opacity-100",
        )}
      >
        <span className="flex -space-x-1.5">
          {CURSOR_COLORS.slice(0, Math.max(count, 1)).map((c) => (
            <span key={c} className="size-3 rounded-full border border-card" style={{ background: c }} />
          ))}
        </span>
        <span className="tabular">
          의원 {count}명 · 레이어 {done}/{count * 6}
        </span>
        <span className="relative h-[3px] w-10 overflow-hidden rounded-full bg-white/10">
          <motion.span className="absolute inset-0 rounded-full" style={{ scaleX: progress, originX: 0, background: WIRE }} />
        </span>
        <button type="button" onClick={onReplay} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 transition hover:bg-white/[0.08] hover:text-ink">
          <RotateCcw className="size-3" /> 다시 보기
        </button>
        <span className="flex rounded-full border border-line p-0.5">
          {([1, 2] as const).map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => onSpeed(sp)}
              aria-pressed={speed === sp}
              className={cn("rounded-full px-1.5 font-mono text-[10px] transition", speed === sp ? "bg-white/[0.12] text-ink" : "text-ink-3 hover:text-ink-2")}
            >
              {sp}x
            </button>
          ))}
        </span>
        <button type="button" onClick={onClose} aria-label="의원 카드 닫기" className="grid size-6 place-items-center rounded-full transition hover:bg-white/[0.08] hover:text-ink">
          <X className="size-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/* ── 본체 ── */

/** 접혀 있는(0 크기) 장애물은 마지막으로 본 크기로 (이슈 팝업이 지역을 바꿀 때 잠깐 비는 순간 대비) */
const obstacleCache = new WeakMap<Element, Rect>();

export function RegionBurst({
  design,
  rootRef,
  onOpenPolitician,
}: {
  design: DesignController;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onOpenPolitician?: (monaCd: string) => void;
}) {
  const { run, t, speed, start, close } = design;
  const code = run?.code ?? null;
  const { data: detail } = useRegion(code);
  const { data: news, isLoading: newsLoading } = useNews(code, 50);
  const { data: list, isLoading: listLoading } = usePoliticians();
  const { data: parties, isLoading: partiesLoading } = useParties();
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [listOpen, setListOpen] = React.useState(false);
  const [frozen, setFrozen] = React.useState<{ id: number; members: Member[] } | null>(null);

  React.useEffect(() => setListOpen(false), [run?.id]);

  // 카드 영역 크기 따라 다시 배치. useEffect: 부모 div 의 ref 가 붙은 뒤에 실행됨 (useLayoutEffect 는 자식이 먼저라 ref 가 아직 null)
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [rootRef]);

  // 데이터가 다 오면 이번 연출의 의원을 고정 (1분마다 새로 읽어도 연출 도중 순서가 바뀌지 않게)
  const ready = !!run && detail?.code === run.code && !newsLoading && !listLoading && !partiesLoading;
  React.useEffect(() => {
    if (!run || !ready || !detail || frozen?.id === run.id) return;
    setFrozen({ id: run.id, members: rankMembers(run.code, detail, news, list, parties) });
  }, [run, ready, detail, news, list, parties, frozen]);
  const members = run && frozen?.id === run.id ? frozen.members : null;

  const layout = React.useMemo(() => {
    const root = rootRef.current;
    const c = run && designCenter(run.code);
    if (!run || !members || !root || !size.w || !c) return null;
    const rb = root.getBoundingClientRect();
    const mapEl = root.querySelector<HTMLElement>("[data-map-box]");
    if (!mapEl) return null;
    const mb = mapEl.getBoundingClientRect();
    const map = { x: mb.left - rb.left, y: mb.top - rb.top, w: mb.width, h: mb.height };
    const sx = map.w / MAP_WIDTH;
    const sy = map.h / MAP_HEIGHT;
    const center = { x: map.x + c.x * sx, y: map.y + c.y * sy };
    const rootRect = { x: 0, y: 0, w: size.w, h: size.h };
    const top = Math.max(map.y, 0);
    const rulers = { top, left: map.x }; // 정렬선이 닿는 곳: 모눈 위·왼쪽 끝
    const obstacles: Rect[] = [...root.querySelectorAll<HTMLElement>("[data-map-obstacle]")].map((o) => {
      const b = o.getBoundingClientRect();
      const r = { x: b.left - rb.left, y: b.top - rb.top, w: b.width, h: b.height };
      if (r.w > 4 && r.h > 4) obstacleCache.set(o, r);
      return obstacleCache.get(o) ?? r;
    });
    for (const l of Object.values(REGION_LABELS))
      obstacles.push({ x: map.x + l.x * sx - (LABEL_W * sx) / 2, y: map.y + l.y * sy - (LABEL_H * sy) / 2, w: LABEL_W * sx, h: LABEL_H * sy });
    // 진행 바 (패널·범례를 피해서) 먼저 정하고, 카드는 바도 피함
    const bar = placeBar(rootRect, map, obstacles);
    obstacles.push({ x: bar.x - BAR_W / 2, y: bar.y, w: BAR_W, h: BAR_H });

    // 카드 면적 합 ≤ 지도 카드의 40%
    const maxByArea = Math.floor((0.4 * size.w * size.h - CHIP_W * CHIP_H) / (CARD_W * CARD_H));
    const want = Math.max(0, Math.min(MAX_CARDS, members.length, maxByArea));
    const placedAll = placeAll(want, members.length > want, rootRect, map, center, obstacles, run.code);
    const shown = members.slice(0, placedAll.cards.length);
    const rest = members.length - shown.length;
    const chip = rest > 0 ? placedAll.chip : null;
    const starts = shown.map((_, i) => T0 + i * STAGGER);
    const chipStart = T0 + shown.length * STAGGER;
    const total = Math.max(T0, ...starts.map((s) => s + K.end), chip ? chipStart + CHIP_END : 0);
    // 레이어: 카드마다 상자·태그·이름·정당·지역구·숫자 (실제로 채워지는 순간)
    const layerTimes = shown.flatMap((m, i) => {
      const s = starts[i];
      return [s + K.draw, s + K.tag, s + K.name + [...m.name].length * K.perChar, s + K.party + 100, s + K.dist + 100, s + K.numEnd];
    });
    return { map, center, rulers, bar, cards: placedAll.cards, chip, shown, rest, starts, chipStart, total, layerTimes, root: rootRect };
  }, [run, members, size, rootRef]);

  // 자리가 정해지면 재생 시작 (run 마다 한 번)
  React.useEffect(() => {
    if (run && layout) start(run.id, layout.total);
  }, [run, layout, start]);

  // Esc · 빈 곳 클릭으로 닫기 (정치인 상세 패널이 열려 있으면 그쪽이 먼저 닫힘)
  React.useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[aria-label="정치인 상세"]')) return;
      close();
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest?.("[data-burst-keep]")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [run, close]);

  if (!run || !layout) return null;
  const { center, cards, chip, shown, rest, starts, chipStart } = layout;
  const listUp = chip ? chip.y + CHIP_H + 230 > layout.root.h : false;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" style={{ "--pm-ghost": `${320 / speed}ms` } as React.CSSProperties}>
      <DesignStage t={t} map={layout.map} root={layout.root} />

      {shown.map((m, i) => {
        const r = cards[i];
        return (
          <DraftFrame
            // 자리가 바뀌면 경로도 새로 (useTransform 계산식이 자리 값을 품고 있음)
            key={`${run.id}-${m.monaCd}-${Math.round(r.x)}-${Math.round(r.y)}`}
            t={t}
            S={starts[i]}
            idx={i}
            rect={r}
            center={center}
            color={CURSOR_COLORS[i % CURSOR_COLORS.length]}
            label={`MP-${String(i + 1).padStart(2, "0")}`}
            rulers={layout.rulers}
            tag={`MP · ${m.term == null ? "—" : `${m.term}선`}`}
            link
            onClick={() => onOpenPolitician?.(m.monaCd)}
            ariaLabel={`${m.name} 상세 보기`}
          >
            <CardContent t={t} S={starts[i]} m={m} />
          </DraftFrame>
        );
      })}

      {chip && (
        <DraftFrame
          key={`${run.id}-chip-${Math.round(chip.x)}-${Math.round(chip.y)}`}
          t={t}
          S={chipStart}
          idx={shown.length}
          rect={chip}
          center={center}
          color={CURSOR_COLORS[shown.length % CURSOR_COLORS.length]}
          label="MP-ALL"
          rulers={layout.rulers}
          onClick={() => setListOpen((v) => !v)}
          ariaLabel={`나머지 의원 ${rest}명 보기`}
          ariaExpanded={listOpen}
        >
          <ChipContent t={t} S={chipStart} text={`+${rest}명`} />
        </DraftFrame>
      )}

      {/* "+N명" 을 누르면 그 지역 의원 전체 */}
      {chip && listOpen && members && (
        <div
          data-burst-keep
          className="pointer-events-auto absolute max-h-[220px] w-[220px] overflow-y-auto bg-card py-1 scroll-thin"
          style={{
            border: `1px solid ${WIRE}`,
            left: Math.max(6, Math.min(chip.x, layout.root.w - 226)),
            top: listUp ? undefined : chip.y + CHIP_H + 8,
            bottom: listUp ? layout.root.h - chip.y + 8 : undefined,
          }}
        >
          {members.map((m) => (
            <button
              key={m.monaCd}
              type="button"
              onClick={() => onOpenPolitician?.(m.monaCd)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition hover:bg-white/[0.05]"
            >
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: m.color }} />
              <span className="font-semibold text-ink">{m.name}</span>
              <span className="min-w-0 flex-1 truncate text-ink-3">{m.district ?? "—"}</span>
              {m.articles > 0 && <span className="shrink-0 text-ink-3">기사 {m.articles}</span>}
            </button>
          ))}
        </div>
      )}

      <ProgressBar
        t={t}
        total={layout.total}
        layerTimes={layout.layerTimes}
        count={shown.length}
        at={layout.bar}
        speed={speed}
        onReplay={design.replay}
        onSpeed={design.setSpeed}
        onClose={close}
      />
    </div>
  );
}

/** 0단계 일부: 지도 SVG 안에서 선택 시도 경계를 파란 점선이 한 바퀴 그리고, 가운데 "+" (Map3D 가 그림) */
export function DesignOutline({ t, code, dx, dy, maskId }: { t: MotionValue<number>; code: string; dx: number; dy: number; maskId: string }) {
  const d = mainRingPath(code);
  const draw = useTransform(t, [0, T0], [0, 1]);
  const plus = useTransform(t, [80, 220], [0, 1]);
  const c = designCenter(code);
  if (!d || !c) return null;
  return (
    <g transform={`translate(${dx} ${dy})`} pointerEvents="none">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT}>
          {/* stroke-dashoffset 으로 한 바퀴 그려지는 흰 선 = 점선이 보이는 범위 */}
          <motion.path d={d} fill="none" stroke="#fff" strokeWidth="4" style={{ pathLength: draw }} />
        </mask>
      </defs>
      <path d={d} fill="none" stroke={WIRE} strokeWidth="1.1" strokeDasharray="4 3" mask={`url(#${maskId})`} />
      <motion.g style={{ opacity: plus }} stroke={WIRE} strokeWidth="1.2">
        <line x1={c.x - 5} y1={c.y} x2={c.x + 5} y2={c.y} />
        <line x1={c.x} y1={c.y - 5} x2={c.x} y2={c.y + 5} />
      </motion.g>
    </g>
  );
}
