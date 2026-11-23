import { db } from "@/db";
import { getNewsSocial, setNewsReaction, type ReactionValue } from "@/lib/news-reactions-data";

export const dynamic = "force-dynamic";

/** news_articles.id 는 원문 URL 의 SHA-1 — 이상한 값은 DB 에 보내지 않음 */
const ID = /^[0-9a-f]{40}$/;

/**
 * GET /api/news/reactions?ids=<id>,<id>… — 기사별 댓글 수 · 좋아요/싫어요 수 · 내 반응 (비로그인도 읽기 가능, mine 은 0)
 * { [id]: { comments, likes, dislikes, mine } } — 표가 아직 없으면 likes·dislikes 가 null
 */
export async function GET(req: Request) {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((s) => ID.test(s)))].slice(0, 100);
  return Response.json(await getNewsSocial(ids));
}

/** POST /api/news/reactions { newsId, value: 1 | -1 | 0 } — 좋아요·싫어요 (로그인 필수). 0 이면 취소 */
export async function POST(req: Request) {
  if (!db) return Response.json({ error: "DB 가 연결되지 않았습니다." }, { status: 503 });
  let body: { newsId?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { newsId, value } = body;
  if (typeof newsId !== "string" || !ID.test(newsId)) return Response.json({ error: "newsId 가 올바르지 않습니다." }, { status: 400 });
  if (value !== 1 && value !== -1 && value !== 0) return Response.json({ error: "value 는 1, -1, 0 중 하나입니다." }, { status: 400 });

  const result = await setNewsReaction(newsId, value as ReactionValue);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
