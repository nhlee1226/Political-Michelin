"use client";
/**
 * 백엔드(Next.js API 라우트, src/app/api) 읽기 훅 모음.
 * 같은 Next.js 서버의 /api 를 부르므로 따로 서버를 띄울 필요가 없습니다.
 * mock-data.ts 를 쓰던 컴포넌트에서 하나씩 이 훅으로 바꾸면 됩니다.
 */
import { useMemo } from "react";
import useSWR from "swr";
import { REGIONS, type Region } from "./mock-data";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api"; // 같은 Next.js 안의 API 라우트

async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} 요청 실패 (${res.status})`);
  return res.json();
}

/** 1분마다 다시 읽고, 갱신 중에는 이전 데이터를 유지해 깜빡임을 막는 공통 옵션 */
const live = { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true };

export interface ApiRegion {
  code: string;
  name: string;
  short: string;
  seats: number | null;
  turnout: number | null;
  heat: number; // 0~100, 최근 24시간 기사 수 기반
  news_24h: number;
}

export interface ApiPolitician {
  mona_cd: string;
  name: string;
  party_id: string | null;
  region_code: string | null;
  district: string | null;
  term: number | null;
  bills_proposed: number;
  total_votes: number;
  vote_participation: number | null; // 표결 참여율(%)
}

export interface ApiParty {
  id: string;
  name: string;
  short: string;
  color: string;
  is_active: boolean;
}

export interface ApiNews {
  id: number;
  url: string;
  source: string | null;
  headline: string;
  summary: string | null;
  published_at: string;
  region_code: string | null;
  bias: number | null;
  bias_signals: string[] | null;
  objective_headline: string | null;
  objective_summary: string | null;
}

export interface ApiRegionDetail extends Omit<ApiRegion, "heat" | "news_24h"> {
  politicians: ApiPolitician[];
  support: { party_id: string; value: number; pollster: string; field_end: string; source_url: string }[];
  news: ApiNews[];
}

export const useRegions = () => useSWR<ApiRegion[]>("/regions", fetcher, live);

export const useRegion = (code: string | null) =>
  useSWR<ApiRegionDetail>(code ? `/regions/${code}` : null, fetcher, live);

export const useNews = (region?: string, limit = 20) =>
  useSWR<ApiNews[]>(`/news?limit=${limit}${region ? `&region=${region}` : ""}`, fetcher, live);

export const usePoliticians = () => useSWR<ApiPolitician[]>("/politicians", fetcher, live);

export const useParties = () => useSWR<ApiParty[]>("/parties", fetcher, live);

export const usePolitician = (monaCd: string | null) =>
  useSWR<ApiPolitician & { recent_bills: unknown[] }>(monaCd ? `/politicians/${monaCd}` : null, fetcher);

/**
 * 단계적 전환용: mock REGIONS 를 기본으로 두고, API 에 값이 있는 필드만 실제 값으로 덮어씀.
 * 백엔드가 꺼져 있어도 화면은 mock 으로 계속 동작합니다.
 * 사용: 컴포넌트 안에서 REGIONS 대신 const regions = useLiveRegions();
 */
export function useLiveRegions(): Region[] {
  const { data } = useRegions();
  return useMemo(() => {
    if (!data) return REGIONS;
    const byCode = new Map(data.map((r) => [r.code, r]));
    return REGIONS.map((r) => {
      const live = byCode.get(r.code);
      if (!live) return r;
      return {
        ...r,
        heat: live.news_24h > 0 ? live.heat : r.heat, // 기사가 아직 없으면 mock 유지
        seats: live.seats ?? r.seats,
        turnout: live.turnout ?? r.turnout,
      };
    });
  }, [data]);
}
