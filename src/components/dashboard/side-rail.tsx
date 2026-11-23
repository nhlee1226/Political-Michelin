"use client";

/**
 * SideRail — 좌측 빠른 메뉴 (lg 이상에서만 표시)
 * ------------------------------------------------------------------
 * 아이콘을 누르면 오른쪽으로 플라이아웃 패널이 열리고, 패널 머리말에 그 메뉴의 역할을 한 줄로 설명한다.
 *  관심 지역 · 즐겨찾는 정치인 · 국회 일정 · 법안 추적 · 공약 문서 · 저장한 뉴스
 *  (국회 일정·법안 처리 단계는 열린국회정보를 하루 1번 자동 수집한 실제 데이터)
 *  ─ 라이트/다크 스위치 · 설정 · 도움말
 * 관심 지역/즐겨찾기/팔로우/저장 목록은 이 브라우저(localStorage)에 보관한다.
 * 지역·정치인·공약을 누르면 onSelectRegion 으로 지도 탭의 해당 지역으로 이동한다.
 */
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  BellRing,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  FileText,
  Gavel,
  HelpCircle,
  MapPin,
  Moon,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { useNews, useRegions } from "@/lib/dashboard-data";
import {
  useBills,
  usePartyLookup,
  usePoliticians,
  useRegion,
  useRegions as useApiRegions,
  useSchedule,
  type ApiBillTrack,
  type ApiLocalWinner,
  type ApiPolitician,
} from "@/lib/api";
import { BILL_STEPS } from "@/lib/bill-stage";
import { timeAgo } from "./news-panel";
import { FONT_SIZES, useFontSize } from "@/lib/font-size";
import { useTheme } from "@/lib/theme";
import { useSyncedSet } from "@/lib/user-items";
import { cn } from "@/lib/utils";
import { Badge, MichelinStars, Segmented, Skeleton } from "@/components/ui/primitives";
import { Bump, Pop } from "@/components/ui/pop";
import { eulReul, markToggled, toast } from "@/lib/toast";

type PanelKey = "regions" | "politicians" | "schedule" | "bills" | "pledges" | "news" | "settings" | "help";

/** width: 패널 넓이(px, 보통 글자 기준). 글자 크기 설정에 비례해 함께 넓어짐 — 내용이 많은 일정·법안은 넓게 */
const MENU: { key: PanelKey; icon: LucideIcon; label: string; desc: string; width: number }[] = [
  { key: "regions", icon: Plus, label: "관심 지역", desc: "자주 보는 시·도를 모아 이슈 활성도와 최근 기사 수를 바로 확인합니다.", width: 360 },
  { key: "politicians", icon: Star, label: "즐겨찾는 정치인", desc: "별표한 국회의원의 별점과 의정 지표(반영률·표결 참여율)를 모아 봅니다.", width: 380 },
  { key: "schedule", icon: CalendarDays, label: "국회 일정", desc: "다가오는 본회의·위원회 회의 일정을 날짜순으로 보여줍니다.", width: 500 },
  { key: "bills", icon: Gavel, label: "법안 추적", desc: "법안이 발의 → 소관위 → 법사위 → 본회의 중 어디까지 왔는지 보여주고, 관심 법안을 추적합니다.", width: 460 },
  { key: "pledges", icon: FileText, label: "공약 문서", desc: "선택한 시·도의 지방선거 당선인 공약 제목을 보여줍니다 (선관위). 이행률은 공식 데이터가 없습니다.", width: 420 },
  { key: "news", icon: Bookmark, label: "저장한 뉴스", desc: "나중에 다시 읽을 기사를 저장합니다.", width: 420 },
];
const SETTINGS = { key: "settings" as const, icon: Settings, label: "설정", desc: "화면 테마와 글자 크기를 설정합니다.", width: 380 };
const HELP = { key: "help" as const, icon: HelpCircle, label: "도움말", desc: "빠른 메뉴의 각 아이콘이 하는 일을 안내합니다.", width: 380 };
const ALL_PANELS = [...MENU, SETTINGS, HELP];

const stripTerms = (s: string) => s.replace(/\[\[(.+?)\]\]/g, "$1");

/** D-day 라벨 (오늘 기준) */
function dday(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
  return { diff, label: diff === 0 ? "D-DAY" : diff > 0 ? `D-${diff}` : `D+${-diff}` };
}

/* ───────────────────────── Panels ───────────────────────── */

function Row({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-white/[0.03] p-3", className)} {...props} />;
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-4 text-[calc(12px*var(--fs))] font-medium text-ink-3 first:mt-0">{children}</p>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">{children}</p>;
}

/* ── 스켈레톤 로딩: "불러오는 중…" 글자 대신 실제 모양대로 회색 뼈대 ── */
function ScheduleSkeleton() {
  return (
    <div role="status" aria-label="일정을 불러오는 중">
      <Skeleton className="h-7 w-56 max-w-full rounded-full" />
      <ol className="mt-3 space-y-3">
        {[[78, 64], [70], [82, 60]].map((ws, g) => (
          <li key={g} className="flex gap-3">
            <Skeleton className="h-[66px] w-14 shrink-0 rounded-xl" />
            <ul className="min-w-0 flex-1 space-y-1.5">
              {ws.map((w, i) => (
                <li key={i} className="rounded-lg border border-line bg-white/[0.03] px-2.5 py-2">
                  <Skeleton className="h-4 w-11 rounded-full" />
                  <Skeleton className="mt-2 h-3.5" style={{ width: `${w}%` }} />
                  <Skeleton className="mt-1.5 h-2.5" style={{ width: `${w - 30}%` }} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
function BillsSkeleton({ n = 3 }: { n?: number }) {
  return (
    <ul className="space-y-2" role="status" aria-label="법안을 불러오는 중">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <Row>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4" style={{ width: `${72 - i * 8}%` }} />
                <Skeleton className="mt-1.5 h-3 w-2/5" />
              </div>
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
            <div className="mt-3 grid grid-cols-4 justify-items-center gap-1">
              {[0, 1, 2, 3].map((k) => (
                <Skeleton key={k} className="size-3 rounded-full" />
              ))}
            </div>
            <Skeleton className="mt-3 h-4 w-24 rounded-full" />
          </Row>
        </li>
      ))}
    </ul>
  );
}
function PeopleSkeleton({ n = 3 }: { n?: number }) {
  return (
    <ul className="space-y-2" role="status" aria-label="의원 목록을 불러오는 중">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <Row className="flex items-center gap-2.5 p-2.5">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="mt-1.5 h-3" style={{ width: `${60 - i * 8}%` }} />
              <Skeleton className="mt-1.5 h-3 w-1/2" />
            </div>
          </Row>
        </li>
      ))}
    </ul>
  );
}

function RegionsPanel({
  interests,
  toggle,
  onSelectRegion,
}: {
  interests: Set<string>;
  toggle: (c: string, name?: string) => void;
  onSelectRegion: (c: string) => void;
}) {
  const { regions: REGIONS } = useRegions();
  const { data: apiRegions } = useApiRegions();
  const news24h = new Map(apiRegions?.map((r) => [r.code, r.news_24h]));
  const mine = REGIONS.filter((r) => interests.has(r.code));
  const rest = REGIONS.filter((r) => !interests.has(r.code));
  return (
    <>
      <SectionLabel>내 관심 지역 <Bump value={mine.length} />곳 · 누르면 지도에서 열림</SectionLabel>
      {mine.length === 0 ? (
        <Empty>아래에서 지역을 추가해 보세요.</Empty>
      ) : (
        <ul className="space-y-2">
          {mine.map((r) => (
            <li key={r.code}>
              <Row className="flex items-center gap-3 p-2.5">
                <button onClick={() => onSelectRegion(r.code)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[calc(14px*var(--fs))] font-semibold">
                      <Pop on id={r.code}>
                        <MapPin className="size-3.5 text-lime" />
                      </Pop>
                      {r.name}
                    </p>
                    <span className="text-[calc(12px*var(--fs))] text-ink-3 tabular">
                      활성도 <b className="text-ink">{r.heat}</b>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-lime/80" style={{ width: `${r.heat}%` }} />
                  </div>
                  {news24h.has(r.code) && (
                    <p className="mt-1.5 truncate text-[calc(12px*var(--fs))] text-ink-2">최근 24시간 지역 기사 {news24h.get(r.code)}건</p>
                  )}
                </button>
                <button
                  onClick={() => toggle(r.code, r.short)}
                  aria-label={`${r.short} 관심 지역에서 제거`}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-white/[0.08] hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              </Row>
            </li>
          ))}
        </ul>
      )}
      <SectionLabel>지역 추가</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {rest.map((r) => (
          <button
            key={r.code}
            onClick={() => toggle(r.code, r.short)}
            className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[calc(12px*var(--fs))] text-ink-2 transition hover:border-lime/40 hover:text-lime"
          >
            <Pop on={false} id={r.code}>
              <Plus className="size-3" />
            </Pop>
            {r.short}
          </button>
        ))}
      </div>
    </>
  );
}

/** 즐겨찾는 정치인 — 실제 국회의원(/api/politicians). 즐겨찾기는 MONA_CD 로 이 브라우저에 저장. 누르면 상세 패널 */
function PoliticiansPanel({
  favorites,
  toggle,
  onOpenPolitician,
}: {
  favorites: Set<string>;
  toggle: (id: string, name?: string) => void;
  onOpenPolitician: (monaCd: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const { data, error } = usePoliticians();
  const partyOf = usePartyLookup();
  const all = data?.rows ?? [];
  const favs = all.filter((p) => favorites.has(p.mona_cd));
  const results = q.trim()
    ? all.filter((p) => !favorites.has(p.mona_cd) && (p.name.includes(q.trim()) || !!p.district?.includes(q.trim()))).slice(0, 30)
    : [];

  const item = (p: ApiPolitician) => {
    const party = partyOf(p.party_id);
    const fav = favorites.has(p.mona_cd);
    return (
      <li key={p.mona_cd}>
        <Row className="flex items-center gap-2.5 p-2.5">
          <button onClick={() => onOpenPolitician(p.mona_cd)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full border-2 text-[calc(12px*var(--fs))] font-semibold"
              style={{ borderColor: party.color, background: `${party.color}22` }}
            >
              {p.name.slice(-2)}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[calc(14px*var(--fs))] font-semibold">{p.name}</span>
                {p.stars && <MichelinStars count={p.stars} />}
              </span>
              <span className="block truncate text-[calc(12px*var(--fs))] text-ink-3">
                {party.name} · {p.elect_type === "비례대표" ? "비례대표" : (p.district ?? "—")}
              </span>
              <span className="block truncate text-[calc(12px*var(--fs))] text-ink-3 tabular">
                반영률 {p.reflect_rate == null ? "—" : `${p.reflect_rate}%`} · 표결 참여 {p.vote_participation == null ? "—" : `${p.vote_participation}%`}
              </span>
            </span>
          </button>
          <button
            onClick={() => toggle(p.mona_cd, p.name)}
            aria-label={fav ? `${p.name} 즐겨찾기 해제` : `${p.name} 즐겨찾기`}
            aria-pressed={fav}
            className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/[0.08]"
          >
            <Pop on={fav} id={p.mona_cd}>
              <Star className={cn("size-4", fav ? "fill-lime text-lime" : "text-ink-3")} />
            </Pop>
          </button>
        </Row>
      </li>
    );
  };

  return (
    <>
      <label className="flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5 focus-within:border-lime/40">
        <Search className="size-3.5 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 또는 지역구로 찾아 별표하기"
          className="min-w-0 flex-1 bg-transparent text-xs placeholder:text-ink-3 focus:outline-none"
        />
      </label>
      {!data && error && <p className="mt-3 text-center text-[calc(12px*var(--fs))] text-ink-3">의원 목록을 불러오지 못했습니다.</p>}
      {q.trim() && (
        <>
          <SectionLabel>검색 결과 {results.length}명</SectionLabel>
          {results.length ? <ul className="space-y-2">{results.map(item)}</ul> : <Empty>일치하는 정치인이 없습니다.</Empty>}
        </>
      )}
      <SectionLabel>
        즐겨찾기 <Bump value={data ? favs.length : favorites.size} />명
      </SectionLabel>
      {!data && !error ? (
        <PeopleSkeleton n={Math.max(1, Math.min(favorites.size, 3))} />
      ) : favs.length ? (
        <ul className="space-y-2">{favs.map(item)}</ul>
      ) : (
        <Empty>위에서 검색해 별표를 눌러 추가하세요.</Empty>
      )}
    </>
  );
}

/** "11-24" → "11/24" */
const md = (date: string) => {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
};

/** 국회 일정 — 열린국회정보 '국회 일정 통합'을 하루 1번 수집 (어제부터 앞으로) */
function SchedulePanel() {
  const { data, error } = useSchedule();
  const [kind, setKind] = React.useState("전체");
  if (!data) return error ? <Empty>일정을 불러오지 못했습니다.</Empty> : <ScheduleSkeleton />;
  if (!data.ready) return <Empty>국회 일정은 자동 수집이 처음 돌고 나면 채워집니다 (하루 1번).</Empty>;

  // 많이 나오는 종류 3개까지 거르기 버튼으로
  const counts = new Map<string, number>();
  for (const r of data.rows) if (r.kind) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const kinds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  const rows = kind === "전체" ? data.rows : data.rows.filter((r) => r.kind === kind);
  const groups: { date: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last?.date === r.date) last.items.push(r);
    else groups.push({ date: r.date, items: [r] });
  }

  return (
    <>
      {kinds.length > 1 && (
        <Segmented
          value={kind}
          onChange={setKind}
          options={[{ value: "전체", label: "전체" }, ...kinds.map((k) => ({ value: k, label: k }))]}
          className="mb-3"
        />
      )}
      {groups.length === 0 ? (
        <Empty>앞으로 잡힌 국회 일정이 없습니다.</Empty>
      ) : (
        <ol className="space-y-3">
          {groups.map((g) => {
            const d = dday(g.date);
            const soon = d.diff >= 0 && d.diff <= 2;
            const [, m, day] = g.date.split("-");
            return (
              <li key={g.date} className={cn("flex gap-3", d.diff < 0 && "opacity-50")}>
                <div
                  className={cn(
                    "sticky top-0 grid h-fit w-14 shrink-0 place-items-center rounded-xl border py-1.5 text-center",
                    soon ? "border-lime/40 bg-lime/10" : "border-line bg-canvas-2",
                  )}
                >
                  <p className="text-[calc(11px*var(--fs))] text-ink-3">{Number(m)}월</p>
                  <p className="text-base font-semibold leading-none tabular">{Number(day)}</p>
                  <p className={cn("mt-1 text-[calc(11px*var(--fs))] font-semibold tabular", soon ? "text-lime" : "text-ink-3")}>{d.label}</p>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {g.items.map((s, i) => (
                    <li key={i} className="rounded-lg border border-line bg-white/[0.03] px-2.5 py-2">
                      <div className="flex items-center gap-1.5">
                        {s.kind && (
                          <Badge tone={/본회의/.test(s.kind) ? "cyan" : "neutral"} className="px-1.5 py-0 text-[calc(11px*var(--fs))]">
                            {s.kind}
                          </Badge>
                        )}
                        {s.time && <span className="text-[calc(12px*var(--fs))] text-ink-3 tabular">{s.time}</span>}
                      </div>
                      <p className="mt-1 text-[calc(14px*var(--fs))] leading-snug">{s.title}</p>
                      {(s.committee || s.place) && (
                        <p className="mt-0.5 truncate text-[calc(12px*var(--fs))] text-ink-3">{[s.committee, s.place].filter(Boolean).join(" · ")}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-[calc(11px*var(--fs))] text-ink-3">출처 열린국회정보 · 하루 1번 자동 갱신{data.updated_at ? ` · 마지막 갱신 ${timeAgo(data.updated_at)}` : ""}</p>
    </>
  );
}

const STEP_TONE: Record<ApiBillTrack["tone"], { dot: string; line: string; badge: "lime" | "good" | "bad" | "neutral" }> = {
  active: { dot: "border-lime bg-lime", line: "bg-lime/70", badge: "lime" },
  good: { dot: "border-good bg-good", line: "bg-good/60", badge: "good" },
  bad: { dot: "border-bad bg-bad", line: "bg-bad/50", badge: "bad" },
  neutral: { dot: "border-ink-3 bg-ink-3", line: "bg-white/20", badge: "neutral" },
};

/** 단계가 한 칸씩 차오르는 간격(초)과 감속 곡선 */
const STEP_GAP = 0.28;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * 법안 1건 — 단계 스테퍼(발의 → 소관위 → 법사위 → 본회의), 지금 상태, 최근 단계, 본회의 표결 수.
 * 패널을 열고 처음 보이는 카드는 발의부터 한 칸씩 차오른다 (seen: 이미 보여 준 법안은 다시 안 함).
 */
function BillCard({
  b,
  on,
  toggle,
  seen,
}: {
  b: ApiBillTrack;
  on: boolean;
  toggle: (id: string, name?: string) => void;
  seen: React.RefObject<Set<string>>;
}) {
  const t = STEP_TONE[b.tone];
  const reduce = useReducedMotion();
  const [play] = React.useState(() => !reduce && !seen.current.has(b.bill_id));
  React.useEffect(() => {
    seen.current.add(b.bill_id);
  }, [b.bill_id, seen]);
  const metaDelay = b.reached * STEP_GAP + 0.22;
  return (
    <li>
      <Row>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {b.detail_url ? (
              <a href={b.detail_url} target="_blank" rel="noreferrer" className="text-[calc(14px*var(--fs))] font-semibold leading-snug hover:underline">
                {b.title}
              </a>
            ) : (
              <p className="text-[calc(14px*var(--fs))] font-semibold leading-snug">{b.title}</p>
            )}
            <p className="mt-0.5 truncate text-[calc(12px*var(--fs))] text-ink-3">
              {[b.proposer && `${b.proposer} 의원 대표발의`, b.committee].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <button
            onClick={() => toggle(b.bill_id, b.title)}
            aria-pressed={on}
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[calc(12px*var(--fs))] transition",
              on ? "border-lime/40 bg-lime/10 text-lime" : "border-line text-ink-3 hover:text-ink",
            )}
          >
            <Pop on={on} id={b.bill_id} className="gap-1">
              <Pop on={on} id={b.bill_id} kind="ring">
                {on ? <BellRing className="size-3" /> : <Bell className="size-3" />}
              </Pop>
              {on ? "추적 중" : "추적"}
            </Pop>
          </button>
        </div>
        {/* 단계 스테퍼 */}
        <ol className="mt-3 grid grid-cols-4">
          {BILL_STEPS.map((label, i) => {
            const done = i <= b.reached;
            const current = i === b.reached;
            const at = i * STEP_GAP;
            return (
              <li key={label} className="relative flex flex-col items-center gap-1">
                {i > 0 && (
                  <span className="absolute right-1/2 top-[5px] h-0.5 w-full overflow-hidden bg-white/[0.08]">
                    {done && (
                      <motion.span
                        className={cn("absolute inset-0 origin-left", t.line)}
                        initial={play ? { scaleX: 0 } : false}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: Math.max(0, at - 0.23), duration: 0.26, ease: EASE_OUT }}
                      />
                    )}
                  </span>
                )}
                <span className="relative size-3">
                  <span className="absolute inset-0 rounded-full border-2 border-white/15 bg-canvas" />
                  {done && (
                    <motion.span
                      className={cn(
                        "absolute inset-0 rounded-full border-2",
                        current ? t.dot : "border-white/40 bg-canvas",
                        current && b.tone === "active" && "ring-4 ring-lime/15",
                      )}
                      initial={play ? { scale: 0, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: at, type: "spring", stiffness: 520, damping: 14 }}
                    />
                  )}
                </span>
                <span className={cn("text-[calc(11px*var(--fs))]", current ? "font-semibold text-ink" : "text-ink-3")}>{label}</span>
              </li>
            );
          })}
        </ol>
        <motion.div
          className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"
          initial={play ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: metaDelay, duration: 0.3, ease: EASE_OUT }}
        >
          <Badge tone={t.badge} className="px-1.5 py-0 text-[calc(11px*var(--fs))]">
            {b.status}
          </Badge>
          {b.latest && (
            <span className="text-[calc(12px*var(--fs))] text-ink-3">
              {md(b.latest.date)} {b.latest.text}
            </span>
          )}
        </motion.div>
        {b.votes && (
          <motion.p
            className="mt-1.5 text-[calc(12px*var(--fs))] text-ink-3 tabular"
            initial={play ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: metaDelay + 0.08, duration: 0.3, ease: EASE_OUT }}
          >
            본회의 표결 · 찬성 <b className="text-ink-2">{b.votes.yes}</b> · 반대 <b className="text-ink-2">{b.votes.no}</b> · 기권{" "}
            <b className="text-ink-2">{b.votes.abstain}</b>
          </motion.p>
        )}
      </Row>
    </li>
  );
}

/** 입력이 멈추고 ms 뒤의 값 (검색 요청을 글자마다 보내지 않게) */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** 법안 추적 — 22대 의원 발의법률안의 처리 단계 (열린국회정보, 하루 1번 수집). 추적 목록은 이 브라우저에 보관 */
function BillsPanel({ followed, toggle }: { followed: Set<string>; toggle: (id: string, name?: string) => void }) {
  // 이 패널을 연 뒤 단계 애니메이션을 이미 보여 준 법안 (추적으로 목록을 옮겨도 다시 차오르지 않게)
  const seen = React.useRef(new Set<string>());
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState<"active" | "done">("active");
  const query = useDebounced(q.trim());
  const searching = query.length >= 2;
  const mine = useBills({ ids: [...followed] });
  const list = useBills(searching ? { q: query } : { view });

  const notReady = list.data?.ready === false;
  const mineRows = mine.data?.rows ?? [];
  const rest = (list.data?.rows ?? []).filter((b) => !followed.has(b.bill_id));

  return (
    <>
      <label className="flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5 focus-within:border-lime/40">
        <Search className="size-3.5 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="법안 이름으로 찾아 추적하기 (2글자 이상)"
          className="min-w-0 flex-1 bg-transparent text-xs placeholder:text-ink-3 focus:outline-none"
        />
      </label>
      {notReady ? (
        <div className="mt-3">
          <Empty>법안 처리 단계는 자동 수집이 다음에 돌 때 채워집니다 (하루 1번).</Empty>
        </div>
      ) : (
        <>
          <SectionLabel>
            추적 중 <Bump value={followed.size} />건
          </SectionLabel>
          {followed.size === 0 ? (
            <Empty>아래 법안의 추적을 누르면 여기에 모입니다.</Empty>
          ) : !mine.data && !mine.error ? (
            <BillsSkeleton n={Math.min(followed.size, 2)} />
          ) : (
            <ul className="space-y-2">
              {mineRows.map((b) => (
                <BillCard key={b.bill_id} b={b} on toggle={toggle} seen={seen} />
              ))}
            </ul>
          )}
          {searching ? (
            <SectionLabel>검색 결과 {list.data ? `${rest.length}건` : "…"}</SectionLabel>
          ) : (
            <div className="mb-2 mt-4 flex items-center justify-between gap-2">
              <p className="text-[calc(12px*var(--fs))] font-medium text-ink-3">{view === "active" ? "최근 움직인 법안" : "최근 처리된 법안"}</p>
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "active", label: "심사 중" },
                  { value: "done", label: "처리 끝" },
                ]}
              />
            </div>
          )}
          {!list.data ? (
            list.error ? <Empty>법안을 불러오지 못했습니다.</Empty> : <BillsSkeleton />
          ) : rest.length ? (
            <ul className="space-y-2">
              {rest.map((b) => (
                <BillCard key={b.bill_id} b={b} on={false} toggle={toggle} seen={seen} />
              ))}
            </ul>
          ) : (
            <Empty>{searching ? "일치하는 법안이 없습니다." : "표시할 법안이 없습니다."}</Empty>
          )}
          <p className="mt-3 text-[calc(11px*var(--fs))] leading-relaxed text-ink-3">
            출처 열린국회정보 의안 정보 · 하루 1번 자동 갱신. 실시간 표결 진행과 공포일은 공개 데이터에 없어 본회의 의결까지 보여 줍니다.
          </p>
        </>
      )}
    </>
  );
}

/** 공약 문서 — 선택한 시·도의 지방선거 당선인 공약 제목 (실제, 선관위). 누르면 지도 탭의 그 지역으로 (원문은 거기서) */
function PledgesPanel({ selectedRegion, onSelectRegion }: { selectedRegion: string; onSelectRegion: (c: string) => void }) {
  const [scope, setScope] = React.useState<"head" | "mayors">("head");
  const { data, error } = useRegion(selectedRegion);
  const detail = data?.code === selectedRegion ? data : undefined;
  const local = detail?.local;
  const winners: ApiLocalWinner[] = !local
    ? []
    : scope === "head"
      ? [local.governor, local.superintendent].filter((w): w is ApiLocalWinner => !!w)
      : local.mayors;
  return (
    <>
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: "head", label: "시·도지사·교육감" },
          { value: "mayors", label: "구·시·군의 장" },
        ]}
      />
      <p className="mt-2 text-[calc(12px*var(--fs))] text-ink-3">
        {detail ? `${detail.name} · ${local?.election.name ?? "지방선거"} 당선인` : error ? "공약을 불러오지 못했습니다." : "불러오는 중…"}
      </p>
      <ul className="mt-2 space-y-2">
        {detail && winners.length === 0 && <Empty>이 지역의 당선인 공약 데이터가 없습니다.</Empty>}
        {winners.map((w) => (
          <li key={w.id}>
            <button onClick={() => onSelectRegion(selectedRegion)} className="block w-full text-left">
              <Row className="transition hover:border-white/15">
                <div className="flex items-start gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-ink-2">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[calc(14px*var(--fs))] font-semibold leading-snug">{w.name}</p>
                    <p className="mt-0.5 text-[calc(12px*var(--fs))] text-ink-3">
                      {w.office} · {w.sgg_name} · 공약 {w.pledges.length}개
                    </p>
                  </div>
                </div>
                {w.pledges.length > 0 && (
                  <ol className="mt-2 space-y-1 border-t border-line pt-2">
                    {w.pledges.map((pl) => (
                      <li key={pl.no} className="flex gap-1.5 text-[calc(12px*var(--fs))] leading-snug text-ink-2">
                        <span className="shrink-0 text-ink-3 tabular">{pl.no}</span>
                        <span>{pl.title ?? "(제목 없음)"}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Row>
            </button>
          </li>
        ))}
      </ul>
      <p className="px-1 pt-3 text-[calc(12px*var(--fs))] leading-relaxed text-ink-3">이행률은 공식 데이터가 없어 표시하지 않습니다. 누르면 지도에서 공약 원문을 볼 수 있습니다.</p>
    </>
  );
}

function NewsPanel({ saved, toggle }: { saved: Set<string>; toggle: (id: string, name?: string) => void }) {
  const { news: NEWS } = useNews();
  const mine = NEWS.filter((n) => saved.has(n.id));
  const rest = NEWS.filter((n) => !saved.has(n.id));
  const item = (n: (typeof NEWS)[number]) => {
    const on = saved.has(n.id);
    return (
      <li key={n.id}>
        <Row className="flex items-start gap-2.5 p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[calc(12px*var(--fs))] text-ink-3">
              {n.source} · {n.time} · {n.category}
            </p>
            <p className="mt-0.5 text-[calc(14px*var(--fs))] leading-snug">{stripTerms(n.objectiveHeadline ?? n.headline)}</p>
          </div>
          <button
            onClick={() => toggle(n.id)}
            aria-label={on ? "저장 취소" : "기사 저장"}
            aria-pressed={on}
            className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/[0.08]"
          >
            <Pop on={on} id={n.id}>
              {on ? <BookmarkCheck className="size-4 text-lime" /> : <Bookmark className="size-4 text-ink-3" />}
            </Pop>
          </button>
        </Row>
      </li>
    );
  };
  return (
    <>
      <SectionLabel>
        저장됨 <Bump value={mine.length} />건
      </SectionLabel>
      {mine.length ? <ul className="space-y-2">{mine.map(item)}</ul> : <Empty>아래 기사의 책갈피를 눌러 저장하세요.</Empty>}
      <SectionLabel>오늘의 기사</SectionLabel>
      <ul className="space-y-2">{rest.map(item)}</ul>
    </>
  );
}

function SettingsPanel() {
  const [theme, setTheme] = useTheme();
  const [fontSize, setFontSize] = useFontSize();
  return (
    <div className="space-y-2">
      <Row>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[calc(14px*var(--fs))] font-semibold">글자 크기</p>
            <p className="mt-0.5 text-[calc(12px*var(--fs))] text-ink-3">사이트 안의 글자만 키우거나 줄여요 (이 브라우저에 저장).</p>
          </div>
          <span className="shrink-0 text-[calc(12px*var(--fs))] font-semibold text-lime tabular">
            {Math.round((FONT_SIZES.find((f) => f.value === fontSize)?.scale ?? 1) * 100)}%
          </span>
        </div>
        <div role="radiogroup" aria-label="글자 크기" className="mt-3 grid grid-cols-4 gap-1.5">
          {FONT_SIZES.map((f) => {
            const on = f.value === fontSize;
            return (
              <button
                key={f.value}
                role="radio"
                aria-checked={on}
                onClick={() => setFontSize(f.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition",
                  on ? "border-lime/50 bg-lime/10 text-ink" : "border-line text-ink-3 hover:text-ink",
                )}
              >
                {/* 미리보기 '가' 는 배율과 상관없이 고정 크기 (버튼끼리 비교되게) */}
                <span className="font-semibold leading-none" style={{ fontSize: 14 * f.scale + 2 }}>
                  가
                </span>
                <span className="text-[calc(11px*var(--fs))] whitespace-nowrap">{f.label}</span>
              </button>
            );
          })}
        </div>
      </Row>
      <Row className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[calc(14px*var(--fs))] font-semibold">화면 테마</p>
          <p className="mt-0.5 text-[calc(12px*var(--fs))] text-ink-3">왼쪽 메뉴의 스위치로도 바꿀 수 있어요.</p>
        </div>
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: "dark", label: "다크" },
            { value: "light", label: "라이트" },
          ]}
        />
      </Row>
      <p className="px-1 pt-1 text-[calc(12px*var(--fs))] leading-relaxed text-ink-3">
        관심 지역·즐겨찾는 정치인·저장한 뉴스는 로그인 시 계정에 저장되고, 비로그인 시에는 이 브라우저에만 저장됩니다.
      </p>
    </div>
  );
}

function HelpPanel({ onOpen }: { onOpen: (k: PanelKey) => void }) {
  return (
    <ul className="space-y-1">
      {[...MENU, SETTINGS].map(({ key, icon: Icon, label, desc }) => (
        <li key={key}>
          <button onClick={() => onOpen(key)} className="flex w-full gap-3 rounded-xl p-2 text-left transition hover:bg-white/[0.05]">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-ink-2">
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block text-[calc(14px*var(--fs))] font-semibold">{label}</span>
              <span className="mt-0.5 block text-[calc(12px*var(--fs))] leading-relaxed text-ink-3">{desc}</span>
            </span>
          </button>
        </li>
      ))}
      <li className="flex gap-3 p-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-ink-2">
          <Sun className="size-4" />
        </span>
        <span>
          <span className="block text-[calc(14px*var(--fs))] font-semibold">라이트/다크 스위치</span>
          <span className="mt-0.5 block text-[calc(12px*var(--fs))] leading-relaxed text-ink-3">해·달 스위치를 눌러 화면 밝기를 전환합니다.</span>
        </span>
      </li>
    </ul>
  );
}

/* ───────────────────────── Rail ───────────────────────── */

function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  const light = theme === "light";
  return (
    <button
      role="switch"
      aria-checked={light}
      aria-label={light ? "다크 모드로 전환" : "라이트 모드로 전환"}
      onClick={() => setTheme(light ? "dark" : "light")}
      className="group relative flex h-[60px] w-8 flex-col items-center justify-between rounded-full border border-line bg-white/[0.04] p-1"
    >
      <motion.span
        className="absolute left-1 size-6 rounded-full bg-lime shadow"
        initial={false}
        animate={{ top: light ? 4 : 30 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
      <Sun className={cn("relative size-6 p-1 transition-colors", light ? "text-canvas" : "text-ink-3")} />
      <Moon className={cn("relative size-6 p-1 transition-colors", light ? "text-ink-3" : "text-canvas")} />
      <Tooltip>{light ? "다크 모드로 전환" : "라이트 모드로 전환"}</Tooltip>
    </button>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="glass-strong pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-[calc(12px*var(--fs))] text-ink opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </span>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className={cn(
        "group relative grid size-9 place-items-center rounded-full transition",
        active ? "bg-lime text-canvas" : "text-ink-3 hover:bg-white/[0.06] hover:text-ink",
      )}
    >
      <Icon className="size-4" />
      {!!count && (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[calc(9px*var(--fs))] font-bold tabular",
            active ? "bg-canvas text-lime" : "bg-cyan text-canvas",
          )}
        >
          {count}
        </span>
      )}
      {!active && <Tooltip>{label}</Tooltip>}
    </button>
  );
}

export function SideRail({
  selectedRegion,
  onSelectRegion,
  onOpenPolitician,
}: {
  selectedRegion: string;
  onSelectRegion: (code: string) => void;
  /** 즐겨찾는 정치인을 누르면 상세 패널 */
  onOpenPolitician: (monaCd: string) => void;
}) {
  const [open, setOpen] = React.useState<PanelKey | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // 로그인 시 DB, 비로그인 시 localStorage (추적 법안은 항상 이 브라우저의 localStorage)
  const [interests, toggleInterest] = useSyncedSet("pm-interest-regions", ["11", "31"], "region");
  const [favorites, toggleFavorite] = useSyncedSet("pm-fav-members", [], "politician");
  // 예전 가상 법안 id(b1…)가 남지 않게 새 키를 씀
  const [followed, toggleFollow] = useSyncedSet("pm-tracked-bills", [], "bill");
  const [saved, toggleSaved] = useSyncedSet("pm-saved-news", [], "news");

  // 누르면 화면 아래에 알림(토스트) + 되돌리기. 되돌리기는 그때의 최신 toggle 을 부르도록 ref 로 들고 있음
  const toggles = React.useRef({ toggleInterest, toggleFavorite, toggleFollow, toggleSaved });
  toggles.current = { toggleInterest, toggleFavorite, toggleFollow, toggleSaved };
  const flip = (key: keyof typeof toggles.current, id: string) => {
    markToggled(id);
    void toggles.current[key](id);
  };
  const withToast = (key: keyof typeof toggles.current, id: string, title: string | undefined, message: string) => {
    flip(key, id);
    toast({ title, message, undo: () => flip(key, id) });
  };
  const onInterest = (id: string, name?: string) =>
    withToast("toggleInterest", id, name && `${name}${eulReul(name)}`, interests.has(id) ? "관심 지역에서 뺐어요" : "관심 지역에 추가했어요");
  const onFavorite = (id: string, name?: string) =>
    withToast("toggleFavorite", id, name && `${name} 의원을`, favorites.has(id) ? "즐겨찾기에서 뺐어요" : "즐겨찾기에 추가했어요");
  const onFollow = (id: string, name?: string) =>
    withToast("toggleFollow", id, name?.replace(/ 일부개정법률안$/, " 개정안"), followed.has(id) ? "추적을 그만뒀어요" : "추적을 시작했어요");
  const onSave = (id: string) => withToast("toggleSaved", id, undefined, saved.has(id) ? "저장한 기사에서 뺐어요" : "기사를 저장했어요");

  // 바깥 클릭 · Esc 로 닫기
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element;
      // 알림의 "되돌리기"를 눌러도 패널은 열어 둠
      if (el.closest?.("[data-toast]")) return;
      if (!rootRef.current?.contains(el)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const goRegion = (code: string) => {
    onSelectRegion(code);
    setOpen(null);
  };
  const toggle = (k: PanelKey) => setOpen((o) => (o === k ? null : k));
  const { data: schedule } = useSchedule();
  // 오늘부터 7일 안의 일정이 있는 날 수
  const upcoming = new Set(
    (schedule?.rows ?? []).filter((s) => {
      const { diff } = dday(s.date);
      return diff >= 0 && diff <= 7;
    }).map((s) => s.date),
  ).size;
  const counts: Partial<Record<PanelKey, number>> = {
    regions: interests.size,
    politicians: favorites.size,
    schedule: upcoming,
    bills: followed.size,
    news: saved.size,
  };
  const panel = ALL_PANELS.find((p) => p.key === open);

  return (
    <div ref={rootRef} className="sticky top-[84px] z-30 hidden h-fit shrink-0 lg:block">
      <nav aria-label="빠른 메뉴" className="glass flex w-12 flex-col items-center gap-1 rounded-full py-3">
        {MENU.map((m) => (
          <RailButton key={m.key} icon={m.icon} label={m.label} active={open === m.key} count={counts[m.key]} onClick={() => toggle(m.key)} />
        ))}
        <span className="my-1 h-px w-6 bg-line" />
        <ThemeSwitch />
        <span className="my-1 h-px w-6 bg-line" />
        {[SETTINGS, HELP].map((m) => (
          <RailButton key={m.key} icon={m.icon} label={m.label} active={open === m.key} onClick={() => toggle(m.key)} />
        ))}
      </nav>

      <AnimatePresence>
        {panel && (
          <motion.section
            key={panel.key}
            role="dialog"
            aria-label={panel.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
            className="glass-overlay absolute left-[calc(100%+12px)] top-0 flex max-h-[calc(100dvh-110px)] max-w-[calc(100vw-96px)] flex-col rounded-2xl"
            style={{ width: `calc(${panel.width}px * var(--fs, 1))` }}
          >
            <header className="flex items-start gap-3 border-b border-line p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lime text-canvas">
                <panel.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[calc(16px*var(--fs))] font-semibold">{panel.label}</h2>
                <p className="mt-0.5 text-[calc(12px*var(--fs))] leading-relaxed text-ink-3">{panel.desc}</p>
              </div>
              <button
                onClick={() => setOpen(null)}
                aria-label="닫기"
                className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-white/[0.08] hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
              {open === "regions" && <RegionsPanel interests={interests} toggle={onInterest} onSelectRegion={goRegion} />}
              {open === "politicians" && (
                <PoliticiansPanel
                  favorites={favorites}
                  toggle={onFavorite}
                  onOpenPolitician={(id) => {
                    onOpenPolitician(id);
                    setOpen(null);
                  }}
                />
              )}
              {open === "schedule" && <SchedulePanel />}
              {open === "bills" && <BillsPanel followed={followed} toggle={onFollow} />}
              {open === "pledges" && <PledgesPanel selectedRegion={selectedRegion} onSelectRegion={goRegion} />}
              {open === "news" && <NewsPanel saved={saved} toggle={onSave} />}
              {open === "settings" && <SettingsPanel />}
              {open === "help" && <HelpPanel onOpen={setOpen} />}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
