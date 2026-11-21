"use client";

/**
 * CommunityFeed — 자유 게시판 (실데이터)
 *  - 로그인 사용자가 글·답글 작성, 본인 글 삭제
 *  - 서버사이드 모더레이션: 혐오 표현 → 블라인드, 수치·사실 주장 → 검증 중
 *  - 비로그인은 읽기만 가능, 글쓰기 시 로그인 유도
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Activity, BadgeCheck, EyeOff, Heart, Loader2, MessageCircle, Reply, ScrollText, Send, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useComments, useUser, postComment, deleteComment, type ApiComment } from "@/lib/api";
import { useSWRConfig } from "swr";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { GlossaryText } from "./glossary-text";

const BOARD_KEY = "/comments?target_type=post&target_id=board";

/** 작성자 이름 → 일관된 hue (아바타 색) */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / (60 * 24))}일 전`;
}

function TagBadge({ c }: { c: ApiComment }) {
  if (c.isBlinded) {
    return (
      <Badge tone="bad" title="AI 블라인드">
        <ShieldAlert className="size-3" /> AI 블라인드
      </Badge>
    );
  }
  if (c.isUnderReview) {
    return (
      <Badge tone="warn" title="사실 검증 중">
        <Loader2 className="size-3 animate-spin" /> 검증 중
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <ShieldCheck className="size-3" /> 클린
    </Badge>
  );
}

function Avatar({ name, blinded }: { name: string; blinded?: boolean }) {
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-canvas"
      style={{ background: `hsl(${hueOf(name)} 70% 70%)` }}
    >
      {blinded ? "?" : name.slice(0, 1)}
    </span>
  );
}

function CommentItem({
  c,
  isReply,
  onReply,
  currentUserId,
}: {
  c: ApiComment;
  isReply?: boolean;
  onReply: (parentId: string) => void;
  currentUserId?: string;
}) {
  const { mutate } = useSWRConfig();
  const [deleting, setDeleting] = React.useState(false);
  const mine = currentUserId === c.userId;
  const blinded = c.isBlinded;

  const handleDelete = async () => {
    if (!confirm("삭제하시겠습니까?")) return;
    setDeleting(true);
    // 낙관적 삭제
    await mutate(
      BOARD_KEY,
      (prev?: ApiComment[]) => prev?.filter((x) => x.id !== c.id && x.parentId !== c.id),
      { revalidate: false },
    );
    const res = await deleteComment(c.id);
    if (!res.ok) {
      alert(res.error ?? "삭제 실패");
      await mutate(BOARD_KEY); // 복구
    }
    setDeleting(false);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-xl border p-3",
        isReply && "ml-6 border-l-2 border-l-line",
        blinded ? "border-bad/20 bg-bad/[0.04]" : "border-line bg-white/[0.02]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={c.author} blinded={blinded} />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{blinded ? "비공개 사용자" : c.author}</p>
            <p className="text-[10px] text-ink-3">{timeAgo(c.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TagBadge c={c} />
          {mine && !blinded && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-label="삭제"
              className="grid size-6 place-items-center rounded-full text-ink-3 transition hover:bg-bad/[0.1] hover:text-bad disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {blinded ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2.5 text-xs text-ink-3">
          <EyeOff className="size-3.5 shrink-0 text-bad" />
          <span>[AI 블라인드 처리됨] 커뮤니티 가이드라인에 따라 게시글이 숨겨졌습니다.</span>
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          <GlossaryText text={c.body} />
        </p>
      )}

      {!blinded && !isReply && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-3">
          <button
            onClick={() => onReply(c.id)}
            className="flex items-center gap-1 transition hover:text-ink"
          >
            <Reply className="size-3" /> 답글
          </button>
        </div>
      )}
    </motion.li>
  );
}

/** 글쓰기 입력 폼 (부모 글 / 답글 공용) */
function CommentForm({
  targetType,
  targetId,
  parentId,
  placeholder,
  onDone,
  autoFocus,
}: {
  targetType: "post" | "news" | "politician";
  targetId: string;
  parentId?: string | null;
  placeholder: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const { data: user } = useUser();
  const { mutate } = useSWRConfig();
  const [text, setText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  if (!user) {
    return (
      <div className="flex items-center justify-between rounded-full border border-line bg-white/[0.02] py-1.5 pl-4 pr-2">
        <span className="text-[12px] text-ink-3">로그인 후 작성할 수 있습니다</span>
        <Link
          href="/login"
          className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-canvas transition hover:bg-white"
        >
          로그인
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await postComment({ targetType, targetId, body, parentId: parentId ?? null });
    if ("error" in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    // 낙관적 추가: 새 댓글을 목록에 붙임
    await mutate(
      `/comments?target_type=${targetType}&target_id=${encodeURIComponent(targetId)}`,
      (prev?: ApiComment[]) => [...(prev ?? []), result],
      { revalidate: false },
    );
    setText("");
    setSubmitting(false);
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-white/[0.03] p-2 focus-within:border-lime/40">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          rows={2}
          className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-lime text-canvas transition hover:bg-lime-2 disabled:opacity-40"
          aria-label="게시"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" />}
        </button>
      </div>
      <div className="flex items-center justify-between px-1">
        {error ? (
          <span className="text-[11px] text-bad">{error}</span>
        ) : (
          <span className="text-[10px] text-ink-3">Ctrl+Enter 로 게시 · AI 모더레이션 적용</span>
        )}
        <span className="text-[10px] text-ink-3 tabular">{text.length}/500</span>
      </div>
    </form>
  );
}

/** showStats: 카드 위 블라인드·검증 중·클린 칸. 커뮤니티 탭은 옆 통계 카드와 겹쳐 끔 */
export function CommunityFeed({ className, showStats = true }: { className?: string; showStats?: boolean }) {
  const { data: comments, isLoading } = useComments("post", "board");
  const { data: user } = useUser();
  const [replyTo, setReplyTo] = React.useState<string | null>(null);

  // 부모 글(최신순) + 각 글의 답글(오래된순) 그룹핑
  const parents = (comments ?? []).filter((c) => !c.parentId).reverse(); // 최신 부모 글 먼저
  const repliesOf = (parentId: string) =>
    (comments ?? []).filter((c) => c.parentId === parentId); // 오래된순 (이미 정렬됨)

  // 통계
  const blinded = (comments ?? []).filter((c) => c.isBlinded).length;
  const review = (comments ?? []).filter((c) => c.isUnderReview).length;
  const clean = (comments ?? []).length - blinded - review;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<ShieldCheck className="size-4 text-lime" />}
        title={
          <span className="flex items-center gap-2">
            자유 게시판 <Badge tone="lime">AI 클린</Badge>
          </span>
        }
        subtitle="정치 전반의 의견을 나눕니다 · AI가 혐오 표현을 걸러내고 사실 주장을 검증합니다"
      />

      {showStats && (
        <div className="mx-5 mt-3 grid grid-cols-3 gap-2">
          {[
            { k: "블라인드", v: blinded, c: "text-bad" },
            { k: "검증 중", v: review, c: "text-warn" },
            { k: "클린", v: clean, c: "text-good" },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-line bg-white/[0.02] px-2.5 py-2">
              <p className="text-[10px] text-ink-3">{s.k}</p>
              <p className={cn("text-sm font-semibold tabular", s.c)}>{s.v.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* 글쓰기 */}
      <div className="mx-5 mt-3">
        <CommentForm targetType="post" targetId="board" placeholder="의견을 남겨주세요 (AI 모더레이션 적용)" />
      </div>

      {/* 글 목록 */}
      <ul className="mt-3 flex-1 space-y-2 overflow-y-auto px-5 pb-5 scroll-thin">
        {isLoading && <p className="py-8 text-center text-xs text-ink-3">불러오는 중…</p>}
        {!isLoading && parents.length === 0 && (
          <li className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-ink-3">
            아직 글이 없습니다. 첫 의견을 남겨보세요.
          </li>
        )}
        <AnimatePresence initial={false}>
          {parents.map((p) => (
            <React.Fragment key={p.id}>
              <CommentItem c={p} onReply={(id) => setReplyTo((v) => (v === id ? null : id))} currentUserId={user?.id} />
              {repliesOf(p.id).map((r) => (
                <CommentItem key={r.id} c={r} isReply onReply={() => {}} currentUserId={user?.id} />
              ))}
              <AnimatePresence>
                {replyTo === p.id && (
                  <motion.li
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="ml-6 overflow-hidden"
                  >
                    <div className="pt-1">
                      <CommentForm
                        targetType="post"
                        targetId="board"
                        parentId={p.id}
                        placeholder={`${p.author}에게 답글`}
                        autoFocus
                        onDone={() => setReplyTo(null)}
                      />
                    </div>
                  </motion.li>
                )}
              </AnimatePresence>
            </React.Fragment>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}

/* ── Community 탭 우측 위젯 ──────────────────────────── */

/** 게시판 통계 — 오늘 글 수·블라인드·검증 중·클린 분포 */
export function CommunityStatsCard() {
  const { data: comments } = useComments("post", "board");
  const all = comments ?? [];
  const today = all.filter((c) => {
    const d = new Date(c.createdAt);
    return d.toDateString() === new Date().toDateString();
  });
  const blinded = all.filter((c) => c.isBlinded).length;
  const review = all.filter((c) => c.isUnderReview).length;
  const clean = all.length - blinded - review;
  const total = all.length || 1;

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<Activity className="size-4 text-lime" />}
        title="게시판 통계"
        subtitle={`전체 ${all.length}개 글 · 오늘 ${today.length}개`}
      />
      <div className="grid grid-cols-3 gap-2 p-5 pt-3">
        {[
          { k: "클린", v: clean, c: "text-good" },
          { k: "검증 중", v: review, c: "text-warn" },
          { k: "블라인드", v: blinded, c: "text-bad" },
        ].map((s) => (
          <div key={s.k} className="rounded-lg border border-line bg-white/[0.02] px-2.5 py-2 text-center">
            <p className={cn("text-base font-semibold tabular", s.c)}>{s.v}</p>
            <p className="mt-0.5 text-[10px] text-ink-3">{s.k}</p>
          </div>
        ))}
      </div>
      {/* 클린 비율 바 */}
      <div className="px-5 pb-5">
        <div className="mb-1 flex items-center justify-between text-[10px] text-ink-3">
          <span>클린 지수</span>
          <span className="tabular">{all.length ? `${Math.round((clean / total) * 100)}%` : "—"}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="bg-good" style={{ width: `${(clean / total) * 100}%` }} />
          <div className="bg-warn" style={{ width: `${(review / total) * 100}%` }} />
          <div className="bg-bad" style={{ width: `${(blinded / total) * 100}%` }} />
        </div>
      </div>
    </Card>
  );
}

/** 커뮤니티 가이드라인 — 이용 수칙 + 모더레이션 설명 */
export function CommunityGuideCard() {
  const rules = [
    { icon: "🤝", title: "존중하는 표현", desc: "인신공격·비하 표현은 AI가 자동 블라인드 처리합니다." },
    { icon: "📊", title: "출처 명시", desc: "수치·사실 주장은 '검증 중' 표시 후 출처 대조를 거칩니다." },
    { icon: "🔗", title: "원문 링크", desc: "뉴스·법안 원문 URL을 함께 올리면 신뢰도가 올라갑니다." },
  ];
  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<ScrollText className="size-4 text-cyan" />}
        title="커뮤니티 가이드"
        subtitle="건전한 토론을 위한 운영 원칙"
      />
      <ul className="space-y-2.5 p-5 pt-3">
        {rules.map((r) => (
          <li key={r.title} className="flex gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-sm">
              {r.icon}
            </span>
            <div>
              <p className="text-[13px] font-semibold">{r.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">{r.desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-line px-5 py-3">
        <p className="text-[10px] leading-relaxed text-ink-3">
          AI 모더레이션은 현재 키워드 필터로 동작합니다. 추후 팩트체크 AI 연동 시 사실 검증이 자동화됩니다.
        </p>
      </div>
    </Card>
  );
}
