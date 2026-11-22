"use client";

/**
 * PoliticalMichelinDashboard — <정치 미슐랭> 메인 대시보드 (페이지 루트 컴포넌트)
 * ------------------------------------------------------------------
 * 전역 상태
 *  - tab           : 상단 슬라이딩 탭 (탭별로 타이틀·KPI·그리드 구성이 바뀜, 레퍼런스 영상과 동일한 패턴)
 *  - selectedRegion: 지도·정치인 테이블이 공유하는 선택 지역
 *  - detailId      : 정치인 상세 패널에 열린 의원 (mona_cd)
 * 위쪽 숫자 카드는 /api/stats 실제 집계. 데이터가 없는 칸은 "—".
 * 가상 숫자뿐인 카드(지지도·공약 이행률)는 SHOW_EXAMPLE_CARDS(src/lib/flags.ts)가 true 일 때만 보임.
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { REGION_BY_CODE } from "@/lib/mock-data";
import { useComments, useRegion, useRegions, useStats, type ApiComment, type ApiRegionDetail, type ApiStats } from "@/lib/api";
import { SHOW_EXAMPLE_CARDS } from "@/lib/flags";
import { DashboardHeader, type TabKey } from "./header";
import { SideRail } from "./side-rail";
import { FlipCounter } from "./flip-counter";
import { KoreaMapCard } from "./korea-map-card";
import { NewsPanel, timeAgo } from "./news-panel";
import { CommunityFeed, CommunityStatsCard, CommunityGuideCard } from "./community-feed";
import { ActivityCard, IssueTimelineCard, PartyTrendCard, PledgeCard } from "./kpi-charts";
import { BiasReportCard, PoliticianTable } from "./extra-cards";
import { RegionMembersCard } from "./region-members-card";
import { RegionLocalCard } from "./region-local-card";
import { PoliticianDetailSheet } from "./politician-detail-sheet";
import { BuildStoryCard, CollectStatusCard, StarRuleCard } from "./about-cards";

const TODAY = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(
  new Date(),
);

const NO_AI = "AI 분석 후 표시";
const NO_DATA = "공식 데이터 없음";
/** 평균 편향 지수 = 기사별 치우침 크기(|lean|, 0~100) 평균. 진보·보수 방향은 나누지 않음 */
const BIAS_CAPTION = "/100 · 방향 없이 치우친 정도";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

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
  comments: ApiComment[] | undefined,
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
        desc: "직접 만든 수집기로 모은 기사의 제목·요약·원문 링크를 보여줍니다. AI 편향 분석을 마친 기사에는 진보↔보수 치우침과 그 근거 문장을 함께 보여줍니다.",
        kpis: [
          { label: "오늘 수집 기사", value: s?.news_24h ?? null, caption: "최근 24시간", accent: true },
          { label: "뉴스 출처", value: s?.sources_7d ?? null, caption: "최근 7일 · 언론사" },
          { label: "AI 분석 기사", value: s?.analyzed ?? null, caption: "건 · 근거 문장과 함께" },
          { label: "평균 편향 지수", value: s?.avg_bias ?? null, caption: s?.avg_bias == null ? NO_AI : BIAS_CAPTION },
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
          { label: "3스타 의원", value: s?.three_star ?? null, caption: "명 · 별점 기준은 오른쪽" },
        ],
      };
    case "community":
      return {
        title: ["안전한", "야차판"],
        desc: "AI가 혐오 표현을 블라인드하고, 사실 주장은 출처와 대조해 검증합니다.",
        kpis: [
          { label: "전체 글", value: comments?.length ?? null, caption: "개 · 답글 포함", accent: true },
          { label: "오늘 글", value: comments?.filter((c) => isToday(c.createdAt)).length ?? null, caption: "개" },
          { label: "블라인드", value: comments?.filter((c) => c.isBlinded).length ?? null, caption: "개 · 혐오 표현 자동 차단" },
        ],
      };
    default:
      return {
        title: ["대한민국 정치", "한눈에 보기"],
        desc: "흩어진 정치 정보를 한눈에. 모든 숫자는 공개 자료를 직접 모아 계산했습니다.",
        kpis: [
          { label: "추적 중인 의원", value: s?.members ?? null, caption: "제22대 국회 전원" },
          { label: "오늘 수집 기사", value: s?.news_24h ?? null, caption: "최근 24시간", accent: true },
          { label: "평균 편향 지수", value: s?.avg_bias ?? null, caption: s?.avg_bias == null ? NO_AI : BIAS_CAPTION },
        ],
      };
  }
}

/** "● 마지막 수집 3시간 전" — 뉴스 수집기가 마지막으로 돈 시각 (news_articles.collected_at 최댓값) */
function LastCollected({ at }: { at: string | null | undefined }) {
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!at) return null;
  return (
    <>
      {" · "}
      <span className="text-lime" title={new Date(at).toLocaleString("ko-KR")}>
        ● 마지막 수집 {timeAgo(at)}
      </span>
    </>
  );
}

export default function PoliticalMichelinDashboard() {
  const [tab, setTab] = React.useState<TabKey>("map");
  // AI 객관화 모드: 객관화 요약을 만드는 분석이 아직 없어 스위치를 뺌 (뉴스 카드는 기본 표시)
  const aiMode = false;
  const [region, setRegion] = React.useState("11");
  const [polQuery, setPolQuery] = React.useState("");
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const { data: stats } = useStats();
  const { data: comments } = useComments("post", "board");
  const { data: regions } = useRegions();
  const { data: regionDetail } = useRegion(region);
  const heat = regions?.find((r) => r.code === region)?.heat ?? null;
  // keepPreviousData 로 이전 지역 응답이 남아 있을 수 있어 코드가 같을 때만 사용
  const detail = regionDetail?.code === region ? regionDetail : undefined;

  const head = useHeadline(tab, stats, region, heat, detail, comments);
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
      <DashboardHeader tab={tab} onTabChange={setTab} onSearch={search} />

      <div className="mx-auto flex max-w-[1680px] gap-5 px-4 pb-10 pt-6 sm:px-6">
        <SideRail selectedRegion={region} onSelectRegion={selectFromTable} onOpenPolitician={setDetailId} />

        <main className="min-w-0 flex-1">
          {/* ── Page headline + Flip KPI ── */}
          <section className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs text-ink-3">
                {TODAY}
                <LastCollected at={stats?.news_updated_at} />
              </p>
              <AnimatePresence mode="wait">
                <motion.h1
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="mt-1.5 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-[calc(40px*var(--fs))]"
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
                  {/* 지도 + 정치인 프로필·지역 최근 이슈 패널 */}
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
                  {SHOW_EXAMPLE_CARDS && (
                    <>
                      <PartyTrendCard className="col-span-12 lg:col-span-7" />
                      <PledgeCard className="col-span-12 lg:col-span-5" />
                    </>
                  )}
                </div>
              )}

              {tab === "overview" && (
                <div className="grid grid-cols-12 gap-4">
                  {/* 1행: 우리가 만든 과정 (수집 → 정리 → 분석 → 지도) */}
                  <BuildStoryCard className="col-span-12" />
                  {/* 기관(인증키)별 자동 최신화 현황 — 자동 수집 API 가 없는 배포에서는 스스로 숨음 */}
                  <CollectStatusCard className="col-span-12" />

                  {/* 2행: 뉴스 | 커뮤니티 */}
                  <NewsPanel aiMode={aiMode} onOpen={go("news")} className="col-span-12 h-[600px] md:col-span-6" />
                  <CommunityFeed className="col-span-12 h-[600px] md:col-span-6" />

                  {/* 3행: 기사 흐름 | 의정 활동 | 편향 리포트 */}
                  <IssueTimelineCard onOpen={go("news")} className="col-span-12 xl:col-span-5" />
                  <ActivityCard totals onOpen={go("politicians")} className="col-span-12 sm:col-span-6 xl:col-span-3" />
                  <BiasReportCard className="col-span-12 sm:col-span-6 xl:col-span-4" />

                  {SHOW_EXAMPLE_CARDS && (
                    <>
                      <PledgeCard className="col-span-12 xl:col-span-4" />
                      <PartyTrendCard className="col-span-12 xl:col-span-8" />
                    </>
                  )}
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
                    <StarRuleCard />
                    {SHOW_EXAMPLE_CARDS && <PledgeCard />}
                  </div>
                </div>
              )}

              {tab === "community" && (
                <div className="grid grid-cols-12 gap-4">
                  {/* 블라인드·검증 중·클린 숫자는 옆 통계 카드에 있어 게시판 카드에서는 끔 */}
                  <CommunityFeed showStats={false} className="col-span-12 h-[760px] lg:col-span-8" />
                  <div className="col-span-12 flex flex-col gap-4 lg:col-span-4">
                    <CommunityStatsCard />
                    <CommunityGuideCard />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-5 text-[calc(11px*var(--fs))] text-ink-3 sm:flex-row sm:justify-between sm:gap-8">
            <p className="max-w-3xl">
              의원·법안·표결(국회), 선거 결과·공약(선관위), 지역 지표(통계청), 정치 뉴스를 팀이 만든 수집기로 모아 정리했습니다. 의원 별점에는
              정당·이념 변수를 넣지 않습니다. 점선 테두리와 &quot;예시 데이터&quot; 띠는 데이터를 불러오지 못했을 때 대신 보이는 가상 데이터입니다.
            </p>
            <p className="shrink-0">© 2026 정치 미슐랭 · 팀 [더 킹]</p>
          </footer>
        </main>
      </div>

      <PoliticianDetailSheet monaCd={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
