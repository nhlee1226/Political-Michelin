"use client";

/**
 * PoliticalMichelinDashboard — <정치 미슐랭> 메인 대시보드 (페이지 루트 컴포넌트)
 * ------------------------------------------------------------------
 * 전역 상태
 *  - tab           : 상단 슬라이딩 탭 (탭별로 타이틀·KPI·그리드 구성이 바뀜, 레퍼런스 영상과 동일한 패턴)
 *  - aiMode        : AI 객관화 모드 (뉴스 기본 표시를 객관화 요약으로 전환)
 *  - selectedRegion: 지도·정치인 테이블이 공유하는 선택 지역
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HEADLINE_KPIS, NEWS, REGION_BY_CODE, REGIONS } from "@/lib/mock-data";
import { DashboardHeader, type TabKey } from "./header";
import { SideRail } from "./side-rail";
import { FlipCounter } from "./flip-counter";
import { KoreaMapCard } from "./korea-map-card";
import { NewsPanel } from "./news-panel";
import { CommunityFeed } from "./community-feed";
import { ActivityCard, IssueTimelineCard, PartyTrendCard, PledgeCard } from "./kpi-charts";
import { BiasReportCard, PoliticianTable } from "./extra-cards";

const TODAY = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(
  new Date(),
);

/** 탭별 페이지 헤드라인 (영상: Sales Overview → Growth Reports 처럼 탭마다 교체) */
function useHeadline(tab: TabKey, newsCount: number, regionCode: string) {
  const r = REGION_BY_CODE[regionCode];
  switch (tab) {
    case "map":
      return {
        title: ["지역별", "정치 지도"],
        desc: `${r.name} 선택됨 · 17개 시·도의 이슈 활성도와 지지도를 비교합니다.`,
        kpis: [
          { label: "이슈 활성도", value: r.heat, caption: `${r.short} · 100점 만점`, accent: true },
          { label: "직전 투표율", value: r.turnout, caption: "%", format: (v: number) => v.toFixed(1) },
          { label: "지역구 의석", value: r.seats, caption: "석" },
        ],
      };
    case "news":
      return {
        title: ["뉴스·이슈", "리포트"],
        desc: "AI가 기사별 편향 신호를 분석하고 객관화 요약을 제공합니다.",
        kpis: [
          { label: "오늘 분석 기사", value: newsCount, caption: "실시간 크롤링", accent: true },
          { label: "평균 편향 지수", value: HEADLINE_KPIS.avgBias, caption: "%" },
          { label: "객관화 변환", value: 1964, caption: "건" },
        ],
      };
    case "politicians":
      return {
        title: ["정치인", "미슐랭 가이드"],
        desc: "의정활동 지표만으로 산출한 평가입니다. 정당·이념 변수는 포함되지 않습니다.",
        kpis: [
          { label: "추적 중인 의원", value: HEADLINE_KPIS.trackedPoliticians, caption: "제22대 국회", accent: true },
          { label: "평균 출석률", value: 94.6, caption: "%", format: (v: number) => v.toFixed(1) },
          { label: "3스타 의원", value: 42, caption: "명" },
        ],
      };
    case "community":
      return {
        title: ["안전한", "야차판"],
        desc: "AI가 혐오 표현을 블라인드하고, 사실 주장은 출처와 대조해 검증합니다.",
        kpis: [
          { label: "오늘 게시글", value: 8421, caption: "건", accent: true },
          { label: "AI 블라인드", value: 128, caption: "건" },
          { label: "클린 지수", value: 97.2, caption: "%", format: (v: number) => v.toFixed(1) },
        ],
      };
    default:
      return {
        title: ["대한민국 정치", "Overview"],
        desc: "흩어진 정치 정보를 한눈에. 모든 수치는 출처와 오차범위를 함께 표기합니다.",
        kpis: [
          { label: "추적 중인 의원", value: HEADLINE_KPIS.trackedPoliticians, caption: "제22대 국회 전원" },
          { label: "오늘 분석 기사", value: newsCount, caption: "AI 편향 분석 완료", accent: true },
          { label: "평균 편향 지수", value: HEADLINE_KPIS.avgBias, caption: "전일 대비 -3%p" },
        ],
      };
  }
}

export default function PoliticalMichelinDashboard() {
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [aiMode, setAiMode] = React.useState(true);
  const [region, setRegion] = React.useState("11");
  const [newsCount, setNewsCount] = React.useState(HEADLINE_KPIS.newsAnalyzedToday);

  // 실시간 기사 분석 카운터 (플립 애니메이션 확인용)
  React.useEffect(() => {
    const t = setInterval(() => setNewsCount((n) => n + 1 + Math.floor(Math.random() * 3)), 3200);
    return () => clearInterval(t);
  }, []);

  const head = useHeadline(tab, newsCount, region);

  const selectFromTable = (code: string) => {
    setRegion(code);
    setTab("map");
  };

  return (
    <div className="aurora min-h-dvh">
      <DashboardHeader tab={tab} onTabChange={setTab} aiMode={aiMode} onAiModeChange={setAiMode} />

      <div className="mx-auto flex max-w-[1680px] gap-5 px-4 pb-10 pt-6 sm:px-6">
        <SideRail selectedRegion={region} onSelectRegion={selectFromTable} aiMode={aiMode} onAiModeChange={setAiMode} />

        <main className="min-w-0 flex-1">
          {/* ── Page headline + Flip KPI ── */}
          <section className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs text-ink-3">
                {TODAY} · <span className="text-lime">● 실시간 집계 중</span>
              </p>
              <AnimatePresence mode="wait">
                <motion.h1
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="mt-1.5 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-[40px]"
                >
                  {head.title[0]}
                  <br className="hidden sm:block" /> <span className="text-ink-2">{head.title[1]}</span>
                </motion.h1>
              </AnimatePresence>
              <p className="mt-2 max-w-xl text-sm text-ink-3">{head.desc}</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              {head.kpis.map((k) => (
                <FlipCounter key={`${tab}-${k.label}`} {...k} />
              ))}
            </div>
          </section>

          {/* ── Body grid ── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: [0.65, 0, 0.35, 1] }}
            >
              {tab === "overview" && (
                <div className="grid grid-cols-12 gap-4">
                  {/* 1행: 뉴스 | 지도 | 커뮤니티 */}
                  <NewsPanel aiMode={aiMode} region={region} className="order-2 col-span-12 md:col-span-6 xl:order-1 xl:col-span-3 xl:h-0 xl:min-h-full" />
                  <div className="order-1 col-span-12 xl:order-2 xl:col-span-6">
                    <KoreaMapCard selected={region} onSelect={setRegion} />
                  </div>
                  <CommunityFeed className="order-3 col-span-12 h-[600px] md:col-span-6 xl:col-span-3 xl:h-0 xl:min-h-full" />

                  {/* 2행: KPI */}
                  <PledgeCard className="order-4 col-span-12 sm:col-span-6 xl:col-span-3" />
                  <ActivityCard className="order-5 col-span-12 sm:col-span-6 xl:col-span-3" />
                  <PartyTrendCard className="order-6 col-span-12 xl:col-span-6" />

                  {/* 3행: 타임라인 + 리포트 */}
                  <IssueTimelineCard className="order-7 col-span-12 xl:col-span-8" />
                  <BiasReportCard className="order-8 col-span-12 xl:col-span-4" />
                </div>
              )}

              {tab === "map" && (
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12">
                    <KoreaMapCard selected={region} onSelect={setRegion} expanded />
                  </div>
                  <PartyTrendCard className="col-span-12 lg:col-span-7" />
                  <PledgeCard className="col-span-12 sm:col-span-6 lg:col-span-5" />
                </div>
              )}

              {tab === "news" && (
                <div className="grid grid-cols-12 gap-4">
                  <NewsPanel aiMode={aiMode} className="col-span-12 lg:col-span-7 lg:h-[880px]" />
                  <div className="col-span-12 flex flex-col gap-4 lg:col-span-5">
                    <BiasReportCard />
                    <IssueTimelineCard />
                  </div>
                </div>
              )}

              {tab === "politicians" && (
                <div className="grid grid-cols-12 gap-4">
                  <PoliticianTable className="col-span-12 lg:col-span-8 lg:h-[640px]" onSelectRegion={selectFromTable} />
                  <div className="col-span-12 flex flex-col gap-4 lg:col-span-4">
                    <ActivityCard />
                    <PledgeCard />
                  </div>
                </div>
              )}

              {tab === "community" && (
                <div className="grid grid-cols-12 gap-4">
                  <CommunityFeed className="col-span-12 h-[760px] lg:col-span-8" />
                  <div className="col-span-12 flex flex-col gap-4 lg:col-span-4">
                    <BiasReportCard />
                    <NewsPanel aiMode={aiMode} limit={2} />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-5 text-[11px] text-ink-3 sm:flex-row sm:justify-between">
            <p>
              © 2026 정치 미슐랭 · 팀 [더 킹] · 본 화면의 정당·인물·수치는 모두 가상 데이터입니다 ({REGIONS.length}개 시·도, 기사{" "}
              {NEWS.length}건 샘플).
            </p>
            <p>데이터 출처 표기 원칙 · 정치적 중립성 가이드라인 · 개인정보처리방침</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
