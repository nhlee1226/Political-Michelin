import { getParties } from "@/server/queries";

export const dynamic = "force-dynamic";

/** GET /api/parties — 정당 이름·색 */
export async function GET() {
  return Response.json(await getParties());
}
