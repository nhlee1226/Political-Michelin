import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession, findUserById } from "./auth";

export type CurrentUser = { id: string; email: string; name: string; role: string };

/**
 * 세션 검증. 유효하지 않으면 /login 으로 리다이렉트.
 * 보호 라우트/서버 액션/라우트 핸들러에서 호출. React cache 로 render pass 내 중복 제거.
 */
export const verifySession = cache(async (): Promise<{ userId: string; role: string }> => {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }
  return { userId: session.userId, role: session.role };
});

/**
 * 현재 로그인한 사용자. 세션 없으면 null (보호 라우트가 아닌 곳에서 사용).
 * header 등 로그인/비로그인 모두 표시되는 UI 용.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session?.userId) return null;
  return findUserById(session.userId);
});
