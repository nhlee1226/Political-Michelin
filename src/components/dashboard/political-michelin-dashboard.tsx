"use client";

/**
 * PoliticalMichelinDashboard — <정치 미슐랭> 메인 대시보드 (페이지 루트 컴포넌트)
 * ------------------------------------------------------------------
 * 전역 상태
 *  - tab           : 상단 슬라이딩 탭 (탭별로 타이틀·KPI·그리드 구성이 바뀜, 레퍼런스 영상과 동일한 패턴)
 *  - aiMode        : AI 객관화 모드 (뉴스 기본 표시를 객관화 요약으로 전환) — AI 분석 전이라 지금은 꺼둔 채 준비 중
 *  - selectedRegion: 지도·정치인 테이블이 공유하는 선택 지역
 *  - detailId      : 정치인 상세 패널에 열린 의원 (mona_cd)
 * 위쪽 숫자 카드는 /api/stats 실제 집계. 데이터가 없는 칸은 "—".
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { REGION_BY_CODE } from "@/lib/mock-data";
import { useRegion, useRegions, useStats, type ApiRegionDetail, type ApiStats } from "@/lib/api";
import { DashboardHeader, type TabKey } from "./header";
import { SideRail } from "./side-rail";
import { FlipCounter } from "./flip-counter";
import { KoreaMapCard } from "./korea-map-card";
import { NewsPanel } from "./news-panel";
import { CommunityFeed } from "./community-feed";
import { ActivityCard, IssueTimelineCard, PartyTrendCard, PledgeCard } from "./kpi-charts";
import { BiasReportCard, PoliticianTable } from "./extra-cards";
import { RegionMembersCard } from "./region-members-card";
import { RegionLocalCard } from "./region-local-card";
import { PoliticianDetailSheet } from "./politician-detail-sheet";

const TODAY = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(
  new Date(),
);

const NO_AI = "AI 분석 후 표시";
const NO_DATA = "공식 데이터 없음";
const NO_COMMUNITY = "커뮤니티 준비 중";

interface Kpi {
  label: string;
  value: number | null;
  caption: string;
  accent?: boolean;
  format?: (v: number) => string;
}

/** 탭별 페이지 헤드라인 (영상: Sales Overview → Growth Reports 처럼 탭마다 교체) */
function useHeadline(
  tab: TabKey,
  stats: ApiStats | undefined,
  regionCode: string,
  heat: number | null,
  detail: ApiRegionDetail | undefined,
): { title: [string, string]; desc: string; kpis: Kpi[] } {
  // 시도 이름은 API(지금 이름: 강원특별자치도 등)가 있으면 그것
  const r = { ...REGION_BY_CODE[regionCode], ...(detail ? { name: detail.name, short: detail.short } : {}) };
  const s = stats ?? null;
  switch (tab) {
    case "map":
      return {
        title: ["지역별", "정치 지도"],
        desc: `${r.name} 선택됨 · 시·도를 누르면 의석 수·투표율, 국회의원, 시·도지사·교육감·구시군장과 공약, 지역 지표, 지역 뉴스를 보여줍니다.`,
        kpis: [
          { label: "이슈 활성도", value: heat, caption: `${r.short} · 100점 만점 · 최근 24시간 기사`, accent: true },
          {
            label: "직전 투표율",
            value: detail?.turnout ?? null,
            caption: detail?.turnout == null ? NO_DATA : "%",
            format: (v: number) => v.toFixed(1),
          },
          { label: "지역구 의석", value: detail?.seats ?? null, caption: detail?.seats == null ? NO_DATA : "석" },
        ],
      };
    case "news":
      return {
        title: ["뉴스·이슈", "리포트"],
        desc: "네이버 뉴스 검색으로 모은 기사의 제목·요약·원문 링크를 보여줍니다. 편향 분석은 준비 중입니다.",
        kpis: [
          { label: "오늘 수집 기사", value: s?.news_24h ?? null, caption: "최근 24시간 · 네이버 뉴스", accent: true },
          { label: "뉴스 출처", value: s?.sources_7d ?? null, caption: "최근 7일 · 언론사" },
          { label: "평균 편향 지수", value: s?.avg_bias ?? null, caption: s?.avg_bias == null ? NO_AI : "%" },
          { label: "객관화 변환", value: null, caption: NO_AI },
        ],
      };
    case "politicians":
      return {
        title: ["정치인", "미슐랭 가이드"],
        desc: "국회 공개 데이터의 의정활동 지표만 보여줍니다. 정당·이념 변수는 포함되지 않습니다.",
        kpis: [
          { label: "추적 중인 의원", value: s?.members ?? null, caption: "제22대 국회", accent: true },
          { label: "22대 발의 법안", value: s?.bills_total ?? null, caption: "건" },
          { label: "가결 법안", value: s?.bills_passed ?? null, caption: "건" },
          {
            label: "평균 법안 반영률",
            value: s?.avg_reflect_rate ?? null,
            caption: s?.avg_reflect_rate == null ? NO_DATA : "% · 대표발의 1건 이상 의원",
            format: (v: number) => v.toFixed(1),
          },
          { label: "3스타 의원", value: s?.three_star ?? null, caption: "명 · 별점 기준은 표 아래" },
        ],
      };
    case "community":
      return {
        title: ["안전한", "야차판"],
        desc: "AI가 혐오 표현을 블라인드하고, 사실 주장은 출처와 대조해 검증합니다.",
        kpis: [
          { label: "오늘 게시글", value: null, caption: NO_COMMUNITY, accent: true },
          { label: "AI 블라인드", value: null, caption: NO_COMMUNITY },
          { label: "클린 지수", value: null, caption: NO_COMMUNITY },
        ],
      };
    default:
      return {
        title: ["대한민국 정치", "Overview"],
        desc: "흩어진 정치 정보를 한눈에. 모든 수치는 출처와 오차범위를 함께 표기합니다.",
        kpis: [
          { label: "추적 중인 의원", value: s?.members ?? null, caption: "제22대 국회 전원" },
          { label: "오늘 수집 기사", value: s?.news_24h ?? null, caption: "최근 24시간 · 네이버 뉴스", accent: true },
          { label: "평균 편향 지수", value: s?.avg_bias ?? null, caption: s?.avg_bias == null ? NO_AI : "%" },
        ],
      };
  }
}

export default function PoliticalMichelinDashboard() {
  const [tab, setTab] = React.useState<TabKey>("map");
  const [aiMode, setAiMode] = React.useState(false);
  const [region, setRegion] = React.useState("11");
  const [polQuery, setPolQuery] = React.useState("");
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const { data: stats } = useStats();
  const { data: regions } = useRegions();
  const { data: regionDetail } = useRegion(region);
  const heat = regions?.find((r) => r.code === region)?.heat ?? null;
  // keepPreviousData 로 이전 지역 응답이 남아 있을 수 있어 코드가 같을 때만 사용
  const detail = regionDetail?.code === region ? regionDetail : undefined;

  const head = useHeadline(tab, stats, region, heat, detail);
  const go = (t: TabKey) => () => setTab(t);

  const selectFromTable = (code: string) => {
    setRegion(code);
    setTab("map");
  };

  const search = (q: string) => {
    setPolQuery(q);
    setTab("politicians");
  };

  return (
    <div className="aurora min-h-dvh">
      <DashboardHeader tab={tab} onTabChange={setTab} aiMode={aiMode} onAiModeChange={setAiMode} onSearch={search} />

      <div className="mx-auto flex max-w-[1680px] gap-5 px-4 pb-10 pt-6 sm:px-6">
        <SideRail
          selectedRegion={region}
          onSelectRegion={selectFromTable}
          onOpenPolitician={setDetailId}
          aiMode={aiMode}
          onAiModeChange={setAiMode}
        />

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
              {tab === "map" && (
                <div className="grid grid-cols-12 gap-4">
                  {/* 지도 + 정치인 프로필·지역 주요 이슈·지지도 패널 */}
                  <div className="col-span-12">
                    <KoreaMapCard selected={region} onSelect={setRegion} onOpenPolitician={setDetailId} expanded />
                  </div>
                  {/* 선택 지역의 지역 지표(KOSIS) + 지방선거 당선인·공약(선관위) */}
                  <RegionLocalCard region={region} className="col-span-12" />
                  {/* 선택 지역의 실제 의원 | 지역 뉴스 */}
                  <RegionMembersCard
                    region={region}
                    onOpenPolitician={setDetailId}
                    className="col-span-12 h-[560px] lg:col-span-5"
                  />
                  <NewsPanel aiMode={aiMode} region={region} onOpen={go("news")} className="col-span-12 h-[560px] lg:col-span-7" />
                  <PartyTrendCard className="col-span-12 lg:col-span-7" />
                  <PledgeCard className="col-span-12 lg:col-span-5" />
                </div>
              )}

              {tab === "overview" && (
                <div className="grid grid-cols-12 gap-4">
                  {/* 1행: 뉴스 | 커뮤니티 */}
                  <NewsPanel aiMode={aiMode} onOpen={go("news")} className="col-span-12 h-[600px] md:col-span-6" />
                  <CommunityFeed className="col-span-12 h-[600px] md:col-span-6" />

                  {/* 2행: KPI */}
                  <PledgeCard className="col-span-12 sm:col-span-6 xl:col-span-3" />
                  <ActivityCard onOpen={go("politicians")} className="col-span-12 sm:col-span-6 xl:col-span-3" />
                  <PartyTrendCard className="col-span-12 xl:col-span-6" />

                  {/* 3행: 타임라인 + 리포트 */}
                  <IssueTimelineCard onOpen={go("news")} className="col-span-12 xl:col-span-8" />
                  <BiasReportCard className="col-span-12 xl:col-span-4" />
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
                  <PoliticianTable
                    className="col-span-12 lg:col-span-8 lg:h-[640px]"
                    query={polQuery}
                    onSelectRegion={selectFromTable}
                    onOpenPolitician={setDetailId}
                  />
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
                    <NewsPanel aiMode={aiMode} limit={2} onOpen={go("news")} />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-5 text-[11px] text-ink-3 sm:flex-row sm:justify-between">
            <p>
              © 2026 정치 미슐랭 · 팀 [더 킹] · 의원·법안·표결은 국회 공개 데이터, 당선인·공약은 선관위, 지역 지표는 KOSIS, 뉴스는 네이버 뉴스 검색
              기준입니다. 점선 테두리와 &quot;예시 데이터 · 실제 아님&quot; 띠가 붙은 부분은 가상 데이터입니다.
            </p>
            <p>데이터 출처 표기 원칙 · 정치적 중립성 가이드라인 · 개인정보처리방침</p>
          </footer>
        </main>
      </div>

      <PoliticianDetailSheet monaCd={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
