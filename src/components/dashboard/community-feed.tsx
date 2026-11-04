"use client";

/**
 * CommunityFeed — AI 정제 클린 커뮤니티 "안전한 야차판"
 *  - 실시간 피드: 7초마다 새 글 유입 (WebSocket 연동 지점)
 *  - AI 클린 모니터링 태그: 블라인드 / 사실 검증 완료 / 검증 중
 *  - 글쓰기 시 모의 AI 모더레이션 (실서비스: FastAPI /moderate 엔드포인트로 교체)
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, EyeOff, Heart, Loader2, MessageCircle, Send, ShieldCheck, ShieldAlert } from "lucide-react";
import { COMMUNITY_POOL, COMMUNITY_SEED, type CommunityPost } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { GlossaryText } from "./glossary-text";

/** 데모용 모의 모더레이션 규칙 */
const HATE_WORDS = ["멍청", "꺼져", "벌레", "쓰레기", "죽어"];
function mockModerate(body: string): Pick<CommunityPost, "tag" | "tagDetail"> {
  if (HATE_WORDS.some((w) => body.includes(w))) return { tag: "blind", tagDetail: "혐오·비하 표현 감지" };
  if (/\d/.test(body) || /사실|출처|통계/.test(body)) return { tag: "review", tagDetail: "수치·사실 주장 감지 · 출처 대조 중" };
  return { tag: "clean" };
}

function TagBadge({ post }: { post: CommunityPost }) {
  switch (post.tag) {
    case "fact":
      return (
        <Badge tone="good" title={post.tagDetail}>
          <BadgeCheck className="size-3" /> 객관적 사실 검증 완료
        </Badge>
      );
    case "review":
      return (
        <Badge tone="warn" title={post.tagDetail}>
          <Loader2 className="size-3 animate-spin" /> 사실 검증 중
        </Badge>
      );
    case "blind":
      return (
        <Badge tone="bad" title={post.tagDetail}>
          <ShieldAlert className="size-3" /> AI 블라인드
        </Badge>
      );
    default:
      return (
        <Badge tone="neutral">
          <ShieldCheck className="size-3" /> 클린
        </Badge>
      );
  }
}

function PostItem({ post }: { post: CommunityPost }) {
  const blinded = post.tag === "blind";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn("rounded-xl border p-3", blinded ? "border-bad/20 bg-bad/[0.04]" : "border-line bg-white/[0.02]")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-canvas"
            style={{ background: `hsl(${post.avatarHue} 70% 70%)` }}
          >
            {post.author.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{blinded ? "비공개 사용자" : post.author}</p>
            <p className="text-[10px] text-ink-3">{post.time}</p>
          </div>
        </div>
        <TagBadge post={post} />
      </div>

      {blinded ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2.5 text-xs text-ink-3">
          <EyeOff className="size-3.5 shrink-0 text-bad" />
          <span>
            [AI 블라인드 처리됨 - {post.tagDetail}] 커뮤니티 가이드라인에 따라 게시글이 숨겨졌습니다.
          </span>
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          <GlossaryText text={post.body} />
        </p>
      )}

      {!blinded && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-3">
          <span className="flex items-center gap-1">
            <Heart className="size-3" /> {post.likes}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="size-3" /> {post.replies}
          </span>
          {post.tagDetail && post.tag !== "clean" && <span className="truncate">· {post.tagDetail}</span>}
        </div>
      )}
    </motion.li>
  );
}

export function CommunityFeed({ className, live = true }: { className?: string; live?: boolean }) {
  const [posts, setPosts] = React.useState<CommunityPost[]>(COMMUNITY_SEED);
  const [draft, setDraft] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [stats, setStats] = React.useState({ blinded: 128, verified: 342 });
  const poolIdx = React.useRef(0);

  // 실시간 유입 시뮬레이션
  React.useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      const base = COMMUNITY_POOL[poolIdx.current++ % COMMUNITY_POOL.length];
      const post: CommunityPost = { ...base, id: `live-${Date.now()}`, time: "방금" };
      setPosts((p) => [post, ...p].slice(0, 12));
      setStats((s) => ({
        blinded: s.blinded + (post.tag === "blind" ? 1 : 0),
        verified: s.verified + (post.tag === "fact" ? 1 : 0),
      }));
    }, 7000);
    return () => clearInterval(t);
  }, [live]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setChecking(true);
    setTimeout(() => {
      const mod = mockModerate(body);
      setPosts((p) => [{ id: `me-${Date.now()}`, author: "나", avatarHue: 75, time: "방금", body, likes: 0, replies: 0, ...mod }, ...p]);
      if (mod.tag === "blind") setStats((s) => ({ ...s, blinded: s.blinded + 1 }));
      setDraft("");
      setChecking(false);
    }, 700);
  };

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<ShieldCheck className="size-4 text-lime" />}
        title={
          <span className="flex items-center gap-2">
            안전한 야차판 <Badge tone="lime">AI 클린</Badge>
          </span>
        }
        subtitle="AI가 혐오 표현을 걸러내고 사실 주장을 검증합니다"
      />

      <div className="mx-5 mt-3 grid grid-cols-3 gap-2">
        {[
          { k: "오늘 블라인드", v: stats.blinded, c: "text-bad" },
          { k: "사실 검증", v: stats.verified, c: "text-good" },
          { k: "클린 지수", v: "97.2%", c: "text-lime" },
        ].map((s) => (
          <div key={s.k} className="rounded-lg border border-line bg-white/[0.02] px-2.5 py-2">
            <p className="text-[10px] text-ink-3">{s.k}</p>
            <p className={cn("text-sm font-semibold tabular", s.c)}>{typeof s.v === "number" ? s.v.toLocaleString() : s.v}</p>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mx-5 mt-3 flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-4 pr-1 focus-within:border-lime/40">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="의견을 남겨주세요 (AI 모더레이션 적용)"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
          maxLength={200}
        />
        <button
          type="submit"
          disabled={checking || !draft.trim()}
          className="grid size-8 place-items-center rounded-full bg-lime text-canvas transition hover:bg-lime-2 disabled:opacity-40"
          aria-label="게시"
        >
          {checking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" />}
        </button>
      </form>

      <ul className="mt-3 flex-1 space-y-2 overflow-y-auto px-5 pb-5 scroll-thin">
        <AnimatePresence initial={false}>
          {posts.map((p) => (
            <PostItem key={p.id} post={p} />
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}
