"use client";

/**
 * PoliticianDetailSheet — 오른쪽에서 열리는 의원 상세 패널 (usePolitician → /api/politicians/[id])
 * 정치인 표의 한 줄, Map View 정치인 프로필 카드·지역 의원 목록에서 연다.
 * 공식 데이터가 없는 지표는 숫자 대신 상태 문구로만 표시한다.
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, FileText, Loader2, X } from "lucide-react";
import { PARTIES } from "@/lib/mock-data";
import { useParties, usePolitician, type ApiPoliticianDetail } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge, IconButton, MichelinStars, PartyTag } from "@/components/ui/primitives";

const REFLECT_HINT = "원안·수정가결 + 대안반영 ÷ 대표발의";

/** 지역구 표기: 비례대표면 "비례대표" */
export const districtLabel = (p: Pick<ApiPoliticianDetail, "elect_type" | "district">) =>
  p.elect_type === "비례대표" ? "비례대표" : (p.district ?? "—");

function Metric({ k, v, muted, title }: { k: string; v: React.ReactNode; muted?: boolean; title?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.02] p-2.5" title={title}>
      <p className="text-[10px] text-ink-3">{k}</p>
      <p className={cn("mt-0.5 font-semibold tabular", muted ? "text-xs text-ink-3" : "text-sm")}>{v}</p>
    </div>
  );
}

function Body({ p }: { p: ApiPoliticianDetail }) {
  const { data: apiParties } = useParties();
  const color = (p.party_id && apiParties?.find((x) => x.id === p.party_id)?.color) || PARTIES.ETC.color;

  return (
    <>
      <div className="flex items-center gap-3">
        <div
          className="grid size-12 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold"
          style={{ borderColor: color, background: `${color}22` }}
        >
          {p.name.slice(-2)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-lg font-semibold">{p.name}</p>
            <MichelinStars count={p.stars} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
            <PartyTag color={color} name={p.party_id ?? "—"} className="text-[11px]" />
            <span>·</span>
            <span>{districtLabel(p)}</span>
            <span>·</span>
            <span>{p.term == null ? "—" : `${p.term}선`}</span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-ink-3">소속 위원회</p>
      <p className="mt-0.5 text-[13px] text-ink-2">{p.committee || "—"}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric k="대표발의 법안" v={`${p.bills_proposed.toLocaleString()}건`} />
        <Metric k="그중 반영(가결·대안반영)" v={`${p.bills_reflected.toLocaleString()}건`} />
        <Metric
          k="법안 반영률"
          v={p.reflect_rate == null ? "—" : `${p.reflect_rate}%`}
          muted={p.reflect_rate == null}
          title={REFLECT_HINT}
        />
        <Metric
          k="표결 참여율"
          v={p.vote_participation == null ? "수집 예정" : `${p.vote_participation}%`}
          muted={p.vote_participation == null}
        />
        <Metric k="공약 이행률" v="공식 데이터 없음" muted />
        <Metric k="출석률" v="공식 데이터 없음" muted />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
        <Badge className="mr-1.5 px-1.5 py-0 text-[10px]">기준</Badge>
        {p.score_rule}
      </p>

      <p className="mb-2 mt-5 flex items-center gap-1.5 text-[13px] font-semibold">
        <FileText className="size-3.5 text-ink-3" /> 최근 대표발의 법안
      </p>
      {p.recent_bills.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3">대표발의 법안이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {p.recent_bills.map((b) => {
            const inner = (
              <>
                <p className="text-[13px] leading-snug text-ink">{b.title}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-ink-3">
                  <span className="tabular">{b.propose_dt ? b.propose_dt.slice(0, 10) : "발의일 —"}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge className="px-1.5 py-0 text-[10px]">{b.proc_result || "처리 결과 —"}</Badge>
                    {b.detail_url && <ExternalLink className="size-3" />}
                  </span>
                </div>
              </>
            );
            const cls = "block rounded-xl border border-line bg-white/[0.02] p-2.5 transition";
            return (
              <li key={b.bill_id}>
                {b.detail_url ? (
                  <a href={b.detail_url} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:border-white/15 hover:bg-white/[0.04]")}>
                    {inner}
                  </a>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[10px] text-ink-3">출처: 국회 열린국회정보 · 법안을 누르면 의안정보시스템이 새 탭에서 열립니다.</p>
    </>
  );
}

export function PoliticianDetailSheet({ monaCd, onClose }: { monaCd: string | null; onClose: () => void }) {
  const { data, error } = usePolitician(monaCd);
  const shown = data?.mona_cd === monaCd ? data : undefined; // 다른 의원으로 바꿀 때 이전 응답 숨김

  React.useEffect(() => {
    if (!monaCd) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [monaCd, onClose]);

  return (
    <AnimatePresence>
      {monaCd && (
        <>
          <motion.div
            key="backdrop"
            data-burst-keep
            // 검정 30% 덮개 + 살짝 흐림 (라이트 테마는 --color-black 이 회색이라 rgb 로 고정)
            className="fixed inset-0 z-50 bg-[rgb(0_0_0/0.3)] backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            data-burst-keep
            role="dialog"
            aria-label="정치인 상세"
            // 불투명 카드 배경 — 뒤 화면 글자가 비치지 않게. 왼쪽으로 그림자
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col rounded-l-2xl border-l border-line bg-card shadow-[-16px_0_48px_-8px_rgb(0_0_0/0.5)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.65, 0, 0.35, 1] }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="text-[15px] font-semibold">정치인 상세</p>
              <IconButton aria-label="닫기" onClick={onClose}>
                <X className="size-4" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 scroll-thin">
              {shown ? (
                <Body p={shown} />
              ) : error ? (
                <p className="py-10 text-center text-xs text-ink-3">의원 정보를 불러오지 못했습니다.</p>
              ) : (
                <p className="flex items-center justify-center gap-2 py-10 text-xs text-ink-3">
                  <Loader2 className="size-4 animate-spin" /> 불러오는 중
                </p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
