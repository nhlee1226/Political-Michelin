"use client";

/**
 * NewsPanel — AI 실시간 뉴스 & 편향성 객관화 리포트
 *  - 크롤링된 뉴스 목록 + 편향 지수 게이지
 *  - "AI 객관화" 버튼: 원문 요약 ↔ 객관화 요약문 전환 (편향 지수 78% → 9% 식 표시)
 *  - 본문 속 정치 용어는 GlossaryText 로 호버 해설
 *  - 상단 AI 객관화 모드 ON 이면 기본값이 객관화 요약
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Newspaper, ScanSearch, Sparkles, Undo2 } from "lucide-react";
import { NEWS, REGION_BY_CODE, type NewsItem } from "@/lib/mock-data";
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

  const shown = objective ? residualBias(item.bias) : item.bias;
  const t = biasTone(item.bias);

  return (
    <article className="group rounded-xl border border-line bg-white/[0.02] p-3.5 transition hover:border-white/15 hover:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="font-medium text-ink-2">{item.source}</span>·<span>{item.time}</span>·
          <span>{item.category}</span>
          {item.region && <Badge className="px-1.5 py-0 text-[10px]">{REGION_BY_CODE[item.region]?.short}</Badge>}
        </span>
        <Badge tone={objective ? "lime" : t.tone}>{objective ? "AI 객관화" : t.label}</Badge>
      </div>

      <h4 className="mt-2 text-[14px] font-semibold leading-snug text-ink">
        <GlossaryText text={objective ? item.objectiveHeadline : item.headline} />
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
            <GlossaryText text={objective ? item.objective : item.original} />
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
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[11px] text-ink-3">편향</span>
          <BiasMeter value={shown} />
          {objective && (
            <span className="flex items-center gap-1 text-[11px] text-ink-3 tabular">
              <span className="line-through">{item.bias}%</span>
              <ArrowRight className="size-3 text-lime" />
            </span>
          )}
        </div>
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

type Filter = "all" | "high" | "neutral";

export function NewsPanel({ aiMode, className, limit }: { aiMode: boolean; className?: string; limit?: number }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const list = NEWS.filter((n) => (filter === "high" ? n.bias >= 60 : filter === "neutral" ? n.bias < 30 : true)).slice(
    0,
    limit ?? NEWS.length,
  );
  const avg = Math.round(NEWS.reduce((a, n) => a + n.bias, 0) / NEWS.length);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Newspaper className="size-4" />}
        title="AI 실시간 뉴스 리포트"
        subtitle={`크롤링 ${NEWS.length}건 · 평균 편향 지수 ${avg}%`}
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
        {list.length === 0 && <p className="py-8 text-center text-xs text-ink-3">해당 조건의 뉴스가 없습니다.</p>}
      </div>
    </Card>
  );
}
