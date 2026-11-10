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
  /** 아래는 /api/politicians 에만 있음 (/api/regions/[code] 의 politicians 에는 없음) */
  elect_type?: "지역구" | "비례대표" | null;
  committee?: string | null;
  /** 원안·수정가결 + 대안반영 된 대표발의 법안 수 */
  bills_reflected?: number;
  /** 반영률(%) = bills_reflected ÷ bills_proposed, 발의 0건이면 null */
  reflect_rate?: number | null;
  /** 별점 1~3 (src/server/member-scores.ts 기준) */
  stars?: 1 | 2 | 3;
}

/** /api/politicians 응답 + 헤더 X-Score-Rule(별점 기준 문장) */
export interface ApiPoliticianList {
  rows: ApiPolitician[];
  scoreRule: string | null;
}

export interface ApiBill {
  bill_id: string;
  bill_no: string | null;
  title: string;
  propose_dt: string | null;
  committee: string | null;
  proc_result: string | null;
  detail_url: string | null;
}

export interface ApiPoliticianDetail extends ApiPolitician {
  bills_passed: number;
  bills_reflected: number;
  reflect_rate: number | null;
  stars: 1 | 2 | 3;
  score_rule: string;
  updated_at: string;
  recent_bills: ApiBill[];
}

/** /api/stats — 데이터가 아직 없는 값은 null */
export interface ApiStats {
  members: number;
  news_24h: number;
  news_total: number;
  sources_7d: number;
  news_updated_at: string | null;
  bills_total: number;
  bills_passed: number;
  analyzed: number;
  avg_bias: number | null;
  /** 별점 3개 의원 수 */
  three_star: number;
  /** 대표발의 1건 이상 의원의 평균 법안 반영률(%) */
  avg_reflect_rate: number | null;
}

export interface ApiParty {
  id: string;
  name: string;
  short: string;
  color: string;
  is_active: boolean;
}

export interface ApiNews {
  id: string; // 원문 URL 의 SHA-1 (news_articles.id)
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

/** region: 시도 코드, undefined = 전국, null = 요청 안 함 */
export const useNews = (region?: string | null, limit = 20) =>
  useSWR<ApiNews[]>(region === null ? null : `/news?limit=${limit}${region ? `&region=${region}` : ""}`, fetcher, live);

/** 목록은 별점 기준 문장을 응답 헤더로 주므로 헤더까지 읽음 */
async function politiciansFetcher(path: string): Promise<ApiPoliticianList> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} 요청 실패 (${res.status})`);
  const rule = res.headers.get("X-Score-Rule");
  return { rows: await res.json(), scoreRule: rule ? decodeURIComponent(rule) : null };
}

export const usePoliticians = () => useSWR<ApiPoliticianList>("/politicians", politiciansFetcher, live);

export const useParties = () => useSWR<ApiParty[]>("/parties", fetcher, live);

export const usePolitician = (monaCd: string | null) =>
  useSWR<ApiPoliticianDetail>(monaCd ? `/politicians/${monaCd}` : null, fetcher);

export const useStats = () => useSWR<ApiStats>("/stats", fetcher, live);

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
        heat: live.heat, // API 가 살아 있으면 0 이어도 실제 값 (mock 숫자를 실제처럼 보이지 않게)
        seats: live.seats ?? r.seats,
        turnout: live.turnout ?? r.turnout,
      };
    });
  }, [data]);
}
