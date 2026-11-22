"use client";
/**
 * 백엔드(Next.js API 라우트, src/app/api) 읽기 훅 모음.
 * 같은 Next.js 서버의 /api 를 부르므로 따로 서버를 띄울 필요가 없습니다.
 * mock-data.ts 를 쓰던 컴포넌트에서 하나씩 이 훅으로 바꾸면 됩니다.
 */
import { useMemo } from "react";
import useSWR from "swr";
import { REGIONS, type Region } from "./mock-data";
import type { BillStage } from "./bill-stage";

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
  /** 본회의 표결 대상 법안 수 = 찬성 + 반대 + 기권 + 불참 (22대에서 가결·부결된 법안) */
  total_votes: number;
  votes_yes: number;
  votes_no: number;
  votes_abstain: number;
  votes_absent: number;
  vote_participation: number | null; // 표결 참여율(%) = (찬성+반대+기권) ÷ total_votes
  /** 아래는 값이 없을 수도 있어 선택 항목으로 둠 */
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
  /** 편향 분석을 마친 기사 수 (news_analysis) */
  analyzed: number;
  /** 평균 치우침 0~100 (= |lean| 평균, 판단 불가 제외) */
  avg_bias: number | null;
  /** 편향 근거 문장 수 (news_evidence) */
  evidence_total: number;
  /** 치우침을 판단한 기사 수 (analyzed - 판단 불가) */
  bias_judged: number;
  /** 치우침 크기 10점 구간별 기사 수 10칸 [0~9, 10~19, …, 90~100] */
  bias_dist: number[];
  /** 별점 3개 의원 수 */
  three_star: number;
  /** 대표발의 1건 이상 의원의 평균 법안 반영률(%) */
  avg_reflect_rate: number | null;
  /** 의원 전체의 평균 표결 참여율(%) */
  avg_vote_participation: number | null;
  /** 본회의 표결이 수집된 법안 수 */
  voted_bills: number;
  /** 최근 14일(오늘 포함) 날짜별 수집 기사 수, 오래된 날부터 */
  news_daily: { day: string; n: number }[];
  /** 그 앞 14일 동안의 수집 기사 수 */
  news_prev_14d: number;
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
  /** 편향 분석을 했는가 (했는데 lean 이 null 이면 '판단 불가') */
  analyzed: boolean;
  /** 편향 크기 0~100 (= |lean|) */
  bias: number | null;
  /** -100(진보 시각) ~ +100(보수 시각). 분석 전이거나 판단 불가면 null */
  lean: number | null;
  confidence: "low" | "medium" | "high" | null;
  bias_signals: string[] | null;
  objective_headline: string | null;
  objective_summary: string | null;
  /** 편향 근거. 분석 전이거나 근거가 없으면 null */
  evidence: ApiEvidence[] | null;
}

/** 편향 판단 근거 1개 (news_evidence) */
export interface ApiEvidence {
  type: "quote_balance" | "wording" | "headline_gap" | "fact_check";
  direction: "progressive" | "neutral" | "conservative";
  /** 1 약함 ~ 3 강함 */
  strength: number;
  /** 근거가 된 원문 문장 */
  excerpt: string;
  explanation: string;
  source_url: string | null;
}

/** 지방선거 당선인 (시·도지사·교육감·구·시·군의 장) */
export interface ApiLocalWinner {
  /** '<sgId>:<sgTypecode>:<huboid>' — useLocalWinner 로 공약 원문을 받을 때 씀 */
  id: string;
  office: string;
  name: string;
  party_name: string | null; // 교육감은 정당 없음
  sd_name: string;
  sgg_name: string;
  votes: number | null;
  vote_rate: number | null;
  pledges: { no: number; realm: string | null; title: string | null }[];
}

export interface ApiRegionLocal {
  election: { sg_id: string; name: string; date: string };
  /** 시·도지사·교육감을 다른 시도와 함께 뽑은 통합 시도 (예: 전남광주통합특별시 = 광주 + 전남) */
  merged: { name: string; regions: string[] } | null;
  governor: ApiLocalWinner | null;
  superintendent: ApiLocalWinner | null;
  mayors: ApiLocalWinner[];
}

/** 시도 지표 한 줄 (KOSIS) */
export interface ApiIndicator {
  indicator: string; // 주민등록인구 / 고령인구비율 / 재정자립도
  year: number;
  value: number;
  unit: string;
  source_org_id: string;
  source_tbl_id: string;
}

export interface ApiRegionDetail extends Omit<ApiRegion, "heat" | "news_24h"> {
  politicians: ApiPolitician[];
  /** 최근 총선 지역구 중 현재 의원이 없는 선거구 이름 (공석) */
  vacancies: string[];
  support: { party_id: string; value: number; pollster: string; field_end: string; source_url: string }[];
  news: ApiNews[];
  /** 지방선거 당선인·공약 제목 (수집 전이면 null) */
  local: ApiRegionLocal | null;
  indicators: ApiIndicator[];
}

/** 지방선거 당선인 1명 + 공약 원문 (선관위 원문 그대로) */
export interface ApiLocalWinnerDetail {
  id: string;
  office: string;
  name: string;
  party_name: string | null;
  sd_name: string;
  sgg_name: string;
  pledges: { no: number; realm: string | null; title: string | null; content: string | null }[];
}

export const useRegions = () => useSWR<ApiRegion[]>("/regions", fetcher, live);

export const useRegion = (code: string | null) =>
  useSWR<ApiRegionDetail>(code ? `/regions/${code}` : null, fetcher, live);

/** region: 시도 코드, undefined = 전국, null = 요청 안 함. analyzed: 편향 분석된 기사만 */
export const useNews = (region?: string | null, limit = 20, analyzed = false) =>
  useSWR<ApiNews[]>(
    region === null ? null : `/news?limit=${limit}${region ? `&region=${region}` : ""}${analyzed ? "&analyzed=1" : ""}`,
    fetcher,
    live,
  );

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

/** 지방선거 당선인의 공약 원문. id = ApiLocalWinner.id, null 이면 요청하지 않음 (펼칠 때만 받음) */
export const useLocalWinner = (id: string | null) =>
  useSWR<ApiLocalWinnerDetail>(id ? `/politicians/${id}` : null, fetcher);

export const useStats = () => useSWR<ApiStats>("/stats", fetcher, live);

/* ── 기관별 자동 수집 현황 (/api/collect-status, src/db/collect-log.ts collectStatus) ── */
export type CollectRunStatus = "ok" | "failed" | "quota" | "running";

export interface ApiCollectJob {
  id: string;
  name: string;
  /** '하루' | '7일' | '30일' */
  every: string;
  /** 주기를 이렇게 정한 이유 */
  why: string;
  lastOkAt: string | null;
  lastAt: string | null;
  lastStatus: CollectRunStatus | null;
  nextAt: string;
}

export interface ApiCollectAgency {
  id: "assembly" | "data_go_kr" | "kosis";
  name: string;
  /** 성향: 데이터가 바뀌는 빠르기 */
  character: string;
  /** 인증키 하루 호출 한도 */
  dailyLimit: number;
  limitNote: string;
  /** 한도 중 자동 수집이 쓰는 몫 */
  usable: number;
  usedToday: number;
  remainingToday: number;
  /** 오늘 기관이 '하루 한도 초과'로 답했는지 */
  blockedToday: boolean;
  jobs: ApiCollectJob[];
}

export interface ApiCollectRun {
  job: string;
  jobName: string;
  agency: string;
  /** schedule = 예약 실행, button = Actions 의 Run workflow, local = PC 에서 실행 */
  trigger: "schedule" | "button" | "local" | string;
  status: CollectRunStatus | string;
  calls: number;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ApiCollectStatus {
  generatedAt: string;
  /** collect_log 표가 있고 읽혔는지. false 면 계획(기관·주기·한도)만 */
  logReady: boolean;
  agencies: ApiCollectAgency[];
  recent: ApiCollectRun[];
}

/** 이 API 가 아직 없는 배포(자동 수집 PR 머지 전)에서는 404 → 한 번만 묻고 재시도하지 않음 */
export const useCollectStatus = () =>
  useSWR<ApiCollectStatus>("/collect-status", fetcher, { ...live, shouldRetryOnError: false });

/* ── 법안 추적·국회 일정 (/api/bills, /api/schedule — src/db/assembly-api.ts) ── */

export interface ApiBillTrack extends BillStage {
  bill_id: string;
  bill_no: string | null;
  title: string;
  committee: string | null;
  /** 대표발의 의원 이름 */
  proposer: string | null;
  detail_url: string | null;
  /** 본회의 찬성·반대·기권 수 (표결을 수집한 법안만) */
  votes: { yes: number; no: number; abstain: number } | null;
}

export interface ApiBillList {
  /** 단계 날짜를 한 번이라도 수집했는지. false 면 화면은 "첫 수집 뒤에 채워짐" */
  ready: boolean;
  rows: ApiBillTrack[];
}

export interface ApiScheduleItem {
  date: string; // YYYY-MM-DD
  time: string | null;
  /** 일정 종류 (원천 표기, 예: 본회의·위원회) */
  kind: string | null;
  title: string;
  committee: string | null;
  place: string | null;
  host: string | null;
}

export interface ApiSchedule {
  ready: boolean;
  updated_at: string | null;
  rows: ApiScheduleItem[];
}

/** 하루 1번 바뀌는 데이터라 10분마다만 다시 읽음. 이 API 가 아직 없는 배포에서는 404 → 재시도 안 함 */
const daily = { ...live, refreshInterval: 10 * 60_000, shouldRetryOnError: false };

/** ids: 추적 중인 법안 / q: 제목 검색 / view: active(진행 중) · done(처리 끝남). null 이면 요청 안 함 */
export function useBills(opts: { ids?: string[]; q?: string; view?: "active" | "done" } | null) {
  let key: string | null = null;
  if (opts?.ids) key = opts.ids.length ? `/bills?ids=${opts.ids.map(encodeURIComponent).join(",")}` : null;
  else if (opts?.q) key = `/bills?q=${encodeURIComponent(opts.q)}`;
  else if (opts) key = `/bills?view=${opts.view ?? "active"}`;
  return useSWR<ApiBillList>(key, fetcher, daily);
}

export const useSchedule = () => useSWR<ApiSchedule>("/schedule", fetcher, daily);

/* ── 인증 ─────────────────────────────────────────────── */
export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
}

/**
 * 현재 로그인한 사용자. 비로그인이면 null.
 * 로그인·회원가입은 서버 액션이 redirect 하므로 페이지가 다시 로드되어 자연스럽게 갱신됨.
 * 로그아웃 후에도 redirect 로 페이지가 바뀌므로 별도 mutate 불필요.
 */
export function useUser() {
  return useSWR<ApiUser | null>("/auth/me", async (path: string) => {
    const res = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<ApiUser | null>;
  });
}

/* ── 커뮤니티 (댓글·게시글) ─────────────────────────── */
export interface ApiComment {
  id: string;
  body: string;
  author: string;
  userId: string;
  parentId: string | null;
  isBlinded: boolean;
  isUnderReview: boolean;
  createdAt: string;
}

export type CommentTarget = "post" | "news" | "politician";

/**
 * 특정 대상의 댓글 목록. 비로그인도 읽기 가능.
 * 작성·삭제 후엔 mutate 로 갱신.
 */
export function useComments(targetType: CommentTarget, targetId: string) {
  return useSWR<ApiComment[]>(
    `/comments?target_type=${targetType}&target_id=${encodeURIComponent(targetId)}`,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true, keepPreviousData: true },
  );
}

/** 댓글 작성. 성공하면 생성된 댓글 반환. */
export async function postComment(opts: {
  targetType: CommentTarget;
  targetId: string;
  body: string;
  parentId?: string | null;
}): Promise<ApiComment | { error: string }> {
  const res = await fetch(`${API}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = await res.json();
  if (!res.ok) return { error: (data as { error?: string }).error ?? "작성 실패" };
  return data as ApiComment;
}

/** 댓글 삭제. */
export async function deleteComment(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API}/comments/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: (data as { error?: string }).error ?? "삭제 실패" };
  }
  return { ok: true };
}

/** 정당이 없거나 정당 표에 없는 이름일 때 쓰는 회색 */
export const NO_PARTY_COLOR = "#6b7280";

/**
 * 정당 표시(이름·색)를 한 곳에서: parties 표의 이름과 색을 그대로 씀.
 * 색은 실제 정당 상징색이 아니라 DB 에 저장된 중립 팔레트 값이라, 같은 정당은 어느 화면에서나 같은 색.
 * 사용: const party = usePartyLookup();  party(p.party_id).name / .color
 */
export function usePartyLookup() {
  const { data } = useParties();
  return useMemo(() => {
    const byId = new Map(data?.map((p) => [p.id, p]));
    return (id: string | null | undefined, none = "—") => {
      const p = id ? byId.get(id) : undefined;
      return { name: p?.name ?? id ?? none, color: p?.color ?? NO_PARTY_COLOR };
    };
  }, [data]);
}

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
        name: live.name, // 강원특별자치도·전북특별자치도 등 지금 이름
        short: live.short,
        heat: live.heat, // API 가 살아 있으면 0 이어도 실제 값 (mock 숫자를 실제처럼 보이지 않게)
        seats: live.seats ?? r.seats,
        turnout: live.turnout ?? r.turnout,
      };
    });
  }, [data]);
}
