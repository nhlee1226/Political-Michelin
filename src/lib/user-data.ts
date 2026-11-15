import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, userBookmarks } from "@/db/schema";
import { getCurrentUser } from "./dal";

export type FollowKind = "region" | "politician";

/** db null 가드 — 화면 코드는 DATABASE_URL 이 없으면 mock 로 동작하지만, 인증 기능은 DB 필수 */
function requireDb() {
  if (!db) throw new Error("DB 가 연결되지 않았습니다. DATABASE_URL 을 확인하세요.");
  return db;
}

/** 현재 로그인 사용자의 모든 팔로우·북마크 (비로그인이면 null) */
export async function getUserItems() {
  const user = await getCurrentUser();
  if (!user) return null;
  const d = requireDb();

  const follows = await d
    .select({ kind: userFollows.kind, targetId: userFollows.targetId })
    .from(userFollows)
    .where(eq(userFollows.userId, user.id));

  const bookmarks = await d
    .select({ newsId: userBookmarks.newsId })
    .from(userBookmarks)
    .where(eq(userBookmarks.userId, user.id));

  return {
    regions: follows.filter((f) => f.kind === "region").map((f) => f.targetId),
    politicians: follows.filter((f) => f.kind === "politician").map((f) => f.targetId),
    news: bookmarks.map((b) => b.newsId),
  };
}

/** 팔로우 토글. 현재 상태를 반환 (true = 팔로우 중) */
export async function toggleFollow(kind: FollowKind, targetId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const d = requireDb();

  const existing = await d
    .select({ userId: userFollows.userId })
    .from(userFollows)
    .where(and(eq(userFollows.userId, user.id), eq(userFollows.kind, kind), eq(userFollows.targetId, targetId)))
    .limit(1);

  if (existing.length) {
    await d
      .delete(userFollows)
      .where(and(eq(userFollows.userId, user.id), eq(userFollows.kind, kind), eq(userFollows.targetId, targetId)));
    return false;
  }
  await d.insert(userFollows).values({ userId: user.id, kind, targetId });
  return true;
}

/** 뉴스 북마크 토글. 현재 상태를 반환 (true = 저장됨) */
export async function toggleBookmark(newsId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const d = requireDb();

  const existing = await d
    .select({ userId: userBookmarks.userId })
    .from(userBookmarks)
    .where(and(eq(userBookmarks.userId, user.id), eq(userBookmarks.newsId, newsId)))
    .limit(1);

  if (existing.length) {
    await d
      .delete(userBookmarks)
      .where(and(eq(userBookmarks.userId, user.id), eq(userBookmarks.newsId, newsId)));
    return false;
  }
  await d.insert(userBookmarks).values({ userId: user.id, newsId });
  return true;
}

