"use client";

/**
 * 서버(page.tsx)가 DB 에서 읽은 데이터를 클라이언트 컴포넌트 전체에 공급합니다.
 *  - useRegions() : 지역·정치인
 *  - useNews()    : 네이버 뉴스로 수집한 실제 기사
 */
import * as React from "react";
import type { NewsItem, Politician, Region } from "@/lib/mock-data";

interface DashboardData {
  regions: Region[];
  byCode: Record<string, Region>;
  /** 모든 지역의 정치인을 한 줄로 펼친 목록 (소속 지역 포함) */
  politicians: (Politician & { region: Region })[];
  news: NewsItem[];
  /** 최근 24시간 동안 수집된 기사 수 */
  newsCountToday: number;
}

const DashboardDataContext = React.createContext<DashboardData | null>(null);

export function DashboardDataProvider({
  regions,
  news,
  newsCountToday,
  children,
}: {
  regions: Region[];
  news: NewsItem[];
  newsCountToday: number;
  children: React.ReactNode;
}) {
  const value = React.useMemo<DashboardData>(
    () => ({
      regions,
      byCode: Object.fromEntries(regions.map((r) => [r.code, r])),
      politicians: regions.flatMap((r) => r.politicians.map((p) => ({ ...p, region: r }))),
      news,
      newsCountToday,
    }),
    [regions, news, newsCountToday],
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
