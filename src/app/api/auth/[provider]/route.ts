import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl, isConfigured, isProvider, redirectUri, STATE_COOKIE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/kakao · /api/auth/naver — 소셜 로그인 시작.
 * 위조 방지용 state 를 쿠키에 넣고 제공자 로그인 화면으로 보냄.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/auth/[provider]">) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not Found", { status: 404 });
  if (!isConfigured(provider)) {
    return NextResponse.redirect(new URL(`/login?error=${provider}_not_configured`, req.url));
  }

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(provider, redirectUri(provider, req.url), state));
  res.cookies.set(STATE_COOKIE, `${provider}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // 제공자에서 돌아오는 최상위 이동(GET)에는 쿠키가 실림
    path: "/api/auth",
    maxAge: 10 * 60,
  });
  return res;
}
