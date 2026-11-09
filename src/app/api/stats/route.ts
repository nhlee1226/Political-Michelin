import { sql } from "@/server/db";
import { memberScores } from "@/server/member-scores";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats — 화면 위쪽 숫자 카드용 실제 집계
 * three_star = 별점 3개 의원 수, avg_reflect_rate = 대표발의 1건 이상 의원의 평균 반영률(%).
 * 아직 데이터가 없는 값(AI 분석 전의 편향 지수 등)은 null 로 내려서 화면이 "—"로 보여주게 합니다.
 */
export async function GET() {
  const [s] = await sql`
    select
      (select count(*)::int from members)                                                    as members,
      (select count(*)::int from news where published_at > now() - interval '24 hours')      as news_24h,
      (select count(*)::int from news)                                                       as news_total,
      (select count(distinct source)::int from news where published_at > now() - interval '7 days') as sources_7d,
      (select max(fetched_at) from news)                                                     as news_updated_at,
      (select count(*)::int from bills)                                                      as bills_total,
      (select count(*)::int from bills where proc_result like '%가결%')                       as bills_passed,
      (select count(*)::int from news_analysis)                                              as analyzed,
      (select round(avg(bias))::int from news_analysis)                                      as avg_bias`;
  const scores = await memberScores(null, null);
  const withBills = scores.filter((m) => m.bills_proposed > 0);
  return Response.json({
    ...s,
    three_star: scores.filter((m) => m.stars === 3).length,
    avg_reflect_rate: withBills.length
      ? Math.round((10 * withBills.reduce((a, m) => a + Number(m.reflect_rate ?? 0), 0)) / withBills.length) / 10
      : null,
  });
}
