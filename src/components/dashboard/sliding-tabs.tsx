"use client";

/**
 * SlidingTabs — 레퍼런스 영상(src/ui.ts)의 "엘라스틱 pill" 탭 인디케이터 재현.
 *
 * 원리: 인디케이터의 left/right 를 각각 다른 duration 으로 애니메이션.
 *  - 이동 방향의 "앞쪽 가장자리"가 먼저, 빠르게 (0.36s)
 *  - "뒤쪽 가장자리"가 느리게 따라옴 (0.55s)
 *  → pill 이 늘어났다가 수축하는 젤리 같은 움직임.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

const FAST = 0.36;
const SLOW = 0.55;
const EASE = "cubic-bezier(0.65, 0, 0.35, 1)"; // ≒ power3.inOut

export function SlidingTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const prev = React.useRef<{ l: number; r: number } | null>(null);
  const [pill, setPill] = React.useState<{ l: number; r: number; t: number; b: number; dir: 1 | -1 } | null>(null);

  const measure = React.useCallback(() => {
    const box = boxRef.current;
    const el = tabRefs.current[value];
    if (!box || !el) return;
    const W = box.scrollWidth;
    const H = box.offsetHeight;
    const l = el.offsetLeft;
    const r = W - (el.offsetLeft + el.offsetWidth);
    const t = el.offsetTop;
    const b = H - (el.offsetTop + el.offsetHeight);
    const dir: 1 | -1 = prev.current && l < prev.current.l ? -1 : 1;
    prev.current = { l, r };
    setPill({ l, r, t, b, dir });
  }, [value]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // 오른쪽으로 이동: right 가 앞쪽(빠름), left 가 뒤쪽(느림)
  const leftDur = pill?.dir === 1 ? SLOW : FAST;
  const rightDur = pill?.dir === 1 ? FAST : SLOW;

  return (
    <div
      ref={boxRef}
      role="tablist"
      className={cn(
        "relative flex items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-white/[0.04] p-1 scroll-thin",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {pill && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-white/[0.12] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]"
          style={{
            left: pill.l,
            right: pill.r,
            top: pill.t,
            bottom: pill.b,
            transition: `left ${leftDur}s ${EASE}, right ${rightDur}s ${EASE}`,
          }}
        />
      )}
      {items.map((it) => {
        const active = it.value === value;
        const Icon = it.icon;
        return (
          <button
            key={it.value}
            ref={(el) => {
              tabRefs.current[it.value] = el;
            }}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative z-10 flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-300",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {Icon && <Icon className={cn("size-3.5", active && "text-lime")} />}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
