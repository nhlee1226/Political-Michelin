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
import { AnimatePresence, motion, type MotionValue } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  MapPin,
  MousePointerClick,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { MAP_HEIGHT, MAP_WIDTH, REGION_PATHS } from "@/lib/korea-map-data";
import { LABEL_H, LABEL_W, REGION_LABELS } from "@/lib/korea-map-labels";
import { PARTIES, PARTY_ORDER, REGION_BY_CODE, type Region } from "@/lib/mock-data";
import { useLiveRegions, usePartyLookup, usePoliticians, useRegion, useRegions } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DesignOutline, RegionBurst, useDesignRun } from "./region-burst";
import { Badge, Card, ExampleFrame, ExampleRibbon, IconButton, MichelinStars, PartyTag } from "@/components/ui/primitives";

// 광역시(2x) 를 도(3x) 위에 그려 클릭 가능하도록 정렬
const PATH_ORDER = Object.keys(REGION_PATHS).sort((a, b) => (a.startsWith("3") ? -1 : 1) - (b.startsWith("3") ? -1 : 1));

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

/** 정당 지지도 — 여론조사 데이터가 없어 전부 가상(정당 A/B/C 익명 유지). 패널 전체에 예시 표시 */
function SupportPanel({ region }: { region: Region }) {
  return (
    <div className="glass-strong pm-example w-full rounded-2xl p-4 @min-[1040px]:w-[256px] @min-[1240px]:w-[290px]">
      <ExampleRibbon className="-mx-4 -mt-4 mb-3 rounded-t-[14px]" />
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

/** 프로필 카드 한 명. 공식 데이터가 없는 지표는 null → "—" */
interface ProfileView {
  key: string;
  monaCd: string | null; // mock 은 null → 상세 패널 없음
  name: string;
  partyName: string;
  partyColor: string;
  district: string | null;
  role: string;
  isIncumbent: boolean;
  michelin: 1 | 2 | 3 | null;
  /** 아래 세 칸: 실제 의원은 법안 반영률·표결 참여율·대표 발의, mock 은 예전 지표 */
  metrics: { k: string; v: string }[];
}

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

function PoliticianPanel({ region, onOpen }: { region: Region; onOpen?: (monaCd: string) => void }) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => setIdx(0), [region.code]);
  const { data, isLoading } = useRegion(region.code);
  const party = usePartyLookup();
  const { data: apiList } = usePoliticians(); // 별점·반영률은 목록 API 에만 있음
  // keepPreviousData 로 이전 지역 응답이 남아 있을 수 있어 코드가 같을 때만 사용
  const detail = data?.code === region.code ? data : undefined;
  const isLive = !!detail?.politicians.length;
  // 불러오는 동안에는 가상 인물을 잠깐이라도 보이지 않게 비워 둠. API 실패·0명일 때만 가상 인물을 예시로
  const isMock = !isLive && !(!detail && isLoading);

  const people: ProfileView[] = React.useMemo(() => {
    if (isLive) {
      const scoreById = new Map(apiList?.rows.map((p) => [p.mona_cd, p]));
      return detail!.politicians.map((p) => ({
        key: p.mona_cd,
        monaCd: p.mona_cd,
        name: p.name,
        partyName: party(p.party_id).name,
        partyColor: party(p.party_id).color,
        district: p.district,
        role: "현역 의원",
        isIncumbent: true,
        michelin: scoreById.get(p.mona_cd)?.stars ?? p.stars ?? null,
        metrics: [
          { k: "법안 반영률", v: pct(scoreById.get(p.mona_cd)?.reflect_rate ?? p.reflect_rate ?? null) },
          { k: "표결 참여율", v: pct(p.vote_participation) },
          { k: "대표 발의", v: `${p.bills_proposed}건` },
        ],
      }));
    }
    if (!isMock) return [];
    return region.politicians.map((p) => ({
      key: p.id,
      monaCd: null,
      name: p.name,
      partyName: PARTIES[p.party].name,
      partyColor: PARTIES[p.party].color,
      district: p.district,
      role: p.role,
      isIncumbent: p.role === "현역 의원",
      michelin: p.michelin,
      metrics: [
        { k: "공약 이행", v: pct(p.pledgeRate) },
        { k: "출석률", v: pct(p.attendance) },
        { k: "대표 발의", v: `${p.bills}건` },
      ],
    }));
  }, [isLive, isMock, detail, party, apiList, region.politicians]);

  const n = people.length;
  const panelClass = "glass-strong w-full rounded-2xl p-4 @min-[1040px]:w-[256px] @min-[1240px]:w-[290px]";
  if (n === 0) {
    return (
      <div className={panelClass}>
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Users className="size-3.5 text-ink-3" /> 정치인 프로필
        </p>
        <p className="mt-3 text-[11px] text-ink-3">불러오는 중…</p>
      </div>
    );
  }
  const pol = people[Math.min(idx, n - 1)];
  const shown = { color: pol.partyColor, name: pol.partyName };
  const isIncumbent = pol.isIncumbent;

  return (
    <div className={cn(panelClass, isMock && "pm-example")}>
      {isMock && <ExampleRibbon className="-mx-4 -mt-4 mb-3 rounded-t-[14px]" />}
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Users className="size-3.5 text-ink-3" /> 정치인 프로필
        </p>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[11px] text-ink-3 tabular">
            {Math.min(idx, n - 1) + 1}/{n}
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
          key={pol.key}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
          // 실제 의원이면 눌러서 상세 패널 열기
          {...(pol.monaCd && onOpen
            ? {
                role: "button",
                tabIndex: 0,
                "aria-label": `${pol.name} 상세 보기`,
                className: "cursor-pointer",
                onClick: () => onOpen(pol.monaCd!),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(pol.monaCd!);
                  }
                },
              }
            : {})}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid size-11 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold"
              style={{ borderColor: shown.color, background: `${shown.color}22` }}
            >
              {pol.name.slice(-2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-semibold">{pol.name}</p>
                {pol.michelin == null ? <span className="text-xs text-ink-3">—</span> : <MichelinStars count={pol.michelin} />}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
                <PartyTag color={shown.color} name={shown.name} className="text-[11px]" />
                <span>·</span>
                <span>{pol.district ?? "—"}</span>
              </div>
            </div>
            <Badge tone={isIncumbent ? "lime" : "cyan"}>{pol.role}</Badge>
          </div>

          {isIncumbent ? (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
              {pol.metrics.map((m) => (
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
      className="glass-strong w-full rounded-2xl p-4 @min-[1040px]:w-[250px] @min-[1240px]:w-[270px]"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Flame className="size-3.5 text-lime" /> {region.short} 주요 이슈
        </p>
        <IconButton className="size-6" aria-label="닫기" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      {/* 이슈 목록만 가상(이슈를 뽑는 분석이 아직 없음). 아래 투표율·의석은 실제(선관위) */}
      <ExampleFrame>
      <ul className="grid gap-2.5 p-2.5 @min-[620px]:grid-cols-3 @min-[620px]:gap-4 @min-[1040px]:grid-cols-1 @min-[1040px]:gap-2.5">
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
      </ExampleFrame>
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
  regions,
  hotRegions,
  selected,
  hovered,
  onHover,
  onSelect,
  design,
}: {
  regions: Region[];
  hotRegions: string[];
  selected: string;
  hovered: string | null;
  onHover: (c: string | null) => void;
  onSelect: (c: string) => void;
  /** 지역 클릭 "설계" 연출: 경계 점선·"+" 를 지도와 같이 기울어지게 여기서 그림 */
  design?: { t: MotionValue<number>; code: string | null };
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
      data-map-box
      // 520 → 608px (+17%). 넓은 카드에서는 양옆 플로팅 패널 사이 폭을 넘지 않게 (섬이 패널에 가리지 않도록)
      className="relative mx-auto aspect-[520/558] w-full max-w-[608px] [perspective:1200px] @min-[1040px]:max-w-[min(608px,calc(100cqw-560px))] @min-[1240px]:max-w-[min(608px,calc(100cqw-608px))]"
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
                data-burst-keep
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

          {/* 설계 연출 0단계: 선택 시도 경계를 파란 점선이 한 바퀴 + 가운데 "+" */}
          {design?.code && (
            <DesignOutline
              key={design.code}
              t={design.t}
              code={design.code}
              dx={design.code === selected ? liftDx : 0}
              dy={design.code === selected ? liftDy : 0}
              maskId={id(`outline-${design.code}`)}
            />
          )}

          {/* 이슈 급상승 지역 펄스 — 작은 시는 시 안의 기준점, 큰 시·도는 이름 왼쪽 */}
          {hotRegions.map((c) => {
            const l = REGION_LABELS[c];
            if (!l) return null;
            const lifted = c === selected;
            const x = (l.leader ? l.anchor.x : l.x - 11) + (lifted ? liftDx : 0);
            const y = (l.leader ? l.anchor.y : l.y) + (lifted ? liftDy : 0);
            return (
              <g key={c} pointerEvents="none">
                <circle cx={x} cy={y} r="4" fill="none" stroke="#4fb3c4" strokeWidth="1.2" className="animate-pulse-ring" />
                <circle cx={x} cy={y} r="3" fill="#4fb3c4" stroke="#fff" strokeWidth="1" />
              </g>
            );
          })}

          {/* 이름 레이어 (맨 위) — 위치는 korea-map-labels.ts 에서 미리 계산 (서로·경계와 겹치지 않음) */}
          {regions.map((r) => {
            const l = REGION_LABELS[r.code];
            if (!l) return null;
            const isSel = r.code === selected;
            const outside = !!l.leader; // 작은 시: 바깥 이름 + 연결선
            const hot = hotRegions.includes(r.code) && !outside;
            // 큰 시·도는 선택되면 떠오른 블록과 함께 올라감. 바깥 이름은 그 자리에
            const x = l.x + (isSel && !outside ? liftDx : 0);
            const y = l.y + (isSel && !outside ? liftDy : 0);
            const ax = l.anchor.x + (isSel ? liftDx : 0);
            const ay = l.anchor.y + (isSel ? liftDy : 0);
            const tx = hot ? 5 : 0; // 펄스 점 자리만큼 오른쪽으로
            return (
              <g
                key={r.code}
                className="cursor-pointer"
                onClick={() => onSelect(r.code)}
                onPointerEnter={() => onHover(r.code)}
                data-region-label={r.code}
                data-burst-keep
              >
                {outside && (
                  <>
                    <line x1={ax} y1={ay} x2={l.leader!.x} y2={l.leader!.y} stroke="#8b939e" strokeWidth="0.7" pointerEvents="none" />
                    <circle cx={ax} cy={ay} r="1.4" fill="#4a515c" pointerEvents="none" />
                  </>
                )}
                <g transform={`translate(${x} ${y})`}>
                  {isSel ? (
                    <rect x={-LABEL_W / 2} y={-LABEL_H / 2} width={LABEL_W} height={LABEL_H} rx={LABEL_H / 2} fill="#2b3038" fillOpacity="0.88" />
                  ) : outside ? (
                    <rect
                      x={-LABEL_W / 2}
                      y={-LABEL_H / 2}
                      width={LABEL_W}
                      height={LABEL_H}
                      rx={LABEL_H / 2}
                      fill="#e9ecef"
                      stroke="#a9b1ba"
                      strokeWidth="0.6"
                    />
                  ) : (
                    // 누를 수 있는 영역 (보이지 않음)
                    <rect x={-LABEL_W / 2} y={-LABEL_H / 2} width={LABEL_W} height={LABEL_H} fill="transparent" />
                  )}
                  <text
                    x={tx}
                    dy="0.35em"
                    textAnchor="middle"
                    fontSize={isSel ? 10 : 9.5}
                    fontWeight={isSel ? 700 : 600}
                    fill={isSel ? "#e3efbf" : "#4a515c"}
                    pointerEvents="none"
                  >
                    {r.short}
                  </text>
                </g>
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
  onOpenPolitician,
  expanded = false,
}: {
  selected: string;
  onSelect: (code: string) => void;
  onOpenPolitician?: (monaCd: string) => void;
  expanded?: boolean;
}) {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [showIssues, setShowIssues] = React.useState(true);

  // API 값이 있으면 실제 값, 없거나 실패하면 mock 그대로 (useLiveRegions 가 처리)
  const regions = useLiveRegions();
  const { data: apiRegions, isLoading: regionsLoading } = useRegions(); // 같은 키라 요청은 한 번 (SWR)
  const isLive = !!apiRegions?.length;
  // API 가 안 되면 지도 숫자(활성도·투표율·의석)가 전부 가상 → 카드 전체에 예시 표시
  const isMock = !isLive && !regionsLoading;
  const byCode = React.useMemo(() => Object.fromEntries(regions.map((r) => [r.code, r])), [regions]);
  const byHeat = React.useMemo(() => [...regions].sort((a, b) => b.heat - a.heat), [regions]);
  const hotRegions = React.useMemo(() => byHeat.slice(0, 3).map((r) => r.code), [byHeat]);

  const region = byCode[selected] ?? REGION_BY_CODE[selected];
  const hov = hovered ? byCode[hovered] : null;

  // 지역 클릭 "설계" 연출 (커서가 의원 카드를 그려 나감). 처음 들어왔을 때는 닫힌 상태
  const design = useDesignRun();
  const gridRef = React.useRef<HTMLDivElement>(null);

  const select = (c: string) => {
    onSelect(c);
    setShowIssues(true);
    design.request(c); // 같은 지역이면 다시 재생하지 않음 (진행 바의 "다시 보기"로만)
  };

  return (
    <Card example={isMock} className={cn("relative overflow-hidden", expanded && "lg:min-h-[760px]")}>
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
            이슈 급상승 {hotRegions.length}
          </Badge>
          {isLive && <Badge tone="lime">LIVE</Badge>}
        </div>
      </div>

      {/* 지도 + 플로팅 패널 — 카드 폭 기준 컨테이너 쿼리로 3단계 레이아웃
          · < 620px  : 지도 → 패널 세로 스택 (모바일)
          · 620~1040 : 지도 | 패널 2열 (Overview 중앙 카드)
          · ≥ 1040px : 지도 위 플로팅 글래스 패널 (Map View 확장, 영상 레퍼런스와 동일) */}
      <div className="@container relative">
        <div
          ref={gridRef}
          className="relative grid gap-3 px-4 pb-4 pt-2 @min-[620px]:grid-cols-[minmax(0,1fr)_272px] @min-[1040px]:block @min-[1040px]:px-5 @min-[1040px]:pb-5"
        >
          <RegionBurst design={design} rootRef={gridRef} onOpenPolitician={onOpenPolitician} />
          {/* 넓은 카드: 지도 윗부분(강원·경기 북쪽)을 머리말의 빈 가운데로 올려 카드 높이(760px)를 그대로 유지 */}
          <div className="@min-[1040px]:-mt-12">
            <Map3D
              regions={regions}
              hotRegions={hotRegions}
              selected={selected}
              hovered={hovered}
              onHover={setHovered}
              onSelect={select}
              design={{ t: design.t, code: design.run?.code ?? null }}
            />
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
            <div data-map-obstacle className="@min-[1040px]:absolute @min-[1040px]:left-5 @min-[1040px]:top-2">
              <SupportPanel region={region} />
            </div>
            <div data-map-obstacle className="@min-[1040px]:absolute @min-[1040px]:bottom-5 @min-[1040px]:left-5">
              <PoliticianPanel region={region} onOpen={onOpenPolitician} />
            </div>
          </div>

          <div data-map-obstacle className="@min-[620px]:col-span-2 @min-[1040px]:absolute @min-[1040px]:right-5 @min-[1040px]:top-2">
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
          <div data-map-obstacle className="flex flex-wrap items-center justify-between gap-2 @min-[620px]:col-span-2 @min-[1040px]:absolute @min-[1040px]:bottom-5 @min-[1040px]:right-5 @min-[1040px]:flex-col @min-[1040px]:items-end">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <MousePointerClick className="size-3.5" /> 마우스로 기울이기 · 지역 클릭
              <button
                onClick={() => {
                  onSelect("11");
                  setShowIssues(true);
                  design.close();
                }}
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
        {byHeat.map((r) => (
          <button
            key={r.code}
            onClick={() => select(r.code)}
            data-burst-keep
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition",
              r.code === selected ? "border-lime/40 bg-lime/10 text-lime" : "border-line text-ink-3 hover:text-ink-2",
            )}
          >
            {r.short}
            <span className="tabular opacity-70">{r.heat}</span>
            {hotRegions.includes(r.code) && <Flame className="size-3 text-cyan" />}
          </button>
        ))}
      </div>
    </Card>
  );
}
