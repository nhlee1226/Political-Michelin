/** 화면에서 쓰는 읽기 쿼리 모음. API 라우트는 이 함수들만 부릅니다. */
import { sql } from "./db";

export async function getRegions() {
  return sql`
    select r.code, r.name, r.short, r.seats, r.turnout,
           coalesce(h.heat, 0)::int as heat, coalesce(h.news_24h, 0)::int as news_24h
    from regions r left join region_heat h on h.code = r.code
    order by r.code`;
}

export async function getNews(region: string | null, limit: number) {
  return sql`
    select n.id, n.url, n.source, n.headline, n.summary, n.published_at, n.region_code,
           a.bias, a.bias_signals, a.objective_headline, a.objective_summary
    from news n left join news_analysis a on a.news_id = n.id
    where ${region}::text is null or n.region_code = ${region}
    order by n.published_at desc
    limit ${limit}`;
}

export async function getRegionDetail(code: string) {
  const [region] = await sql`select * from regions where code = ${code}`;
  if (!region) return null;
  const [politicians, support, news] = await Promise.all([
    sql`select * from member_stats where region_code = ${code} order by name`,
    sql`select * from region_support_latest where region_code = ${code}`,
    getNews(code, 10),
  ]);
  return { ...region, politicians, support, news };
}

export async function getPolitician(monaCd: string) {
  const [person] = await sql`select * from member_stats where mona_cd = ${monaCd}`;
  if (!person) return null;
  const recent_bills = await sql`
    select bill_id, bill_no, title, propose_dt, proc_result, detail_url
    from bills where proposer_mona_cd = ${monaCd}
    order by propose_dt desc nulls last limit 10`;
  return { ...person, recent_bills };
}

export async function getParties() {
  return sql`select * from parties where is_active order by id`;
}
