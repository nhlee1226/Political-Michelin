import { getCurrentUser } from "@/lib/dal";
import { toggleBookmark } from "@/lib/user-data";

export const dynamic = "force-dynamic";

/** POST /api/user/bookmark — { newsId } 토글 → { active } */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { newsId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { newsId } = body;
  if (!newsId) return Response.json({ error: "newsId 가 필요합니다." }, { status: 400 });
  const active = await toggleBookmark(newsId);
  return Response.json({ active });
}
