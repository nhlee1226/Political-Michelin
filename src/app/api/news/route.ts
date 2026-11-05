import { getNews } from "@/server/queries";

export const dynamic = "force-dynamic";

/** GET /api/news?region=11&limit=20 — 뉴스 피드 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const limit = Math.min(Number(q.get("limit") ?? 20) || 20, 100);
  return Response.json(await getNews(q.get("region"), limit));
}
