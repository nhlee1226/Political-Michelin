import { getCurrentUser } from "@/lib/dal";
import { deleteComment } from "@/lib/comments-data";

export const dynamic = "force-dynamic";

/** DELETE /api/comments/[id] — 댓글 삭제 (본인만) */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const result = await deleteComment(id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
