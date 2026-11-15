import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 로그인·회원가입 페이지 공통 레이아웃.
 * 오로라 배경 위에 중앙 정렬된 글래스 카드 + 로고.
 * 기존 대시보드의 글래스모피즘·라임/시안 액센트와 동일 톤.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="aurora relative grid min-h-svh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="relative grid size-11 place-items-center rounded-xl bg-lime text-canvas shadow-[0_0_24px_-4px_rgb(201_228_107/0.6)]">
            <Star className="size-5 fill-canvas" strokeWidth={0} />
            <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border-2 border-canvas bg-cyan text-[8px] font-bold text-canvas">
              AI
            </span>
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight">정치 미슐랭</span>
            <span className="block text-[10px] font-medium tracking-[0.12em] text-ink-3">POLITICAL MICHELIN</span>
          </span>
        </div>

        <div className="glass rounded-2xl p-6">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-xs text-ink-3">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-4 text-center text-xs text-ink-3">{footer}</div>}
      </div>
    </main>
  );
}

/* ── 폼 필드 (라벨 + 입력 + 에러) ─────────────────────── */
export function AuthField({
  label,
  name,
  type = "text",
  error,
  autoComplete,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string[];
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={cn(
          "w-full rounded-xl border bg-white/[0.03] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-3 transition",
          "focus:outline-none focus-visible:border-lime/40 focus-visible:bg-white/[0.05]",
          error ? "border-bad/40" : "border-line",
        )}
      />
      {error && <span className="mt-1 block text-[11px] text-bad">{error[0]}</span>}
    </label>
  );
}

/* ── 제출 버튼 ───────────────────────────────────────── */
export function AuthSubmit({ children, pending }: { children: React.ReactNode; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-sm font-semibold text-canvas transition",
        "hover:bg-lime-2 disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {pending && (
        <span className="size-4 animate-spin rounded-full border-2 border-canvas/30 border-t-canvas" />
      )}
      {children}
    </button>
  );
}
