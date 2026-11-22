"use client";

/**
 * DashboardHeader — 상단 고정 헤더
 *  [로고] [슬라이딩 탭: 지도 / 한눈에 / 뉴스·이슈 / 정치인 / 커뮤니티]
 *  [검색(의원 이름·지역구 → 정치인 탭)] [로그인]
 *  (AI 객관화 모드·알림은 아직 동작하지 않아 발표 전 11/20 에 뺌)
 */
import * as React from "react";
import { LayoutDashboard, Map, MessagesSquare, Newspaper, Search, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/primitives";
import { SlidingTabs, type TabItem } from "./sliding-tabs";
import { UserMenu } from "@/components/auth/user-menu";

export type TabKey = "overview" | "map" | "news" | "politicians" | "community";

export const TABS: TabItem<TabKey>[] = [
  { value: "map", label: "지도", icon: Map },
  { value: "overview", label: "한눈에", icon: LayoutDashboard },
  { value: "news", label: "뉴스·이슈", icon: Newspaper },
  { value: "politicians", label: "정치인", icon: Users },
  { value: "community", label: "커뮤니티", icon: MessagesSquare },
];

function Logo() {
  return (
    <a href="#" className="flex shrink-0 items-center gap-2.5" aria-label="정치 미슐랭 홈">
      <span className="relative grid size-9 place-items-center rounded-xl bg-lime text-canvas shadow-[0_0_24px_-4px_rgb(201_228_107/0.6)]">
        <Star className="size-[18px] fill-canvas" strokeWidth={0} />
        <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border-2 border-canvas bg-cyan text-[calc(8px*var(--fs))] font-bold text-canvas">
          AI
        </span>
      </span>
      <span className="leading-tight">
        <span className="block text-[calc(15px*var(--fs))] font-bold tracking-tight">정치 미슐랭</span>
        <span className="block text-[calc(10px*var(--fs))] font-medium tracking-[0.12em] text-ink-3">POLITICAL MICHELIN</span>
      </span>
    </a>
  );
}

export function DashboardHeader({
  tab,
  onTabChange,
  onSearch,
}: {
  tab: TabKey;
  onTabChange: (t: TabKey) => void;
  /** 의원 이름·지역구 검색 → 정치인 탭의 표로 */
  onSearch: (q: string) => void;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(q.trim());
    setSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Logo />

        {/* 탭: 데스크톱은 로고 옆(좌측 상단 고정), 모바일은 두 번째 줄 전체 폭 */}
        <SlidingTabs items={TABS} value={tab} onChange={onTabChange} className="order-last w-full lg:order-none lg:w-auto" />

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
