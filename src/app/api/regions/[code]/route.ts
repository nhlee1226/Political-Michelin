import { db } from "@/db";
import { apiRegionDetail } from "@/db/ui-api";

export const dynamic = "force-dynamic";

/** GET /api/regions/11 — 지역 클릭 패널: 의원(점수 포함)·여론조사·뉴스 + 선거구별 개표 결과 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  const { code } = await params;
  const region = await apiRegionDetail(code);
  if (!region) return Response.json({ detail: "없는 지역 코드입니다" }, { status: 404 });
  return Response.json(region);
}
