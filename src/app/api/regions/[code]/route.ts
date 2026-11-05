import { getDistrictResults, getElectedMembers, getLatestNews, getRegionStats } from "@/db/queries";

export const dynamic = "force-dynamic";

/** GET /api/regions/11 — 지역 패널: 의석·투표율, 선거구별 개표 결과, 현역 의원, 지역 기사 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { stats } = await getRegionStats();
  const region = stats.find((r) => r.code === code);
  if (!region) return Response.json({ detail: "없는 지역 코드입니다" }, { status: 404 });
  const [results, members, news] = await Promise.all([
    getDistrictResults(code),
    getElectedMembers(code),
    getLatestNews({ region: code, limit: 10 }),
  ]);
  return Response.json({ ...region, election: results.election, districts: results.districts, members: members.list, news });
}
