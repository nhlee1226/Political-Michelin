"use client";

/**
 * DashboardHeader — 상단 고정 헤더
 *  [로고] [슬라이딩 탭: 지도 / 뉴스·이슈 / 정치인 / 커뮤니티 / 한눈에] │ [백과사전(별도 페이지 /encyclopedia)]
 *  대시보드 밖(백과사전 페이지)에서는 tab·onTabChange 없이 쓰고, 탭·검색을 누르면 /?tab= 주소로 대시보드에 감
 *  [검색(의원 이름·지역구 → 정치인 탭)] [로그인]
 *  (AI 객관화 모드·알림은 아직 동작하지 않아 발표 전 11/20 에 뺌)
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, LayoutDashboard, Map, MessagesSquare, Newspaper, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { OneEye } from "@/components/ui/one-eye";
import { IconButton } from "@/components/ui/primitives";
import { SlidingTabs, type TabItem } from "./sliding-tabs";
import { UserMenu } from "@/components/auth/user-menu";

import type { TabKey } from "./tab-keys";
export type { TabKey } from "./tab-keys";

export const TABS: TabItem<TabKey>[] = [
  { value: "map", label: "지도", icon: Map },
  { value: "news", label: "뉴스·이슈", icon: Newspaper },
  { value: "politicians", label: "정치인", icon: Users },
  { value: "community", label: "커뮤니티", icon: MessagesSquare },
  { value: "overview", label: "한눈에", icon: LayoutDashboard },
];

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="정치 미슐랭 홈">
      <span className="relative grid size-9 place-items-center rounded-xl bg-lime text-canvas shadow-[0_0_24px_-4px_rgb(201_228_107/0.6)]">
        <OneEye className="size-[22px]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[calc(15px*var(--fs))] font-bold tracking-tight">정치 미슐랭</span>
        <span className="block text-[calc(10px*var(--fs))] font-medium tracking-[0.12em] text-ink-3">POLITICAL MICHELIN</span>
      </span>
    </Link>
  );
}

/** 탭 줄과 떨어진 독립 버튼 — 국가 구조 백과사전 페이지로 */
function EncyclopediaLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/encyclopedia"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[calc(13px*var(--fs))] font-medium transition-colors",
        active ? "border-lime/50 bg-lime/10 text-ink" : "border-line bg-white/[0.04] text-ink-3 hover:border-white/20 hover:text-ink",
      )}
    >
      <BookOpen className={cn("size-3.5", active && "text-lime")} />
      백과사전
    </Link>
  );
}

export function DashboardHeader({
  tab,
  onTabChange,
  onSearch,
}: {
  /** 없으면 대시보드 밖(백과사전 페이지): 선택된 탭 없음, 백과사전 버튼이 선택됨 */
  tab?: TabKey;
  onTabChange?: (t: TabKey) => void;
  /** 의원 이름·지역구 검색 → 정치인 탭의 표로 */
  onSearch?: (q: string) => void;
}) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const inDashboard = tab != null;

  const changeTab = (t: TabKey) => (onTabChange ? onTabChange(t) : router.push(`/?tab=${t}`));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (onSearch) onSearch(query);
    else router.push(`/?tab=politicians${query ? `&q=${encodeURIComponent(query)}` : ""}`);
    setSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Logo />

        {/* 탭 + 독립 백과사전 버튼: 데스크톱은 로고 옆(좌측 상단 고정), 모바일은 두 번째 줄 전체 폭 */}
        <div className="order-last flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto">
          <SlidingTabs items={TABS} value={tab ?? null} onChange={changeTab} className="min-w-0 flex-1 lg:flex-none" />
          <span aria-hidden className="h-6 w-px shrink-0 bg-line" />
          <EncyclopediaLink active={!inDashboard} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* 검색 */}
          <form
            onSubmit={submit}
            className={cn(
              "flex items-center gap-2 overflow-hidden rounded-full border border-line bg-white/[0.03] transition-all duration-300",
              searchOpen ? "w-56 pl-3 pr-1 sm:w-64" : "w-8 border-transparent bg-transparent",
            )}
          >
            {searchOpen && (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onBlur={() => setSearchOpen(false)}
                placeholder="의원 이름·지역구 검색"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-xs placeholder:text-ink-3 focus:outline-none"
              />
            )}
            <IconButton
              type={searchOpen ? "submit" : "button"}
              aria-label="검색"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                if (!searchOpen) {
                  e.preventDefault();
                  setSearchOpen(true);
                }
              }}
              className={cn(searchOpen && "border-0 bg-transparent")}
            >
              <Search className="size-4" />
            </IconButton>
          </form>

          {/* 사용자 메뉴 (로그인/로그아웃) */}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
