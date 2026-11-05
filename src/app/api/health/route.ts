import { sql } from "@/server/db";

export const dynamic = "force-dynamic"; // 항상 DB 에서 새로 읽기

/** GET /api/health — 서버와 DB 연결 확인 */
export async function GET() {
  const [row] = await sql`select count(*)::int as regions from regions`;
  return Response.json({ ok: true, regions: row.regions });
}
