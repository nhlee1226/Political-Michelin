"use client";

/**
 * 보조 카드
 *  - BiasReportCard    : AI 편향성 객관화 리포트 — 실제 편향 분석 집계(news_analysis·news_evidence, useStats).
 *                        분석된 기사 수 · 근거 문장 수 · 치우침 크기 분포. 진보·보수 방향은 나누지 않음
 *  - PoliticianTable   : 정치인 미슐랭 랭킹 테이블 — 실제 의원(별점·반영률·본회의 표결 수·참여율), API 가 안 될 때만 가상 의원을 예시로
 */
import * as React from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ArrowDownUp, ScanSearch, Search, Users } from "lucide-react";
import { PARTIES, REGIONS, type Politician } from "@/lib/mock-data";
import { usePartyLookup, usePoliticians, useStats } from "@/lib/api";
import { districtLabel } from "./politician-detail-sheet";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader, MichelinStars, PartyTag, Segmented } from "@/components/ui/primitives";

/* eslint-disable @typescript-eslint/no-explicit-any */

// 단일 색상(라임) 명도 단계 = 치우침 크기. 진보·보수 방향은 색으로 나누지 않음
const binColor = (i: number) => `color-mix(in srgb, var(--color-lime) ${Math.round((0.18 + (i / 9) * 0.72) * 100)}%, transparent)`;

function DistTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      <p className="text-ink-3">
        치우침 {d.bin}~{+d.bin === 90 ? 100 : +d.bin + 9}
      </p>
      <p className="font-semibold tabular">{d.n.toLocaleString("ko-KR")}건</p>
    </div>
  );
}

function StatTile({ label, value, unit, note, accent }: { label: string; value: React.ReactNode; unit?: string; note?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-2.5", accent ? "border-lime/20 bg-lime/[0.05]" : "border-line")}>
      <p className="text-[calc(10px*var(--fs))] text-ink-3">{label}</p>
      <p className={cn("text-lg font-semibold tabular", accent && "text-lime")}>
        {value}
        {unit && <span className="ml-0.5 text-[calc(11px*var(--fs))] font-normal text-ink-3">{unit}</span>}
      </p>
      {note && <p className="text-[calc(10px*var(--fs))] text-ink-3">{note}</p>}
    </div>
  );
}

/** 편향 분석을 마친 기사 전체의 실제 집계. 치우침 = |진보↔보수 점수| (0~100), 방향은 보여주지 않음 */
export function BiasReportCard({ className }: { className?: string }) {
  const { data: s, error } = useStats();
  const dist = (s?.bias_dist ?? []).map((n, i) => ({ bin: String(i * 10), n }));
  // DB 가 없을 때 /stats 응답에는 이 값들이 빠져 있음 → 0 으로 보고 "아직 없음" 표시
  const analyzed = s?.analyzed ?? 0;
  const judged = s?.bias_judged ?? 0;
  const undecided = analyzed - judged;
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<ScanSearch className="size-4" />}
        title="AI 편향성 객관화 리포트"
        subtitle="현재 분석 버전으로 마친 기사 전체 · 진보·보수 방향 없이 치우친 정도만"
      />
      {!s ? (
        <p className="px-5 py-10 text-center text-xs text-ink-3">{error ? "편향 분석 집계를 불러오지 못했습니다." : "불러오는 중…"}</p>
      ) : analyzed === 0 ? (
        <p className="mx-5 my-5 rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-ink-3">
          아직 분석된 기사가 없습니다.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 px-5 pt-3">
            <StatTile
              label="분석된 기사"
              value={analyzed.toLocaleString("ko-KR")}
              unit="건"
              note={undecided > 0 ? `판단 불가 ${undecided}건 포함` : undefined}
            />
            <StatTile label="근거 문장" value={(s.evidence_total ?? 0).toLocaleString("ko-KR")} unit="개" />
            <StatTile label="평균 치우침" value={s.avg_bias ?? "—"} unit={s.avg_bias == null ? undefined : "/ 100"} accent />
          </div>
          <div className="h-[140px] px-3 pt-3">
            {judged > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dist} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap={2}>
                  <XAxis dataKey="bin" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
                  <Tooltip content={<DistTooltip />} cursor={{ fill: "var(--chart-grid)" }} />
                  <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                    {dist.map((_, i) => (
                      <Cell key={i} fill={binColor(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-xs text-ink-3">치우침을 판단할 수 있었던 기사가 아직 없습니다.</p>
            )}
          </div>
          <div className="mt-auto space-y-1.5 border-t border-line px-5 py-4 text-[calc(11px*var(--fs))] text-ink-3">
            <p className="flex items-center justify-between">
              <span>0 (균형)</span>
              <span className="h-1.5 w-24 rounded-full bg-gradient-to-r from-lime/20 to-lime/90" />
              <span>100 (한쪽으로 치우침)</span>
            </p>
            <p className="leading-relaxed">
              치우침은 진보↔보수 점수(−100~+100)의 크기만 0~100으로 본 값입니다. 점수는 AI가 기사 원문에서 뽑은 근거 문장(인용 균형·표현·제목과
              본문 차이)으로만 계산합니다. 막대는 구간별 기사 수이고, 판단 불가 기사는 빠집니다.
            </p>
            {(s.analyzed_old ?? 0) > 0 && (
              <p className="leading-relaxed">
                이전 분석 버전(다른 모델·프롬프트) 결과 {s.analyzed_old}건은 기준이 달라 집계에서 뺐습니다. 다시 분석되면 포함됩니다.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/* ───────── 정치인 랭킹 테이블 ───────── */

type SortKey = "stars" | "reflect" | "vote" | "bills";
const ALL_POLS: (Politician & { regionShort: string })[] = REGIONS.flatMap((r) =>
  r.politicians.filter((p) => p.role === "현역 의원").map((p) => ({ ...p, regionShort: r.short })),
);

const REFLECT_HINT = "원안·수정가결 + 대안반영 ÷ 대표발의";
const VOTE_HINT = "(찬성 + 반대 + 기권) ÷ 본회의 표결 대상 법안 · 22대에서 가결·부결된 법안 기준";
const MOCK_RULE = "미슐랭 스타 = 공약 이행·출석·입법 실적의 가중 합산. 정당·이념 변수는 산식에 포함되지 않습니다.";

/** 표 한 줄. 공식 데이터가 없는 지표는 null */
interface TableRow {
  key: string;
  monaCd: string | null; // mock 은 null → 상세 패널 없음
  name: string;
  district: string | null;
  committee: string | null;
  term: number | null;
  partyName: string;
  partyColor: string;
  regionCode: string | null;
  stars: 1 | 2 | 3 | null;
  reflect: number | null; // 법안 반영률 %
  vote: number | null; // 표결 참여율 %
  /** 본회의 표결 수 (찬성·반대·기권·불참). 표결 기록이 없으면 null */
  votes: { yes: number; no: number; abstain: number; absent: number } | null;
  bills: number;
}

const dash =(v: number | null, unit = "") => (v == null ? "—" : `${v}${unit}`);

/** 큰 값이 위로, 값 없는 줄은 아래로, 같으면 이름순 */
function byMetric(key: SortKey) {
  return (a: TableRow, b: TableRow) => {
    const av = a[key];
    const bv = b[key];
    if (av != null && bv != null && av !== bv) return bv - av;
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    return a.name.localeCompare(b.name, "ko");
  };
}

export function PoliticianTable({
  className,
  query = "",
  onSelectRegion,
  onOpenPolitician,
}: {
  className?: string;
  /** 위쪽 검색창에서 넘어온 검색어 */
  query?: string;
  onSelectRegion?: (code: string) => void;
  onOpenPolitician?: (monaCd: string) => void;
}) {
  const [sort, setSort] = React.useState<SortKey>("stars");
  const [q, setQ] = React.useState(query);
  React.useEffect(() => setQ(query), [query]);
  const { data: apiList, isLoading } = usePoliticians();
  const party = usePartyLookup();
  const apiPols = apiList?.rows;
  const isLive = !!apiPols?.length;
  // API 가 실패했거나 아직 의원이 없으면 가상 의원을 "예시"로 보여줌. 불러오는 동안에는 가상 의원을 잠깐이라도 보이지 않게 비워 둠
  const isMock = !isLive && !isLoading;
  // 표결 값이 하나도 없으면(수집 전) 정렬 버튼을 준비 중으로
  const noVotes = isLive && !apiPols!.some((p) => p.vote_participation != null);
  React.useEffect(() => {
    if ((!isLive || noVotes) && (sort === "vote" || (!isLive && sort === "reflect"))) setSort("stars");
  }, [isLive, noVotes, sort]);

  const rows: TableRow[] = React.useMemo(() => {
    const match = (name: string, district: string | null) => !q || name.includes(q) || !!district?.includes(q);
    const list: TableRow[] = isLive
      ? apiPols!.map((p) => ({
          key: p.mona_cd,
          monaCd: p.mona_cd,
          name: p.name,
          district: districtLabel(p),
          committee: p.committee ?? null,
          term: p.term,
          partyName: party(p.party_id).name,
          partyColor: party(p.party_id).color,
          regionCode: p.region_code,
          stars: p.stars ?? null,
          reflect: p.reflect_rate ?? null,
          vote: p.vote_participation,
          votes: p.total_votes > 0 ? { yes: p.votes_yes, no: p.votes_no, abstain: p.votes_abstain, absent: p.votes_absent } : null,
          bills: p.bills_proposed,
        }))
      : !isMock
        ? []
        : ALL_POLS.map((p) => ({
          key: p.id,
          monaCd: null,
          name: p.name,
          district: p.district,
          committee: null,
          term: p.term,
          partyName: PARTIES[p.party].name,
          partyColor: PARTIES[p.party].color,
          regionCode: REGIONS.find((r) => r.short === p.regionShort)!.code,
          stars: p.michelin,
          reflect: null,
          vote: null,
          votes: null,
          bills: p.bills,
        }));
    return list.filter((p) => match(p.name, p.district)).sort(byMetric(sort));
  }, [isLive, isMock, apiPols, party, q, sort]);

  return (
    <Card example={isMock} className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Users className="size-4" />}
        title="정치인 미슐랭 가이드"
        subtitle="현역 의원 의정활동 지표 · 정당과 무관하게 지표 순 정렬"
        action={
          <Segmented<SortKey>
            value={sort}
            onChange={setSort}
            options={[
              { value: "stars", label: "별점" },
              { value: "reflect", label: "반영률", soon: !isLive },
              { value: "vote", label: "표결", soon: !isLive || noVotes },
              { value: "bills", label: "발의" },
            ]}
          />
        }
      />
      <div className="mx-5 mt-3 flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5">
        <Search className="size-3.5 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 또는 지역구 검색"
          className="min-w-0 flex-1 bg-transparent text-xs placeholder:text-ink-3 focus:outline-none"
        />
      </div>
      <div className="mt-3 flex-1 overflow-auto px-2 pb-4 scroll-thin">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="text-[calc(10px*var(--fs))] text-ink-3">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
              <th>#</th>
              <th>의원</th>
              <th>정당</th>
              <th>평가</th>
              <th className="text-right" title={REFLECT_HINT}>
                법안 반영률
              </th>
              <th className="text-right" title={VOTE_HINT}>
                표결 참여율
              </th>
              <th className="text-right">
                <span className="inline-flex items-center gap-1">
                  대표 발의 <ArrowDownUp className="size-3" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr
                key={p.key}
                // 실제 의원은 상세 패널, mock 은 예전처럼 지도의 해당 지역으로
                onClick={() => (p.monaCd ? onOpenPolitician?.(p.monaCd) : p.regionCode && onSelectRegion?.(p.regionCode))}
                className="cursor-pointer border-t border-line transition hover:bg-white/[0.04] [&>td]:px-3 [&>td]:py-2.5"
              >
                <td className="text-ink-3 tabular">{i + 1}</td>
                <td>
                  <p className="font-semibold text-ink">{p.name}</p>
                  <p className="text-[calc(10px*var(--fs))] text-ink-3">
                    {p.district ?? "—"} · {dash(p.term, "선")}
                  </p>
                  {p.committee && <p className="max-w-[220px] truncate text-[calc(10px*var(--fs))] text-ink-3">{p.committee}</p>}
                </td>
                <td>
                  <PartyTag color={p.partyColor} name={p.partyName} />
                </td>
                <td>{p.stars == null ? <span className="text-ink-3">—</span> : <MichelinStars count={p.stars} />}</td>
                <td className="text-right font-semibold tabular" title={REFLECT_HINT}>
                  {dash(p.reflect, "%")}
                </td>
                <td className={cn("whitespace-nowrap text-right tabular", p.vote == null && "text-ink-3")} title={VOTE_HINT}>
                  {/* 실제 의원인데 값이 없으면 표결 기록 없음(—), 표결 수집 자체가 안 됐으면 "수집 예정" */}
                  {p.vote == null ? (noVotes || !isLive ? "수집 예정" : "—") : `${p.vote}%`}
                  {p.votes && (
                    <p className="text-[calc(10px*var(--fs))] text-ink-3">
                      찬성 {p.votes.yes} · 반대 {p.votes.no} · 기권 {p.votes.abstain} · 불참 {p.votes.absent}
                    </p>
                  )}
                </td>
                <td className="text-right tabular">{p.bills}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-6 text-center text-xs text-ink-3">{!isLive && isLoading ? "의원 목록을 불러오는 중…" : "검색 결과가 없습니다."}</p>
        )}
      </div>
      <p className="border-t border-line px-5 py-3 text-[calc(10px*var(--fs))] leading-relaxed text-ink-3">
        <Badge className="mr-1.5 px-1.5 py-0 text-[calc(10px*var(--fs))]">기준</Badge>
        {isLive ? (apiList?.scoreRule ?? "—") : isMock ? MOCK_RULE : "—"}
        {isLive && !noVotes && <> · 표결 참여율 = {VOTE_HINT}</>}
      </p>
    </Card>
  );
}
