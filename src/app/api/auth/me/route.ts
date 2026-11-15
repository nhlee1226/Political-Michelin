import { getCurrentUser } from "@/lib/dal";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — 현재 로그인한 사용자 (없으면 null) */
export async function GET() {
  const user = await getCurrentUser();
  return Response.json(user);
}
