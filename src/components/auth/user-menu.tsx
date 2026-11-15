"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, LayoutDashboard, LogIn, LogOut, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/api";
import { logout } from "@/app/actions/auth";

/**
 * 헤더용 사용자 메뉴.
 *  - 비로그인: /login 으로 가는 "로그인" 버튼
 *  - 로그인: 이름 + 드롭다운 (내 활동 /my · 관리자 /admin[admin만] · 로그아웃)
 */
export function UserMenu() {
  const { data: user, isLoading } = useUser();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // 바깥 클릭·ESC 로 닫기
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 로딩 중: 자리만 잡아둔 스켈레톤 (깜빡임 방지)
  if (isLoading) {
    return <div className="h-8 w-20 animate-pulse rounded-full bg-white/[0.04]" />;
  }

  // 비로그인
  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-canvas transition hover:bg-white"
      >
        <LogIn className="size-3.5" /> 로그인
      </Link>
    );
  }

  // 로그인 — 드롭다운
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-line bg-white/[0.03] py-1 pl-2.5 pr-1.5 text-xs font-medium transition hover:border-white/20 hover:bg-white/[0.08]"
      >
        <span className="grid size-5 place-items-center rounded-full bg-lime/15 text-lime">
          <User className="size-3" />
        </span>
        <span className="max-w-[80px] truncate text-ink">{user.name}</span>
        <ChevronDown className={cn("size-3.5 text-ink-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="glass-strong absolute right-0 top-[calc(100%+8px)] z-50 w-48 overflow-hidden rounded-xl p-1">
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-xs font-semibold text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-ink-3">{user.email}</p>
          </div>

          <MenuItem href="/my" icon={<LayoutDashboard className="size-3.5" />} onClick={() => setOpen(false)}>
            내 활동
          </MenuItem>

          {user.role === "admin" && (
            <MenuItem href="/admin" icon={<Shield className="size-3.5" />} onClick={() => setOpen(false)}>
              관리자
            </MenuItem>
          )}

          <form action={logout}>
            <button
              type="submit"
              className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-2 transition hover:bg-bad/[0.08] hover:text-bad"
            >
              <LogOut className="size-3.5" /> 로그아웃
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-2 transition hover:bg-white/[0.06] hover:text-ink"
    >
      {icon}
      {children}
    </Link>
  );
}
