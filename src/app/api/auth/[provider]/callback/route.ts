import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, findOrCreateSocialUser } from "@/lib/auth";
import { fetchProfile, isConfigured, isProvider, redirectUri, STATE_COOKIE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/{provider}/callback?code&state — 제공자에서 돌아오는 곳.
 * state 확인 → 토큰·프로필 → 사용자 찾기/만들기 → 세션 쿠키 → 홈.
 * 실패하면 /login?error=… 로 보내 화면에 이유를 보여 줌.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/auth/[provider]/callback">) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not Found", { status: 404 });

  const cookieStore = await cookies();
  const saved = cookieStore.get(STATE_COOKIE)?.value ?? "";
  // state 는 한 번만 씀
  cookieStore.delete({ name: STATE_COOKIE, path: "/api/auth" });

  if (!isConfigured(provider)) redirect(`/login?error=${provider}_not_configured`);
  const q = new URL(req.url).searchParams;
  // 사용자가 동의 화면에서 취소
  if (q.get("error")) redirect("/login?error=cancelled");

  const code = q.get("code");
  const state = q.get("state") ?? "";
  const expected = `${provider}:${state}`;
  const sameState =
    !!state && saved.length === expected.length && timingSafeEqual(Buffer.from(saved), Buffer.from(expected));
  if (!code || !sameState) redirect("/login?error=state");

  let ok = false;
  try {
    const profile = await fetchProfile(provider, code, state, redirectUri(provider, req.url));
    const user = await findOrCreateSocialUser(profile);
    await createSession(user.id, user.role);
    ok = true;
  } catch (e) {
    console.error(`[oauth:${provider}]`, e);
  }
  // redirect() 는 예외로 동작하므로 try 밖에서
  redirect(ok ? "/" : "/login?error=failed");
}
