import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/politicians — 의원 전체 목록 (정치인 표용)
 * ?region=11 로 시도를 거를 수 있음. 정렬은 이름순(정당·성향과 무관).
 * 공약 이행률·출석률은 공식 API가 없어서 내려주지 않습니다.
 */
export async function GET(req: Request) {
  const region = new URL(req.url).searchParams.get("region");
  const rows = await sql`
    select mona_cd, name, party_id, region_code, district, term,
           bills_proposed::int as bills_proposed, coalesce(total_votes, 0)::int as total_votes, vote_participation
    from member_stats
    where ${region}::text is null or region_code = ${region}
    order by name`;
  return Response.json(rows);
}
