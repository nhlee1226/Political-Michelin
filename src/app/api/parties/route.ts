import { db } from "@/db";
import { apiParties } from "@/db/ui-api";

export const dynamic = "force-dynamic";

/** GET /api/parties — 정당 이름·색(중립 팔레트) */
export async function GET() {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  return Response.json(await apiParties());
}
