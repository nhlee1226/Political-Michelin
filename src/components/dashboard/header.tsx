"use client";

/**
 * DashboardHeader — 상단 고정 헤더
 *  [로고] [슬라이딩 탭: Overview / Map View / News·Issues / Politicians / Community]
 *  [검색] [AI 객관화 모드 토글] [알림] [로그인]
 */
import * as React from "react";
import { Bell, LayoutDashboard, LogIn, Map, MessagesSquare, Newspaper, Search, Sparkles, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton, Switch } from "@/components/ui/primitives";
import { SlidingTabs, type TabItem } from "./sliding-tabs";

export type TabKey = "overview" | "map" | "news" | "politicians" | "community";

export const TABS: TabItem<TabKey>[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "map", label: "Map View", icon: Map },
  { value: "news", label: "News/Issues", icon: Newspaper },
  { value: "politicians", label: "Politicians", icon: Users },
  { value: "community", label: "Community", icon: MessagesSquare },
];

function Logo() {
  return (
    <a href="#" className="flex shrink-0 items-center gap-2.5" aria-label="정치 미슐랭 홈">
      <span className="relative grid size-9 place-items-center rounded-xl bg-lime text-canvas shadow-[0_0_24px_-4px_rgb(201_228_107/0.6)]">
        <Star className="size-[18px] fill-canvas" strokeWidth={0} />
        <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border-2 border-canvas bg-cyan text-[8px] font-bold text-canvas">
          AI
        </span>
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-tight">정치 미슐랭</span>
        <span className="block text-[10px] font-medium tracking-[0.12em] text-ink-3">POLITICAL MICHELIN</span>
      </span>
    </a>
  );
}

export function DashboardHeader({
  tab,
  onTabChange,
  aiMode,
  onAiModeChange,
}: {
  tab: TabKey;
  onTabChange: (t: TabKey) => void;
  aiMode: boolean;
  onAiModeChange: (v: boolean) => void;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [loggedIn, setLoggedIn] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Logo />

        {/* 탭: 데스크톱은 로고 옆(좌측 상단 고정), 모바일은 두 번째 줄 전체 폭 */}
        <SlidingTabs items={TABS} value={tab} onChange={onTabChange} className="order-last w-full lg:order-none lg:w-auto" />

        <div className="ml-auto flex items-center gap-2">
          {/* 검색 */}
          <div
            className={cn(
              "flex items-center gap-2 overflow-hidden rounded-full border border-line bg-white/[0.03] transition-all duration-300",
              searchOpen ? "w-56 pl-3 pr-1 sm:w-64" : "w-8 border-transparent bg-transparent",
            )}
          >
            {searchOpen && (
              <input
                autoFocus
                onBlur={() => setSearchOpen(false)}
                placeholder="정치인, 지역, 법안 검색"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-xs placeholder:text-ink-3 focus:outline-none"
              />
            )}
            <IconButton aria-label="검색" onMouseDown={(e) => e.preventDefault()} onClick={() => setSearchOpen((v) => !v)} className={cn(searchOpen && "border-0 bg-transparent")}>
              <Search className="size-4" />
            </IconButton>
          </div>

          {/* AI 객관화 모드 */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 transition-colors duration-300",
              aiMode ? "border-lime/30 bg-lime/[0.07]" : "border-line bg-white/[0.03]",
            )}
          >
            <Sparkles className={cn("size-3.5", aiMode ? "text-lime" : "text-ink-3")} />
            <span className="hidden text-xs font-medium sm:inline">
              AI 객관화 모드{" "}
              <span className={cn("font-semibold", aiMode ? "text-lime" : "text-ink-3")}>{aiMode ? "Active" : "Off"}</span>
            </span>
            <Switch checked={aiMode} onCheckedChange={onAiModeChange} label="AI 객관화 모드" />
          </div>

          <IconButton aria-label="알림" className="relative hidden sm:grid">
            <Bell className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-lime" />
          </IconButton>

          {loggedIn ? (
            <button
              onClick={() => setLoggedIn(false)}
              className="grid size-8 place-items-center rounded-full bg-lime text-xs font-bold text-canvas"
              aria-label="내 계정 (클릭 시 로그아웃)"
            >
              민
            </button>
          ) : (
            <button
              onClick={() => setLoggedIn(true)}
              className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-canvas transition hover:bg-white"
            >
              <LogIn className="size-3.5" /> 로그인
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
