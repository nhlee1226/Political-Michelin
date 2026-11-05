import { getRegions } from "@/server/queries";

export const dynamic = "force-dynamic";

/** GET /api/regions — 지도용: 시도 17개 + 이슈 활성도 */
export async function GET() {
  return Response.json(await getRegions());
}
