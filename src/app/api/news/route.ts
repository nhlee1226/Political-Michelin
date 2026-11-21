import { db } from "@/db";
import { apiNews, apiNewsPage, NEWS_FILTERS, type NewsFilter } from "@/db/ui-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/news?region=11&limit=20&analyzed=1 — 뉴스 피드 (배열)
 * 제목·요약·링크 + AI 분석이 있으면 편향 방향(lean)·확신 정도·근거. analyzed=1 이면 분석된 기사만
 *
 * GET /api/news?page=3&pageSize=20&filter=right&region=11 — 뉴스 리포트 페이지 넘김용
 *   filter: all | analyzed | right(보수 쪽) | left(진보 쪽) | neutral(균형) | range(&leanMin=-30&leanMax=10)
 * { items, total, page, pages, pageSize, counts: { total, analyzed, right, left, neutral, range } }
 */
export async function GET(req: Request) {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  const q = new URL(req.url).searchParams;
  if (q.has("page")) {
    const f = q.get("filter") as NewsFilter;
    const filter = NEWS_FILTERS.includes(f) ? f : "all";
    const page = Math.max(1, Math.floor(Number(q.get("page")) || 1));
    const pageSize = Math.min(Math.max(1, Math.floor(Number(q.get("pageSize")) || 20)), 100);
    // filter=range 일 때 lean 범위 (-100 진보 ~ +100 보수)
    const lean = (key: string, fallback: number) => {
      const v = Math.round(Number(q.get(key) ?? fallback));
      return Number.isFinite(v) ? Math.min(100, Math.max(-100, v)) : fallback;
    };
    const [a, b] = [lean("leanMin", -100), lean("leanMax", 100)];
    return Response.json(
      await apiNewsPage(q.get("region"), filter, page, pageSize, Math.min(a, b), Math.max(a, b)),
    );
  }
  const limit = Math.min(Number(q.get("limit") ?? 20) || 20, 100);
  return Response.json(await apiNews(q.get("region"), limit, q.get("analyzed") === "1"));
}
