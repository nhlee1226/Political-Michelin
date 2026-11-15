import { getCurrentUser } from "@/lib/dal";
import { toggleFollow, type FollowKind } from "@/lib/user-data";

export const dynamic = "force-dynamic";

/** POST /api/user/follow — { kind: "region"|"politician", targetId } 토글 → { active } */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { kind?: string; targetId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { kind, targetId } = body;
  if (!kind || !targetId || (kind !== "region" && kind !== "politician")) {
    return Response.json({ error: "kind 와 targetId 가 필요합니다." }, { status: 400 });
  }
  const active = await toggleFollow(kind as FollowKind, targetId);
  return Response.json({ active });
}
