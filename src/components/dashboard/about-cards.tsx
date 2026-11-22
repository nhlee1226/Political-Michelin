"use client";

/**
 * 팀이 직접 만든 부분을 보여 주는 카드 (발표 피드백: "API 보다 팀의 노력이 보이게")
 *  - BuildStoryCard : 모으기 → 정리하기 → 분석하기 → 보여주기 4단계 + 각 단계의 실제 숫자(/api/stats)
 *  - StarRuleCard   : 미슐랭 별점 산식 (src/db/ui-api.ts memberScores 와 같은 기준)
 *  - CollectStatusCard : 기관(인증키)별 자동 최신화 현황 — 성향·하루 한도·오늘 호출 수, 작업별 주기·마지막 성공·다음 예정
 *                        (/api/collect-status, scripts/auto 스케줄러가 남긴 collect_log). API 가 없는 배포에서는 카드를 숨김
 * 숫자는 전부 실제 집계. 불러오기 전이거나 실패하면 "—".
 */
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Database, Download, Hammer, Map, RefreshCw, Sparkles, Star, type LucideIcon } from "lucide-react";
import { useCollectStatus, useStats, type ApiCollectAgency, type ApiCollectRun } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader, MichelinStars } from "@/components/ui/primitives";
import { timeAgo } from "./news-panel";

const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());

interface Step {
  icon: LucideIcon;
  label: string;
  headline: string;
  desc: string;
  facts: { k: string; v: string }[];
}

export function BuildStoryCard({ className }: { className?: string }) {
  const { data: s } = useStats();
  // 모으기 → 정리하기 → 분석하기 → 보여주기가 차례로 나타남 (움직임 줄이기면 바로 보임)
  const reduce = useReducedMotion();
  const steps: Step[] = [
    {
      icon: Download,
      label: "모으기",
      headline: "수집기 9개",
      desc: "국회 의원·법안 처리 단계·표결·일정, 선관위 선거 결과·공약, 통계청 지역 지표, 정치 뉴스를 모으는 수집기를 직접 만들었습니다. 모두 정해 둔 주기에 맞춰 자동으로 모입니다.",
      facts: [
        { k: "수집 기사", v: `${num(s?.news_total)}건` },
        { k: "22대 법안", v: `${num(s?.bills_total)}건` },
      ],
    },
    {
      icon: Database,
      label: "정리하기",
      headline: "데이터베이스 표 24개",
      desc: "출처마다 제각각인 형식을 하나의 구조로 맞춰 저장합니다. 의원·법안·표결·국회 일정·선거·공약·지역·뉴스·게시판이 서로 연결됩니다.",
      facts: [
        { k: "추적 의원", v: `${num(s?.members)}명` },
        { k: "표결 수집 법안", v: `${num(s?.voted_bills)}건` },
      ],
    },
    {
      icon: Sparkles,
      label: "분석하기",
      headline: "AI 편향 분석 · 별점 산식",
      desc: "기사마다 치우친 정도와 그 근거 문장을 AI로 찾고, 의원 별점은 정당·이념 변수 없이 의정 실적 순위로만 매깁니다.",
      facts: [
        { k: "분석한 기사", v: `${num(s?.analyzed)}건` },
        { k: "근거 문장", v: `${num(s?.evidence_total)}개` },
      ],
    },
    {
      icon: Map,
      label: "보여주기",
      headline: "직접 그린 3D 지도",
      desc: "17개 시·도 경계로 입체 지도를 직접 그렸습니다. 지역을 누르면 의원·당선인·공약·지역 지표·기사를 한 화면에 모아 보여줍니다.",
      facts: [
        { k: "시·도", v: "17곳" },
        { k: "3스타 의원", v: `${num(s?.three_star)}명` },
      ],
    },
  ];

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Hammer className="size-4 text-lime" />}
        title="정치 미슐랭은 이렇게 만들었습니다"
        subtitle="팀 [더 킹] · 흩어진 공개 자료를 모아서 정리하고, 분석해서, 지도로 보여주기까지"
      />
      <ol className="grid gap-3 p-5 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((st, i) => (
          <motion.li
            key={st.label}
            className="relative flex flex-col rounded-xl border border-line bg-white/[0.03] p-4"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2">
              <motion.span
                className="grid size-7 shrink-0 place-items-center rounded-full bg-lime text-[calc(12px*var(--fs))] font-bold text-canvas tabular"
                initial={reduce ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.15 + 0.18, type: "spring", stiffness: 500, damping: 14 }}
              >
                {i + 1}
              </motion.span>
              <span className="text-[calc(12px*var(--fs))] font-medium text-ink-3">{st.label}</span>
              <st.icon className="ml-auto size-4 text-ink-3" aria-hidden />
            </div>
            <p className="mt-3 text-[calc(15px*var(--fs))] font-semibold tracking-tight">{st.headline}</p>
            <p className="mt-1.5 flex-1 text-[calc(12px*var(--fs))] leading-relaxed text-ink-3">{st.desc}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
              {st.facts.map((f) => (
                <div key={f.k}>
                  <dt className="text-[calc(10px*var(--fs))] text-ink-3">{f.k}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular">{f.v}</dd>
                </div>
              ))}
            </dl>
          </motion.li>
        ))}
      </ol>
    </Card>
  );
}

/** 별점 기준 — memberScores: 대표발의 수 순위와 반영 법안 수 순위의 평균, 0.8 이상 ★★★ · 0.5 이상 ★★ */
export function StarRuleCard({ className }: { className?: string }) {
  const { data: s } = useStats();
  const reduce = useReducedMotion();
  const rules: { n: string; title: string; desc: string }[] = [
    { n: "1", title: "대표발의 수 순위", desc: "의원이 대표로 발의한 법안 수를 전체 의원 안에서 순위로 바꿉니다." },
    { n: "2", title: "반영 법안 수 순위", desc: "원안·수정가결과 대안반영으로 실제 반영된 법안 수의 순위입니다." },
    { n: "3", title: "두 순위의 평균", desc: "평균이 높은 순서로 별을 나눕니다." },
  ];
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Star className="size-4" />}
        title="미슐랭 별점은 이렇게 매깁니다"
        subtitle="정당·이념 변수 없이 의정 실적만 봅니다"
      />
      <ol className="space-y-3 px-5 pt-4">
        {rules.map((r, i) => (
          <motion.li
            key={r.n}
            className="flex gap-3"
            initial={reduce ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-[calc(11px*var(--fs))] font-semibold text-ink-2 tabular">
              {r.n}
            </span>
            <div className="min-w-0">
              <p className="text-[calc(13px*var(--fs))] font-semibold">{r.title}</p>
              <p className="mt-0.5 text-[calc(11px*var(--fs))] leading-relaxed text-ink-3">{r.desc}</p>
            </div>
          </motion.li>
        ))}
      </ol>
      <div className="m-5 mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-white/[0.03] p-3 text-center">
        {(
          [
            { stars: 3, k: "상위 20%" },
            { stars: 2, k: "상위 50%" },
            { stars: 1, k: "나머지" },
          ] as const
        ).map((t) => (
          <div key={t.stars}>
            <MichelinStars count={t.stars} className="justify-center" />
            <p className="mt-1 text-[calc(11px*var(--fs))] text-ink-3">{t.k}</p>
          </div>
        ))}
      </div>
      <p className="-mt-2 px-5 pb-5 text-[calc(11px*var(--fs))] text-ink-3">
        지금 ★★★ 의원 <b className="text-ink tabular">{num(s?.three_star)}</b>명 · 전체 <span className="tabular">{num(s?.members)}</span>명
      </p>
    </Card>
  );
}

/* ───────── 자동 최신화 현황 ───────── */

/** 상태 → 점 색·글자 (정당과 무관한 상태색만 씀) */
const RUN_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  ok: { label: "성공", dot: "bg-good", text: "text-good" },
  failed: { label: "실패", dot: "bg-bad", text: "text-bad" },
  quota: { label: "한도 초과", dot: "bg-warn", text: "text-warn" },
  running: { label: "도는 중", dot: "bg-cyan", text: "text-cyan" },
};
const NO_RUN = { label: "기록 없음", dot: "bg-white/20", text: "text-ink-3" };
const TRIGGER: Record<string, string> = { schedule: "예약", button: "버튼", local: "PC" };

/** nextAt → "3시간 뒤" (이미 지났으면 "곧": 스케줄러가 매시간 깨어나 확인) */
function until(iso: string, now: number) {
  const min = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (Number.isNaN(min)) return "—";
  if (min <= 0) return "곧";
  if (min < 60) return `${min}분 뒤`;
  if (min < 60 * 24) return `${Math.round(min / 60)}시간 뒤`;
  return `${Math.round(min / (60 * 24))}일 뒤`;
}

function AgencyColumn({ a, logReady, now }: { a: ApiCollectAgency; logReady: boolean; now: number }) {
  const ratio = a.usable > 0 ? Math.min(1, a.usedToday / a.usable) : 0;
  return (
    <li className="flex flex-col rounded-xl border border-line bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[calc(14px*var(--fs))] font-semibold leading-snug">{a.name}</p>
        {a.blockedToday && <Badge tone="warn">오늘 한도 초과</Badge>}
      </div>
      <p className="mt-1 text-[calc(11px*var(--fs))] leading-relaxed text-ink-3">{a.character}</p>

      {/* 오늘 쓴 호출 / 자동 수집 몫 (하루 한도의 일부를 손으로 하는 확인·재시도 몫으로 남김) */}
      <div className="mt-3" title={a.limitNote}>
        <div className="flex items-center justify-between text-[calc(10px*var(--fs))] text-ink-3">
          <span>오늘 호출</span>
          <span className="tabular">
            <b className="text-ink">{logReady ? a.usedToday.toLocaleString() : "—"}</b> / {a.usable.toLocaleString()}회 · 하루 한도{" "}
            {a.dailyLimit.toLocaleString()}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className={cn("h-full rounded-full", a.blockedToday ? "bg-warn" : "bg-lime/80")} style={{ width: `${ratio * 100}%` }} />
        </div>
      </div>

      <ul className="mt-3 flex-1 space-y-2.5 border-t border-line pt-3">
        {a.jobs.map((j) => {
          const st = (j.lastStatus && RUN_STATUS[j.lastStatus]) || NO_RUN;
          return (
            <li key={j.id} title={j.why}>
              <div className="flex items-center gap-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", st.dot)} aria-label={st.label} />
                <span className="min-w-0 flex-1 truncate text-[calc(12px*var(--fs))] font-medium">{j.name}</span>
                <Badge className="px-1.5 py-0 text-[calc(10px*var(--fs))]">{j.every}마다</Badge>
              </div>
              <p className="mt-0.5 pl-3.5 text-[calc(10px*var(--fs))] text-ink-3">
                {j.lastOkAt ? (
                  <>
                    마지막 성공 {timeAgo(j.lastOkAt)} · 다음 {until(j.nextAt, now)}
                  </>
                ) : (
                  "첫 자동 실행 대기"
                )}
                {j.lastStatus && j.lastStatus !== "ok" && <span className={cn("ml-1", st.text)}>· 최근 {st.label}</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function RecentRuns({ runs }: { runs: ApiCollectRun[] }) {
  return (
    <div className="border-t border-line px-5 py-4">
      <p className="mb-2 text-[calc(11px*var(--fs))] font-medium text-ink-3">최근 실행</p>
      <ul className="space-y-1.5">
        {runs.map((r, i) => {
          const st = RUN_STATUS[r.status] ?? NO_RUN;
          return (
            <li key={`${r.job}-${r.startedAt}-${i}`} className="flex items-center gap-3 text-[calc(11px*var(--fs))]">
              <span className="w-16 shrink-0 text-ink-3 tabular">{r.startedAt ? timeAgo(r.startedAt) : "—"}</span>
              <span className={cn("size-1.5 shrink-0 rounded-full", st.dot)} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{r.jobName}</span>
              <span className="hidden text-ink-3 sm:inline">{TRIGGER[r.trigger] ?? r.trigger}</span>
              <span className="w-14 shrink-0 text-right text-ink-3 tabular">{r.calls.toLocaleString()}회</span>
              <span className={cn("w-14 shrink-0 text-right", st.text)}>{st.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CollectStatusCard({ className }: { className?: string }) {
  const { data, error } = useCollectStatus();
  // 화면의 "N분 뒤"가 멈춰 있지 않게 1분마다 다시 그림
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // 자동 수집 API 가 아직 없는 배포(404)거나 실패하면 카드 자체를 숨김
  if (error || !data) return null;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<RefreshCw className="size-4 text-lime" />}
        title="자동 최신화 현황"
        subtitle="인증키(기관)마다 데이터가 바뀌는 빠르기와 하루 호출 한도를 따져, 스케줄러가 매시간 실행할 수집기를 고릅니다"
        action={
          data.logReady ? (
            <Badge tone="lime">기록 중</Badge>
          ) : (
            <Badge title="첫 자동 실행 뒤부터 마지막 갱신·호출 수가 채워집니다">첫 실행 전</Badge>
          )
        }
      />
      <ul className="grid gap-3 p-5 pt-4 lg:grid-cols-3">
        {data.agencies.map((a) => (
          <AgencyColumn key={a.id} a={a} logReady={data.logReady} now={now} />
        ))}
      </ul>
      {data.logReady && data.recent.length > 0 && <RecentRuns runs={data.recent.slice(0, 5)} />}
    </Card>
  );
}
