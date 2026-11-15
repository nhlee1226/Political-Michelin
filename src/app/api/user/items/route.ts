import { getCurrentUser } from "@/lib/dal";
import { getUserItems } from "@/lib/user-data";

export const dynamic = "force-dynamic";

/** GET /api/user/items — 현재 사용자의 관심 지역·즐겨찾는 정치인·저장한 뉴스 (비로그인이면 null) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json(null);
  const items = await getUserItems();
  return Response.json(items);
}
