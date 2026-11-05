import { getLatestNews } from "@/db/queries";

export const dynamic = "force-dynamic";

/** GET /api/news?region=11&limit=20 — 네이버 뉴스 수집 기사 (최신순) */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const limit = Math.min(Number(q.get("limit") ?? 20) || 20, 200);
  return Response.json(await getLatestNews({ region: q.get("region"), limit }));
}
