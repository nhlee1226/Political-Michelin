/** 자동 수집 기록(collect_log) 읽기·쓰기 — scripts/auto/run.ts 가 씀 */
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../../src/db/client";
import { collectLog } from "../../src/db/schema";
import type { AgencyId } from "../../src/lib/collect-schedule";
import { applySqlFile } from "../collectors/sql-file";

export { loadCollectState as loadState } from "../../src/db/collect-log";

/** 표가 없으면 만듦 (scripts/sql/add-collect-log.sql 을 그대로 실행, 여러 번 실행해도 안전) */
export async function ensureCollectLog(db: Db) {
  await applySqlFile(db, "add-collect-log.sql");
}

/** 시간 초과 등으로 끝을 못 맺은 줄은 실패로 정리 (그래야 다음 회차에 다시 시도) */
export async function closeStaleRuns(db: Db, now: Date) {
  await db
    .update(collectLog)
    .set({ status: "failed", message: "끝나지 못하고 멈춤 (시간 초과 등)", finishedAt: now })
    .where(and(eq(collectLog.status, "running"), lt(collectLog.startedAt, new Date(now.getTime() - 3600_000))));
}

export async function startRun(db: Db, v: { job: string; agency: AgencyId; trigger: string }): Promise<number> {
  const [row] = await db.insert(collectLog).values({ ...v, status: "running" }).returning({ id: collectLog.id });
  return row.id;
}

export async function finishRun(db: Db, id: number, v: { status: "ok" | "failed" | "quota"; calls: number; message: string }) {
  await db
    .update(collectLog)
    .set({ ...v, message: v.message.slice(0, 500), finishedAt: new Date() })
    .where(eq(collectLog.id, id));
}
