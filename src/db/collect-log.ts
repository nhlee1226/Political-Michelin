/**
 * 자동 수집 기록(collect_log) 조회 — 스케줄러(scripts/auto/run.ts)와 화면용 API(/api/collect-status)가 같은 계산을 씀.
 * 수집 스크립트도 import 하므로 server-only 를 넣지 않음 (db 는 인자로 받음).
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  AGENCIES,
  AGENCY_ORDER,
  JOBS,
  dueState,
  everyText,
  remainingCalls,
  startOfKstDay,
  type AgencyId,
  type JobHistory,
} from "../lib/collect-schedule";
import type { Db } from "./client";
import { collectLog } from "./schema";

const toDate = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string));

export interface LogState {
  history: Map<string, JobHistory>;
  usedToday: Map<AgencyId, number>;
  /** 오늘 '하루 한도 초과' 답을 받은 기관 */
  blockedToday: Set<AgencyId>;
}

export async function loadCollectState(db: Db, now: Date): Promise<LogState> {
  const today = startOfKstDay(now);
  const [lastRows, okRows, usedRows, quotaRows] = await Promise.all([
    db.execute<{ job: string; status: string; started_at: string }>(
      sql`select distinct on (job) job, status, started_at from collect_log order by job, started_at desc`,
    ),
    db
      .select({ job: collectLog.job, at: sql<string>`max(${collectLog.finishedAt})` })
      .from(collectLog)
      .where(eq(collectLog.status, "ok"))
      .groupBy(collectLog.job),
    db
      .select({ agency: collectLog.agency, n: sql<number>`coalesce(sum(${collectLog.calls}), 0)::int` })
      .from(collectLog)
      .where(gte(collectLog.startedAt, today))
      .groupBy(collectLog.agency),
    db
      .selectDistinct({ agency: collectLog.agency })
      .from(collectLog)
      .where(and(eq(collectLog.status, "quota"), gte(collectLog.startedAt, today))),
  ]);

  const ok = new Map(okRows.map((r) => [r.job, toDate(r.at)]));
  const history = new Map<string, JobHistory>();
  for (const r of lastRows) history.set(r.job, { lastOkAt: ok.get(r.job) ?? null, lastAt: toDate(r.started_at), lastStatus: r.status });
  return {
    history,
    usedToday: new Map(usedRows.map((r) => [r.agency as AgencyId, r.n])),
    blockedToday: new Set(quotaRows.map((r) => r.agency as AgencyId)),
  };
}

/**
 * 화면용 현황: 기관별(성향·하루 한도·오늘 호출) → 작업별(주기·마지막 성공·다음 예정) + 최근 실행 20줄.
 * db 가 없거나 표가 아직 없으면 계획(기관·주기·한도)만 내려줌 (logReady: false).
 */
export async function collectStatus(db: Db | null, now = new Date()) {
  let state: LogState = { history: new Map(), usedToday: new Map(), blockedToday: new Set() };
  let recent: (typeof collectLog.$inferSelect)[] = [];
  let logReady = false;
  if (db) {
    try {
      [state, recent] = await Promise.all([
        loadCollectState(db, now),
        db.select().from(collectLog).orderBy(desc(collectLog.startedAt)).limit(20),
      ]);
      logReady = true;
    } catch {
      /* collect_log 표가 아직 없음 → 첫 자동 수집 때 생김 */
    }
  }

  const jobName = new Map(JOBS.map((j) => [j.id, j.name]));
  return {
    generatedAt: now.toISOString(),
    logReady,
    agencies: AGENCY_ORDER.map((id) => {
      const a = AGENCIES[id];
      const used = state.usedToday.get(id) ?? 0;
      return {
        id,
        name: a.name,
        character: a.character,
        dailyLimit: a.dailyLimit,
        limitNote: a.limitNote,
        usable: Math.floor(a.dailyLimit * a.safety),
        usedToday: used,
        remainingToday: remainingCalls(a, used),
        blockedToday: state.blockedToday.has(id),
        jobs: JOBS.filter((j) => j.agency === id).map((j) => {
          const h = state.history.get(j.id) ?? { lastOkAt: null, lastAt: null, lastStatus: null };
          const d = dueState(j, h, now);
          return {
            id: j.id,
            name: j.name,
            every: everyText(j.everyMin),
            why: j.why,
            lastOkAt: h.lastOkAt?.toISOString() ?? null,
            lastAt: h.lastAt?.toISOString() ?? null,
            lastStatus: h.lastStatus,
            nextAt: d.nextAt.toISOString(),
          };
        }),
      };
    }),
    recent: recent.map((r) => ({
      job: r.job,
      jobName: jobName.get(r.job) ?? r.job,
      agency: r.agency,
      trigger: r.trigger,
      status: r.status,
      calls: r.calls,
      message: r.message,
      startedAt: toDate(r.startedAt)?.toISOString() ?? null,
      finishedAt: toDate(r.finishedAt)?.toISOString() ?? null,
    })),
  };
}
