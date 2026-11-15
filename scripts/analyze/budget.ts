/**
 * Claude API 예산 관리 (DB 없이 동작하는 순수 함수).
 *
 * 충전한 금액을 '기간 전체 총액'으로 보고, 남은 돈을 남은 날수로 고르게 나눠 하루에 쓸 수 있는 금액을 정한다.
 * 달력 한 달 기준이 아니다 — 다음 달 1일이 돼도 예산이 다시 채워지지 않는다(충전한 적 없는 돈을 쓰지 않게).
 * 기간이 끝나면 분석을 멈춘다. 다시 충전하면 .env.local / GitHub Secrets 의 ANALYZE_BUDGET_* 값을 바꾼다.
 *
 *   ANALYZE_BUDGET_USD    기간 전체에 쓸 금액 (기본 4.5 — 충전액 $5 에서 계산 오차 여유 $0.5)
 *   ANALYZE_BUDGET_FROM   시작일 (한국 날짜, 기본 2026-11-15)
 *   ANALYZE_BUDGET_UNTIL  종료일 — 이 날 0시부터 멈춤 (기본 2026-12-15)
 */
const KST = 9 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

export interface BudgetConfig {
  totalUsd: number;
  from: Date;
  until: Date;
}

/** 'YYYY-MM-DD'(한국 날짜) → 그날 한국 0시의 Date */
export function kstDate(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error(`날짜 형식이 아닙니다: ${ymd} (YYYY-MM-DD)`);
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - KST);
}

/** now 가 속한 한국 날짜의 0시 */
export function startOfKstDay(now: Date): Date {
  return new Date(Math.floor((now.getTime() + KST) / DAY) * DAY - KST);
}

export function readBudget(env: Record<string, string | undefined> = process.env): BudgetConfig {
  const totalUsd = Number(env.ANALYZE_BUDGET_USD ?? 4.5);
  if (!(totalUsd >= 0)) throw new Error(`ANALYZE_BUDGET_USD 가 숫자가 아닙니다: ${env.ANALYZE_BUDGET_USD}`);
  const from = kstDate(env.ANALYZE_BUDGET_FROM ?? "2026-11-15");
  const until = kstDate(env.ANALYZE_BUDGET_UNTIL ?? "2026-12-15");
  if (until <= from) throw new Error("ANALYZE_BUDGET_UNTIL 이 FROM 보다 늦어야 합니다");
  return { totalUsd, from, until };
}

export interface Allowance {
  /** 오늘 더 쓸 수 있는 금액 */
  todayUsd: number;
  /** 기간 전체에서 남은 금액 */
  remainingUsd: number;
  /** 0 이면 그 이유 */
  stop?: string;
}

/**
 * spentTotal: 기간 시작 이후 쓴 금액(오늘 포함), spentToday: 오늘(한국 날짜) 쓴 금액.
 * 오늘 몫 = (오늘 시작 시점에 남아 있던 금액 ÷ 오늘 포함 남은 날수) − 오늘 이미 쓴 금액.
 * 어제 덜 쓴 돈은 남은 날들에 자동으로 고르게 다시 나뉜다.
 */
export function allowance(cfg: BudgetConfig, spentTotal: number, spentToday: number, now: Date): Allowance {
  const remainingUsd = Math.max(0, cfg.totalUsd - spentTotal);
  if (now < cfg.from) return { todayUsd: 0, remainingUsd, stop: "예산 기간 시작 전" };
  if (now >= cfg.until) return { todayUsd: 0, remainingUsd, stop: "예산 기간이 끝남 (ANALYZE_BUDGET_UNTIL)" };
  if (remainingUsd <= 0) return { todayUsd: 0, remainingUsd, stop: "기간 예산을 다 씀" };
  const today = startOfKstDay(now);
  const daysLeft = Math.max(1, Math.round((cfg.until.getTime() - today.getTime()) / DAY));
  const atStartOfToday = cfg.totalUsd - (spentTotal - spentToday);
  const todayUsd = Math.min(remainingUsd, Math.max(0, atStartOfToday / daysLeft - spentToday));
  return todayUsd > 0 ? { todayUsd, remainingUsd } : { todayUsd: 0, remainingUsd, stop: "오늘 몫을 다 씀 (내일 다시)" };
}

/** 다음 기사 1건에 들 것으로 보는 금액: 최근 호출 중 가장 비싼 값(없으면 기본값) — 넉넉하게 잡아 넘치지 않게 */
export function estimateNext(recentCosts: number[], fallback = 0.01): number {
  return recentCosts.length ? Math.max(...recentCosts) : fallback;
}
