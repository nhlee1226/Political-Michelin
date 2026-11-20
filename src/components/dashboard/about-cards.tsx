"use client";

/**
 * 팀이 직접 만든 부분을 보여 주는 카드 (발표 피드백: "API 보다 팀의 노력이 보이게")
 *  - BuildStoryCard : 모으기 → 정리하기 → 분석하기 → 보여주기 4단계 + 각 단계의 실제 숫자(/api/stats)
 *  - StarRuleCard   : 미슐랭 별점 산식 (src/db/ui-api.ts memberScores 와 같은 기준)
 * 숫자는 전부 실제 집계. 불러오기 전이거나 실패하면 "—".
 */
import * as React from "react";
import { Database, Download, Hammer, Map, Sparkles, Star, type LucideIcon } from "lucide-react";
import { useStats } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardHeader, MichelinStars } from "@/components/ui/primitives";

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
  const steps: Step[] = [
    {
      icon: Download,
      label: "모으기",
      headline: "수집기 8개",
      desc: "국회 의원·법안·표결, 선관위 선거 결과·공약, 통계청 지역 지표, 정치 뉴스를 모으는 수집기를 직접 만들었습니다. 뉴스는 자동으로 계속 모입니다.",
      facts: [
        { k: "수집 기사", v: `${num(s?.news_total)}건` },
        { k: "22대 법안", v: `${num(s?.bills_total)}건` },
      ],
    },
    {
      icon: Database,
      label: "정리하기",
      headline: "데이터베이스 표 22개",
      desc: "출처마다 제각각인 형식을 하나의 구조로 맞춰 저장합니다. 의원·법안·표결·선거·공약·지역·뉴스·게시판이 서로 연결됩니다.",
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
          <li key={st.label} className="relative flex flex-col rounded-xl border border-line bg-white/[0.03] p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lime text-[12px] font-bold text-canvas tabular">
                {i + 1}
              </span>
              <span className="text-[12px] font-medium text-ink-3">{st.label}</span>
              <st.icon className="ml-auto size-4 text-ink-3" aria-hidden />
            </div>
            <p className="mt-3 text-[15px] font-semibold tracking-tight">{st.headline}</p>
            <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-ink-3">{st.desc}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
              {st.facts.map((f) => (
                <div key={f.k}>
                  <dt className="text-[10px] text-ink-3">{f.k}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular">{f.v}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** 별점 기준 — memberScores: 대표발의 수 순위와 반영 법안 수 순위의 평균, 0.8 이상 ★★★ · 0.5 이상 ★★ */
export function StarRuleCard({ className }: { className?: string }) {
  const { data: s } = useStats();
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
        {rules.map((r) => (
          <li key={r.n} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-[11px] font-semibold text-ink-2 tabular">
              {r.n}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{r.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">{r.desc}</p>
            </div>
          </li>
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
            <p className="mt-1 text-[11px] text-ink-3">{t.k}</p>
          </div>
        ))}
      </div>
      <p className="-mt-2 px-5 pb-5 text-[11px] text-ink-3">
        지금 ★★★ 의원 <b className="text-ink tabular">{num(s?.three_star)}</b>명 · 전체 <span className="tabular">{num(s?.members)}</span>명
      </p>
    </Card>
  );
}
