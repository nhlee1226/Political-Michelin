import { db } from "@/db";
import { apiSchedule } from "@/db/assembly-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/schedule — 빠른 메뉴 "국회 일정" (어제부터 앞으로의 본회의·위원회 회의·행사, 날짜·시간 순)
 * 일정 수집기(scripts/collectors/schedule.ts)가 아직 돌기 전이면 { ready: false, rows: [] }.
 */
export async function GET() {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 표시할 수 없습니다" }, { status: 503 });
  return Response.json(await apiSchedule());
}
