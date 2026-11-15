import { NextResponse, type NextRequest } from "next/server";
import { decrypt } from "@/lib/auth";

const PROTECTED = ["/my", "/admin"];
const PUBLIC_AUTH = ["/login", "/register"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path.startsWith(p));
  const isPublicAuth = PUBLIC_AUTH.includes(path);
  if (!isProtected && !isPublicAuth) return NextResponse.next();

  // 쿠키에서 세션 낙관적 검사 (DB 조회 X — 미들웨어는 가볍게)
  const token = req.cookies.get("pm-session")?.value;
  const session = await decrypt(token);

  // 보호 라우트: 미인증 → 로그인
  if (isProtected && !session?.userId) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // 인증된 상태로 로그인/회원가입 접근 → 홈으로
  if (isPublicAuth && session?.userId) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
