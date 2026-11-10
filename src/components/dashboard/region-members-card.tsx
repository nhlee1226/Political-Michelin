"use client";

/**
 * RegionMembersCard — Map View 에서 선택한 시·도의 실제 국회의원 목록 (useRegion)
 * 이름을 누르면 정치인 상세 패널이 열린다. API 실패·0명이면 mock 을 "예시"로 표시.
 */
import * as React from "react";
import { ChevronRight, Users } from "lucide-react";
import { PARTIES, REGION_BY_CODE } from "@/lib/mock-data";
import { useParties, useRegion } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardHeader, ExampleBadge, PartyTag } from "@/components/ui/primitives";

interface MemberRow {
  key: string;
  monaCd: string | null; // mock 은 null → 상세 없음
  name: string;
  partyName: string;
  partyColor: string;
  district: string | null;
  term: number | null;
  bills: number | null;
}

export function RegionMembersCard({
  region,
  onOpenPolitician,
  className,
}: {
  region: string;
  onOpenPolitician: (monaCd: string) => void;
  className?: string;
}) {
  const { data: detail } = useRegion(region);
  const { data: apiParties } = useParties();
  const mock = REGION_BY_CODE[region];
  // keepPreviousData 로 이전 지역 응답이 남아 있을 수 있어 코드가 같을 때만 사용
  const isLive = detail?.code === region && !!detail.politicians.length;

  const rows: MemberRow[] = React.useMemo(() => {
    if (isLive) {
      const colorById = new Map(apiParties?.map((p) => [p.id, p.color]));
      return detail!.politicians.map((p) => ({
        key: p.mona_cd,
        monaCd: p.mona_cd,
        name: p.name,
        partyName: p.party_id ?? "—",
        partyColor: (p.party_id && colorById.get(p.party_id)) || PARTIES.ETC.color,
        district: p.district,
        term: p.term,
        bills: p.bills_proposed,
      }));
    }
    return mock.politicians
      .filter((p) => p.role === "현역 의원")
      .map((p) => ({
        key: p.id,
        monaCd: null,
        name: p.name,
        partyName: PARTIES[p.party].name,
        partyColor: PARTIES[p.party].color,
        district: p.district,
        term: p.term,
        bills: p.bills,
      }));
  }, [isLive, detail, apiParties, mock]);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        icon={<Users className="size-4" />}
        title={
          <>
            {mock.name} 국회의원
            {!isLive && <ExampleBadge />}
          </>
        }
        subtitle={`지역구 의원 ${rows.length}명 · 이름순${isLive ? " · 누르면 상세 정보" : ""}`}
      />
      <ul className="mt-3 flex-1 overflow-y-auto px-2 pb-4 scroll-thin">
        {rows.map((p) => (
          <li key={p.key}>
            <button
              onClick={() => p.monaCd && onOpenPolitician(p.monaCd)}
              disabled={!p.monaCd}
              className="flex w-full items-center gap-3 border-t border-line px-3 py-2.5 text-left text-xs transition hover:bg-white/[0.04] disabled:cursor-default"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{p.name}</p>
                <p className="truncate text-[10px] text-ink-3">
                  {p.district ?? "—"} · {p.term == null ? "—" : `${p.term}선`}
                </p>
              </div>
              <PartyTag color={p.partyColor} name={p.partyName} />
              <span className="w-14 text-right text-ink-3 tabular">발의 {p.bills ?? "—"}</span>
              {p.monaCd && <ChevronRight className="size-3.5 text-ink-3" />}
            </button>
          </li>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-xs text-ink-3">이 지역 의원 정보가 없습니다.</p>}
      </ul>
    </Card>
  );
}
