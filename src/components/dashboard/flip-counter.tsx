"use client";

/**
 * FlipCounter — 레퍼런스 영상(Voyage)의 스플릿 플랩(split-flap) KPI 숫자.
 * 각 자리 숫자가 바뀔 때마다 해당 타일만 X축으로 뒤집히며 교체됩니다.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

function FlipTile({ ch, accent }: { ch: string; accent?: boolean }) {
  const isDigit = /\d/.test(ch);
  if (!isDigit) {
    return <span className="self-end px-0.5 pb-1 text-lg font-semibold text-ink-3">{ch}</span>;
  }
  return (
    <span className="relative inline-grid h-10 w-7 [perspective:300px] sm:h-11 sm:w-8">
      {/* key 가 바뀌면 리마운트 → flip 애니메이션 재생 */}
      <span
        key={ch}
        className={cn(
          "animate-flip relative grid place-items-center overflow-hidden rounded-md border text-xl font-semibold tabular sm:text-2xl",
          accent ? "border-lime/30 bg-lime text-canvas" : "border-white/10 bg-flip text-ink",
        )}
        style={{ transformOrigin: "50% 50%" }}
      >
        {ch}
        {/* 가운데 분할선 */}
        <span className={cn("absolute inset-x-0 top-1/2 h-px", accent ? "bg-black/20" : "bg-black/70")} />
      </span>
    </span>
  );
}

export function FlipCounter({
  value,
  label,
  caption,
  accent,
  format = (v: number) => v.toLocaleString("ko-KR"),
}: {
  value: number;
  label: string;
  caption?: React.ReactNode;
  accent?: boolean;
  format?: (v: number) => string;
}) {
  const chars = format(value).split("");
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-medium text-ink-3">{label}</p>
      <div className="flex items-stretch gap-[3px]" aria-label={`${label} ${format(value)}`}>
        {chars.map((c, i) => (
          <FlipTile key={`${chars.length}-${i}`} ch={c} accent={accent} />
        ))}
      </div>
      {caption && <p className="mt-1.5 text-[11px] text-ink-3">{caption}</p>}
    </div>
  );
}
