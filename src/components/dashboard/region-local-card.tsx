"use client";

/**
 * RegionLocalCard — Map View 에서 선택한 시·도의 지역 지표와 지방선거 당선인 (전부 실제 데이터, useRegion)
 *  - 지역 지표: 주민등록인구 · 고령인구비율 · 재정자립도 (KOSIS, region_indicators)
 *  - 지방선거 당선인: 시·도지사 · 교육감 · 구·시·군의 장 (선관위, election_candidates)
 *  - 선거공약: 제목 목록을 먼저 보여주고, 누르면 선관위 원문을 그대로 펼침 (useLocalWinner 로 그때 받음)
 *  - 광주·전남처럼 통합된 시도는 시·도지사·교육감 자리에 통합 시도 당선인 + 안내 한 줄
 * 가상 데이터로 대신하지 않는다. 데이터가 없으면 없다고 표시.
 */
import * as React from "react";
import { ChevronDown, Info, Landmark } from "lucide-react";
import { REGION_BY_CODE } from "@/lib/mock-data";
import { useLocalWinner, usePartyLookup, useRegion, type ApiIndicator, type ApiLocalWinner } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader, PartyTag } from "@/components/ui/primitives";

const INDICATOR_LABEL: Record<string, string> = {
  주민등록인구: "주민등록 인구",
  고령인구비율: "고령화율 (65세 이상 인구 비율)",
  재정자립도: "재정자립도",
};

/** 득표 0 = 선관위 기록 그대로 (투표 없이 당선된 경우로 보이지만 단정하지 않음) */
const voteText = (w: ApiLocalWinner) =>
  w.vote_rate
    ? `득표율 ${w.vote_rate}%${w.votes ? ` · ${w.votes.toLocaleString("ko-KR")}표` : ""}`
    : w.votes === 0
      ? "선관위 득표 기록 0표"
      : "득표 정보 없음";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-medium text-ink-3">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">{children}</p>;
}

function IndicatorTile({ i }: { i: ApiIndicator }) {
  const value = i.unit === "명" ? i.value.toLocaleString("ko-KR") : String(i.value);
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] p-3" title={`출처: KOSIS 통계표 ${i.source_org_id}/${i.source_tbl_id}`}>
      <p className="text-[10px] text-ink-3">{INDICATOR_LABEL[i.indicator] ?? i.indicator}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight tabular">
        {value}
        <span className="ml-0.5 text-[11px] font-normal text-ink-3">{i.unit}</span>
      </p>
      <p className="mt-0.5 text-[10px] text-ink-3">{i.year}년</p>
    </div>
  );
}

/** 공약 제목 목록. 제목을 누르면 그 당선인의 공약 원문을 받아 그대로 보여줌 (줄바꿈 유지) */
function PledgeList({ winner }: { winner: ApiLocalWinner }) {
  const [openNo, setOpenNo] = React.useState<number | null>(null);
  const { data, error } = useLocalWinner(openNo != null ? winner.id : null);
  const detail = data?.id === winner.id ? data : undefined;

  if (winner.pledges.length === 0) return <Empty>선관위에 등록된 공약 정보가 없습니다.</Empty>;
  return (
    <ol className="space-y-0.5">
      {winner.pledges.map((pl) => {
        const open = openNo === pl.no;
        const content = detail?.pledges.find((x) => x.no === pl.no)?.content;
        return (
          <li key={pl.no}>
            <button
              onClick={() => setOpenNo(open ? null : pl.no)}
              aria-expanded={open}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
            >
              <span className="mt-px w-3.5 shrink-0 text-[11px] font-semibold text-ink-3 tabular">{pl.no}</span>
              <span className="min-w-0 flex-1 text-xs leading-snug text-ink">
                {pl.title ?? "(제목 없음)"}
                {pl.realm && <Badge className="ml-1.5 px-1.5 py-0 align-middle text-[10px]">{pl.realm}</Badge>}
              </span>
              <ChevronDown className={cn("mt-0.5 size-3.5 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <div className="mb-1 ml-[30px] mr-2 rounded-lg border border-line bg-white/[0.02] p-2.5">
                {detail ? (
                  <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-2">{content || "내용이 없습니다."}</p>
                ) : (
                  <p className="text-[11px] text-ink-3">{error ? "공약 내용을 불러오지 못했습니다." : "불러오는 중…"}</p>
                )}
                <p className="mt-2 text-[10px] text-ink-3">선관위 선거공약 원문 그대로</p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** 시·도지사 / 교육감: 인물 한 명 + 공약 목록 */
function HeadBlock({ office, winner }: { office: string; winner: ApiLocalWinner | null }) {
  const party = usePartyLookup();
  if (!winner) {
    return (
      <div>
        <SectionTitle>{office}</SectionTitle>
        <Empty>{office} 당선인 데이터가 없습니다.</Empty>
      </div>
    );
  }
  const shown = party(winner.party_name, "정당 없음");
  return (
    <div>
      <SectionTitle>
        {office} · {winner.sd_name}
      </SectionTitle>
      <div className="rounded-xl border border-line bg-white/[0.02] p-3">
        <div className="flex items-center gap-3">
          <div
            className="grid size-10 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold"
            style={{ borderColor: shown.color, background: `${shown.color}22` }}
          >
            {winner.name.slice(-2)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{winner.name}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
              <PartyTag color={shown.color} name={shown.name} className="text-[11px]" />
              <span>·</span>
              <span className="tabular">{voteText(winner)}</span>
            </div>
          </div>
        </div>
        <p className="mb-1 mt-3 border-t border-line pt-2.5 text-[11px] text-ink-3">선거공약 {winner.pledges.length}개 · 누르면 원문</p>
        <PledgeList winner={winner} />
      </div>
    </div>
  );
}

/** 구·시·군의 장 한 줄. 누르면 공약 목록이 펼쳐짐 */
function MayorRow({ w }: { w: ApiLocalWinner }) {
  const [open, setOpen] = React.useState(false);
  const shown = usePartyLookup()(w.party_name, "정당 없음");
  return (
    <li className="border-t border-line first:border-t-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition hover:bg-white/[0.04]"
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {w.name} <span className="font-normal text-ink-3">{w.sgg_name}</span>
          </p>
          <p className="truncate text-[10px] text-ink-3 tabular">{voteText(w)}</p>
        </div>
        <PartyTag color={shown.color} name={shown.name} />
        <span className="w-11 shrink-0 text-right text-ink-3 tabular">공약 {w.pledges.length}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-2 pb-2.5">
          <PledgeList winner={w} />
        </div>
      )}
    </li>
  );
}

export function RegionLocalCard({ region, className }: { region: string; className?: string }) {
  const { data, error, isLoading } = useRegion(region);
  // keepPreviousData 로 이전 지역 응답이 남아 있을 수 있어 코드가 같을 때만 사용
  const detail = data?.code === region ? data : undefined;
  const name = detail?.name ?? REGION_BY_CODE[region]?.name ?? "";
  const local = detail?.local ?? null;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Landmark className="size-4" />}
        title={`${name} 지역 지표 · 지방선거 당선인`}
        subtitle={
          local
            ? `${local.election.name}(${local.election.date}) 당선인·공약은 선관위, 지표는 KOSIS 국가통계포털`
            : "지역 지표는 KOSIS 국가통계포털, 당선인·공약은 선관위"
        }
      />

      {!detail ? (
        <p className="px-5 py-10 text-center text-xs text-ink-3">
          {isLoading || !error ? "불러오는 중…" : "지역 정보를 불러오지 못했습니다."}
        </p>
      ) : (
        <>
          {local?.merged && (
            <p className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-cyan/25 bg-cyan/[0.06] px-3 py-2 text-xs text-ink-2">
              <Info className="mt-px size-3.5 shrink-0 text-cyan" />
              <span>
                {local.merged.regions.join(" · ")} → <b className="font-semibold text-ink">{local.merged.name}</b> 통합. 시·도지사와 교육감은 통합특별시
                당선인이고, 구·시·군의 장과 지역 지표는 {name} 기준입니다.
              </span>
            </p>
          )}

          <div className="grid gap-x-5 gap-y-5 px-5 pb-5 pt-4 lg:grid-cols-12">
            <section className="lg:col-span-3">
              <SectionTitle>지역 지표</SectionTitle>
              {detail.indicators.length ? (
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                  {detail.indicators.map((i) => (
                    <IndicatorTile key={i.indicator} i={i} />
                  ))}
                </div>
              ) : (
                <Empty>지역 지표 데이터가 아직 없습니다.</Empty>
              )}
            </section>

            {local ? (
              <>
                <section className="space-y-4 lg:col-span-5">
                  <HeadBlock key={local.governor?.id ?? "governor"} office="시·도지사" winner={local.governor} />
                  <HeadBlock key={local.superintendent?.id ?? "superintendent"} office="교육감" winner={local.superintendent} />
                </section>

                <section className="lg:col-span-4">
                  <SectionTitle>구·시·군의 장 {local.mayors.length}명 · 이름을 누르면 공약</SectionTitle>
                  {local.mayors.length ? (
                    <ul className="max-h-[560px] overflow-y-auto rounded-xl border border-line scroll-thin">
                      {local.mayors.map((w) => (
                        <MayorRow key={w.id} w={w} />
                      ))}
                    </ul>
                  ) : (
                    <Empty>이 시·도에는 구·시·군의 장 당선인 데이터가 없습니다.</Empty>
                  )}
                </section>
              </>
            ) : (
              <section className="lg:col-span-9">
                <SectionTitle>지방선거 당선인</SectionTitle>
                <Empty>지방선거 당선인 데이터가 아직 없습니다.</Empty>
              </section>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
