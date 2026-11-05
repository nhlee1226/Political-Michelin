"use client";

/**
 * 서버(page.tsx)가 DB 에서 읽은 데이터를 클라이언트 컴포넌트 전체에 공급합니다.
 *  - useRegions()        : 지역(의석·투표율·이슈 활성도는 실데이터가 있으면 실제 값) + mock 정치인
 *  - useNews()           : 네이버 뉴스로 수집한 실제 기사
 *  - useElectedMembers() : 현역 의원 (열린국회정보 연동 전에는 선관위 당선인)
 *  - useDataSources()    : 어떤 항목이 실데이터인지 (화면 표기용)
 * 1분마다 서버 데이터를 다시 받아 화면을 갱신합니다 (router.refresh).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import type { NewsItem, Politician, Region } from "@/lib/mock-data";
import type { DataSources, ElectedMember } from "@/lib/live-types";

interface DashboardData {
  regions: Region[];
  byCode: Record<string, Region>;
  /** 모든 지역의 mock 정치인을 한 줄로 펼친 목록 (소속 지역 포함) */
  politicians: (Politician & { region: Region })[];
  news: NewsItem[];
  /** 최근 24시간 동안 발행된 수집 기사 수 */
  newsCountToday: number;
  electedMembers: ElectedMember[];
  sources: DataSources;
}

const DashboardDataContext = React.createContext<DashboardData | null>(null);

const REFRESH_MS = 60_000;

export function DashboardDataProvider({
  regions,
  news,
  newsCountToday,
  electedMembers,
  sources,
  children,
}: {
  regions: Region[];
  news: NewsItem[];
  newsCountToday: number;
  electedMembers: ElectedMember[];
  sources: DataSources;
  children: React.ReactNode;
}) {
  const router = useRouter();
  React.useEffect(() => {
    if (!sources.db) return; // DB 가 없으면 다시 읽어도 같은 mock
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [router, sources.db]);

  const value = React.useMemo<DashboardData>(
    () => ({
      regions,
      byCode: Object.fromEntries(regions.map((r) => [r.code, r])),
      politicians: regions.flatMap((r) => r.politicians.map((p) => ({ ...p, region: r }))),
      news,
      newsCountToday,
      electedMembers,
      sources,
    }),
    [regions, news, newsCountToday, electedMembers, sources],
  );
  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

function useDashboardData() {
  const v = React.useContext(DashboardDataContext);
  if (!v) throw new Error("useRegions()/useNews() 는 <DashboardDataProvider> 안에서만 사용할 수 있습니다.");
  return v;
}

export function useRegions() {
  const { regions, byCode, politicians } = useDashboardData();
  return { regions, byCode, politicians };
}

export function useNews() {
  const { news, newsCountToday } = useDashboardData();
  return { news, newsCountToday };
}

export function useElectedMembers() {
  return useDashboardData().electedMembers;
}

export function useDataSources() {
  return useDashboardData().sources;
}
