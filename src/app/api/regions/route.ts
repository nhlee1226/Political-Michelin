import { getRegionStats } from "@/db/queries";

export const dynamic = "force-dynamic";

/** GET /api/regions — 시도 17개: 의석·투표율(선관위) + 이슈 활성도(최근 24시간 기사 수) */
export async function GET() {
  return Response.json(await getRegionStats());
}
