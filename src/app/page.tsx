import PoliticalMichelinDashboard from "@/components/dashboard/political-michelin-dashboard";
import { getLatestNews, getRegions } from "@/db/queries";
import { DashboardDataProvider } from "@/lib/dashboard-data";

// 요청마다 DB 에서 최신 데이터를 읽음 (빌드 시점에 고정하지 않음)
export const dynamic = "force-dynamic";

export default async function Page() {
  const [regions, { news, countToday }] = await Promise.all([getRegions(), getLatestNews()]);
  return (
    <DashboardDataProvider regions={regions} news={news} newsCountToday={countToday}>
      <PoliticalMichelinDashboard />
    </DashboardDataProvider>
  );
}
