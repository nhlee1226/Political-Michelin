import { db } from "@/db";
import { apiNews } from "@/db/ui-api";

export const dynamic = "force-dynamic";

/** GET /api/news?region=11&limit=20 — 뉴스 피드 (제목·요약·링크, AI 분석이 있으면 편향 지수) */
export async function GET(req: Request) {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  const q = new URL(req.url).searchParams;
  const limit = Math.min(Number(q.get("limit") ?? 20) || 20, 100);
  return Response.json(await apiNews(q.get("region"), limit));
}
