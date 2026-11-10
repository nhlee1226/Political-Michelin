import { db } from "@/db";
import { apiRegions } from "@/db/ui-api";

export const dynamic = "force-dynamic";

/** GET /api/regions — 지도용: 시도 17개 + 의석·투표율(선관위) + 이슈 활성도(최근 24시간 기사 수) */
export async function GET() {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  return Response.json(await apiRegions());
}
