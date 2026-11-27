import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { politicianProfile } from "@/db/politician-profile";
import { PoliticianProfileView } from "@/components/politician/politician-profile-view";

export const dynamic = "force-dynamic";

/**
 * 정치인 상세 페이지 — /politicians/<MONA_CD> (국회의원) 또는 /politicians/<sgId:sgTypecode:huboid> (지방선거 당선인)
 * 사이트 어디서든 정치인 이름을 누르면 옆에 뜨는 "정치인 상세 페이지로 이동" 버튼이 여기로 옴 (components/politician/politician-link.tsx)
 */
type Props = { params: Promise<{ id: string }> };

const load = async (params: Props["params"]) => {
  const { id } = await params;
  return db ? politicianProfile(decodeURIComponent(id)) : null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load(params).catch(() => null);
  if (!p) return { title: "정치인 상세 | 정치 미슐랭" };
  const role = p.kind === "member" ? `${p.party_id ?? "무소속"} · ${p.elect_type === "비례대표" ? "비례대표" : (p.district ?? "")}` : `${p.office} · ${p.sd_name}`;
  return {
    title: `${p.name} | 정치 미슐랭`,
    description: `${p.name} (${role}) — 의정활동·법안·표결·선거 결과·뉴스를 공개 데이터로 한눈에.`,
  };
}

export default async function PoliticianPage({ params }: Props) {
  if (!db) {
    return (
      <main className="aurora grid min-h-svh place-items-center px-4">
        <div className="glass max-w-md rounded-2xl p-6 text-center">
          <p className="text-lg font-semibold">정치인 상세는 DB 연결이 필요합니다</p>
          <p className="mt-2 text-sm text-ink-3">DATABASE_URL 이 설정되지 않아 실제 의원 데이터를 불러올 수 없습니다.</p>
          <Link href="/" className="mt-4 inline-block text-sm font-semibold text-lime hover:underline">
            대시보드로 돌아가기
          </Link>
        </div>
      </main>
    );
  }
  const data = await load(params);
  if (!data) notFound();
  return <PoliticianProfileView data={data} />;
}
