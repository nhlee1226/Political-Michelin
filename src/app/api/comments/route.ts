import { getCurrentUser } from "@/lib/dal";
import { getComments, createComment, type CommentTarget } from "@/lib/comments-data";

export const dynamic = "force-dynamic";

const VALID: CommentTarget[] = ["post", "news", "politician"];

/** GET /api/comments?target_type=post&target_id=board — 댓글 목록 (비로그인도 읽기 가능) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const targetType = url.searchParams.get("target_type") as CommentTarget | null;
  const targetId = url.searchParams.get("target_id");

  if (!targetType || !VALID.includes(targetType)) {
    return Response.json({ error: "target_type 이 필요합니다." }, { status: 400 });
  }
  if (!targetId) {
    return Response.json({ error: "target_id 가 필요합니다." }, { status: 400 });
  }
  const rows = await getComments(targetType, targetId);
  return Response.json(rows);
}

/** POST /api/comments — 댓글 작성 (로그인 필수) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { targetType?: string; targetId?: string; body?: string; parentId?: string | null };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { targetType, targetId, body: text, parentId } = body;
  if (!targetType || !VALID.includes(targetType)) {
    return Response.json({ error: "target_type 이 올바르지 않습니다." }, { status: 400 });
  }
  if (!targetId) return Response.json({ error: "target_id 가 필요합니다." }, { status: 400 });
  if (typeof text !== "string") return Response.json({ error: "body 가 필요합니다." }, { status: 400 });

  const result = await createComment({
    targetType: targetType as CommentTarget,
    targetId,
    body: text,
    parentId: parentId ?? null,
  });

  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result, { status: 201 });
}
