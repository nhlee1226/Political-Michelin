import { getElectedMembers } from "@/db/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/politicians?region=11 — 현역 의원 목록 (이름순)
 * 열린국회정보 연동 전에는 최근 총선 지역구 당선인(선관위, 득표수·득표율 포함)으로 대신합니다 → source 필드로 구분.
 * 공약 이행률·출석률은 공식 API 가 없어 내려주지 않습니다.
 */
export async function GET(req: Request) {
  const region = new URL(req.url).searchParams.get("region");
  const { list, source } = await getElectedMembers(region);
  return Response.json({ source, members: list.sort((a, b) => a.name.localeCompare(b.name, "ko")) });
}
