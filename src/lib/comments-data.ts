import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { comments, users } from "@/db/schema";
import { getCurrentUser } from "./dal";

export type CommentTarget = "post" | "news" | "politician";

/** 클라이언트에 보낼 댓글 한 줄 (작성자 name 포함, email 미포함) */
export interface CommentRow {
  id: string;
  body: string;
  author: string;
  userId: string;
  parentId: string | null;
  isBlinded: boolean;
  isUnderReview: boolean;
  createdAt: string;
}

/* ── 모더레이션 (서버사이드 기본 필터) ──────────────────
 * 실서비스에서는 FastAPI /moderate 엔드포인트로 교체.
 * 지금은 단순 키워드 필터로 저장 시점에 태깅.
 */
const HATE_WORDS = ["멍청", "꺼져", "벌레", "쓰레기", "죽어", "병신", " retard"];

function moderate(body: string): { isBlinded: boolean; isUnderReview: boolean } {
  if (HATE_WORDS.some((w) => body.includes(w))) {
    return { isBlinded: true, isUnderReview: false };
  }
  // URL 이나 수치·사실 주장 포함 → 검증 중
  if (/https?:\/\//i.test(body) || /\d/.test(body) || /사실|출처|통계|조사/.test(body)) {
    return { isBlinded: false, isUnderReview: true };
  }
  return { isBlinded: false, isUnderReview: false };
}

function requireDb() {
  if (!db) throw new Error("DB 가 연결되지 않았습니다. DATABASE_URL 을 확인하세요.");
  return db;
}

/** 특정 대상의 댓글 목록. 부모 글은 최신순, 답글은 오래된순. */
export async function getComments(targetType: CommentTarget, targetId: string): Promise<CommentRow[]> {
  const d = requireDb();
  const rows = await d
    .select({
      id: comments.id,
      body: comments.body,
      author: users.name,
      userId: comments.userId,
      parentId: comments.parentId,
      isBlinded: comments.isBlinded,
      isUnderReview: comments.isUnderReview,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId)))
    .orderBy(comments.createdAt); // 오래된순 — UI 에서 부모/답글 정렬

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** 댓글 작성. 로그인 필수. 모더레이션 적용 후 저장. */
export async function createComment(opts: {
  targetType: CommentTarget;
  targetId: string;
  body: string;
  parentId?: string | null;
}): Promise<CommentRow | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const body = opts.body.trim();
  if (!body) return { error: "내용을 입력하세요." };
  if (body.length > 500) return { error: "500자 이하로 작성하세요." };

  const d = requireDb();
  const { isBlinded, isUnderReview } = moderate(body);
  const id = randomUUID();

  const [row] = await d
    .insert(comments)
    .values({
      id,
      userId: user.id,
      targetType: opts.targetType,
      targetId: opts.targetId,
      parentId: opts.parentId ?? null,
      body,
      isBlinded,
      isUnderReview,
    })
    .returning({
      id: comments.id,
      body: comments.body,
      parentId: comments.parentId,
      isBlinded: comments.isBlinded,
      isUnderReview: comments.isUnderReview,
      createdAt: comments.createdAt,
    });

  return {
    id: row.id,
    body: row.body,
    author: user.name,
    userId: user.id,
    parentId: row.parentId,
    isBlinded: row.isBlinded,
    isUnderReview: row.isUnderReview,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 댓글 삭제. 본인만 가능. 답글이 있으면 cascade 로 같이 삭제됨. */
export async function deleteComment(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const d = requireDb();
  // 본인 글인지 확인
  const [mine] = await d
    .select({ userId: comments.userId })
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!mine) return { ok: false, error: "댓글이 없습니다." };
  if (mine.userId !== user.id) return { ok: false, error: "본인 글만 삭제할 수 있습니다." };

  await d.delete(comments).where(eq(comments.id, id));
  return { ok: true };
}
