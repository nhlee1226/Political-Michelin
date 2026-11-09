"use client";

/**
 * 하단 데이터 시각화 KPI 카드 모음 (Recharts)
 *  1. PledgeCard        공약 이행률 (세미 링 게이지)
 *  2. ActivityCard      의정 활동 평가 (300명 평균, 가로 막대)
 *  3. PartyTrendCard    정당별 지지도 비교 (12주 라인, 크로스헤어 툴팁)
 *  4. IssueTimelineCard 이슈 타임라인 (언급량 영역 차트 + 이벤트 마커)
 */
import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, ArrowUpRight, ClipboardCheck, LineChart as LineIcon, Milestone, MoreHorizontal } from "lucide-react";
import { ASSEMBLY_ACTIVITY, ISSUE_TIMELINE, PARTIES, PLEDGE_STATUS, SUPPORT_TREND } from "@/lib/mock-data";
import { useStats } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardHeader, ExampleBadge, IconButton, PartyTag, Segmented, Soon } from "@/components/ui/primitives";

const AXIS = { stroke: "var(--chart-axis)", fontSize: 11 };
const GRID = "var(--chart-grid)";

/* eslint-disable @typescript-eslint/no-explicit-any */
function TooltipShell({ children }: { children: React.ReactNode }) {
  return <div className="glass-strong min-w-[150px] rounded-xl px-3 py-2 text-xs shadow-2xl">{children}</div>;
}

/* ───────── 1. 공약 이행률 ───────── */
export function PledgeCard({ className }: { className?: string }) {
  const { total, done, inProgress, notStarted } = PLEDGE_STATUS;
  const rate = Math.round((done / total) * 1000) / 10;
  const segs = [
    { k: "완료", v: done, color: "var(--color-lime)" },
    { k: "진행 중", v: inProgress, color: "var(--color-cyan)" },
    { k: "미착수", v: notStarted, color: "var(--chart-muted)" },
  ];
  // 반원 아크
  const R = 70;
  const C = Math.PI * R;
  const GAP = 3;
  let acc = 0;
  const [hover, setHover] = React.useState<number | null>(null);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<ClipboardCheck className="size-4" />}
        title={
          <>
            공약 이행률
            <ExampleBadge />
          </>
        }
        subtitle="제22대 국회의원 전체 공약 기준"
        action={
          <Soon>
            <IconButton aria-label="더보기" disabled>
              <MoreHorizontal className="size-4" />
            </IconButton>
          </Soon>
        }
      />
      <div className="relative mx-auto mt-2 w-full max-w-[220px] px-5">
        <svg viewBox="0 0 180 100" className="w-full overflow-visible">
          <path d={`M 20 90 A ${R} ${R} 0 0 1 160 90`} fill="none" stroke="var(--chart-track)" strokeWidth="14" />
          {segs.map((s, i) => {
            const len = (s.v / total) * C;
            const el = (
              <path
                key={s.k}
                d={`M 20 90 A ${R} ${R} 0 0 1 160 90`}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? 17 : 14}
                strokeDasharray={`${Math.max(len - GAP, 0)} ${C}`}
                strokeDashoffset={-acc}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-3xl font-semibold tracking-tight tabular">
            {hover === null ? rate : Math.round((segs[hover].v / total) * 1000) / 10}
            <span className="text-base text-ink-3">%</span>
          </p>
          <p className="text-[11px] text-ink-3">{hover === null ? "이행 완료" : segs[hover].k}</p>
        </div>
      </div>
      <ul className="mt-auto grid grid-cols-3 gap-2 px-5 pb-5 pt-4">
        {segs.map((s, i) => (
          <li
            key={s.k}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={cn("rounded-lg border border-line p-2 transition", hover === i && "border-white/20 bg-white/[0.04]")}
          >
            <p className="flex items-center gap-1.5 text-[10px] text-ink-3">
              <span className="size-1.5 rounded-full" style={{ background: s.color }} />
              {s.k}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular">{s.v.toLocaleString()}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ───────── 2. 의정 활동 평가 ───────── */
/** onOpen 이 있을 때만 ↗ (자세한 화면으로 이동). 그 화면 안에서는 넘기지 않아 아이콘이 사라짐 */
function OpenButton({ onOpen, label }: { onOpen?: () => void; label: string }) {
  if (!onOpen) return null;
  return (
    <IconButton aria-label={label} title={label} onClick={onOpen}>
      <ArrowUpRight className="size-4" />
    </IconButton>
  );
}

export function ActivityCard({ className, onOpen }: { className?: string; onOpen?: () => void }) {
  const { data: stats } = useStats();
  // 실제 값은 평균 법안 반영률 하나. 출석·표결은 공식 데이터가 없거나 수집 전이라 mock 을 "예시"로 표시
  const rows: { metric: string; value: number | null; unit: string; example: boolean; hint?: string }[] = [
    {
      metric: "평균 법안 반영률",
      value: stats?.avg_reflect_rate ?? null,
      unit: "%",
      example: false,
      hint: "원안·수정가결 + 대안반영 ÷ 대표발의 (대표발의 1건 이상 의원 평균)",
    },
    ...ASSEMBLY_ACTIVITY.filter((m) => m.metric !== "법안 가결률").map((m) => ({ ...m, example: true })),
  ];

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Activity className="size-4" />}
        title="의정 활동 평가"
        subtitle="국회의원 전체 평균 · 22대"
        action={<OpenButton onOpen={onOpen} label="Politicians 화면으로" />}
      />
      <ul className="mt-4 flex flex-1 flex-col justify-center gap-4 px-5 pb-5">
        {rows.map((m) => (
          <li key={m.metric} className="group" title={m.hint ?? `${m.metric}: ${m.value ?? "—"}${m.unit}`}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-ink-2">
                {m.metric}
                {m.example && <ExampleBadge />}
              </span>
              <span className="text-sm font-semibold tabular">
                {m.value ?? "—"}
                {m.value != null && <span className="text-[11px] text-ink-3">{m.unit}</span>}
              </span>
            </div>
            {/* 영상의 진행 바 + 끝점 마커 스타일 */}
            <div className="relative h-2 rounded-full bg-[repeating-linear-gradient(90deg,var(--chart-track)_0_4px,transparent_4px_7px)]">
              {m.value != null && (
                <>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-lime/30 to-lime transition-all duration-300 group-hover:to-cyan"
                    style={{ width: `${m.value}%` }}
                  />
                  <span
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas bg-lime group-hover:bg-cyan"
                    style={{ left: `${m.value}%` }}
                  />
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ───────── 3. 정당별 지지도 비교 ───────── */
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a: any, b: any) => b.value - a.value);
  return (
    <TooltipShell>
      <p className="mb-1.5 text-[11px] text-ink-3">{label} 주차</p>
      {sorted.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <PartyTag color={p.color} name={PARTIES[p.dataKey as "A"].name} />
          <span className="font-semibold tabular text-ink">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </TooltipShell>
  );
}

export function PartyTrendCard({ className }: { className?: string }) {
  const [range, setRange] = React.useState<"6" | "12">("12");
  const data = range === "6" ? SUPPORT_TREND.slice(-6) : SUPPORT_TREND;
  const last = data[data.length - 1];
  const ids = ["A", "B", "C"] as const;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<LineIcon className="size-4" />}
        title={
          <>
            정당별 지지도 비교
            <ExampleBadge />
          </>
        }
        subtitle="주간 가상 여론조사 집계 · 오차범위 ±3.1%p"
        action={
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "6", label: "6주" },
              { value: "12", label: "12주" },
            ]}
          />
        }
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-3">
        {ids.map((id) => (
          <span key={id} className="flex items-center gap-1.5 text-xs">
            <PartyTag color={PARTIES[id].color} name={PARTIES[id].name} />
            <span className="font-semibold tabular">{last[id]}%</span>
          </span>
        ))}
      </div>
      <div className="h-[210px] flex-1 px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 34, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={AXIS} dy={6} />
            <YAxis domain={[15, 35]} tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--chart-cursor)", strokeDasharray: "3 3" }} />
            {ids.map((id) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                stroke={PARTIES[id].color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--chart-dot-ring)", strokeWidth: 2 }}
                isAnimationActive
                label={(p: any) =>
                  p.index === data.length - 1 ? (
                    <text x={p.x + 8} y={p.y + 4 + (id === "A" ? -6 : id === "B" ? 6 : 0)} fontSize={11} fill="var(--chart-label)" fontWeight={600}>
                      {id}
                    </text>
                  ) : (
                    <g />
                  )
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/* ───────── 4. 이슈 타임라인 ───────── */
function TimelineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as (typeof ISSUE_TIMELINE)[number];
  return (
    <TooltipShell>
      <p className="text-[11px] text-ink-3">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular">
        {d.volume}천 건 <span className="text-[11px] font-normal text-ink-3">언급</span>
      </p>
      {d.event && (
        <p className="mt-1.5 flex items-center gap-1 border-t border-line pt-1.5 text-[11px] text-lime">
          <Milestone className="size-3" /> {d.event}
        </p>
      )}
    </TooltipShell>
  );
}

export function IssueTimelineCard({ className, onOpen }: { className?: string; onOpen?: () => void }) {
  const total = ISSUE_TIMELINE.reduce((a, d) => a + d.volume, 0);
  const events = ISSUE_TIMELINE.filter((d) => d.event);
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Milestone className="size-4" />}
        title={
          <>
            이슈 타임라인
            <ExampleBadge />
          </>
        }
        subtitle="최근 14일 정치 이슈 언급량 (뉴스·커뮤니티 합산)"
        action={<OpenButton onOpen={onOpen} label="News/Issues 화면으로" />}
      />
      <div className="flex items-baseline gap-2 px-5 pt-3">
        <p className="text-2xl font-semibold tracking-tight tabular">{(total / 10).toFixed(1)}만 건</p>
        <span className="rounded-full bg-lime/10 px-2 py-0.5 text-[11px] font-medium text-lime">+38% vs 이전 14일</span>
      </div>
      <div className="h-[190px] flex-1 px-2 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={ISSUE_TIMELINE} margin={{ top: 14, right: 14, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="tlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-lime)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-lime)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={AXIS} dy={6} interval={1} />
            <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(v) => `${v}k`} />
            <Tooltip content={<TimelineTooltip />} cursor={{ stroke: "var(--chart-cursor)", strokeDasharray: "3 3" }} />
            <Area type="monotone" dataKey="volume" stroke="var(--color-lime)" strokeWidth={2} fill="url(#tlFill)" activeDot={{ r: 5, stroke: "var(--chart-dot-ring)", strokeWidth: 2, fill: "var(--color-lime)" }} />
            {events.map((e) => (
              <ReferenceDot key={e.day} x={e.day} y={e.volume} r={5} fill="var(--color-cyan)" stroke="var(--chart-dot-ring)" strokeWidth={2} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex gap-2 overflow-x-auto px-5 pb-5 pt-2 scroll-thin">
        {events.map((e) => (
          <li key={e.day} className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[11px]">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-cyan align-middle" />
            <span className="text-ink-3 tabular">{e.day}</span> <span className="text-ink-2">{e.event}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
