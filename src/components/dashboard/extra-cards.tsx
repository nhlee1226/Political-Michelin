"use client";

/**
 * 보조 카드
 *  - BiasReportCard    : AI 편향성 객관화 리포트 (오늘 분석 기사의 편향 지수 분포)
 *  - PoliticianTable   : 정치인 미슐랭 랭킹 테이블 (Lawmake 지표 구조 벤치마킹)
 */
import * as React from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ArrowDownUp, ScanSearch, Search, Users } from "lucide-react";
import { PARTIES, REGIONS, type Politician } from "@/lib/mock-data";
import { useParties, usePoliticians } from "@/lib/api";
import { districtLabel } from "./politician-detail-sheet";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader, ExampleBadge, MichelinStars, PartyTag, Segmented } from "@/components/ui/primitives";
import { GlossaryText } from "./glossary-text";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 오늘 분석된 기사 편향 지수 분포 (10점 구간, 단위: 건) */
const BIAS_DIST = [
  { bin: "0", n: 1820 }, { bin: "10", n: 2410 }, { bin: "20", n: 2190 }, { bin: "30", n: 1760 },
  { bin: "40", n: 1310 }, { bin: "50", n: 1080 }, { bin: "60", n: 860 }, { bin: "70", n: 690 },
  { bin: "80", n: 480 }, { bin: "90", n: 247 },
];
// 단일 색상(라임) 명도 단계 = 크기(편향 정도)
const binColor = (i: number) => `color-mix(in srgb, var(--color-lime) ${Math.round((0.18 + (i / 9) * 0.72) * 100)}%, transparent)`;

function DistTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      <p className="text-ink-3">편향 지수 {d.bin}~{+d.bin + 9}%</p>
      <p className="font-semibold tabular">{d.n.toLocaleString()}건</p>
    </div>
  );
}

export function BiasReportCard({ className }: { className?: string }) {
  const total = BIAS_DIST.reduce((a, d) => a + d.n, 0);
  const high = BIAS_DIST.slice(6).reduce((a, d) => a + d.n, 0);
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<ScanSearch className="size-4" />}
        title={
          <>
            AI 편향성 객관화 리포트
            <ExampleBadge />
          </>
        }
        subtitle="오늘 분석된 기사의 편향 지수 분포"
      />
      <div className="grid grid-cols-2 gap-2 px-5 pt-3">
        <div className="rounded-lg border border-line p-2.5">
          <p className="text-[10px] text-ink-3">편향 60% 이상</p>
          <p className="text-lg font-semibold tabular">
            {high.toLocaleString()}
            <span className="ml-1 text-[11px] font-normal text-ink-3">{Math.round((high / total) * 100)}%</span>
          </p>
        </div>
        <div className="rounded-lg border border-lime/20 bg-lime/[0.05] p-2.5">
          <p className="text-[10px] text-ink-3">AI 객관화 변환</p>
          <p className="text-lg font-semibold tabular text-lime">
            {(1964).toLocaleString()}
            <span className="ml-1 text-[11px] font-normal text-ink-3">건</span>
          </p>
        </div>
      </div>
      <div className="h-[140px] px-3 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={BIAS_DIST} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap={2}>
            <XAxis dataKey="bin" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
            <Tooltip content={<DistTooltip />} cursor={{ fill: "var(--chart-grid)" }} />
            <Bar dataKey="n" radius={[4, 4, 0, 0]}>
              {BIAS_DIST.map((_, i) => (
                <Cell key={i} fill={binColor(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-auto space-y-1.5 border-t border-line px-5 py-4 text-[11px] text-ink-3">
        <p className="flex items-center justify-between">
          <span>낮음 (중립 서술)</span>
          <span className="h-1.5 w-24 rounded-full bg-gradient-to-r from-lime/20 to-lime/90" />
          <span>높음 (감정·일방)</span>
        </p>
        <p className="leading-relaxed">
          <GlossaryText text="편향 지수는 감정 어휘, 인용 균형, 출처 명확성을 종합한 점수입니다. [[여론조사]] 인용 기사는 표본·오차범위 표기 여부도 반영합니다." />
        </p>
      </div>
    </Card>
  );
}

/* ───────── 정치인 랭킹 테이블 ───────── */

type SortKey = "stars" | "reflect" | "vote" | "bills";
const ALL_POLS: (Politician & { regionShort: string })[] = REGIONS.flatMap((r) =>
  r.politicians.filter((p) => p.role === "현역 의원").map((p) => ({ ...p, regionShort: r.short })),
);

const REFLECT_HINT = "원안·수정가결 + 대안반영 ÷ 대표발의";
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
  bills: number;
}

const NEUTRAL = PARTIES.ETC.color;
const dash = (v: number | null, unit = "") => (v == null ? "—" : `${v}${unit}`);

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
  const { data: apiList } = usePoliticians();
  const { data: apiParties } = useParties();
  const apiPols = apiList?.rows;
  // API 가 실패했거나 아직 의원이 없으면 mock 을 그대로 보여줌
  const isLive = !!apiPols?.length;
  // 표결은 아직 수집 전이라 값이 하나도 없으면 정렬 버튼을 준비 중으로
  const noVotes = isLive && !apiPols!.some((p) => p.vote_participation != null);
  React.useEffect(() => {
    if ((!isLive || noVotes) && (sort === "vote" || (!isLive && sort === "reflect"))) setSort("stars");
  }, [isLive, noVotes, sort]);

  const rows: TableRow[] = React.useMemo(() => {
    const match = (name: string, district: string | null) => !q || name.includes(q) || !!district?.includes(q);
    const colorById = new Map(apiParties?.map((p) => [p.id, p.color]));
    const list: TableRow[] = isLive
      ? apiPols!.map((p) => ({
          key: p.mona_cd,
          monaCd: p.mona_cd,
          name: p.name,
          district: districtLabel(p),
          committee: p.committee ?? null,
          term: p.term,
          partyName: p.party_id ?? "—",
          partyColor: (p.party_id && colorById.get(p.party_id)) || NEUTRAL,
          regionCode: p.region_code,
          stars: p.stars ?? null,
          reflect: p.reflect_rate ?? null,
          vote: p.vote_participation,
          bills: p.bills_proposed,
        }))
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
          bills: p.bills,
        }));
    return list.filter((p) => match(p.name, p.district)).sort(byMetric(sort));
  }, [isLive, apiPols, apiParties, q, sort]);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Users className="size-4" />}
        title={
          <>
            정치인 미슐랭 가이드
            {!isLive && <ExampleBadge />}
          </>
        }
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
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="text-[10px] text-ink-3">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
              <th>#</th>
              <th>의원</th>
              <th>정당</th>
              <th>평가</th>
              <th className="text-right" title={REFLECT_HINT}>
                법안 반영률
              </th>
              <th className="text-right">표결 참여율</th>
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
                  <p className="text-[10px] text-ink-3">
                    {p.district ?? "—"} · {dash(p.term, "선")}
                  </p>
                  {p.committee && <p className="max-w-[220px] truncate text-[10px] text-ink-3">{p.committee}</p>}
                </td>
                <td>
                  <PartyTag color={p.partyColor} name={p.partyName} />
                </td>
                <td>{p.stars == null ? <span className="text-ink-3">—</span> : <MichelinStars count={p.stars} />}</td>
                <td className="text-right font-semibold tabular" title={REFLECT_HINT}>
                  {dash(p.reflect, "%")}
                </td>
                <td className={cn("text-right tabular", p.vote == null && "text-ink-3")}>
                  {p.vote == null ? "수집 예정" : `${p.vote}%`}
                </td>
                <td className="text-right tabular">{p.bills}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-center text-xs text-ink-3">검색 결과가 없습니다.</p>}
      </div>
      <p className="border-t border-line px-5 py-3 text-[10px] text-ink-3">
        <Badge className="mr-1.5 px-1.5 py-0 text-[10px]">기준</Badge>
        {isLive ? (apiList?.scoreRule ?? "—") : MOCK_RULE}
      </p>
    </Card>
  );
}
