/**
 * 화면(src/lib/api.ts 의 SWR 훅)이 /api/* 로 받는 응답을 통합 스키마(schema.ts)에서 만듭니다.
 * 응답 모양(필드 이름)은 화면 코드가 쓰던 그대로 유지합니다 → 화면 컴포넌트는 고치지 않아도 됨.
 *
 * 의정활동 점수(별점·반영률) 기준 — 정당·이념과 무관, 국회 공개 데이터만:
 *  - 대표발의 수: 대표발의한 법안 수
 *  - 반영 법안: 그중 원안가결·수정가결 또는 대안반영폐기(위원회 대안에 내용이 들어감)된 수
 *  - 반영률 = 반영 법안 / 대표발의 수
 *  - 별점: 전체 의원 안에서 대표발의 수 순위(백분위)와 반영 법안 수 순위의 평균
 *          상위 20% = 3개, 상위 50% = 2개, 나머지 = 1개
 * 공약 이행률·출석률은 공식 API 가 없어 점수에 넣지 않습니다. 표결 참여율은 bill_votes 수집 후 채워집니다.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./index";
import { getDistrictResults, getRegionStats } from "./queries";

export const SCORE_RULE = "별점 = 대표발의 수 순위와 반영 법안 수 순위의 평균 (상위 20% ★★★, 상위 50% ★★). 정당·이념 변수 없음";

type Row = Record<string, unknown>;
// 시각은 to_json(...)#>>'{}' 로 ISO 8601 문자열(예: 2026-11-09T12:43:08.93+00:00)로 내려 모든 브라우저에서 new Date() 가 되게 함

async function rows<T = Row>(query: ReturnType<typeof sql>): Promise<T[]> {
  if (!db) return [];
  return (await db.execute(query)) as unknown as T[];
}

/* ───────── 의원 점수 ───────── */

export interface MemberScore {
  mona_cd: string;
  name: string;
  party_id: string | null;
  region_code: string | null;
  district: string | null;
  term: number | null;
  elect_type: string | null;
  committee: string | null;
  bills_proposed: number;
  bills_reflected: number;
  reflect_rate: number | null;
  total_votes: number;
  vote_participation: number | null;
  stars: 1 | 2 | 3;
}

/** 의원 점수 목록. 순위는 전체 의원 기준으로 먼저 매기고, 그다음 의원·시도로 거름 */
export function memberScores(monaCd: string | null, region: string | null) {
  return rows<MemberScore>(sql`
    with base as (
      select m.mona_cd, m.name, m.party_id, m.region_code, m.district, m.term::int as term,
             m.elect_type, m.committee,
             coalesce(b.proposed, 0)::int as bills_proposed,
             coalesce(b.reflected, 0)::int as bills_reflected,
             coalesce(v.total_votes, 0)::int as total_votes,
             case when v.total_votes > 0 then round(100.0 * v.participated / v.total_votes, 1)::float8 end as vote_participation
      from members m
      left join (
        select proposer_mona_cd,
               count(*) as proposed,
               count(*) filter (where proc_result like '%가결%' or proc_result like '대안반영%') as reflected
        from bills group by proposer_mona_cd
      ) b on b.proposer_mona_cd = m.mona_cd
      left join (
        select mona_cd, count(*) as total_votes, count(*) filter (where result <> '불참') as participated
        from bill_votes group by mona_cd
      ) v on v.mona_cd = m.mona_cd
    ), ranked as (
      select *,
             -- 같은 값끼리는 가운데 순위를 줌 (percent_rank 와 cume_dist 의 평균)
             ((percent_rank() over (order by bills_proposed) + cume_dist() over (order by bills_proposed)) / 2
            + (percent_rank() over (order by bills_reflected) + cume_dist() over (order by bills_reflected)) / 2) / 2 as score
      from base
    )
    select mona_cd, name, party_id, region_code, district, term, elect_type, committee,
           bills_proposed, bills_reflected,
           case when bills_proposed > 0 then round(100.0 * bills_reflected / bills_proposed, 1)::float8 end as reflect_rate,
           total_votes, vote_participation,
           (case when score >= 0.8 then 3 when score >= 0.5 then 2 else 1 end)::int as stars
    from ranked
    where (${monaCd}::text is null or mona_cd = ${monaCd})
      and (${region}::text is null or region_code = ${region})
    order by name`);
}

/** 의원 1명 상세: 점수 + 대표발의 법안 최근 10건 */
export async function politicianDetail(monaCd: string) {
  const [person] = await memberScores(monaCd, null);
  if (!person) return null;
  const recent_bills = await rows(sql`
    select bill_id, bill_no, title, propose_date::text as propose_dt, committee, proc_result, detail_url
    from bills where proposer_mona_cd = ${monaCd}
    order by propose_date desc nulls last, bill_id desc limit 10`);
  return { ...person, bills_passed: person.bills_reflected, score_rule: SCORE_RULE, updated_at: new Date().toISOString(), recent_bills };
}

/* ───────── 지역 ───────── */

/** 지도용 시도 17개: 의석·투표율(선관위) + 이슈 활성도(최근 24시간 기사 수) */
export async function apiRegions() {
  const { stats } = await getRegionStats();
  return stats.map((s) => ({
    code: s.code,
    name: s.name,
    short: s.short,
    seats: s.seats,
    turnout: s.turnout,
    heat: s.heat,
    news_24h: s.news24h,
  }));
}

/** 지역 클릭 패널: 의원 점수·여론조사·지역 기사 (+ 선거구별 개표 결과) */
export async function apiRegionDetail(code: string) {
  const regions = await apiRegions();
  const r = regions.find((x) => x.code === code);
  if (!r) return null;
  const [politicians, support, news, results] = await Promise.all([
    memberScores(null, code),
    rows(sql`
      select distinct on (party_id) party_id, value::float8 as value, pollster, field_end::text as field_end, source_url
      from support_polls where region_code = ${code}
      order by party_id, field_end desc, id desc`),
    apiNews(code, 10),
    getDistrictResults(code),
  ]);
  const { heat: _heat, news_24h: _n, ...region } = r;
  return { ...region, politicians, support, news, election: results.election, districts: results.districts };
}

/* ───────── 뉴스 · 정당 · 숫자 카드 ───────── */

export function apiNews(region: string | null, limit: number) {
  return rows(sql`
    select a.id, a.url, a.source, a.title as headline, a.summary, to_json(a.published_at)#>>'{}' as published_at, a.region_code,
           x.bias::int as bias, x.bias_signals, x.objective_headline, x.objective_summary
    from news_articles a left join news_analysis x on x.news_id = a.id
    where (${region}::text is null or a.region_code = ${region})
    order by a.published_at desc
    limit ${limit}`);
}

export function apiParties() {
  return rows(sql`select id, name, short, color, is_active from parties where is_active order by id`);
}

/** 위쪽 숫자 카드. 아직 데이터가 없는 값(AI 분석 전의 편향 지수 등)은 null → 화면에 "—" */
export async function apiStats() {
  const [s] = await rows(sql`
    select
      (select count(*)::int from members)                                                                  as members,
      (select count(*)::int from news_articles where published_at > now() - interval '24 hours')           as news_24h,
      (select count(*)::int from news_articles)                                                            as news_total,
      (select count(distinct source)::int from news_articles where published_at > now() - interval '7 days') as sources_7d,
      (select to_json(max(collected_at))#>>'{}' from news_articles)                                        as news_updated_at,
      (select count(*)::int from bills)                                                                    as bills_total,
      (select count(*)::int from bills where proc_result like '%가결%')                                     as bills_passed,
      (select count(*)::int from news_analysis)                                                            as analyzed,
      (select round(avg(bias))::int from news_analysis)                                                    as avg_bias`);
  const scores = await memberScores(null, null);
  const withBills = scores.filter((m) => m.bills_proposed > 0);
  return {
    ...s,
    three_star: scores.filter((m) => m.stars === 3).length,
    avg_reflect_rate: withBills.length
      ? Math.round((10 * withBills.reduce((a, m) => a + (m.reflect_rate ?? 0), 0)) / withBills.length) / 10
      : null,
  };
}
