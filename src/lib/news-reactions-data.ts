import "server-only";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, newsArticles, newsReactions } from "@/db/schema";
import { getCurrentUser } from "./dal";

/** 기사 한 건의 댓글 수 · 좋아요/싫어요 수 · 내 반응 */
export interface NewsSocial {
  comments: number;
  /** news_reactions 표가 아직 없으면 null → 화면에서 버튼을 숨김 */
  likes: number | null;
  dislikes: number | null;
  /** 1 좋아요 · -1 싫어요 · 0 안 누름 (비로그인도 0) */
  mine: -1 | 0 | 1;
}

export type ReactionValue = -1 | 0 | 1;

function requireDb() {
  if (!db) throw new Error("DB 가 연결되지 않았습니다. DATABASE_URL 을 확인하세요.");
  return db;
}

/** 표가 없을 때(마이그레이션 전) Postgres 오류 42P01 — 뉴스 목록·댓글은 그대로 두고 반응만 숨기려고 구분 */
function isMissingTable(e: unknown) {
  const cause = (e as { cause?: { code?: string }; code?: string }) ?? {};
  return cause.code === "42P01" || cause.cause?.code === "42P01";
}

/**
 * 여러 기사의 댓글 수·반응 수를 한 번에 (뉴스 리포트 한 페이지 = 최대 100건).
 * 댓글 수는 블라인드된 글까지 포함 — 댓글 탭을 열면 블라인드 글도 "숨김 처리됨"으로 보이므로 숫자를 맞춤
 */
export async function getNewsSocial(ids: string[]): Promise<Record<string, NewsSocial>> {
  const d = requireDb();
  const out: Record<string, NewsSocial> = {};
  for (const id of ids) out[id] = { comments: 0, likes: 0, dislikes: 0, mine: 0 };
  if (!ids.length) return out;

  const commentRows = await d
    .select({ id: comments.targetId, n: count() })
    .from(comments)
    .where(and(eq(comments.targetType, "news"), inArray(comments.targetId, ids)))
    .groupBy(comments.targetId);
  for (const r of commentRows) out[r.id].comments = r.n;

  try {
    const reactionRows = await d
      .select({
        id: newsReactions.newsId,
        likes: sql<number>`(count(*) filter (where ${newsReactions.value} = 1))::int`,
        dislikes: sql<number>`(count(*) filter (where ${newsReactions.value} = -1))::int`,
      })
      .from(newsReactions)
      .where(inArray(newsReactions.newsId, ids))
      .groupBy(newsReactions.newsId);
    for (const r of reactionRows) Object.assign(out[r.id], { likes: r.likes, dislikes: r.dislikes });

    const user = await getCurrentUser();
    if (user) {
      const mine = await d
        .select({ id: newsReactions.newsId, value: newsReactions.value })
        .from(newsReactions)
        .where(and(eq(newsReactions.userId, user.id), inArray(newsReactions.newsId, ids)));
      for (const r of mine) out[r.id].mine = r.value === 1 ? 1 : -1;
    }
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    for (const id of ids) Object.assign(out[id], { likes: null, dislikes: null });
  }
  return out;
}

/**
 * 좋아요(1)·싫어요(-1) 누르기, 0 이면 취소. 로그인 필수. 바뀐 뒤 그 기사의 숫자를 돌려줌
 */
export async function setNewsReaction(newsId: string, value: ReactionValue): Promise<NewsSocial | { error: string; status: number }> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다.", status: 401 };
  const d = requireDb();

  const [exists] = await d.select({ id: newsArticles.id }).from(newsArticles).where(eq(newsArticles.id, newsId)).limit(1);
  if (!exists) return { error: "없는 기사입니다.", status: 404 };

  try {
    if (value === 0) {
      await d.delete(newsReactions).where(and(eq(newsReactions.userId, user.id), eq(newsReactions.newsId, newsId)));
    } else {
      await d
        .insert(newsReactions)
        .values({ userId: user.id, newsId, value })
        .onConflictDoUpdate({ target: [newsReactions.userId, newsReactions.newsId], set: { value, createdAt: sql`now()` } });
    }
  } catch (e) {
    if (isMissingTable(e)) return { error: "좋아요 기능을 준비 중입니다.", status: 503 };
    throw e;
  }
  return (await getNewsSocial([newsId]))[newsId];
}
