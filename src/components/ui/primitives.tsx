"use client";

/**
 * shadcn/ui 스타일 경량 프리미티브.
 * (실제 프로젝트에서는 `npx shadcn add card badge switch tooltip` 후 교체 가능)
 */
import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Card ─────────────────────────────────────────────── */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-2xl", className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && (
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-ink-2">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </div>
  );
}

/* ── IconButton (영상의 원형 ↗ / ··· 버튼) ───────────────── */
export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function IconButton({ className, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "grid size-8 place-items-center rounded-full border border-line bg-white/[0.03] text-ink-2 transition",
          "hover:border-white/20 hover:bg-white/[0.08] hover:text-ink focus-visible:outline-2 focus-visible:outline-lime",
          className,
        )}
        {...props}
      />
    );
  },
);

/* ── Badge ───────────────────────────────────────────── */
type BadgeTone = "neutral" | "lime" | "cyan" | "good" | "warn" | "bad";
const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-white/[0.06] text-ink-2 border-white/10",
  lime: "bg-lime/10 text-lime border-lime/25",
  cyan: "bg-cyan/10 text-cyan border-cyan/25",
  good: "bg-good/10 text-good border-good/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/25",
};
export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}

/** 아직 mock 데이터인 카드 제목 옆에 붙이는 표시 */
export function ExampleBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn("ml-1.5 px-1.5 py-0 align-middle text-[10px]", className)} title="실제 데이터가 아닌 예시입니다">
      예시
    </Badge>
  );
}

/**
 * 아직 동작하지 않는 컨트롤을 감싸 흐리게 하고 "준비 중" 툴팁을 띄움.
 * disabled 버튼은 마우스 이벤트가 없어 title 이 안 뜨는 브라우저가 있으므로 바깥 span 에 title 을 둡니다.
 */
export function Soon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span title="준비 중" className={cn("inline-flex cursor-not-allowed opacity-40 [&_*]:pointer-events-none", className)}>
      {children}
    </span>
  );
}

/* ── Switch ──────────────────────────────────────────── */
export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-300",
        checked ? "border-lime/40 bg-lime" : "border-white/10 bg-white/10",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block size-[18px] rounded-full shadow transition-transform duration-300",
          checked ? "translate-x-[22px] bg-canvas" : "translate-x-[3px] bg-ink-2",
        )}
      />
    </button>
  );
}

/* ── Segmented (영상의 6M / 12M 토글) ─────────────────── */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  /** soon: 아직 데이터가 없어 누를 수 없는 항목 (흐리게 + "준비 중" 툴팁) */
  options: { value: T; label: string; soon?: boolean }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-full border border-line bg-white/[0.03] p-0.5", className)}>
      {options.map((o) => {
        const btn = (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            disabled={o.soon}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
              value === o.value ? "bg-white/[0.12] text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {o.label}
          </button>
        );
        return o.soon ? <Soon key={o.value}>{btn}</Soon> : btn;
      })}
    </div>
  );
}

/* ── Michelin Stars ──────────────────────────────────── */
export function MichelinStars({ count, className }: { count: 1 | 2 | 3; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`미슐랭 ${count}스타`}>
      {[1, 2, 3].map((i) => (
        <Star
          key={i}
          className={cn("size-3", i <= count ? "fill-lime text-lime" : "text-white/15")}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

/* ── Party dot + label (색만으로 구분하지 않도록 항상 텍스트 동반) ── */
export function PartyTag({ color, name, className }: { color: string; name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-ink-2", className)}>
      <span className="size-2 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}
