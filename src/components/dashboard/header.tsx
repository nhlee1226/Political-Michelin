"use client";

/**
 * DashboardHeader — 상단 고정 헤더
 *  [로고] [슬라이딩 탭: Map View / Overview / News·Issues / Politicians / Community]
 *  [검색(의원 이름·지역구 → Politicians)] [AI 객관화 모드 토글] [알림] [로그인] — 뒤의 셋은 준비 중
 */
import * as React from "react";
import { Bell, LayoutDashboard, LogIn, Map, MessagesSquare, Newspaper, Search, Sparkles, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton, Soon, Switch } from "@/components/ui/primitives";
import { SlidingTabs, type TabItem } from "./sliding-tabs";

export type TabKey = "overview" | "map" | "news" | "politicians" | "community";

export const TABS: TabItem<TabKey>[] = [
  { value: "map", label: "Map View", icon: Map },
  { value: "overview", label: "Overview", icon: LayoutDashboard },
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
  onSearch,
}: {
  tab: TabKey;
  onTabChange: (t: TabKey) => void;
  aiMode: boolean;
  onAiModeChange: (v: boolean) => void;
  /** 의원 이름·지역구 검색 → Politicians 표로 */
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

          {/* AI 객관화 모드 — AI 분석 전이라 준비 중 */}
          <Soon>
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
              <Switch checked={aiMode} onCheckedChange={onAiModeChange} label="AI 객관화 모드" disabled />
            </div>
          </Soon>

          {/* 알림·로그인 — 준비 중 */}
          <Soon className="hidden sm:inline-flex">
            <IconButton aria-label="알림" className="relative" disabled>
              <Bell className="size-4" />
            </IconButton>
          </Soon>

          <Soon>
            <button
              disabled
              className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-canvas transition hover:bg-white"
            >
              <LogIn className="size-3.5" /> 로그인
            </button>
          </Soon>
        </div>
      </div>
    </header>
  );
}
