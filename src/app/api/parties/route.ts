import { getParties } from "@/db/queries";

export const dynamic = "force-dynamic";

/** GET /api/parties — 정당 이름·색(중립 팔레트)·출처 */
export async function GET() {
  return Response.json(await getParties());
}
