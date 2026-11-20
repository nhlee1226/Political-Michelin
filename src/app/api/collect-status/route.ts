import { db } from "@/db";
import { collectStatus } from "@/db/collect-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/collect-status — 기관별 자동 수집 현황 (scripts/auto/run.ts 가 남긴 collect_log 기준)
 * 기관마다 성향·하루 호출 한도·오늘 쓴 호출 수, 작업마다 주기·마지막 성공·다음 예정, 그리고 최근 실행 20줄.
 * DB 나 표가 없으면 계획(기관·주기·한도)만 내려줌 (logReady: false). 키 값은 들어 있지 않음.
 */
export async function GET() {
  return Response.json(await collectStatus(db));
}
