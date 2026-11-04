"use client";

/**
 * GlossaryText — "AI 정치 용어 해설" 툴팁.
 * 본문 속 [[용어]] 표기를 찾아 점선 밑줄로 강조하고, 호버/포커스 시 해설 팝업을 띄웁니다.
 * (키보드 접근 가능: Tab 으로 포커스하면 동일하게 표시)
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { GLOSSARY } from "@/lib/mock-data";

/**
 * 툴팁은 body 로 포털 렌더링(fixed) → 스크롤 영역(overflow)에 잘리지 않음.
 * 화면 위쪽 공간이 부족하면 아래로 뒤집어 표시.
 */
function Term({ term }: { term: string }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number; below: boolean } | null>(null);
  const desc = GLOSSARY[term];

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 150;
    const x = Math.min(Math.max(r.left + r.width / 2, 140), window.innerWidth - 140);
    setPos({ x, y: below ? r.bottom + 8 : r.top - 8, below });
  };
  const hide = () => setPos(null);

  React.useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [pos]);

  if (!desc) return <>{term}</>;
  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="cursor-help border-b border-dashed border-cyan/70 text-cyan outline-none focus-visible:rounded-sm focus-visible:bg-cyan/10"
        aria-describedby={pos ? `gl-${term}` : undefined}
      >
        {term}
      </button>
      {pos &&
        createPortal(
          <span
            id={`gl-${term}`}
            role="tooltip"
            className="pointer-events-none fixed z-[100] w-64 rounded-xl border border-cyan/25 bg-canvas-2/95 p-3 text-left shadow-[0_20px_50px_-12px_rgb(0_0_0/0.8)] backdrop-blur-xl"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, ${pos.below ? "0" : "-100%"})`,
              animation: "feed-in 0.18s ease-out",
            }}
          >
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-cyan">
              <Sparkles className="size-3" /> AI 정치 용어 해설
            </span>
            <span className="block text-[13px] font-semibold text-ink">{term}</span>
            <span className="mt-1 block text-xs font-normal leading-relaxed text-ink-2">{desc}</span>
          </span>,
          document.body,
        )}
    </>
  );
}

export function GlossaryText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const m = part.match(/^\[\[(.+)\]\]$/);
        return m ? <Term key={i} term={m[1]} /> : <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
}
