/**
 * 정치인 상세 페이지(/politicians/[id]) 응답 모양 — 서버(src/db/politician-profile.ts)와 화면이 함께 씀.
 * 값이 없거나 그 데이터를 아직 수집하지 않았으면 null (화면은 "자료 없음"으로 표시, 숫자를 지어내지 않음).
 */
import type { ApiNews } from "./api";
import type { BillStage } from "./bill-stage";

/** 상세 페이지 주소. 국회의원 = MONA_CD, 지방선거 당선인 = 'sgId:sgTypecode:huboid' */
export const politicianHref = (id: string) => `/politicians/${encodeURIComponent(id)}`;

export interface MetricSet {
  /** 비교 집단 인원 */
  n: number;
  bills_proposed: number | null;
  reflect_rate: number | null;
  vote_participation: number | null;
  cosponsored: number | null;
}

export interface ProfileBill extends BillStage {
  bill_id: string;
  bill_no: string | null;
  title: string;
  committee: string | null;
  propose_date: string | null;
  proc_result: string | null;
  detail_url: string | null;
}

export interface ProfileVote {
  bill_id: string;
  title: string;
  detail_url: string | null;
  result: "찬성" | "반대" | "기권" | "불참";
  vote_date: string;
  /** 같은 정당 의원 다수의 표 (불참 제외). 무소속·정당 정보 없음 = null */
  party_result: string | null;
  /** 그 다수 표의 비율(%) */
  party_share: number | null;
}

export interface ElectionResult {
  election: string;
  sgg_name: string;
  votes: number | null;
  vote_rate: number | null;
  /** 같은 선거구 득표 2위 (당선인 기준) 또는 1위 (낙선 기준은 쓰지 않음) */
  runner_up: { name: string; party_name: string | null; votes: number | null; vote_rate: number | null } | null;
  /** 2위와의 표 차이 · 득표율 차이(%p) */
  margin_votes: number | null;
  margin_rate: number | null;
  /** 선거구 투표율(%) = 투표수 ÷ 선거인수 */
  turnout: number | null;
}

export interface CandidateBio {
  hanja_name: string | null;
  gender: string | null;
  age: number | null;
  birthday: string | null;
  job: string | null;
  edu: string | null;
  career: string[];
}

export interface MemberProfileData {
  kind: "member";
  id: string;
  name: string;
  hanja_name: string | null;
  eng_name: string | null;
  photo_url: string | null;
  party_id: string | null;
  district: string | null;
  elect_type: string | null;
  term: number | null;
  units: string | null;
  committee: string | null;
  committees: string[];
  job_title: string | null;
  birth_date: string | null;
  gender: string | null;
  /** 인적사항 API 약력 원문 (줄바꿈 유지) */
  career: string | null;
  contact: {
    tel: string | null;
    email: string | null;
    homepage: string | null;
    office: string | null;
    staff: string | null;
    secretary: string | null;
    secretary2: string | null;
  };
  /** 최근 총선 선관위 후보 정보 (지역구 당선인만, 비례대표는 null) */
  bio: CandidateBio | null;
  election: ElectionResult | null;

  stars: 1 | 2 | 3;
  score_rule: string;
  bills_proposed: number;
  bills_reflected: number;
  reflect_rate: number | null;
  total_votes: number;
  votes_yes: number;
  votes_no: number;
  votes_abstain: number;
  votes_absent: number;
  vote_participation: number | null;
  /** 공동발의 수. 공동발의 표가 아직 없으면 null */
  cosponsored: number | null;

  /** 전체 의원 중 순위 (1 = 가장 높음). 값이 없으면 null */
  ranks: {
    total: number;
    bills_proposed: number | null;
    bills_reflected: number | null;
    reflect_rate: number | null;
    vote_participation: number | null;
    cosponsored: number | null;
  };
  compare: { me: MetricSet; party: MetricSet | null; committee: MetricSet | null; all: MetricSet };

  bills: {
    pending: number;
    closed: number;
    /** 대표발의 법안 (최근 발의 순, 최대 200건) */
    list: ProfileBill[];
    by_committee: { committee: string; n: number }[];
  };
  /** 최근 공동발의 법안. 표가 아직 없으면 null */
  cosponsored_bills: { bill_id: string; title: string; proposer: string | null; propose_date: string | null; proc_result: string | null; detail_url: string | null }[] | null;

  votes: {
    /** 최근 표결 30건 */
    recent: ProfileVote[];
    /** 당 다수와 다르게 던진 표 (불참 제외, 최근 순 최대 50건) */
    dissent: ProfileVote[];
    dissent_total: number;
    /** 당 다수와 비교 가능한 표결 수 */
    comparable: number;
  };

  news: {
    total_30d: number;
    /** 최근 30일 날짜별(KST) 언급 기사 수, 오래된 날부터 */
    daily: { day: string; n: number }[];
    /** 편향 분석된 언급 기사의 평균 lean (-100 진보 시각 ~ +100 보수 시각) */
    avg_lean: number | null;
    analyzed: number;
    articles: ApiNews[];
  };

  /** 이 의원을 즐겨찾기한 회원 수. 표가 없으면 null */
  followers: number | null;
  /** 소속 위원회·본회의 일정 (오늘부터 14일). 일정 표가 없으면 null */
  schedule: { date: string; time: string | null; kind: string | null; title: string; committee: string | null; place: string | null }[] | null;

  /** B: 수집·입력 데이터. 표가 없으면 null, 표는 있는데 이 의원 줄이 없으면 [] */
  records: {
    attendance: { kind: string; period: string; attended: number; total: number; source_url: string | null }[] | null;
    assets: { year: number; total: number; real_estate: number | null; deposits: number | null; securities: number | null; debts: number | null; source_url: string | null }[] | null;
    funds: { year: number; income: number; expense: number; donations: number | null; source_url: string | null }[] | null;
  };
  updated_at: string;
}

export interface LocalProfileData {
  kind: "local";
  id: string;
  office: string;
  name: string;
  party_name: string | null;
  sd_name: string;
  sgg_name: string;
  bio: CandidateBio;
  election: ElectionResult;
  pledges: { no: number; realm: string | null; title: string | null; content: string | null }[];
  news: MemberProfileData["news"];
  updated_at: string;
}

export type PoliticianProfileData = MemberProfileData | LocalProfileData;
