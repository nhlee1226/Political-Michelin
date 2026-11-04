"use client";

/**
 * SideRail — 좌측 빠른 메뉴 (lg 이상에서만 표시)
 * ------------------------------------------------------------------
 * 아이콘을 누르면 오른쪽으로 플라이아웃 패널이 열리고, 패널 머리말에 그 메뉴의 역할을 한 줄로 설명한다.
 *  관심 지역 · 즐겨찾는 정치인 · 선거·국회 일정 · 법안 추적 · 공약 문서 · 저장한 뉴스
 *  ─ 라이트/다크 스위치 · 설정 · 도움말
 * 관심 지역/즐겨찾기/팔로우/저장 목록은 이 브라우저(localStorage)에 보관한다.
 * 지역·정치인·공약을 누르면 onSelectRegion 으로 지도 탭의 해당 지역으로 이동한다.
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  Sparkles,
  Star,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  BILL_STAGES,
  BILLS,
  PARTIES,
  PLEDGE_DOCS,
  SCHEDULE,
  type Politician,
  type Region,
} from "@/lib/mock-data";
import { useNews, useRegions } from "@/lib/dashboard-data";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Badge, MichelinStars, Segmented, Switch } from "@/components/ui/primitives";

type PanelKey = "regions" | "politicians" | "schedule" | "bills" | "pledges" | "news" | "settings" | "help";

const MENU: { key: PanelKey; icon: LucideIcon; label: string; desc: string }[] = [
  { key: "regions", icon: Plus, label: "관심 지역", desc: "자주 보는 시·도를 모아 이슈 활성도와 1순위 이슈를 바로 확인합니다." },
  { key: "politicians", icon: Star, label: "즐겨찾는 정치인", desc: "별표한 정치인의 미슐랭 등급과 의정 지표를 모아 봅니다." },
  { key: "schedule", icon: CalendarDays, label: "선거·국회 일정", desc: "다가오는 본회의·공청회·선거 일정을 D-day 순으로 보여줍니다." },
  { key: "bills", icon: Gavel, label: "법안 추적", desc: "관심 법안이 발의 → 위원회 → 본회의 → 공포 중 어디까지 왔는지 추적합니다." },
  { key: "pledges", icon: FileText, label: "공약 문서", desc: "정치인별 공약집과 이행률을 확인합니다. 선택 지역 기준으로 걸러 볼 수 있습니다." },
  { key: "news", icon: Bookmark, label: "저장한 뉴스", desc: "나중에 다시 읽을 기사를 저장합니다. AI 객관화 헤드라인으로 표시됩니다." },
];
const SETTINGS = { key: "settings" as const, icon: Settings, label: "설정", desc: "화면 테마와 AI 객관화 모드를 설정합니다." };
const HELP = { key: "help" as const, icon: HelpCircle, label: "도움말", desc: "빠른 메뉴의 각 아이콘이 하는 일을 안내합니다." };
const ALL_PANELS = [...MENU, SETTINGS, HELP];

const stripTerms = (s: string) => s.replace(/\[\[(.+?)\]\]/g, "$1");

/* ── localStorage 에 보관하는 id 집합 ── */
function useStoredSet(key: string, initial: string[]) {
  const [set, setSet] = React.useState<Set<string>>(() => new Set(initial));
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v) setSet(new Set(JSON.parse(v) as string[]));
    } catch {}
  }, [key]);
  const toggle = React.useCallback(
    (id: string) =>
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {}
        return next;
      }),
    [key],
  );
  return [set, toggle] as const;
}

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
  return <p className="mb-2 mt-4 text-[11px] font-medium text-ink-3 first:mt-0">{children}</p>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">{children}</p>;
}

function RegionsPanel({
  interests,
  toggle,
  onSelectRegion,
}: {
  interests: Set<string>;
  toggle: (c: string) => void;
  onSelectRegion: (c: string) => void;
}) {
  const { regions: REGIONS } = useRegions();
  const mine = REGIONS.filter((r) => interests.has(r.code));
  const rest = REGIONS.filter((r) => !interests.has(r.code));
  return (
    <>
      <SectionLabel>내 관심 지역 {mine.length}곳 · 누르면 지도에서 열림</SectionLabel>
      {mine.length === 0 ? (
        <Empty>아래에서 지역을 추가해 보세요.</Empty>
      ) : (
        <ul className="space-y-2">
          {mine.map((r) => (
            <li key={r.code}>
              <Row className="flex items-center gap-3 p-2.5">
                <button onClick={() => onSelectRegion(r.code)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <MapPin className="size-3.5 text-lime" />
                      {r.name}
                    </p>
                    <span className="text-[11px] text-ink-3 tabular">
                      활성도 <b className="text-ink">{r.heat}</b>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-lime/80" style={{ width: `${r.heat}%` }} />
                  </div>
                  <p className="mt-1.5 truncate text-[11px] text-ink-2">1순위 이슈 · {r.issues[0].title}</p>
                </button>
                <button
                  onClick={() => toggle(r.code)}
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
            onClick={() => toggle(r.code)}
            className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-2 transition hover:border-lime/40 hover:text-lime"
          >
            <Plus className="size-3" />
            {r.short}
          </button>
        ))}
      </div>
    </>
  );
}

function PoliticiansPanel({
  favorites,
  toggle,
  onSelectRegion,
}: {
  favorites: Set<string>;
  toggle: (id: string) => void;
  onSelectRegion: (c: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const { politicians: ALL_POLITICIANS } = useRegions();
  const favs = ALL_POLITICIANS.filter((p) => favorites.has(p.id));
  const results = q.trim()
    ? ALL_POLITICIANS.filter((p) => !favorites.has(p.id) && (p.name.includes(q.trim()) || p.district.includes(q.trim())))
    : [];

  const item = (p: Politician & { region: Region }) => {
    const party = PARTIES[p.party];
    const fav = favorites.has(p.id);
    return (
      <li key={p.id}>
        <Row className="flex items-center gap-2.5 p-2.5">
          <button onClick={() => onSelectRegion(p.region.code)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full border-2 text-[11px] font-semibold"
              style={{ borderColor: party.color, background: `${party.color}22` }}
            >
              {p.name.slice(-2)}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold">{p.name}</span>
                <MichelinStars count={p.michelin} />
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {party.name} · {p.district}
                {p.role === "현역 의원" && ` · 이행 ${p.pledgeRate}% · 출석 ${p.attendance}%`}
              </span>
            </span>
          </button>
          <button
            onClick={() => toggle(p.id)}
            aria-label={fav ? `${p.name} 즐겨찾기 해제` : `${p.name} 즐겨찾기`}
            aria-pressed={fav}
            className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/[0.08]"
          >
            <Star className={cn("size-4", fav ? "fill-lime text-lime" : "text-ink-3")} />
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
      {q.trim() && (
        <>
          <SectionLabel>검색 결과 {results.length}명</SectionLabel>
          {results.length ? <ul className="space-y-2">{results.map(item)}</ul> : <Empty>일치하는 정치인이 없습니다.</Empty>}
        </>
      )}
      <SectionLabel>즐겨찾기 {favs.length}명</SectionLabel>
      {favs.length ? <ul className="space-y-2">{favs.map(item)}</ul> : <Empty>위에서 검색해 별표를 눌러 추가하세요.</Empty>}
    </>
  );
}

function SchedulePanel() {
  const items = SCHEDULE.map((s) => ({ ...s, d: dday(s.date) })).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <ul className="relative space-y-2 before:absolute before:bottom-3 before:left-[27px] before:top-3 before:w-px before:bg-line">
      {items.map((s) => {
        const past = s.d.diff < 0;
        const soon = s.d.diff >= 0 && s.d.diff <= 7;
        const [, m, day] = s.date.split("-");
        return (
          <li key={s.id} className={cn("relative flex gap-3", past && "opacity-50")}>
            <div
              className={cn(
                "z-10 grid w-14 shrink-0 place-items-center rounded-xl border py-1.5 text-center",
                soon ? "border-lime/40 bg-lime/10" : "border-line bg-canvas-2",
              )}
            >
              <p className="text-[10px] text-ink-3">{Number(m)}월</p>
              <p className="text-base font-semibold leading-none tabular">{Number(day)}</p>
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <div className="flex items-center gap-1.5">
                <Badge tone={s.kind === "선거" ? "cyan" : s.kind === "국회" ? "neutral" : "warn"} className="px-1.5 py-0 text-[10px]">
                  {s.kind}
                </Badge>
                <span className={cn("text-[11px] font-semibold tabular", soon ? "text-lime" : "text-ink-3")}>{s.d.label}</span>
              </div>
              <p className="mt-1 text-[13px] leading-snug">{s.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-3">{s.place}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BillsPanel({ followed, toggle }: { followed: Set<string>; toggle: (id: string) => void }) {
  const sorted = [...BILLS].sort((a, b) => Number(followed.has(b.id)) - Number(followed.has(a.id)));
  return (
    <ul className="space-y-2">
      {sorted.map((b) => {
        const on = followed.has(b.id);
        return (
          <li key={b.id}>
            <Row>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug">{b.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">{b.proposer}</p>
                </div>
                <button
                  onClick={() => toggle(b.id)}
                  aria-pressed={on}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                    on ? "border-lime/40 bg-lime/10 text-lime" : "border-line text-ink-3 hover:text-ink",
                  )}
                >
                  {on ? <BellRing className="size-3" /> : <Bell className="size-3" />}
                  {on ? "추적 중" : "추적"}
                </button>
              </div>
              {/* 단계 스테퍼 */}
              <ol className="mt-3 grid grid-cols-4">
                {BILL_STAGES.map((label, i) => {
                  const done = i <= b.stage;
                  return (
                    <li key={label} className="relative flex flex-col items-center gap-1">
                      {i > 0 && (
                        <span className={cn("absolute right-1/2 top-[5px] h-0.5 w-full", i <= b.stage ? "bg-lime/70" : "bg-white/[0.08]")} />
                      )}
                      <span
                        className={cn(
                          "relative size-3 rounded-full border-2",
                          i === b.stage ? "border-lime bg-lime" : done ? "border-lime/70 bg-canvas" : "border-white/15 bg-canvas",
                        )}
                      />
                      <span className={cn("text-[10px]", i === b.stage ? "font-semibold text-ink" : "text-ink-3")}>{label}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 text-[11px] text-ink-3">최근 · {b.updated}</p>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

function PledgesPanel({ selectedRegion, onSelectRegion }: { selectedRegion: string; onSelectRegion: (c: string) => void }) {
  const [scope, setScope] = React.useState<"all" | "region">("all");
  const { byCode: REGION_BY_CODE } = useRegions();
  const region = REGION_BY_CODE[selectedRegion];
  const docs = scope === "region" ? PLEDGE_DOCS.filter((d) => d.region === selectedRegion) : PLEDGE_DOCS;
  return (
    <>
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: "all", label: "전체" },
          { value: "region", label: `선택 지역 (${region.short})` },
        ]}
      />
      <ul className="mt-3 space-y-2">
        {docs.length === 0 && <Empty>{region.name}에 등록된 공약 문서가 없습니다.</Empty>}
        {docs.map((d) => (
          <li key={d.id}>
            <button onClick={() => onSelectRegion(d.region)} className="block w-full text-left">
              <Row className="transition hover:border-white/15">
                <div className="flex items-start gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-ink-2">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug">{d.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {d.owner} · {REGION_BY_CODE[d.region].short} · {d.category}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-cyan/80" style={{ width: `${d.progress}%` }} />
                  </div>
                  <span className="text-[11px] text-ink-2 tabular">이행 {d.progress}%</span>
                </div>
              </Row>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function NewsPanel({ saved, toggle }: { saved: Set<string>; toggle: (id: string) => void }) {
  const { news: NEWS } = useNews();
  const mine = NEWS.filter((n) => saved.has(n.id));
  const rest = NEWS.filter((n) => !saved.has(n.id));
  const item = (n: (typeof NEWS)[number]) => {
    const on = saved.has(n.id);
    return (
      <li key={n.id}>
        <Row className="flex items-start gap-2.5 p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-3">
              {n.source} · {n.time} · {n.category}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug">{stripTerms(n.objectiveHeadline ?? n.headline)}</p>
          </div>
          <button
            onClick={() => toggle(n.id)}
            aria-label={on ? "저장 취소" : "기사 저장"}
            aria-pressed={on}
            className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/[0.08]"
          >
            {on ? <BookmarkCheck className="size-4 text-lime" /> : <Bookmark className="size-4 text-ink-3" />}
          </button>
        </Row>
      </li>
    );
  };
  return (
    <>
      <SectionLabel>저장됨 {mine.length}건</SectionLabel>
      {mine.length ? <ul className="space-y-2">{mine.map(item)}</ul> : <Empty>아래 기사의 책갈피를 눌러 저장하세요.</Empty>}
      <SectionLabel>오늘의 기사</SectionLabel>
      <ul className="space-y-2">{rest.map(item)}</ul>
    </>
  );
}

function SettingsPanel({ aiMode, onAiModeChange }: { aiMode: boolean; onAiModeChange: (v: boolean) => void }) {
  const [theme, setTheme] = useTheme();
  return (
    <div className="space-y-2">
      <Row className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold">화면 테마</p>
          <p className="mt-0.5 text-[11px] text-ink-3">왼쪽 메뉴의 스위치로도 바꿀 수 있어요.</p>
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
      <Row className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Sparkles className="size-3.5 text-lime" /> AI 객관화 모드
          </p>
          <p className="mt-0.5 text-[11px] text-ink-3">뉴스를 감정 표현을 덜어낸 요약으로 기본 표시합니다.</p>
        </div>
        <Switch checked={aiMode} onCheckedChange={onAiModeChange} label="AI 객관화 모드" />
      </Row>
      <p className="px-1 pt-1 text-[11px] leading-relaxed text-ink-3">
        관심 지역·즐겨찾기·추적 법안·저장한 뉴스는 이 브라우저에만 저장됩니다.
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
              <span className="block text-[13px] font-semibold">{label}</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-3">{desc}</span>
            </span>
          </button>
        </li>
      ))}
      <li className="flex gap-3 p-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-ink-2">
          <Sun className="size-4" />
        </span>
        <span>
          <span className="block text-[13px] font-semibold">라이트/다크 스위치</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-3">해·달 스위치를 눌러 화면 밝기를 전환합니다.</span>
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
    <span className="glass-strong pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] text-ink opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
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
            "absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold tabular",
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
  aiMode,
  onAiModeChange,
}: {
  selectedRegion: string;
  onSelectRegion: (code: string) => void;
  aiMode: boolean;
  onAiModeChange: (v: boolean) => void;
}) {
  const [open, setOpen] = React.useState<PanelKey | null>(null);
  const { politicians: ALL_POLITICIANS } = useRegions();
  const rootRef = React.useRef<HTMLDivElement>(null);

  const [interests, toggleInterest] = useStoredSet("pm-interest-regions", ["11", "31"]);
  const [favorites, toggleFavorite] = useStoredSet("pm-fav-politicians", [ALL_POLITICIANS[0].id]);
  const [followed, toggleFollow] = useStoredSet("pm-followed-bills", ["b1"]);
  const [saved, toggleSaved] = useStoredSet("pm-saved-news", []);

  // 바깥 클릭 · Esc 로 닫기
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
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
  const upcoming = SCHEDULE.filter((s) => {
    const { diff } = dday(s.date);
    return diff >= 0 && diff <= 7;
  }).length;
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
            className="glass-overlay absolute left-[calc(100%+12px)] top-0 flex max-h-[calc(100dvh-110px)] w-[340px] flex-col rounded-2xl"
          >
            <header className="flex items-start gap-3 border-b border-line p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lime text-canvas">
                <panel.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold">{panel.label}</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">{panel.desc}</p>
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
              {open === "regions" && <RegionsPanel interests={interests} toggle={toggleInterest} onSelectRegion={goRegion} />}
              {open === "politicians" && <PoliticiansPanel favorites={favorites} toggle={toggleFavorite} onSelectRegion={goRegion} />}
              {open === "schedule" && <SchedulePanel />}
              {open === "bills" && <BillsPanel followed={followed} toggle={toggleFollow} />}
              {open === "pledges" && <PledgesPanel selectedRegion={selectedRegion} onSelectRegion={goRegion} />}
              {open === "news" && <NewsPanel saved={saved} toggle={toggleSaved} />}
              {open === "settings" && <SettingsPanel aiMode={aiMode} onAiModeChange={onAiModeChange} />}
              {open === "help" && <HelpPanel onOpen={setOpen} />}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
