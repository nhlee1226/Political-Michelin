"use client";

/**
 * 정치인 상세 페이지 화면 (/politicians/[id]). 데이터는 서버(src/db/politician-profile.ts)에서 받아 그대로 그림.
 *  - 국회의원: 헤더(사진·정당·지역·선수·즐겨찾기) · 인적사항·연락처·총선 결과·위원회 일정 · 지표(순위·정당/위원회 평균 비교)
 *              · 탭(법안 / 표결 / 뉴스 / 한줄평 / 재산·자금·출석)
 *  - 지방선거 당선인: 헤더 · 인적사항·선거 결과 · 선거공약 원문 · 뉴스
 * 값이 없으면 숫자를 지어내지 않고 "자료 없음 / 수집 전"으로 보여 줌.
 */
import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ExternalLink,
  FileText,
  Globe,
  IdCard,
  Landmark,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  Newspaper,
  Phone,
  Scale,
  Star,
  Trophy,
  Users,
  Vote,
} from "lucide-react";
import { usePartyLookup } from "@/lib/api";
import { BILL_STEPS } from "@/lib/bill-stage";
import { useSyncedSet } from "@/lib/user-items";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type {
  CandidateBio,
  ElectionResult,
  LocalProfileData,
  MemberProfileData,
  MetricSet,
  PoliticianProfileData,
  ProfileBill,
  ProfileVote,
} from "@/lib/politician-profile";
import { Badge, Card, CardHeader, MichelinStars, PartyTag, Segmented } from "@/components/ui/primitives";
import { Toaster } from "@/components/ui/toaster";
import { CommentThread } from "@/components/dashboard/community-feed";

/* ───────── 공통 조각 ───────── */

const n0 = (v: number | null | undefined, unit = "") => (v == null ? "—" : `${v.toLocaleString()}${unit}`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={cn("rounded-xl border border-dashed border-line px-3 py-5 text-center text-ink-3", "text-[calc(12px*var(--fs))]")}>{children}</p>;
}

function Section({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} />
      <div className="p-5 pt-3">{children}</div>
    </Card>
  );
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className={cn("w-[4.5rem] shrink-0 text-ink-3", "text-[calc(12px*var(--fs))]")}>{k}</dt>
      <dd className={cn("min-w-0 flex-1 break-words text-ink-2", "text-[calc(13px*var(--fs))]")}>{children}</dd>
    </div>
  );
}

function Avatar({ name, color, photo }: { name: string; color: string; photo?: string | null }) {
  const [broken, setBroken] = React.useState(false);
  return photo && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element -- 국회 사진 서버(외부 도메인)를 그대로 씀
    <img
      src={photo}
      alt={`${name} 사진`}
      onError={() => setBroken(true)}
      className="size-20 shrink-0 rounded-2xl border-2 object-cover sm:size-24"
      style={{ borderColor: color }}
    />
  ) : (
    <div
      className="grid size-20 shrink-0 place-items-center rounded-2xl border-2 text-xl font-semibold sm:size-24 sm:text-2xl"
      style={{ borderColor: color, background: `${color}22` }}
      aria-hidden
    >
      {name.slice(-2)}
    </div>
  );
}

function ShareButton({ name }: { name: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setDone(true);
          toast({ title: name, message: "상세 페이지 주소를 복사했어요" });
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast({ message: "주소를 복사하지 못했어요" });
        }
      }}
      className={cn("flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-ink-2 transition hover:border-white/20 hover:text-ink", "text-[calc(12px*var(--fs))]")}
    >
      {done ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      링크 복사
    </button>
  );
}

function PageTop({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <Link
        href="/"
        className={cn("flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5 text-ink-2 transition hover:border-white/20 hover:text-ink", "text-[calc(12px*var(--fs))]")}
      >
        <ArrowLeft className="size-3.5" /> 대시보드
      </Link>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/** 가로 막대 한 줄 (값 / 최대값). 색은 화면 기본 강조색, 숫자는 본문 잉크 */
function HBar({ label, value, max, text, strong, title }: { label: string; value: number | null; max: number; text: string; strong?: boolean; title?: string }) {
  const w = value == null || max <= 0 ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2" title={title ?? `${label}: ${text}`}>
      <span className={cn("w-16 shrink-0 truncate", strong ? "font-semibold text-ink" : "text-ink-3", "text-[calc(11px*var(--fs))]")}>{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: strong ? "var(--color-lime)" : "var(--chart-muted)" }} />
      </div>
      <span className={cn("w-14 shrink-0 text-right tabular", strong ? "font-semibold text-ink" : "text-ink-2", "text-[calc(11px*var(--fs))]")}>{text}</span>
    </div>
  );
}

/* ───────── 인적사항 · 선거 결과 (의원·당선인 공통) ───────── */

function BioCard({
  bio,
  extra,
  career,
  hideBirthday,
}: {
  bio: CandidateBio | null;
  extra?: React.ReactNode;
  career?: string | null;
  /** 위 extra 에 생년월일이 이미 있으면 나이 옆 생일은 숨김 */
  hideBirthday?: boolean;
}) {
  const lines = career?.split("\n").map((s) => s.trim()).filter(Boolean) ?? [];
  const [more, setMore] = React.useState(false);
  const empty = !bio && !extra && lines.length === 0;
  return (
    <Section title="인적사항" subtitle="국회 인적사항 · 선관위 후보 등록 정보" icon={<IdCard className="size-4" />}>
      {empty ? (
        <Empty>인적사항 자료가 없습니다. (의원 수집기 첫 실행 뒤 채워짐)</Empty>
      ) : (
        <>
          <dl className="divide-y divide-line">
            {extra}
            {bio?.age != null && (
              <Field k="나이">
                {bio.age}세{bio.birthday && !hideBirthday ? ` (${bio.birthday})` : ""}
                <span className="text-ink-3"> (선거 당시)</span>
              </Field>
            )}
            {bio?.job && <Field k="직업">{bio.job}</Field>}
            {bio?.edu && <Field k="학력">{bio.edu}</Field>}
            {bio && bio.career.length > 0 && (
              <Field k="경력">
                <ul className="space-y-0.5">
                  {bio.career.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </Field>
            )}
          </dl>
          {lines.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <p className={cn("mb-1.5 text-ink-3", "text-[calc(11px*var(--fs))]")}>약력 (국회 원문)</p>
              <ul className={cn("space-y-0.5 text-ink-2", "text-[calc(12px*var(--fs))]")}>
                {(more ? lines : lines.slice(0, 8)).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              {lines.length > 8 && (
                <button onClick={() => setMore((v) => !v)} className={cn("mt-1.5 font-semibold text-lime hover:underline", "text-[calc(11px*var(--fs))]")}>
                  {more ? "접기" : `약력 ${lines.length - 8}줄 더 보기`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function ElectionCard({ e }: { e: ElectionResult | null }) {
  const party = usePartyLookup();
  return (
    <Section title="선거 결과" subtitle={e ? `${e.election} · ${e.sgg_name}` : "선관위 개표 결과"} icon={<Vote className="size-4" />}>
      {!e ? (
        <Empty>지역구 개표 결과가 없습니다. (비례대표이거나 선관위 데이터 수집 전)</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line bg-white/[0.02] p-3">
              <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>득표율</p>
              <p className="mt-0.5 text-xl font-semibold tabular">{pct(e.vote_rate)}</p>
              <p className={cn("text-ink-3 tabular", "text-[calc(11px*var(--fs))]")}>{n0(e.votes, "표")}</p>
            </div>
            <div className="rounded-xl border border-line bg-white/[0.02] p-3">
              <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>2위와 차이</p>
              <p className="mt-0.5 text-xl font-semibold tabular">{e.margin_rate == null ? "—" : `${e.margin_rate}%p`}</p>
              <p className={cn("text-ink-3 tabular", "text-[calc(11px*var(--fs))]")}>{e.margin_votes == null ? "—" : `${e.margin_votes.toLocaleString()}표`}</p>
            </div>
          </div>
          {e.vote_rate != null && e.runner_up?.vote_rate != null && (
            <div className="mt-3 space-y-1.5">
              <HBar label="당선" value={e.vote_rate} max={100} text={pct(e.vote_rate)} strong />
              <HBar label={e.runner_up.name} value={e.runner_up.vote_rate} max={100} text={pct(e.runner_up.vote_rate)} />
            </div>
          )}
          <dl className="mt-3 divide-y divide-line border-t border-line">
            {e.runner_up && (
              <Field k="2위">
                {e.runner_up.name}{" "}
                {e.runner_up.party_name && (
                  <PartyTag color={party(e.runner_up.party_name).color} name={e.runner_up.party_name} className={"text-[calc(11px*var(--fs))]"} />
                )}
              </Field>
            )}
            <Field k="투표율">{pct(e.turnout)}</Field>
          </dl>
        </>
      )}
    </Section>
  );
}

/* ───────── 뉴스 (의원·당선인 공통) ───────── */

function leanText(lean: number) {
  const abs = Math.abs(lean);
  if (abs < 15) return "균형";
  return `${lean < 0 ? "진보" : "보수"} 쪽 ${abs < 40 ? "약간" : "치우침"}`;
}

function NewsBlock({ news }: { news: MemberProfileData["news"] }) {
  const max = Math.max(1, ...news.daily.map((d) => d.n));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-line bg-white/[0.02] p-3">
          <div className="flex items-baseline justify-between">
            <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>최근 30일 언급 기사</p>
            <p className="text-lg font-semibold tabular">{news.total_30d.toLocaleString()}건</p>
          </div>
          <div className="mt-2 flex h-14 items-end gap-[2px]" role="img" aria-label={`최근 30일 날짜별 언급 기사 수, 합계 ${news.total_30d}건`}>
            {news.daily.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day}: ${d.n}건`}>
                <div
                  className="w-full rounded-t-[3px] transition group-hover:opacity-80"
                  style={{ height: d.n ? `${Math.max(6, (d.n / max) * 100)}%` : "2px", background: d.n ? "var(--color-cyan)" : "var(--chart-muted)" }}
                />
              </div>
            ))}
          </div>
          <div className={cn("mt-1 flex justify-between text-ink-3 tabular", "text-[calc(10px*var(--fs))]")}>
            <span>{news.daily[0]?.day.slice(5)}</span>
            <span>오늘</span>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-white/[0.02] p-3 sm:w-48">
          <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>언급 기사 논조 (AI 분석)</p>
          {news.avg_lean == null ? (
            <p className={cn("mt-2 text-ink-3", "text-[calc(12px*var(--fs))]")}>분석된 기사 없음</p>
          ) : (
            <>
              <p className="mt-0.5 text-lg font-semibold">{leanText(news.avg_lean)}</p>
              <div className="relative mt-2 h-1.5 rounded-full bg-white/[0.06]">
                <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-ink-3" />
                <span
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-lime"
                  style={{ left: `${(news.avg_lean + 100) / 2}%` }}
                />
              </div>
              <div className={cn("mt-1 flex justify-between text-ink-3", "text-[calc(10px*var(--fs))]")}>
                <span>진보</span>
                <span className="tabular">{news.analyzed}건 평균</span>
                <span>보수</span>
              </div>
            </>
          )}
        </div>
      </div>
      {news.articles.length === 0 ? (
        <Empty>이 정치인이 언급된 수집 기사가 없습니다.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {news.articles.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-xl border border-line bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.04]"
              >
                <div className="min-w-0 flex-1">
                  <p className={cn("leading-snug text-ink", "text-[calc(13px*var(--fs))]")}>{a.headline.replace(/\[\[(.+?)\]\]/g, "$1")}</p>
                  <p className={cn("mt-1 text-ink-3", "text-[calc(11px*var(--fs))]")}>
                    {a.source ?? "언론사 —"} · {new Date(a.published_at).toLocaleDateString("ko-KR")}
                    {a.lean != null && ` · ${leanText(a.lean)}`}
                  </p>
                </div>
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-ink-3 group-hover:text-ink" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>출처: 네이버 뉴스 검색으로 수집한 기사 중 이름이 나온 기사 (동명이인은 제외). 논조는 AI 분석 결과이며 정답이 아닙니다.</p>
    </div>
  );
}

/* ───────── 국회의원 ───────── */

const METRICS: { key: keyof Omit<MetricSet, "n">; rank: keyof MemberProfileData["ranks"]; label: string; unit: string; hint: string }[] = [
  { key: "bills_proposed", rank: "bills_proposed", label: "대표발의", unit: "건", hint: "대표발의한 법안 수" },
  { key: "reflect_rate", rank: "reflect_rate", label: "법안 반영률", unit: "%", hint: "원안·수정가결 + 대안반영 ÷ 대표발의" },
  { key: "vote_participation", rank: "vote_participation", label: "표결 참여율", unit: "%", hint: "(찬성 + 반대 + 기권) ÷ 본회의 표결 대상 법안" },
  { key: "cosponsored", rank: "cosponsored", label: "공동발의", unit: "건", hint: "공동발의자로 이름을 올린 법안 수" },
];

function MetricsCard({ p }: { p: MemberProfileData }) {
  const groups = [
    { name: "이 의원", set: p.compare.me, strong: true },
    p.compare.party && { name: `${p.party_id} 평균`, set: p.compare.party },
    p.compare.committee && { name: "위원회 평균", set: p.compare.committee },
    { name: "전체 평균", set: p.compare.all },
  ].filter(Boolean) as { name: string; set: MetricSet; strong?: boolean }[];

  return (
    <Section
      title="의정활동 지표"
      subtitle={`전체 ${p.ranks.total}명 중 순위 · 같은 정당·위원회 평균과 비교`}
      icon={<Trophy className="size-4" />}
      action={<MichelinStars count={p.stars} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {METRICS.map((m) => {
          const mine = p.compare.me[m.key];
          const max = Math.max(...groups.map((g) => g.set[m.key] ?? 0), m.unit === "%" ? 100 : 1);
          const rank = p.ranks[m.rank];
          return (
            <div key={m.key} className="rounded-xl border border-line bg-white/[0.02] p-3" title={m.hint}>
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("text-ink-3", "text-[calc(12px*var(--fs))]")}>{m.label}</p>
                {rank != null && <Badge tone="neutral" className="tabular">{rank}위 / {p.ranks.total}</Badge>}
              </div>
              <p className="mt-0.5 text-2xl font-semibold tabular">
                {mine == null ? <span className={cn("text-ink-3", "text-[calc(13px*var(--fs))]")}>{m.key === "cosponsored" ? "수집 전" : "자료 없음"}</span> : `${mine.toLocaleString()}${m.unit}`}
              </p>
              {mine != null && (
                <div className="mt-2 space-y-1">
                  {groups.map((g) => (
                    <HBar
                      key={g.name}
                      label={g.name}
                      value={g.set[m.key]}
                      max={max}
                      text={g.set[m.key] == null ? "—" : `${g.set[m.key]!.toLocaleString()}${m.unit}`}
                      strong={g.strong}
                      title={`${g.name}${g.set.n > 1 ? ` (${g.set.n}명)` : ""}: ${g.set[m.key] ?? "—"}${m.unit}`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat k="반영 법안" v={`${p.bills_reflected.toLocaleString()}건`} />
        <MiniStat k="계류 중" v={`${p.bills.pending.toLocaleString()}건`} />
        <MiniStat k="표결 대상" v={`${p.total_votes.toLocaleString()}건`} />
        <MiniStat k="당과 다른 표" v={p.votes.comparable ? `${p.votes.dissent_total}건` : "—"} />
      </div>
      <p className={cn("mt-3 leading-relaxed text-ink-3", "text-[calc(11px*var(--fs))]")}>
        <Badge className={cn("mr-1.5 px-1.5 py-0", "text-[calc(10px*var(--fs))]")}>기준</Badge>
        {p.score_rule}
      </p>
    </Section>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.02] px-2.5 py-2">
      <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>{k}</p>
      <p className={cn("font-semibold tabular", "text-[calc(14px*var(--fs))]")}>{v}</p>
    </div>
  );
}

const TONE_COLOR = { active: "var(--color-cyan)", good: "var(--color-lime)", bad: "var(--color-warn)", neutral: "var(--chart-muted)" } as const;

function StepDots({ b }: { b: ProfileBill }) {
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`처리 단계: ${BILL_STEPS[b.reached]}까지 진행, ${b.status}`}>
      {BILL_STEPS.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className="h-px w-3" style={{ background: i <= b.reached ? TONE_COLOR[b.tone] : "var(--chart-muted)" }} />}
          <span
            title={s}
            className="size-2 rounded-full"
            style={{ background: i <= b.reached ? TONE_COLOR[b.tone] : "transparent", boxShadow: `inset 0 0 0 1.5px ${i <= b.reached ? TONE_COLOR[b.tone] : "var(--chart-muted)"}` }}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

function BillsTab({ p }: { p: MemberProfileData }) {
  const [view, setView] = React.useState<"all" | "pending" | "closed">("all");
  const [limit, setLimit] = React.useState(15);
  const list = p.bills.list.filter((b) => (view === "all" ? true : view === "pending" ? !b.closed : b.closed));
  const max = Math.max(1, ...p.bills.by_committee.map((c) => c.n));
  return (
    <div className="space-y-5">
      <div>
        <p className={cn("mb-2 font-semibold", "text-[calc(13px*var(--fs))]")}>법안 분야 (소관 위원회)</p>
        {p.bills.by_committee.length === 0 ? (
          <Empty>대표발의 법안이 없습니다.</Empty>
        ) : (
          <div className="space-y-1.5">
            {p.bills.by_committee.slice(0, 8).map((c) => (
              <div key={c.committee} className="flex items-center gap-2" title={`${c.committee}: ${c.n}건`}>
                <span className={cn("w-32 shrink-0 truncate text-ink-2", "text-[calc(12px*var(--fs))]")}>{c.committee}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full bg-lime" style={{ width: `${Math.max(3, (c.n / max) * 100)}%` }} />
                </div>
                <span className={cn("w-10 text-right tabular text-ink-2", "text-[calc(12px*var(--fs))]")}>{c.n}</span>
              </div>
            ))}
            {p.bills.by_committee.length > 8 && (
              <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>그 밖의 위원회 {p.bills.by_committee.slice(8).reduce((s, c) => s + c.n, 0)}건</p>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className={cn("font-semibold", "text-[calc(13px*var(--fs))]")}>대표발의 법안 · 처리 단계</p>
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v);
              setLimit(15);
            }}
            options={[
              { value: "all", label: `전체 ${p.bills.list.length}` },
              { value: "pending", label: `진행 중 ${p.bills.pending}` },
              { value: "closed", label: `처리 끝 ${p.bills.closed}` },
            ]}
          />
        </div>
        {list.length === 0 ? (
          <Empty>해당하는 법안이 없습니다.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {list.slice(0, limit).map((b) => (
              <li key={b.bill_id} className="rounded-xl border border-line bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-3">
                  {b.detail_url ? (
                    <a href={b.detail_url} target="_blank" rel="noopener noreferrer" className={cn("leading-snug text-ink hover:underline", "text-[calc(13px*var(--fs))]")}>
                      {b.title}
                    </a>
                  ) : (
                    <p className={cn("leading-snug text-ink", "text-[calc(13px*var(--fs))]")}>{b.title}</p>
                  )}
                  <Badge tone={b.tone === "good" ? "lime" : b.tone === "bad" ? "warn" : "neutral"} className="shrink-0">
                    {b.status}
                  </Badge>
                </div>
                <div className={cn("mt-2 flex flex-wrap items-center justify-between gap-2 text-ink-3", "text-[calc(11px*var(--fs))]")}>
                  <StepDots b={b} />
                  <span className="tabular">
                    {b.propose_date ?? "발의일 —"}
                    {b.committee && ` · ${b.committee}`}
                    {b.latest && b.latest.date !== b.propose_date && ` · 최근 ${b.latest.text} ${b.latest.date}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list.length > limit && (
          <button
            onClick={() => setLimit((l) => l + 30)}
            className={cn("mt-2 w-full rounded-xl border border-line py-2 font-semibold text-ink-2 transition hover:text-ink", "text-[calc(12px*var(--fs))]")}
          >
            {list.length - limit}건 더 보기
          </button>
        )}
      </div>

      <div>
        <p className={cn("mb-2 font-semibold", "text-[calc(13px*var(--fs))]")}>
          최근 공동발의 법안 {p.cosponsored != null && <span className="font-normal text-ink-3">· 모두 {p.cosponsored.toLocaleString()}건</span>}
        </p>
        {p.cosponsored_bills == null ? (
          <Empty>공동발의 자료는 법안 수집기가 다음에 돌 때 채워집니다.</Empty>
        ) : p.cosponsored_bills.length === 0 ? (
          <Empty>공동발의한 법안이 없습니다.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {p.cosponsored_bills.map((b) => (
              <li key={b.bill_id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  {b.detail_url ? (
                    <a href={b.detail_url} target="_blank" rel="noopener noreferrer" className={cn("leading-snug hover:underline", "text-[calc(13px*var(--fs))]")}>
                      {b.title}
                    </a>
                  ) : (
                    <p className={cn("leading-snug", "text-[calc(13px*var(--fs))]")}>{b.title}</p>
                  )}
                  <p className={cn("mt-0.5 text-ink-3", "text-[calc(11px*var(--fs))]")}>
                    {b.proposer ? `${b.proposer} 의원 대표발의` : "대표발의 —"} · {b.propose_date ?? "—"}
                  </p>
                </div>
                <span className={cn("shrink-0 text-ink-3", "text-[calc(11px*var(--fs))]")}>{b.proc_result || "계류"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>출처: 국회 열린국회정보 의안정보 · 법안 제목을 누르면 의안정보시스템이 새 탭에서 열립니다.</p>
    </div>
  );
}

const VOTE_KINDS = [
  { key: "votes_yes", label: "찬성", color: "var(--color-lime)" },
  { key: "votes_no", label: "반대", color: "var(--color-warn)" },
  { key: "votes_abstain", label: "기권", color: "var(--color-cyan)" },
  { key: "votes_absent", label: "불참", color: "var(--chart-muted)" },
] as const;

const RESULT_TONE: Record<ProfileVote["result"], "lime" | "warn" | "neutral"> = { 찬성: "lime", 반대: "warn", 기권: "neutral", 불참: "neutral" };

function VoteRow({ v }: { v: ProfileVote }) {
  const differs = v.result !== "불참" && v.party_result && v.party_result !== v.result;
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        {v.detail_url ? (
          <a href={v.detail_url} target="_blank" rel="noopener noreferrer" className={cn("leading-snug hover:underline", "text-[calc(13px*var(--fs))]")}>
            {v.title}
          </a>
        ) : (
          <p className={cn("leading-snug", "text-[calc(13px*var(--fs))]")}>{v.title}</p>
        )}
        <p className={cn("mt-0.5 text-ink-3 tabular", "text-[calc(11px*var(--fs))]")}>
          {v.vote_date}
          {v.party_result && ` · 당 다수 ${v.party_result}${v.party_share != null ? ` ${v.party_share}%` : ""}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {differs && <Badge tone="warn">당과 다름</Badge>}
        <Badge tone={RESULT_TONE[v.result]}>{v.result}</Badge>
      </div>
    </li>
  );
}

function VotesTab({ p }: { p: MemberProfileData }) {
  const [view, setView] = React.useState<"dissent" | "recent">(p.votes.dissent_total ? "dissent" : "recent");
  if (!p.total_votes) return <Empty>본회의 표결 기록이 없습니다.</Empty>;
  const list = view === "dissent" ? p.votes.dissent : p.votes.recent;
  return (
    <div className="space-y-5">
      <div>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={VOTE_KINDS.map((k) => `${k.label} ${p[k.key]}건`).join(", ")}>
          {VOTE_KINDS.map((k) => p[k.key] > 0 && <span key={k.key} title={`${k.label} ${p[k.key]}건`} style={{ flexGrow: p[k.key], background: k.color }} />)}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {VOTE_KINDS.map((k) => (
            <div key={k.key} className="rounded-lg border border-line bg-white/[0.02] p-2">
              <p className={cn("flex items-center gap-1 text-ink-3", "text-[calc(11px*var(--fs))]")}>
                <span className="size-1.5 rounded-full" style={{ background: k.color }} />
                {k.label}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular">{p[k.key].toLocaleString()}</p>
            </div>
          ))}
        </div>
        <p className={cn("mt-2 text-ink-3", "text-[calc(11px*var(--fs))]")}>
          표결 대상 {p.total_votes.toLocaleString()}건 · 참여율 {pct(p.vote_participation)} · 22대 국회에서 가결·부결된 법안의 본회의 표결
        </p>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className={cn("font-semibold", "text-[calc(13px*var(--fs))]")}>
            {p.party_id && p.party_id !== "무소속"
              ? `당 다수와 다른 표 ${p.votes.dissent_total}건 / 비교 가능한 표결 ${p.votes.comparable}건`
              : "표결 기록"}
          </p>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "dissent", label: "당과 다른 표", soon: p.votes.dissent_total === 0 },
              { value: "recent", label: "최근 표결" },
            ]}
          />
        </div>
        {list.length === 0 ? (
          <Empty>{view === "dissent" ? "당 다수와 다르게 던진 표가 없습니다." : "표결 기록이 없습니다."}</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((v) => (
              <VoteRow key={v.bill_id} v={v} />
            ))}
          </ul>
        )}
        <p className={cn("mt-2 text-ink-3", "text-[calc(11px*var(--fs))]")}>
          당 다수 = 같은 정당 의원 중 그 법안에 표를 던진(불참 제외) 사람들의 가장 많은 선택. 무소속은 비교하지 않습니다.
        </p>
      </div>
    </div>
  );
}

const won = (v: number) => {
  const abs = Math.abs(v);
  const s = abs >= 1e8 ? `${(abs / 1e8).toFixed(abs >= 1e10 ? 0 : 1)}억` : abs >= 1e4 ? `${Math.round(abs / 1e4).toLocaleString()}만` : abs.toLocaleString();
  return `${v < 0 ? "-" : ""}${s}원`;
};

function SourceLink({ url }: { url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-ink-3 hover:text-ink">
      원문 <ExternalLink className="size-3" />
    </a>
  ) : null;
}

function RecordsTab({ p }: { p: MemberProfileData }) {
  const { attendance, assets, funds } = p.records;
  const missing = (what: string, src: string) => (
    <Empty>
      {what} 자료가 아직 입력되지 않았습니다. 공식 API 가 없어 {src} 원문에서 옮겨 넣습니다 (npm run import:records).
    </Empty>
  );
  return (
    <div className="space-y-6">
      <div>
        <p className={cn("mb-2 font-semibold", "text-[calc(13px*var(--fs))]")}>출석</p>
        {!attendance || attendance.length === 0 ? (
          missing("본회의·위원회 출석", "국회 공보·회의록")
        ) : (
          <div className="space-y-1.5">
            {attendance.map((a) => {
              const r = Math.round((1000 * a.attended) / a.total) / 10;
              return (
                <div key={`${a.kind}-${a.period}`} className="flex items-center gap-2" title={`${a.kind} ${a.period}: ${a.attended}/${a.total}회 (${r}%)`}>
                  <span className={cn("w-40 shrink-0 truncate text-ink-2", "text-[calc(12px*var(--fs))]")}>
                    {a.kind} · {a.period}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <div className="h-full rounded-full bg-lime" style={{ width: `${r}%` }} />
                  </div>
                  <span className={cn("w-24 shrink-0 text-right tabular text-ink-2", "text-[calc(12px*var(--fs))]")}>
                    {r}% ({a.attended}/{a.total})
                  </span>
                  <span className={cn("w-10 shrink-0", "text-[calc(11px*var(--fs))]")}>
                    <SourceLink url={a.source_url} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className={cn("mb-2 font-semibold", "text-[calc(13px*var(--fs))]")}>재산공개</p>
        {!assets || assets.length === 0 ? (
          missing("재산공개", "국회공보(공직자 재산 정기공개)")
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className={cn("w-full min-w-[520px] text-left tabular", "text-[calc(12px*var(--fs))]")}>
              <thead className="text-ink-3">
                <tr className="border-b border-line">
                  {["연도", "총액", "부동산", "예금", "증권", "채무", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => {
                  const prev = assets[i + 1];
                  const diff = prev ? a.total - prev.total : null;
                  const k = (v: number | null) => (v == null ? "—" : won(v * 1000));
                  return (
                    <tr key={a.year} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">{a.year}</td>
                      <td className="px-3 py-2 font-semibold text-ink">
                        {k(a.total)}
                        {diff != null && <span className={cn("ml-1 font-normal text-ink-3", "text-[calc(11px*var(--fs))]")}>({diff >= 0 ? "+" : ""}{k(diff)})</span>}
                      </td>
                      <td className="px-3 py-2">{k(a.real_estate)}</td>
                      <td className="px-3 py-2">{k(a.deposits)}</td>
                      <td className="px-3 py-2">{k(a.securities)}</td>
                      <td className="px-3 py-2">{k(a.debts)}</td>
                      <td className="px-3 py-2">
                        <SourceLink url={a.source_url} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <p className={cn("mb-2 font-semibold", "text-[calc(13px*var(--fs))]")}>정치자금</p>
        {!funds || funds.length === 0 ? (
          missing("정치자금 수입·지출", "선관위 정치자금 회계보고 공개")
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className={cn("w-full min-w-[420px] text-left tabular", "text-[calc(12px*var(--fs))]")}>
              <thead className="text-ink-3">
                <tr className="border-b border-line">
                  {["연도", "수입", "그중 후원금", "지출", ""].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funds.map((f) => (
                  <tr key={f.year} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{f.year}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{won(f.income)}</td>
                    <td className="px-3 py-2">{f.donations == null ? "—" : won(f.donations)}</td>
                    <td className="px-3 py-2">{won(f.expense)}</td>
                    <td className="px-3 py-2">
                      <SourceLink url={f.source_url} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactCard({ p }: { p: MemberProfileData }) {
  const c = p.contact;
  const any = Object.values(c).some(Boolean);
  return (
    <Section title="연락처" subtitle="국회 인적사항 공개 정보" icon={<Phone className="size-4" />}>
      {!any ? (
        <Empty>연락처 자료가 없습니다. (의원 수집기 첫 실행 뒤 채워짐)</Empty>
      ) : (
        <dl className="divide-y divide-line">
          {c.tel && (
            <Field k="전화">
              <a href={`tel:${c.tel.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-ink hover:underline">
                <Phone className="size-3" /> {c.tel}
              </a>
            </Field>
          )}
          {c.email && (
            <Field k="이메일">
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 break-all hover:text-ink hover:underline">
                <Mail className="size-3 shrink-0" /> {c.email}
              </a>
            </Field>
          )}
          {c.homepage && (
            <Field k="홈페이지">
              <a href={c.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all hover:text-ink hover:underline">
                <Globe className="size-3 shrink-0" /> {c.homepage.replace(/^https?:\/\//, "")}
              </a>
            </Field>
          )}
          {c.office && <Field k="의원회관">{c.office}</Field>}
          {c.staff && <Field k="보좌관">{c.staff}</Field>}
          {c.secretary && <Field k="선임비서관">{c.secretary}</Field>}
          {c.secretary2 && <Field k="비서관">{c.secretary2}</Field>}
        </dl>
      )}
    </Section>
  );
}

function ScheduleCard({ p }: { p: MemberProfileData }) {
  return (
    <Section title="다가오는 일정" subtitle="소속 위원회 회의 · 본회의 (14일)" icon={<CalendarDays className="size-4" />}>
      {p.schedule == null ? (
        <Empty>국회 일정 수집 전입니다.</Empty>
      ) : p.schedule.length === 0 ? (
        <Empty>앞으로 14일 안에 잡힌 일정이 없습니다.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {p.schedule.map((s, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-line bg-white/[0.02] px-3 py-2">
              <div className={cn("w-14 shrink-0 text-ink-3 tabular", "text-[calc(11px*var(--fs))]")}>
                <p className="font-semibold text-ink-2">{s.date.slice(5).replace("-", ".")}</p>
                <p>{s.time ?? ""}</p>
              </div>
              <div className="min-w-0">
                <p className={cn("leading-snug", "text-[calc(12px*var(--fs))]")}>{s.title}</p>
                <p className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>{[s.committee, s.place].filter(Boolean).join(" · ") || s.kind || ""}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

type Tab = "bills" | "votes" | "news" | "comments" | "records";

function MemberView({ p }: { p: MemberProfileData }) {
  const party = usePartyLookup()(p.party_id, "무소속");
  const [favorites, toggleFavorite, ready] = useSyncedSet("pm-fav-members", [], "politician");
  const fav = favorites.has(p.id);
  const [tab, setTab] = React.useState<Tab>("bills");
  const district = p.elect_type === "비례대표" ? "비례대표" : (p.district ?? "—");

  return (
    <>
      <PageTop>
        <ShareButton name={p.name} />
      </PageTop>

      {/* 헤더 */}
      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={p.name} color={party.color} photo={p.photo_url} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{p.name}</h1>
              {(p.hanja_name || p.eng_name) && <span className={cn("text-ink-3", "text-[calc(13px*var(--fs))]")}>{[p.hanja_name, p.eng_name].filter(Boolean).join(" · ")}</span>}
              <MichelinStars count={p.stars} />
            </div>
            <div className={cn("mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2", "text-[calc(13px*var(--fs))]")}>
              <PartyTag color={party.color} name={party.name} className={"text-[calc(13px*var(--fs))]"} />
              <span className="text-ink-3">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5 text-ink-3" />
                {district}
              </span>
              <span className="text-ink-3">·</span>
              <span>{p.term == null ? "선수 —" : `${p.term}선`}</span>
              {p.units && <span className="text-ink-3">({p.units})</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.committees.map((c) => (
                <Badge key={c} tone={c === p.committee ? "lime" : "neutral"}>
                  <Landmark className="size-3" /> {c}
                  {c === p.committee && p.job_title ? ` ${p.job_title}` : ""}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                toggleFavorite(p.id);
                toast({ title: p.name, message: fav ? "즐겨찾기에서 뺐어요" : "즐겨찾는 정치인에 넣었어요" });
              }}
              aria-pressed={fav}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-semibold transition disabled:opacity-50",
                fav ? "border-lime/40 bg-lime/10 text-lime" : "border-line text-ink-2 hover:border-white/20 hover:text-ink",
                "text-[calc(13px*var(--fs))]",
              )}
            >
              <Star className={cn("size-4", fav && "fill-lime")} />
              {fav ? "즐겨찾는 중" : "즐겨찾기"}
            </button>
            <p className={cn("inline-flex items-center gap-1 text-ink-3", "text-[calc(12px*var(--fs))]")}>
              <Users className="size-3.5" />
              {p.followers == null ? "팔로워 —" : `회원 ${p.followers.toLocaleString()}명이 즐겨찾기`}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* 왼쪽: 인물 정보 (휴대폰에서는 의정활동 다음에) */}
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-none">
          <BioCard
            bio={p.bio}
            career={p.career}
            hideBirthday={!!p.birth_date}
            extra={
              <>
                {p.birth_date && <Field k="생년월일">{p.birth_date}</Field>}
                {p.gender && <Field k="성별">{p.gender}</Field>}
                <Field k="선출">{p.elect_type ?? "—"}</Field>
              </>
            }
          />
          <ContactCard p={p} />
          <ElectionCard e={p.election} />
          <ScheduleCard p={p} />
        </div>

        {/* 오른쪽: 의정활동 (휴대폰에서는 맨 위) */}
        <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-none">
          <MetricsCard p={p} />
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <h2 className={cn("font-semibold tracking-tight", "text-[calc(15px*var(--fs))]")}>상세 기록</h2>
              <div className="max-w-full overflow-x-auto">
                <Segmented
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "bills", label: "법안" },
                    { value: "votes", label: "표결" },
                    { value: "news", label: "뉴스" },
                    { value: "comments", label: "한줄평" },
                    { value: "records", label: "재산·자금·출석" },
                  ]}
                />
              </div>
            </div>
            <div className="p-5 pt-4">
              {tab === "bills" && <BillsTab p={p} />}
              {tab === "votes" && <VotesTab p={p} />}
              {tab === "news" && <NewsBlock news={p.news} />}
              {tab === "comments" && (
                <CommentThread targetType="politician" targetId={p.id} placeholder={`${p.name} 의원에 대한 한줄평을 남겨주세요 (AI 모더레이션 적용)`} />
              )}
              {tab === "records" && <RecordsTab p={p} />}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ───────── 지방선거 당선인 ───────── */

function PledgeItem({ pl }: { pl: LocalProfileData["pledges"][number] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className="rounded-xl border border-line bg-white/[0.02]">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-2.5 p-3 text-left">
        <span className={cn("mt-0.5 shrink-0 text-ink-3 tabular", "text-[calc(12px*var(--fs))]")}>{pl.no}</span>
        <span className="min-w-0 flex-1">
          <span className={cn("block leading-snug text-ink", "text-[calc(13px*var(--fs))]")}>{pl.title ?? "(제목 없음)"}</span>
          {pl.realm && <span className={cn("text-ink-3", "text-[calc(11px*var(--fs))]")}>{pl.realm}</span>}
        </span>
        <span className={cn("shrink-0 text-ink-3", "text-[calc(11px*var(--fs))]")}>{open ? "접기" : "원문"}</span>
      </button>
      {open && <p className={cn("whitespace-pre-line border-t border-line px-3 py-3 leading-relaxed text-ink-2", "text-[calc(12px*var(--fs))]")}>{pl.content || "내용 없음"}</p>}
    </li>
  );
}

function LocalView({ p }: { p: LocalProfileData }) {
  const party = usePartyLookup()(p.party_name, "정당 없음");
  return (
    <>
      <PageTop>
        <ShareButton name={p.name} />
      </PageTop>
      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={p.name} color={party.color} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{p.name}</h1>
              {p.bio.hanja_name && <span className={cn("text-ink-3", "text-[calc(13px*var(--fs))]")}>{p.bio.hanja_name}</span>}
            </div>
            <div className={cn("mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2", "text-[calc(13px*var(--fs))]")}>
              <PartyTag color={party.color} name={party.name} className={"text-[calc(13px*var(--fs))]"} />
              <span className="text-ink-3">·</span>
              <span>{p.office}</span>
              <span className="text-ink-3">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5 text-ink-3" />
                {p.sd_name === p.sgg_name ? p.sd_name : `${p.sd_name} ${p.sgg_name}`}
              </span>
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <BioCard bio={p.bio} extra={p.bio.gender ? <Field k="성별">{p.bio.gender}</Field> : undefined} />
          <ElectionCard e={p.election} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Section title="선거공약" subtitle={`${p.pledges.length}개 · 선관위 원문 그대로 · 이행률은 공식 데이터가 없어 표시하지 않음`} icon={<FileText className="size-4" />}>
            {p.pledges.length === 0 ? (
              <Empty>공약 데이터가 없습니다.</Empty>
            ) : (
              <ol className="space-y-1.5">
                {p.pledges.map((pl) => (
                  <PledgeItem key={pl.no} pl={pl} />
                ))}
              </ol>
            )}
          </Section>
          <Section title="관련 뉴스" icon={<Newspaper className="size-4" />}>
            <NewsBlock news={p.news} />
          </Section>
          <Section title="한줄평" icon={<MessageSquare className="size-4" />}>
            <CommentThread targetType="politician" targetId={p.id} placeholder={`${p.name} ${p.office}에 대한 한줄평을 남겨주세요 (AI 모더레이션 적용)`} />
          </Section>
        </div>
      </div>
    </>
  );
}

export function PoliticianProfileView({ data }: { data: PoliticianProfileData }) {
  return (
    <main className="aurora min-h-svh">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {data.kind === "member" ? <MemberView p={data} /> : <LocalView p={data} />}
        <p className={cn("mt-8 flex items-center justify-center gap-1.5 text-center text-ink-3", "text-[calc(11px*var(--fs))]")}>
          <Scale className="size-3.5" /> 별점·순위에는 정당·이념 변수를 넣지 않습니다 · 자료 기준 {new Date(data.updated_at).toLocaleString("ko-KR")}
        </p>
      </div>
      <Toaster />
    </main>
  );
}
