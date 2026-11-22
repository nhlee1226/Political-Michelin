"use client";

/**
 * NewsPanel — AI 실시간 뉴스 & 편향성 리포트
 *  - 실제 기사: 진보 ↔ 보수 막대(lean) + 확신 정도, "근거 보기"를 누르면 AI 가 찾은 근거(원문 문장·설명)가 펼쳐짐
 *    점수는 근거로만 계산하므로(scripts/analyze/score.ts) 막대와 근거가 항상 맞음
 *  - 예시 기사(수집 전): 편향 지수 게이지 + "AI 객관화" 버튼으로 원문 요약 ↔ 객관화 요약문 전환
 *  - 본문 속 정치 용어는 GlossaryText 로 호버 해설
 *  - 상단 AI 객관화 모드 ON 이면 기본값이 객관화 요약
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Newspaper, ScanSearch, Sparkles, Undo2 } from "lucide-react";
import { NEWS, REGION_BY_CODE, type NewsItem } from "@/lib/mock-data";
import { useNews, useNewsPage, type ApiEvidence, type ApiNews, type NewsFilter } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader, IconButton, Segmented } from "@/components/ui/primitives";
import { GlossaryText } from "./glossary-text";

/** 이보다 |lean| 이 작으면 '균형', 이 이상이면 '치우침' */
const BALANCED = 15;
const LEANING = 40;

const TONE_BAR = { good: "bg-good", warn: "bg-warn", bad: "bg-bad" } as const;

/** lean(-100 진보 ~ +100 보수) → 화면 문구와 색. 색은 정당색이 아니라 치우친 정도(초록·노랑·빨강)로만 */
function leanTone(lean: number) {
  const side = lean < 0 ? "진보" : "보수";
  const abs = Math.abs(lean);
  if (abs < BALANCED) return { tone: "good" as const, label: "균형" };
  if (abs < LEANING) return { tone: "warn" as const, label: `${side} 쪽 약간` };
  return { tone: "bad" as const, label: `${side} 쪽 치우침` };
}

const CONFIDENCE_LABEL = { low: "확신 낮음", medium: "확신 보통", high: "확신 높음" } as const;
const TYPE_LABEL: Record<ApiEvidence["type"], string> = {
  quote_balance: "인용 균형",
  wording: "표현",
  headline_gap: "제목·본문 차이",
  fact_check: "사실 검증",
};
const DIRECTION_LABEL: Record<ApiEvidence["direction"], string> = {
  progressive: "진보 쪽",
  neutral: "균형",
  conservative: "보수 쪽",
};

/** 진보 ●───┼───○ 보수 : 가운데(중립)에서 점까지 칠함 */
function LeanBar({ lean }: { lean: number }) {
  const t = leanTone(lean);
  const pos = (lean + 100) / 2; // 0 ~ 100 %
  return (
    <div className="min-w-0 flex-1" role="img" aria-label={`진보-보수 척도 ${lean > 0 ? "+" : ""}${lean} (${t.label})`}>
      <div className="relative h-1.5 rounded-full bg-white/[0.06]">
        <span className="absolute -inset-y-1 left-1/2 w-px bg-white/25" />
        <motion.div
          className={cn("absolute inset-y-0 rounded-full opacity-50", TONE_BAR[t.tone])}
          initial={false}
          animate={{ left: `${Math.min(50, pos)}%`, width: `${Math.abs(lean) / 2}%` }}
          transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
        />
        <motion.span
          className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card", TONE_BAR[t.tone])}
          initial={false}
          animate={{ left: `${pos}%` }}
          transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[calc(10px*var(--fs))] text-ink-3">
        <span>진보</span>
        <span>중립</span>
        <span>보수</span>
      </div>
    </div>
  );
}

function StrengthDots({ value }: { value: number }) {
  return (
    <span className="tracking-tight text-ink-3" aria-label={`근거 강도 ${value}/3`} title={`근거 강도 ${value}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= value ? "text-ink-2" : "opacity-30"}>
          ●
        </span>
      ))}
    </span>
  );
}

function EvidenceList({ items }: { items: ApiEvidence[] }) {
  return (
    <ul className="space-y-2">
      {items.map((e, i) => (
        <li key={i} className="rounded-lg border border-line bg-white/[0.02] p-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[calc(10px*var(--fs))]">
            <Badge className="px-1.5 py-0 text-[calc(10px*var(--fs))]">{TYPE_LABEL[e.type]}</Badge>
            <span className={cn("font-semibold", e.direction === "neutral" ? "text-good" : "text-ink-2")}>
              {DIRECTION_LABEL[e.direction]}
            </span>
            <StrengthDots value={e.strength} />
          </div>
          <blockquote className="mt-1.5 border-l-2 border-white/15 pl-2 text-[calc(12px*var(--fs))] leading-relaxed text-ink-2">
            {e.excerpt}
          </blockquote>
          <p className="mt-1.5 text-[calc(12px*var(--fs))] leading-relaxed text-ink-3">{e.explanation}</p>
          {e.source_url && (
            <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-[calc(11px*var(--fs))] text-cyan hover:underline">
              확인한 자료 <ArrowUpRight className="size-3" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function biasTone(b: number) {
  if (b >= 60) return { tone: "bad" as const, label: "편향 높음", bar: "bg-bad" };
  if (b >= 30) return { tone: "warn" as const, label: "주의", bar: "bg-warn" };
  return { tone: "good" as const, label: "중립", bar: "bg-good" };
}

function BiasMeter({ value }: { value: number }) {
  const t = biasTone(value);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", t.bar)}
          initial={false}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
        />
      </div>
      <span className="text-xs font-semibold tabular">{value}%</span>
    </div>
  );
}

function NewsCard({ item, aiMode }: { item: NewsItem; aiMode: boolean }) {
  const [objective, setObjective] = React.useState(aiMode);
  const [scanning, setScanning] = React.useState(false);
  React.useEffect(() => setObjective(aiMode), [aiMode]);

  const convert = () => {
    if (objective) return setObjective(false);
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setObjective(true);
    }, 650);
  };

  // 샘플 기사는 값이 늘 있음. 통합 스키마 타입은 AI 분석 전 null 을 허용하므로 0 으로 대신
  const bias = item.bias ?? 0;
  const t = biasTone(bias);

  return (
    <article className="group rounded-xl border border-line bg-white/[0.02] p-3.5 transition hover:border-white/15 hover:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2 text-[calc(11px*var(--fs))] text-ink-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="font-medium text-ink-2">{item.source}</span>·<span>{item.time}</span>·
          <span>{item.category}</span>
          {item.region && <Badge className="px-1.5 py-0 text-[calc(10px*var(--fs))]">{REGION_BY_CODE[item.region]?.short}</Badge>}
        </span>
        <Badge tone={objective ? "lime" : t.tone}>{objective ? "AI 객관화" : t.label}</Badge>
      </div>

      <h4 className="mt-2 text-[calc(14px*var(--fs))] font-semibold leading-snug text-ink">
        <GlossaryText text={objective ? (item.objectiveHeadline ?? item.headline) : item.headline} />
      </h4>

      <div className="relative mt-2">
        <AnimatePresence mode="wait">
          <motion.p
            key={objective ? "obj" : "org"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn("text-[calc(13px*var(--fs))] leading-relaxed", objective ? "text-ink-2" : "text-ink-3")}
          >
            <GlossaryText text={objective ? (item.objective ?? item.original) : item.original} />
          </motion.p>
        </AnimatePresence>
        {scanning && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
            <motion.div
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-lime/25 to-transparent"
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{ duration: 0.65, ease: "easeInOut" }}
            />
          </div>
        )}
      </div>

      {!objective && item.biasSignals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.biasSignals.map((s) => (
            <span key={s} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[calc(10px*var(--fs))] text-ink-3">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[calc(11px*var(--fs))] text-ink-3">편향</span>
          <BiasMeter value={bias} />
        </div>
        <button
          onClick={convert}
          disabled={scanning}
          className={cn(
            "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[calc(11px*var(--fs))] font-semibold transition",
            objective
              ? "border border-line text-ink-2 hover:text-ink"
              : "bg-lime text-canvas hover:bg-lime-2 disabled:opacity-60",
          )}
        >
          {objective ? (
            <>
              <Undo2 className="size-3" /> 원문 보기
            </>
          ) : scanning ? (
            <>
              <ScanSearch className="size-3 animate-pulse" /> 분석 중
            </>
          ) : (
            <>
              <Sparkles className="size-3" /> AI 객관화
            </>
          )}
        </button>
      </div>
    </article>
  );
}

/** published_at → "3분 전" (mock 의 time 표기와 맞춤) */
export function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "시간 —";
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000)); // 미래 시각(시계 오차)은 0
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / (60 * 24))}일 전`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// 줄을 나누는 태그는 공백으로, <b> 같은 인라인 태그는 그냥 지움 (단어가 쪼개지지 않게)
const stripTags = (s: string) => s.replace(/<\/?(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, " ").replace(/<[^>]*>/g, "");
const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/**
 * 뉴스 요약에 섞여 오는 HTML 태그·엔티티를 지우고 공백을 정리 (태그를 렌더하지 않고 글자만 남김).
 * 엔티티로 감싼 태그(&lt;b&gt;)도 있어 풀고 나서 한 번 더 지움.
 */
export function plainText(html: string | null) {
  if (!html) return "";
  return stripTags(decodeEntities(stripTags(html)))
    .replace(/\s+/g, " ")
    .trim();
}

/** 실제 기사 카드: 제목·출처·시간·요약 + 진보↔보수 막대와 근거. 본문은 싣지 않고 원문 링크로 보냄 */
function LiveNewsCard({ item }: { item: ApiNews }) {
  const [open, setOpen] = React.useState(false);
  const summary = plainText(item.summary);
  const lean = item.lean;
  const t = lean != null ? leanTone(lean) : null;
  const evidence = item.evidence ?? [];
  const badge = t ? t.label : item.analyzed ? "판단 불가" : "분석 전";

  return (
    <article className="group rounded-xl border border-line bg-white/[0.02] p-3.5 transition hover:border-white/15 hover:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2 text-[calc(11px*var(--fs))] text-ink-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="font-medium text-ink-2">{item.source ?? "출처 미상"}</span>·<span>{timeAgo(item.published_at)}</span>
          {item.region_code && <Badge className="px-1.5 py-0 text-[calc(10px*var(--fs))]">{REGION_BY_CODE[item.region_code]?.short}</Badge>}
        </span>
        <Badge tone={t?.tone}>{badge}</Badge>
      </div>

      <h4 className="mt-2 text-[calc(14px*var(--fs))] font-semibold leading-snug text-ink">{item.headline}</h4>

      {summary && <p className="mt-2 text-[calc(13px*var(--fs))] leading-relaxed text-ink-3">{summary}</p>}

      <div className="mt-3 border-t border-line pt-3">
        {lean != null ? (
          <div className="flex items-start gap-3">
            <LeanBar lean={lean} />
            <div className="shrink-0 text-right">
              <div className="text-xs font-semibold tabular text-ink">
                {lean > 0 ? "+" : ""}
                {lean}
              </div>
              {item.confidence && <div className="text-[calc(10px*var(--fs))] text-ink-3">{CONFIDENCE_LABEL[item.confidence]}</div>}
            </div>
          </div>
        ) : (
          <p className="text-[calc(11px*var(--fs))] text-ink-3">
            {item.analyzed ? "판단 불가 — 한국 정치 기사가 아니거나 진영 간 쟁점이 없는 기사입니다." : "아직 편향 분석 전입니다."}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2">
          {evidence.length > 0 ? (
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex items-center gap-1 text-[calc(11px*var(--fs))] font-semibold text-ink-2 transition hover:text-ink"
            >
              근거 {evidence.length}개 {open ? "접기" : "보기"}
              <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
            </button>
          ) : (
            <span />
          )}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[calc(11px*var(--fs))] font-semibold text-ink-2 transition hover:text-ink"
          >
            <ArrowUpRight className="size-3" /> 원문 보기
          </a>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-2.5">
                <EvidenceList items={evidence} />
                <p className="mt-2 text-[calc(10px*var(--fs))] leading-relaxed text-ink-3">
                  AI가 기사 문장에서 찾은 근거입니다. 점수는 이 근거의 방향과 강도로만 계산합니다. 언론사 이름은 판단에 쓰지 않습니다.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </article>
  );
}

type Filter = NewsFilter;

/** 1 … 4 5 [6] 7 8 … 1072 처럼 처음·끝과 현재 주변만 */
function pageList(page: number, pages: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  const lo = Math.max(2, page - 2);
  const hi = Math.min(pages - 1, page + 2);
  out.push(1);
  if (lo > 2) out.push("…");
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < pages - 1) out.push("…");
  if (pages > 1) out.push(pages);
  return out;
}

/** 뉴스 리포트 아래 페이지 넘김 */
function Pager({
  page,
  pages,
  from,
  to,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const btn =
    "grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums transition disabled:pointer-events-none disabled:opacity-30";
  return (
    <nav aria-label="뉴스 페이지" className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-2.5">
      <span className="text-[10px] tabular-nums text-ink-3">
        {total.toLocaleString("ko-KR")}건 중 {from.toLocaleString("ko-KR")}–{to.toLocaleString("ko-KR")}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="이전 페이지"
          className={cn(btn, "text-ink-2 hover:bg-white/[0.06] hover:text-ink")}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`gap${i}`} className="px-1 text-[11px] text-ink-3">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === page ? "page" : undefined}
              className={cn(btn, p === page ? "bg-white/[0.12] text-ink" : "text-ink-2 hover:bg-white/[0.06] hover:text-ink")}
              onClick={() => onChange(p)}
            >
              {p.toLocaleString("ko-KR")}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="다음 페이지"
          className={cn(btn, "text-ink-2 hover:bg-white/[0.06] hover:text-ink")}
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}

/** 예시 기사: 방향 정보가 없어 편향 지수 크기로만 */
const mockFilter = (filter: Filter) => (bias: number | null) =>
  filter === "right" || filter === "left"
    ? bias != null && bias >= 60
    : filter === "neutral"
      ? bias != null && bias < 30
      : true;

/** 분석됨 안의 세부 필터 */
type SubFilter = Exclude<Filter, "all">;

/** lean → "진보 30" · "0" · "보수 10" */
const leanText = (v: number) => (v < 0 ? `진보 ${-v}` : v > 0 ? `보수 ${v}` : "0");

/** 세부 필터 칩 (건수 포함). Segmented 와 같은 모양 */
function SubChips({
  value,
  onChange,
  options,
}: {
  value: SubFilter;
  onChange: (v: SubFilter) => void;
  options: { value: SubFilter; label: string; count?: number; title?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label="분석 기사 세부 필터" className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
            value === o.value
              ? "border-white/20 bg-white/[0.12] text-ink"
              : "border-line text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
          {o.count != null && <span className="ml-1 tabular-nums text-ink-3">{o.count.toLocaleString("ko-KR")}</span>}
        </button>
      ))}
    </div>
  );
}

/** 편향 방향 수치(lean) 범위 슬라이더. 손을 떼거나 멈춘 뒤 0.3초 뒤에 반영 */
function LeanRange({
  value,
  onChange,
  count,
}: {
  value: [number, number];
  onChange: (v: [number, number]) => void;
  count?: number;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  React.useEffect(() => {
    if (draft[0] === value[0] && draft[1] === value[1]) return;
    const t = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  const pct = (v: number) => ((v + 100) / 200) * 100;
  const thumb =
    "pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-canvas [&::-webkit-slider-thumb]:bg-ink " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-canvas [&::-moz-range-thumb]:bg-ink";
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-semibold tabular-nums text-ink">
          {leanText(draft[0])} ~ {leanText(draft[1])}
        </span>
        {count != null && <span className="tabular-nums text-ink-3">{count.toLocaleString("ko-KR")}건</span>}
      </div>
      <div className="relative mt-2 h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        <div className="absolute top-1/2 h-px w-px -translate-y-1/2 bg-ink-3" style={{ left: "50%" }} />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-lime/70"
          style={{ left: `${pct(draft[0])}%`, right: `${100 - pct(draft[1])}%` }}
        />
        <input
          type="range"
          aria-label="최소 (진보 쪽)"
          min={-100}
          max={100}
          step={5}
          value={draft[0]}
          onChange={(e) => setDraft([Math.min(Number(e.target.value), draft[1]), draft[1]])}
          className={thumb}
        />
        <input
          type="range"
          aria-label="최대 (보수 쪽)"
          min={-100}
          max={100}
          step={5}
          value={draft[1]}
          onChange={(e) => setDraft([draft[0], Math.max(Number(e.target.value), draft[0])])}
          className={thumb}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>← 진보 시각 100</span>
        <span>0</span>
        <span>보수 시각 100 →</span>
      </div>
    </div>
  );
}

export function NewsPanel({
  aiMode,
  className,
  limit,
  region,
  onOpen,
}: {
  aiMode: boolean;
  className?: string;
  limit?: number;
  /** 지정하면 그 시도 기사만 */
  region?: string;
  /** ↗ 누르면 뉴스 화면으로. 뉴스 화면 안에서는 넘기지 않아 아이콘이 사라짐 */
  onOpen?: () => void;
}) {
  // 위 줄: 전체 | 분석됨. 분석됨 안에서 진보 쪽·보수 쪽·균형·수치 범위로 세분화
  const [mode, setMode] = React.useState<"all" | "analyzed">("all");
  const [sub, setSub] = React.useState<SubFilter>("analyzed");
  const [lean, setLean] = React.useState<[number, number]>([-100, 100]);
  const filter: Filter = mode === "all" ? "all" : sub;
  // 기사 목록이 그대로여도 "○분 전"이 흘러가도록 1분마다 다시 그림
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  // 전체 기사를 pageSize 씩 서버에서 잘라 받음. 필터·지역이 바뀌면 1페이지로
  const pageSize = limit ?? 20;
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [filter, region, lean]);
  const listRef = React.useRef<HTMLDivElement>(null);
  const goPage = (p: number) => {
    setPage(p);
    listRef.current?.scrollTo({ top: 0 });
  };
  const { data: paged, isLoading: newsLoading } = useNewsPage(region, filter, page, pageSize, lean);
  // keepPreviousData 로 이전 지역·필터 결과가 잠깐 남을 수 있어, 지역이 맞는 것만
  const pageItems = region ? paged?.items.filter((n) => n.region_code === region) : paged?.items;
  const counts = paged?.counts;
  // 지역 기사가 0건일 때, 수집 자체가 안 된 건지(→ 가상 기사를 예시로) 그 지역만 없는 건지 구분용
  const { data: anyNews, isLoading: anyLoading } = useNews(undefined, 1);
  const hasLive = !!anyNews?.length || !!pageItems?.length;
  // 불러오는 동안에는 가상 기사를 잠깐이라도 보이지 않게 비워 둠
  const loading = !hasLive && (newsLoading || anyLoading);
  const isMock = !hasLive && !loading;

  const live = pageItems ?? [];
  const mock = isMock ? NEWS.filter((n) => mockFilter(filter)(n.bias)).slice(0, pageSize) : [];
  const count = hasLive ? live.length : mock.length;
  const noAnalysis = hasLive && counts != null && counts.analyzed === 0;
  React.useEffect(() => {
    if (noAnalysis) setMode("all");
  }, [noAnalysis]);

  const num = (v: number) => v.toLocaleString("ko-KR");
  const mockBias = NEWS.filter((n) => n.bias != null).map((n) => n.bias!);
  const avgMock = mockBias.length ? `${Math.round(mockBias.reduce((a, b) => a + b, 0) / mockBias.length)}%` : "분석 전";
  const subtitle = hasLive
    ? `${region ? `${REGION_BY_CODE[region]?.short} ` : ""}수집 ${num(counts?.total ?? 0)}건 · ${
        counts?.analyzed
          ? `편향 분석 ${num(counts.analyzed)}건`
          : "편향 분석 전"
      }`
    : loading
      ? "불러오는 중…"
      : `수집 ${NEWS.length}건 · 평균 편향 지수 ${avgMock}`;

  return (
    <Card example={isMock} className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Newspaper className="size-4" />}
        title="AI 뉴스 리포트"
        subtitle={subtitle}
        action={
          onOpen && (
            <IconButton aria-label="뉴스 화면으로" title="뉴스 화면으로" onClick={onOpen}>
              <ArrowUpRight className="size-4" />
            </IconButton>
          )
        }
      />
      <div className="flex items-center justify-between px-5 pt-3">
        <Segmented<"all" | "analyzed">
          value={mode}
          onChange={setMode}
          options={[
            { value: "all", label: "전체" },
            // 분석된 기사가 하나도 없으면 준비 중 (예시 기사에서는 동작)
            { value: "analyzed", label: "분석됨", soon: noAnalysis },
          ]}
        />
        <span className="text-[calc(10px*var(--fs))] text-ink-3">용어에 마우스를 올려보세요</span>
      </div>
      {mode === "analyzed" && (
        <div className="space-y-2 px-5 pt-2">
          <SubChips
            value={sub}
            onChange={setSub}
            options={[
              { value: "analyzed", label: "전체 분석", count: counts?.analyzed },
              { value: "left", label: "진보 쪽 치우침", count: counts?.left, title: "진보 시각 40 이상" },
              { value: "right", label: "보수 쪽 치우침", count: counts?.right, title: "보수 시각 40 이상" },
              { value: "neutral", label: "균형", count: counts?.neutral, title: "어느 쪽으로도 15 미만" },
              { value: "range", label: "수치 지정", title: "진보 100 ~ 보수 100 사이에서 범위를 고름" },
            ]}
          />
          {sub === "range" && <LeanRange value={lean} onChange={setLean} count={counts?.range} />}
        </div>
      )}
      <div ref={listRef} className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 pb-3 scroll-thin">
        {hasLive
          ? live.map((n) => <LiveNewsCard key={n.id} item={n} />)
          : mock.map((n) => <NewsCard key={n.id} item={n} aiMode={aiMode} />)}
        {count === 0 && !loading && <p className="py-8 text-center text-xs text-ink-3">해당 조건의 뉴스가 없습니다.</p>}
      </div>
      {hasLive && paged && paged.total > 0 && (
        <Pager
          page={paged.page}
          pages={paged.pages}
          from={(paged.page - 1) * paged.pageSize + 1}
          to={Math.min(paged.page * paged.pageSize, paged.total)}
          total={paged.total}
          onChange={goPage}
        />
      )}
    </Card>
  );
}
