/**
 * 기관별 자동 수집 계획 — DB·네트워크 없이 동작하는 순수 모듈.
 * scripts/auto/run.ts(스케줄러), scripts/collectors/api-fetch.ts(호출 세기), /api/collect-status(현황)가 함께 씀.
 *
 * 우리가 가진 인증키 = 기관. 기관마다
 *   (1) 성향: 데이터가 얼마나 자주 바뀌는지 (법안은 매일, 선거 결과는 확정 후 거의 안 바뀜, 통계는 연 단위)
 *   (2) 토큰: 인증키 하루 호출 한도
 * 가 달라서, 수집기마다 주기와 예상 호출 수를 따로 정한다. 스케줄러는 매시간 깨어나
 * "주기가 됐는지 + 오늘 남은 호출 수로 충분한지"를 DB(collect_log)로 확인해서 해당 수집기만 실행한다.
 *
 * 뉴스(네이버 API HUB)와 편향 분석(Claude)은 남호 담당이라 여기 넣지 않음 → .github/workflows/collect.yml 이 따로 돌림.
 */

export type AgencyId = "assembly" | "data_go_kr" | "kosis";

export interface Agency {
  id: AgencyId;
  name: string;
  /** 이 기관 인증키 환경변수 (.env.local / GitHub Environment secrets) */
  keyEnv: string;
  /** 성향: 데이터가 바뀌는 빠르기 → 주기를 정한 이유 */
  character: string;
  /** 인증키 하루 호출 한도 (토큰). 기관이 공개하지 않으면 우리가 정한 자체 한도 */
  dailyLimit: number;
  limitNote: string;
  /** 한도 중 자동 수집이 쓸 비율. 나머지는 손으로 돌리는 확인·재시도 몫으로 남겨 둠 */
  safety: number;
  /** 호출 사이 최소 간격(ms) — 기관 서버에 무리를 주지 않게 */
  minIntervalMs: number;
}

export const AGENCIES: Record<AgencyId, Agency> = {
  assembly: {
    id: "assembly",
    name: "열린국회정보",
    keyEnv: "ASSEMBLY_API_KEY",
    character: "의원·정당은 가끔 바뀌고, 법안은 매일 발의·심사되고, 표결은 본회의가 열린 날 생기고, 회의 일정은 며칠 앞서 잡힘",
    dailyLimit: 3_000,
    limitNote: "기관이 공개한 하루 한도가 없어 우리가 정한 자체 한도 (한 번에 최대 1,000줄)",
    safety: 0.8,
    minIntervalMs: 200,
  },
  data_go_kr: {
    id: "data_go_kr",
    name: "공공데이터포털 (중앙선거관리위원회)",
    keyEnv: "DATA_GO_KR_KEY",
    character: "끝난 선거 결과·공약이라 확정 뒤에는 거의 바뀌지 않음 (재보궐·정정만)",
    dailyLimit: 10_000,
    limitNote: "개발계정 API마다 하루 10,000회 (공공데이터포털). 서비스별 한도지만 키 하나로 묶어 더 보수적으로 셈",
    safety: 0.8,
    minIntervalMs: 100,
  },
  kosis: {
    id: "kosis",
    name: "KOSIS 국가통계포털",
    keyEnv: "KOSIS_API_KEY",
    character: "인구·고령인구비율·재정자립도는 1년 단위 통계라 새 연도가 올라올 때만 바뀜",
    dailyLimit: 1_000,
    limitNote: "하루 한도는 공개되지 않음, 분당 200회·한 번에 40,000셀 (KOSIS) → 자체 한도 하루 1,000회, 0.3초 간격",
    safety: 0.8,
    minIntervalMs: 300,
  },
};

export const AGENCY_ORDER: AgencyId[] = ["assembly", "data_go_kr", "kosis"];

export interface Job {
  /** collect_log.job 값 */
  id: string;
  agency: AgencyId;
  name: string;
  /** 실행할 수집기 (레포 루트 기준) */
  script: string;
  /** 수집기에 넘길 인자. cap = 이번 실행에 쓸 수 있는 최대 호출 수 */
  args?: (cap: number) => string[];
  /** 주기(분) */
  everyMin: number;
  /** 한 번 실행에 드는 예상 호출 수 — 오늘 남은 호출이 이보다 적으면 실행하지 않음 (넉넉히 잡음) */
  estCalls: number;
  /** 한 번 실행에 쓸 수 있는 최대 호출 수 — 넘으면 수집기가 그 자리에서 멈춤 (반복 오류로 한도를 다 쓰지 않게) */
  maxCalls: number;
  /** 같은 회차에 이 작업이 실패했으면 건너뜀 (앞 단계 데이터가 필요함) */
  after?: string[];
  /** 주기를 이렇게 정한 이유 */
  why: string;
}

const HOUR = 60;
const DAY = 24 * HOUR;

/** 실행 순서 = 이 배열 순서 (앞 단계가 먼저) */
export const JOBS: Job[] = [
  {
    id: "members",
    agency: "assembly",
    name: "국회의원·정당",
    script: "scripts/collectors/members.ts",
    everyMin: DAY,
    estCalls: 2,
    maxCalls: 10,
    why: "당적 변경·의원직 상실은 드물어서 하루 1번이면 충분",
  },
  {
    id: "bills",
    agency: "assembly",
    name: "22대 발의 법안",
    script: "scripts/collectors/bills.ts",
    everyMin: DAY,
    estCalls: 30,
    maxCalls: 80,
    after: ["members"],
    why: "법안은 매일 발의되고 위원회·법사위·본회의를 거치지만 실시간일 필요는 없어 하루 1번 (1,000건씩 약 20번 호출, 처리 단계 날짜도 같은 응답에서 함께 저장)",
  },
  {
    id: "votes",
    agency: "assembly",
    name: "본회의 표결",
    script: "scripts/collectors/votes.ts",
    // 이미 표결을 받은 법안은 다시 묻지 않음(--new-only). 법안 1건 = 1번 호출, 재시도 몫을 빼고 상한까지
    args: (cap) => ["--new-only", "--limit", String(Math.max(1, Math.floor(cap / 2)))],
    everyMin: DAY,
    estCalls: 10,
    maxCalls: 400,
    after: ["bills"],
    why: "본회의가 열린 날만 새 표결이 생김. 새로 가결·부결된 법안만 하루 1번 확인",
  },
  {
    id: "schedule",
    agency: "assembly",
    name: "국회 일정",
    script: "scripts/collectors/schedule.ts",
    everyMin: DAY,
    estCalls: 20,
    maxCalls: 60,
    why: "본회의·위원회 회의는 며칠 앞서 잡히므로 하루 1번, 3일 전~14일 뒤를 날짜마다 1번씩(약 18번) 다시 받아 취소·변경까지 반영",
  },
  {
    id: "nec",
    agency: "data_go_kr",
    name: "22대 총선 후보·득표·투표율",
    script: "scripts/collectors/nec.ts",
    everyMin: 30 * DAY,
    estCalls: 150,
    maxCalls: 600,
    why: "확정된 선거 결과라 바뀌지 않음. 정정이 있을 때만 반영되도록 30일에 1번 확인",
  },
  {
    id: "local",
    agency: "data_go_kr",
    name: "제9회 지방선거 당선인",
    script: "scripts/collectors/local.ts",
    everyMin: 30 * DAY,
    estCalls: 10,
    maxCalls: 60,
    why: "확정된 당선인이라 30일에 1번 확인 (재보궐로 바뀐 경우 반영)",
  },
  {
    id: "pledges",
    agency: "data_go_kr",
    name: "지방선거 당선인 공약",
    script: "scripts/collectors/pledges.ts",
    everyMin: 30 * DAY,
    estCalls: 300,
    maxCalls: 800,
    after: ["local"],
    why: "당선인 1명 = 1번 호출(약 260번)이라 무거움. 공약 원문은 선거 뒤 바뀌지 않아 30일에 1번",
  },
  {
    id: "kosis",
    agency: "kosis",
    name: "시도별 인구·고령인구비율·재정자립도",
    script: "scripts/collectors/kosis.ts",
    everyMin: 7 * DAY,
    estCalls: 3,
    maxCalls: 20,
    why: "연 단위 통계라 새 연도가 언제 올라올지만 보면 됨. 호출이 3번뿐이라 7일에 1번",
  },
];

/* ═══════════════════════════ 판단 규칙 (순수 함수) ═══════════════════════════ */

const MIN = 60_000;
const KST = 9 * 3600_000;
/** GitHub 예약 실행이 몇 분씩 늦게 깨우므로, 주기보다 이만큼 일찍 와도 '때가 됨'으로 봄 */
export const SLACK_MIN = 10;

/** now 가 속한 한국 날짜의 0시 (기관 하루 한도는 한국 자정에 초기화) */
export function startOfKstDay(now: Date): Date {
  const day = 24 * 3600_000;
  return new Date(Math.floor((now.getTime() + KST) / day) * day - KST);
}

/** 실패한 뒤 다시 시도할 때까지 기다리는 시간(분): 주기와 2시간 중 짧은 쪽 */
export function retryAfterMin(job: Job): number {
  return Math.min(job.everyMin, 2 * HOUR);
}

export interface JobHistory {
  /** 마지막으로 성공한 시각 */
  lastOkAt: Date | null;
  /** 마지막 시도(성공·실패 모두)의 시작 시각과 결과 */
  lastAt: Date | null;
  lastStatus: string | null;
}

export interface DueState {
  due: boolean;
  /** 다음에 실행될 시각 (이미 때가 됐으면 지금보다 이전일 수 있음) */
  nextAt: Date;
  reason: string;
}

/** 이 작업을 지금 실행할 때가 됐는지 */
export function dueState(job: Job, h: JobHistory, now: Date): DueState {
  if (h.lastStatus === "quota" && h.lastAt && h.lastAt >= startOfKstDay(now)) {
    const tomorrow = new Date(startOfKstDay(now).getTime() + 24 * 3600_000);
    return { due: false, nextAt: tomorrow, reason: "기관이 '하루 한도 초과'로 답함 → 한국 자정 뒤 다시" };
  }
  if ((h.lastStatus === "failed" || h.lastStatus === "quota") && h.lastAt) {
    const retryAt = new Date(h.lastAt.getTime() + retryAfterMin(job) * MIN);
    if (retryAt > now) return { due: false, nextAt: retryAt, reason: "지난번 실패 → 잠시 뒤 다시 시도" };
    return { due: true, nextAt: retryAt, reason: "지난번 실패 → 다시 시도" };
  }
  if (!h.lastOkAt) return { due: true, nextAt: now, reason: "아직 자동 수집 기록이 없음 → 처음 실행" };
  const nextAt = new Date(h.lastOkAt.getTime() + job.everyMin * MIN);
  if (nextAt.getTime() - SLACK_MIN * MIN <= now.getTime()) return { due: true, nextAt, reason: `주기(${everyText(job.everyMin)})가 됨` };
  return { due: false, nextAt, reason: `주기 전 (${everyText(job.everyMin)}마다)` };
}

/** 오늘 이 기관에 자동 수집이 더 쓸 수 있는 호출 수 */
export function remainingCalls(agency: Agency, usedToday: number): number {
  return Math.max(0, Math.floor(agency.dailyLimit * agency.safety) - usedToday);
}

/** 1440 → '하루', 10080 → '7일', 60 → '1시간' */
export function everyText(min: number): string {
  if (min % DAY === 0) return min === DAY ? "하루" : `${min / DAY}일`;
  if (min % HOUR === 0) return `${min / HOUR}시간`;
  return `${min}분`;
}

export type Decision =
  | { run: true; cap: number; reason: string }
  | { run: false; reason: string; nextAt?: Date };

/**
 * 한 작업의 실행 여부를 정하는 규칙 (스케줄러와 테스트가 같은 함수를 씀)
 *   1) 인증키가 없으면 건너뜀   2) 기관이 오늘 '한도 초과'로 답했으면 자정까지 건너뜀
 *   3) 같은 회차 앞 단계가 실패했으면 건너뜀   4) 주기가 안 됐으면 건너뜀(force 면 무시)
 *   5) 오늘 남은 호출 수가 예상보다 적으면 건너뜀(force 여도 지킴)
 */
export function decide(
  job: Job,
  ctx: {
    hasKey: boolean;
    /** 이 기관이 오늘 한 번이라도 '하루 한도 초과'로 답했는지 */
    agencyBlocked: boolean;
    failedThisRound: Set<string>;
    history: JobHistory;
    usedToday: number;
    now: Date;
    force: boolean;
  },
): Decision {
  const agency = AGENCIES[job.agency];
  const tomorrow = new Date(startOfKstDay(ctx.now).getTime() + 24 * 3600_000);
  if (!ctx.hasKey) return { run: false, reason: `인증키 없음 (${agency.keyEnv})` };
  if (ctx.agencyBlocked) return { run: false, reason: "기관이 오늘 '하루 한도 초과'로 답함 → 한국 자정 뒤 다시", nextAt: tomorrow };
  const failedDep = job.after?.find((d) => ctx.failedThisRound.has(d));
  if (failedDep) return { run: false, reason: `앞 단계(${failedDep})가 이번에 실패해서 건너뜀` };
  const state = dueState(job, ctx.history, ctx.now);
  if (!state.due && !ctx.force) return { run: false, reason: state.reason, nextAt: state.nextAt };
  const left = remainingCalls(agency, ctx.usedToday);
  if (left < job.estCalls) {
    return { run: false, reason: `오늘 남은 호출 ${left}회 < 예상 ${job.estCalls}회 → 내일 다시`, nextAt: tomorrow };
  }
  return { run: true, cap: Math.min(job.maxCalls, left), reason: ctx.force && !state.due ? "강제 실행 (--force)" : state.reason };
}
