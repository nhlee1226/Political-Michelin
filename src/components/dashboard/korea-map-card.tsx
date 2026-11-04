"use client";

/**
 * KoreaMapCard — 중앙 메인 "지도 기반 인터랙티브 대시보드"
 * ------------------------------------------------------------------
 * 레퍼런스 영상(Voyage)의 도트 글로브 + 플로팅 글래스 패널 구성을 대한민국 지도로 재해석.
 *  - 3D 압출 지도: KOSTAT 시·도 경계 path (scripts/gen_map.py) 를 겹겹이 쌓아 두께 표현
 *  - 정당 색으로 칠하지 않는 무채색 지도 (중립성 유지), 선택 지역만 떠오르며 강조
 *  - 마우스 위치에 따라 3D 틸트, 지역 호버/클릭 시 하이라이트
 *  - 선택 지역: 정당 지지도 패널 / 정치인 프로필 카드 / 주요 이슈 팝업
 *
 * 실서비스 전환 시: 이 컴포넌트의 <svg> 레이어를 Mapbox/Kakao 지도로 교체하고
 * REGIONS 데이터를 API 응답으로 대체하면 패널 UI 는 그대로 재사용 가능합니다.
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  MapPin,
  MousePointerClick,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { MAP_DOTS, MAP_HEIGHT, MAP_WIDTH, REGION_PATHS } from "@/lib/korea-map-data";
import { PARTIES, PARTY_ORDER, REGION_BY_CODE, REGIONS, type Region } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Badge, Card, IconButton, MichelinStars, PartyTag } from "@/components/ui/primitives";

/* ── 지역 중심점 (도트 평균) ── */
const REGION_CENTERS: Record<string, { x: number; y: number }> = (() => {
  const acc: Record<string, { x: number; y: number; n: number }> = {};
  for (const [x, y, c] of MAP_DOTS) {
    acc[c] ??= { x: 0, y: 0, n: 0 };
    acc[c].x += x;
    acc[c].y += y;
    acc[c].n++;
  }
  const out: Record<string, { x: number; y: number }> = {};
  for (const c in acc) out[c] = { x: acc[c].x / acc[c].n, y: acc[c].y / acc[c].n };
  // 섬(울릉도 등) 영향 보정
  out["37"] = { x: out["37"].x - 22, y: out["37"].y };
  return out;
})();

// 광역시(2x) 를 도(3x) 위에 그려 클릭 가능하도록 정렬
const PATH_ORDER = Object.keys(REGION_PATHS).sort((a, b) => (a.startsWith("3") ? -1 : 1) - (b.startsWith("3") ? -1 : 1));
const HOT_REGIONS = [...REGIONS].sort((a, b) => b.heat - a.heat).slice(0, 3).map((r) => r.code);

/* ───────────────────────── Sub components ───────────────────────── */

/** 정당 지지도 도넛 (세그먼트 사이 2px 간격) */
function SupportDonut({ region }: { region: Region }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const GAP = 2.5;
  let offset = 0;
  const lead = PARTY_ORDER.slice(0, 3).reduce((a, b) => (region.support[a] >= region.support[b] ? a : b));
  return (
    <div className="relative size-[92px] shrink-0">
      <svg viewBox="0 0 92 92" className="size-full -rotate-90">
        <circle cx="46" cy="46" r={R} fill="none" stroke="var(--chart-track)" strokeWidth="9" />
        {PARTY_ORDER.map((id) => {
          const len = (region.support[id] / 100) * C;
          const el = (
            <motion.circle
              key={id}
              cx="46"
              cy="46"
              r={R}
              fill="none"
              stroke={PARTIES[id].color}
              strokeWidth="9"
              strokeLinecap="butt"
              initial={false}
              animate={{ strokeDasharray: `${Math.max(len - GAP, 0)} ${C}`, strokeDashoffset: -offset }}
              transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-lg font-semibold leading-none tabular">{region.support[lead]}%</p>
          <p className="mt-1 text-[10px] text-ink-3">{PARTIES[lead].name} 1위</p>
        </div>
      </div>
    </div>
  );
}

function SupportPanel({ region }: { region: Region }) {
  return (
    <div className="glass-strong w-full rounded-2xl p-4 @min-[1040px]:w-[290px]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold">실시간 정당 지지도</p>
        <Badge tone="neutral" className="tabular">±3.1%p</Badge>
      </div>
      <div className="flex items-center gap-4">
        <SupportDonut region={region} />
        <ul className="min-w-0 flex-1 space-y-2">
          {PARTY_ORDER.map((id) => {
            const delta = region.supportDelta[id];
            return (
              <li key={id}>
                <div className="flex items-center justify-between text-xs">
                  <PartyTag color={PARTIES[id].color} name={PARTIES[id].name} />
                  <span className="flex items-center gap-1.5 tabular">
                    <span className="font-semibold text-ink">{region.support[id]}%</span>
                    <span className={cn("text-[10px]", delta > 0 ? "text-good" : delta < 0 ? "text-bad" : "text-ink-3")}>
                      {delta > 0 ? "▲" : delta < 0 ? "▼" : "–"}
                      {Math.abs(delta).toFixed(1)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: PARTIES[id].color }}
                    initial={false}
                    animate={{ width: `${region.support[id] * 2}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-ink-3">
        가상 데이터 · 표본 1,004명 · 기타는 무소속 포함. 정당명은 익명 처리했으며, 오차범위 내 차이는 순위로 해석하지 않습니다.
      </p>
    </div>
  );
}

function PoliticianPanel({ region }: { region: Region }) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => setIdx(0), [region.code]);
  const pol = region.politicians[idx];
  const party = PARTIES[pol.party];
  const n = region.politicians.length;
  const isIncumbent = pol.role === "현역 의원";

  return (
    <div className="glass-strong w-full rounded-2xl p-4 @min-[1040px]:w-[290px]">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Users className="size-3.5 text-ink-3" /> 정치인 프로필
        </p>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[11px] text-ink-3 tabular">
            {idx + 1}/{n}
          </span>
          <IconButton className="size-6" aria-label="이전" onClick={() => setIdx((i) => (i - 1 + n) % n)} disabled={n < 2}>
            <ChevronLeft className="size-3.5" />
          </IconButton>
          <IconButton className="size-6" aria-label="다음" onClick={() => setIdx((i) => (i + 1) % n)} disabled={n < 2}>
            <ChevronRight className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={pol.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid size-11 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold"
              style={{ borderColor: party.color, background: `${party.color}22` }}
            >
              {pol.name.slice(-2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-semibold">{pol.name}</p>
                <MichelinStars count={pol.michelin} />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
                <PartyTag color={party.color} name={party.name} className="text-[11px]" />
                <span>·</span>
                <span>{pol.district}</span>
              </div>
            </div>
            <Badge tone={isIncumbent ? "lime" : "cyan"}>{pol.role}</Badge>
          </div>

          {isIncumbent ? (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
              {[
                { k: "공약 이행", v: `${pol.pledgeRate}%` },
                { k: "출석률", v: `${pol.attendance}%` },
                { k: "대표 발의", v: `${pol.bills}건` },
              ].map((m) => (
                <div key={m.k}>
                  <p className="text-[10px] text-ink-3">{m.k}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular">{m.v}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
              의정 활동 이력이 없어 평가 지표 대신 공개된 공약 목록을 제공합니다.
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function IssuePopup({ region, onClose }: { region: Region; onClose: () => void }) {
  return (
    <motion.div
      key={region.code}
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.22 }}
      className="glass-strong w-full rounded-2xl p-4 @min-[1040px]:w-[270px]"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Flame className="size-3.5 text-lime" /> {region.short} 주요 이슈
        </p>
        <IconButton className="size-6" aria-label="닫기" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      <ul className="grid gap-2.5 @min-[620px]:grid-cols-3 @min-[620px]:gap-4 @min-[1040px]:grid-cols-1 @min-[1040px]:gap-2.5">
        {region.issues.map((iss, i) => (
          <li key={iss.title} className="group">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-[11px] font-semibold text-ink-3 tabular">0{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ink group-hover:text-lime">{iss.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge className="px-1.5 py-0 text-[10px]">{iss.category}</Badge>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-lime/80" style={{ width: `${iss.heat}%` }} />
                  </div>
                  <span className="text-[10px] text-ink-3 tabular">{iss.heat}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[11px] @min-[620px]:grid-cols-4 @min-[1040px]:grid-cols-2">
        <div>
          <p className="text-ink-3">직전 투표율</p>
          <p className="font-semibold tabular">{region.turnout}%</p>
        </div>
        <div>
          <p className="text-ink-3">지역구 의석</p>
          <p className="font-semibold tabular">{region.seats}석</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ───────────────────────── Map SVG ───────────────────────── */

/* 3D 압출 지도 (레퍼런스: 화이트 아이소메트릭 지도)
 * 같은 경계 path 를 한 단위 깊이마다 (EXT_X, EXT_Y) 만큼 밀어 여러 겹 쌓아 옆면을 만들고,
 * 선택 지역은 LIFT 만큼 떠오른 별도 블록으로 다시 그린다. */
const DEPTH = 12;
const LIFT = 7;
const EXT_X = -0.75;
const EXT_Y = 1;
const SIDE_TOP = [154, 161, 170]; // 윗면과 맞닿는 옆면
const SIDE_BOTTOM = [92, 98, 107]; // 바닥 쪽 옆면
const sideColor = (t: number) =>
  `rgb(${SIDE_TOP.map((v, i) => Math.round(v + (SIDE_BOTTOM[i] - v) * t)).join(" ")})`;

function Map3D({
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  selected: string;
  hovered: string | null;
  onHover: (c: string | null) => void;
  onSelect: (c: string) => void;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });

  const onMove = (e: React.PointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 6, y: px * 8 });
  };

  const uid = React.useId().replace(/:/g, "");
  const id = (s: string) => `${uid}-${s}`;
  const liftDx = -EXT_X * LIFT;
  const liftDy = -EXT_Y * LIFT;

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto aspect-[520/558] w-full max-w-[520px] [perspective:1200px]"
      onPointerMove={onMove}
      onPointerLeave={() => {
        setTilt({ x: 0, y: 0 });
        onHover(null);
      }}
    >
      <div
        className="size-full transition-transform duration-500 ease-out [transform-style:preserve-3d]"
        style={{ transform: `rotateX(${6 + tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="size-full overflow-visible" role="img" aria-label="대한민국 시·도 지도">
          <defs>
            {PATH_ORDER.map((c) => (
              <path key={c} id={id(`r${c}`)} d={REGION_PATHS[c]} />
            ))}
            <g id={id("all")}>
              {PATH_ORDER.map((c) => (
                <use key={c} href={`#${id(`r${c}`)}`} />
              ))}
            </g>
            <linearGradient id={id("top")} x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0%" stopColor="#f1f3f5" />
              <stop offset="100%" stopColor="#d6dbe0" />
            </linearGradient>
            <linearGradient id={id("sel")} x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0%" stopColor="#eef5d6" />
              <stop offset="100%" stopColor="#d3e2a4" />
            </linearGradient>
            <filter id={id("shadow")} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </defs>

          {/* 바닥 그림자 (좌하단으로 드리움) */}
          <use href={`#${id("all")}`} transform="translate(-16 22)" fill="#000" opacity="0.45" filter={`url(#${id("shadow")})`} />

          {/* 옆면: 깊은 층부터 겹쳐 그려 두께를 만든다 */}
          {Array.from({ length: DEPTH }, (_, i) => {
            const k = DEPTH - i;
            const col = sideColor(k / DEPTH);
            return (
              <use
                key={k}
                href={`#${id("all")}`}
                transform={`translate(${EXT_X * k} ${EXT_Y * k})`}
                fill={col}
                stroke={col}
                strokeWidth="0.8"
              />
            );
          })}

          {/* 윗면 (클릭 영역) */}
          {PATH_ORDER.map((c) => {
            const isSel = c === selected;
            const isHov = c === hovered && !isSel;
            return (
              <use
                key={c}
                href={`#${id(`r${c}`)}`}
                fill={isSel ? "#bfc6cd" : isHov ? "#ffffff" : `url(#${id("top")})`}
                stroke="#a9b1ba"
                strokeWidth="0.7"
                strokeLinejoin="round"
                className="cursor-pointer outline-none"
                style={{ transition: "fill 200ms" }}
                tabIndex={0}
                role="button"
                aria-label={`${REGION_BY_CODE[c]?.name} 선택`}
                aria-pressed={isSel}
                onPointerEnter={() => onHover(c)}
                onClick={() => onSelect(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(c);
                  }
                }}
                onFocus={() => onHover(c)}
              />
            );
          })}

          {/* 선택 지역: 떠오른 블록 */}
          <AnimatePresence>
            <motion.g
              key={selected}
              pointerEvents="none"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <use
                href={`#${id(`r${selected}`)}`}
                transform="translate(-8 12)"
                fill="#000"
                opacity="0.35"
                filter={`url(#${id("shadow")})`}
              />
              {Array.from({ length: LIFT }, (_, k) => {
                const col = sideColor(1 - k / LIFT);
                return (
                  <use
                    key={k}
                    href={`#${id(`r${selected}`)}`}
                    transform={`translate(${-EXT_X * k} ${-EXT_Y * k})`}
                    fill={col}
                    stroke={col}
                    strokeWidth="0.8"
                  />
                );
              })}
              <use
                href={`#${id(`r${selected}`)}`}
                transform={`translate(${liftDx} ${liftDy})`}
                fill={`url(#${id("sel")})`}
                stroke="#9fb35c"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </motion.g>
          </AnimatePresence>

          {/* 이슈 급상승 지역 펄스 */}
          {HOT_REGIONS.map((c) => {
            const p = REGION_CENTERS[c];
            const dx = c === selected ? liftDx : 0;
            const dy = c === selected ? liftDy : 0;
            return (
              <g key={c} pointerEvents="none" transform={`translate(${dx} ${dy})`}>
                <circle cx={p.x} cy={p.y} r="4" fill="none" stroke="#4fb3c4" strokeWidth="1.2" className="animate-pulse-ring" />
                <circle cx={p.x} cy={p.y} r="3" fill="#4fb3c4" stroke="#fff" strokeWidth="1" />
              </g>
            );
          })}

          {/* 라벨 */}
          {REGIONS.map((r) => {
            const p = REGION_CENTERS[r.code];
            const isSel = r.code === selected;
            const small = ["11", "23", "29", "25", "24", "22", "26", "21"].includes(r.code);
            if (!isSel && small && r.code !== hovered) return null;
            const x = p.x + (isSel ? liftDx : 0);
            const y = p.y + (isSel ? liftDy : 0) - (HOT_REGIONS.includes(r.code) ? 10 : 0);
            return (
              <g key={r.code} pointerEvents="none" transform={`translate(${x} ${y})`}>
                {isSel ? (
                  <>
                    <rect x={-24} y={-21} width={48} height={17} rx={8.5} fill="#2b3038" fillOpacity="0.88" />
                    <text y={-9} textAnchor="middle" fontSize="10" fontWeight="700" fill="#e3efbf">
                      {r.short}
                    </text>
                  </>
                ) : (
                  <text y={-6} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#4a515c">
                    {r.short}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ───────────────────────── Card ───────────────────────── */

export function KoreaMapCard({
  selected,
  onSelect,
  expanded = false,
}: {
  selected: string;
  onSelect: (code: string) => void;
  expanded?: boolean;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [showIssues, setShowIssues] = React.useState(true);
  const region = REGION_BY_CODE[selected];
  const hov = hovered ? REGION_BY_CODE[hovered] : null;

  const select = (c: string) => {
    onSelect(c);
    setShowIssues(true);
  };

  return (
    <Card className={cn("relative overflow-hidden", expanded && "lg:min-h-[760px]")}>
      {/* 카드 배경광 (영상의 그린 글로브 카드 톤) */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_52%_48%,rgb(255_255_255/0.06),transparent_70%),radial-gradient(50%_40%_at_90%_100%,rgb(111_211_224/0.05),transparent_70%)]" />

      {/* 헤더 */}
      <div className="relative flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <MapPin className="size-4 text-lime" /> 대한민국 정치 지도
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            17개 시·도 · <span className="text-ink-2">{region.name}</span> 선택됨 · 이슈 활성도{" "}
            <span className="font-semibold text-lime tabular">{region.heat}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="cyan" className="gap-1.5">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-cyan" />
            </span>
            이슈 급상승 {HOT_REGIONS.length}
          </Badge>
          <Badge tone="lime">LIVE</Badge>
          <IconButton aria-label="전체 보기">
            <ArrowUpRight className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* 지도 + 플로팅 패널 — 카드 폭 기준 컨테이너 쿼리로 3단계 레이아웃
          · < 620px  : 지도 → 패널 세로 스택 (모바일)
          · 620~1040 : 지도 | 패널 2열 (Overview 중앙 카드)
          · ≥ 1040px : 지도 위 플로팅 글래스 패널 (Map View 확장, 영상 레퍼런스와 동일) */}
      <div className="@container relative">
        <div className="relative grid gap-3 px-4 pb-4 pt-2 @min-[620px]:grid-cols-[minmax(0,1fr)_272px] @min-[1040px]:block @min-[1040px]:px-5 @min-[1040px]:pb-5">
          <div className="@min-[1040px]:px-[250px]">
            <Map3D selected={selected} hovered={hovered} onHover={setHovered} onSelect={select} />
          </div>

          {/* 호버 툴팁 */}
          <AnimatePresence>
            {hov && hov.code !== selected && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="glass-strong pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs"
              >
                <span className="font-semibold">{hov.name}</span>
                <span className="mx-2 text-ink-3">|</span>
                이슈 활성도 <span className="font-semibold text-cyan tabular">{hov.heat}</span>
                <span className="mx-2 hidden text-ink-3 sm:inline">|</span>
                <span className="hidden text-ink-3 sm:inline">클릭하여 상세 보기</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-3 @min-[1040px]:contents">
            <div className="@min-[1040px]:absolute @min-[1040px]:left-5 @min-[1040px]:top-2">
              <SupportPanel region={region} />
            </div>
            <div className="@min-[1040px]:absolute @min-[1040px]:bottom-5 @min-[1040px]:left-5">
              <PoliticianPanel region={region} />
            </div>
          </div>

          <div className="@min-[620px]:col-span-2 @min-[1040px]:absolute @min-[1040px]:right-5 @min-[1040px]:top-2">
            <AnimatePresence mode="wait">
              {showIssues ? (
                <IssuePopup key={region.code} region={region} onClose={() => setShowIssues(false)} />
              ) : (
                <motion.button
                  key="reopen"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setShowIssues(true)}
                  className="glass-strong flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
                >
                  <Flame className="size-3.5 text-lime" /> {region.short} 이슈 보기
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* 범례 + 힌트 */}
          <div className="flex flex-wrap items-center justify-between gap-2 @min-[620px]:col-span-2 @min-[1040px]:absolute @min-[1040px]:bottom-5 @min-[1040px]:right-5 @min-[1040px]:flex-col @min-[1040px]:items-end">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <MousePointerClick className="size-3.5" /> 마우스로 기울이기 · 지역 클릭
              <button
                onClick={() => select("11")}
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 hover:text-ink"
              >
                <RotateCcw className="size-3" /> 초기화
              </button>
            </p>
            <div className="glass-strong flex items-center gap-3 rounded-full px-3 py-1.5 text-[11px] text-ink-2">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-[#d3e2a4]" /> 선택 지역
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-cyan" /> 이슈 급상승
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 빠른 지역 선택 (모바일 접근성) */}
      <div className="relative flex gap-1.5 overflow-x-auto border-t border-line px-5 py-3 scroll-thin">
        {[...REGIONS]
          .sort((a, b) => b.heat - a.heat)
          .map((r) => (
            <button
              key={r.code}
              onClick={() => select(r.code)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition",
                r.code === selected ? "border-lime/40 bg-lime/10 text-lime" : "border-line text-ink-3 hover:text-ink-2",
              )}
            >
              {r.short}
              <span className="tabular opacity-70">{r.heat}</span>
              {HOT_REGIONS.includes(r.code) && <Flame className="size-3 text-cyan" />}
            </button>
          ))}
      </div>
    </Card>
  );
}
