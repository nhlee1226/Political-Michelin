import PoliticalMichelinDashboard from "@/components/dashboard/political-michelin-dashboard";
import { isTabKey } from "@/components/dashboard/tab-keys";
import { getDashboardData } from "@/db/queries";
import { DashboardDataProvider } from "@/lib/dashboard-data";

// 요청마다 DB 에서 최신 데이터를 읽음 (빌드 시점에 고정하지 않음)
export const dynamic = "force-dynamic";

/** ?tab=news 처럼 주소로 첫 탭을 고름 (백과사전 페이지의 탭에서 넘어올 때). 모르는 값이면 지도 */
type Props = { searchParams: Promise<{ tab?: string; q?: string }> };

export default async function Page({ searchParams }: Props) {
  const [data, sp] = await Promise.all([getDashboardData(), searchParams]);
  return (
    <DashboardDataProvider {...data}>
      <PoliticalMichelinDashboard initialTab={isTabKey(sp.tab) ? sp.tab : "map"} initialQuery={typeof sp.q === "string" ? sp.q : ""} />
    </DashboardDataProvider>
  );
}
