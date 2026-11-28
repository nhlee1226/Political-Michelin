import type { Metadata } from "next";
import { EncyclopediaView } from "@/components/encyclopedia/encyclopedia-view";

/**
 * 정치 백과사전 1편 — 대한민국 국가 구조 (/encyclopedia, /encyclopedia?node=<칸 id>)
 * 데이터는 정적 파일(src/lib/encyclopedia/state-structure.ts)이라 DB 연결이 없어도 열림.
 */
export const metadata: Metadata = {
  title: "국가 구조 백과사전 | 정치 미슐랭",
  description: "국회·정부·법원·헌법재판소·선관위·지방자치까지, 대한민국 국가 기관을 위에서 아래로 쉬운 말로 설명합니다.",
};

type Props = { searchParams: Promise<{ node?: string | string[] }> };

export default async function EncyclopediaPage({ searchParams }: Props) {
  const { node } = await searchParams;
  return <EncyclopediaView initialNodeId={typeof node === "string" ? node : null} />;
}
