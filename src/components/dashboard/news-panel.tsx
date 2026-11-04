"use client";

/**
 * NewsPanel — AI 실시간 뉴스 & 편향성 객관화 리포트
 *  - 네이버 뉴스 검색 API 로 수집한 실제 기사 목록 (useNews)
 *  - AI 분석이 끝난 기사(bias !== null)만 편향 지수 게이지·"AI 객관화" 전환을 보여줌
 *  - 분석 전 기사는 "분석 전" 배지 + 원문 링크만 표시 (가짜 수치를 만들지 않음)
 *  - 본문 속 정치 용어는 GlossaryText 로 호버 해설
 *  - 상단 AI 객관화 모드 ON 이면 (분석된 기사의) 기본값이 객관화 요약
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, ExternalLink, Newspaper, ScanSearch, Sparkles, Undo2 } from "lucide-react";
import type { NewsItem } from "@/lib/mock-data";
import { useNews, useRegions } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader, IconButton, Segmented } from "@/components/ui/primitives";
import { GlossaryText } from "./glossary-text";

/** 객관화 이후 잔여 편향 지수 (AI 재작성 결과, 데모용 계산) */
const residualBias = (b: number) => Math.max(4, Math.round(b * 0.12));

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

function OriginalLink({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition hover:text-ink"
    >
      <ExternalLink className="size-3" /> 원문
    </a>
  );
}

function NewsCard({ item, aiMode }: { item: NewsItem; aiMode: boolean }) {
  const { byCode: REGION_BY_CODE } = useRegions();
  const analyzed = item.bias !== null;
  const [objective, setObjective] = React.useState(aiMode && analyzed);
  const [scanning, setScanning] = React.useState(false);
  React.useEffect(() => setObjective(aiMode && analyzed), [aiMode, analyzed]);

  const convert = () => {
    if (objective) return setObjective(false);
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setObjective(true);
    }, 650);
  };

  const bias = item.bias ?? 0;
  const shown = objective ? residualBias(bias) : bias;
  const t = biasTone(bias);
  const headline = objective ? (item.objectiveHeadline ?? item.headline) : item.headline;
  const body = objective ? (item.objective ?? item.original) : item.original;

  return (
    <article className="group rounded-xl border border-line bg-white/[0.02] p-3.5 transition hover:border-white/15 hover:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-ink-2">{item.source}</span>·
          <span className="shrink-0">{item.time}</span>·<span className="shrink-0">{item.category}</span>
          {item.region && <Badge className="px-1.5 py-0 text-[10px]">{REGION_BY_CODE[item.region]?.short}</Badge>}
        </span>
        {analyzed ? (
          <Badge tone={objective ? "lime" : t.tone}>{objective ? "AI 객관화" : t.label}</Badge>
        ) : (
          <Badge>분석 전</Badge>
        )}
      </div>

      <h4 className="mt-2 text-[14px] font-semibold leading-snug text-ink">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            <GlossaryText text={headline} />
          </a>
        ) : (
          <GlossaryText text={headline} />
        )}
      </h4>

      <div className="relative mt-2">
        <AnimatePresence mode="wait">
          <motion.p
            key={objective ? "obj" : "org"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn("text-[13px] leading-relaxed", objective ? "text-ink-2" : "text-ink-3")}
          >
            <GlossaryText text={body} />
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
            <span key={s} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-ink-3">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        {analyzed ? (
          <>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[11px] text-ink-3">편향</span>
              <BiasMeter value={shown} />
              {objective && (
                <span className="flex items-center gap-1 text-[11px] text-ink-3 tabular">
                  <span className="line-through">{bias}%</span>
                  <ArrowRight className="size-3 text-lime" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <OriginalLink url={item.url} />
              <button
                onClick={convert}
                disabled={scanning}
                className={cn(
                  "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                  objective
                    ? "border border-line text-ink-2 hover:text-ink"
                    : "bg-lime text-canvas hover:bg-lime-2 disabled:opacity-60",
                )}
              >
                {objective ? (
                  <>
                    <Undo2 className="size-3" /> 원문 요약
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
          </>
        ) : (
          <>
            <span className="text-[11px] text-ink-3">편향 지수 · AI 분석 대기 중</span>
            <OriginalLink url={item.url} />
          </>
        )}
      </div>
    </article>
  );
}

type Filter = "all" | "high" | "neutral";

export function NewsPanel({ aiMode, className, limit }: { aiMode: boolean; className?: string; limit?: number }) {
  const { news } = useNews();
  const [filter, setFilter] = React.useState<Filter>("all");
  const analyzed = news.filter((n): n is NewsItem & { bias: number } => n.bias !== null);
  const list = news
    .filter((n) => (filter === "all" ? true : n.bias !== null && (filter === "high" ? n.bias >= 60 : n.bias < 30)))
    .slice(0, limit ?? news.length);
  const avg = analyzed.length ? Math.round(analyzed.reduce((a, n) => a + n.bias, 0) / analyzed.length) : null;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Newspaper className="size-4" />}
        title="AI 실시간 뉴스 리포트"
        subtitle={`네이버 뉴스 ${news.length}건 · ${avg === null ? "AI 편향 분석 대기" : `평균 편향 지수 ${avg}%`}`}
        action={
          <IconButton aria-label="전체 뉴스">
            <ArrowUpRight className="size-4" />
          </IconButton>
        }
      />
      <div className="flex items-center justify-between px-5 pt-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "전체" },
            { value: "high", label: "편향 높음" },
            { value: "neutral", label: "중립" },
          ]}
        />
        <span className="text-[10px] text-ink-3">용어에 마우스를 올려보세요</span>
      </div>
      <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto px-5 pb-5 scroll-thin">
        {list.map((n) => (
          <NewsCard key={n.id} item={n} aiMode={aiMode} />
        ))}
        {list.length === 0 && (
          <p className="py-8 text-center text-xs text-ink-3">
            {news.length === 0
              ? "수집된 기사가 없습니다. 터미널에서 npm run collect:news 를 실행하세요."
              : filter !== "all" && analyzed.length === 0
                ? "아직 AI 편향 분석이 끝난 기사가 없습니다."
                : "해당 조건의 뉴스가 없습니다."}
          </p>
        )}
      </div>
    </Card>
  );
}
