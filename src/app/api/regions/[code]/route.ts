import { getRegionDetail } from "@/server/queries";

export const dynamic = "force-dynamic";

/** GET /api/regions/11 — 지역 클릭 패널: 의원·여론조사·뉴스 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const region = await getRegionDetail(code);
  if (!region) return Response.json({ detail: "없는 지역 코드입니다" }, { status: 404 });
  return Response.json(region);
}
