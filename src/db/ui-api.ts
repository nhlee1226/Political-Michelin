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
 * 공약 이행률·출석률은 공식 API 가 없어 점수에 넣지 않습니다.
 *
 * 본회의 표결(bill_votes, 22대에서 가결·부결된 법안) — 별점에는 넣지 않고 그대로 보여줌:
 *  - 찬성·반대·기권·불참 수: 그 의원이 표결 대상이었던 법안 기준
 *  - 표결 참여율 = (찬성 + 반대 + 기권) / 표결 대상 법안 수
 *
 * 지방선거 당선인·공약(election_candidates·election_pledges)과 시도 지표(region_indicators)는 지역 상세에 붙습니다.
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
  votes_yes: number;
  votes_no: number;
  votes_abstain: number;
  votes_absent: number;
  vote_participation: number | null;
  stars: 1 | 2 | 3;
}

/** 의원 점수 목록. 순위는 전체 의원 기준으로 먼저 매기고, 그다음 의원·시도로 거름 */
export function memberScores(monaCd: string | null, region: string | null) {
  // '전남광주통합특별시 광산구을' = 통합 시도 이름 + 선관위 선거구 이름, 시도는 통합된 시도(광주·전남) 중 하나
  const mergedDistrict = sql.join(
    MERGED_SIDO.map(
      (g) => sql`(m.district = ${g.name} || ' ' || c.sgg_name and c.region_code in (${sql.join(g.codes.map((c) => sql`${c}`), sql`, `)}))`,
    ),
    sql` or `,
  );
  return rows<MemberScore>(sql`
    with latest as (
      select sg_id from elections where sg_typecode = '2' order by sg_id desc limit 1
    ), base as (
      select m.mona_cd, m.name, m.party_id,
             -- 국회 데이터의 선거구 표기('전남광주통합특별시 광산구갑', '세종특별자치시갑')로는 시도 코드를 못 찾은 지역구 의원:
             -- 최근 총선 당선인(선관위) 중 이름과 선거구 이름이 같은 사람의 시도로 채움 (DB 값은 그대로 둠)
             coalesce(m.region_code, w.region_code) as region_code,
             m.district, m.term::int as term,
             m.elect_type, m.committee,
             coalesce(b.proposed, 0)::int as bills_proposed,
             coalesce(b.reflected, 0)::int as bills_reflected,
             coalesce(v.total_votes, 0)::int as total_votes,
             coalesce(v.yes, 0)::int as votes_yes,
             coalesce(v.no, 0)::int as votes_no,
             coalesce(v.abstain, 0)::int as votes_abstain,
             coalesce(v.absent, 0)::int as votes_absent,
             case when v.total_votes > 0 then round(100.0 * (v.total_votes - v.absent) / v.total_votes, 1)::float8 end as vote_participation
      from members m
      left join lateral (
        select c.region_code from election_candidates c
        where m.region_code is null and m.elect_type = '지역구'
          and c.sg_id = (select sg_id from latest) and c.sg_typecode = '2' and c.is_winner
          and m.district like '%' || c.sgg_name
          -- 이름까지 같은 당선인이 먼저. 재보궐로 바뀐 의원은 통합 시도 안에서 선거구 이름이 같은 곳으로
          and (c.name = m.name or ${mergedDistrict})
        order by (c.name = m.name) desc
        limit 1
      ) w on true
      left join (
        select proposer_mona_cd,
               count(*) as proposed,
               count(*) filter (where proc_result like '%가결%' or proc_result like '대안반영%') as reflected
        from bills group by proposer_mona_cd
      ) b on b.proposer_mona_cd = m.mona_cd
      left join (
        select mona_cd, count(*) as total_votes,
               count(*) filter (where result = '찬성') as yes,
               count(*) filter (where result = '반대') as no,
               count(*) filter (where result = '기권') as abstain,
               count(*) filter (where result = '불참') as absent
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
           total_votes, votes_yes, votes_no, votes_abstain, votes_absent, vote_participation,
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

/* ───────── 지방선거 당선인 · 공약 · 시도 지표 ───────── */

const LOCAL_OFFICE: Record<string, string> = { "3": "시·도지사", "4": "구·시·군의 장", "11": "교육감" };

/**
 * 시·도지사·교육감을 함께 뽑는 통합 시도. regions(17개)에는 없어서 그 당선인은 region_code 가 비어 있고,
 * 여기 적힌 시도 코드를 누르면 시도명(sd_name)으로 찾아 보여줍니다.
 */
const MERGED_SIDO = [{ name: "전남광주통합특별시", codes: ["24", "36"] }];

export interface LocalWinner {
  /** '<sgId>:<sgTypecode>:<huboid>' — /api/politicians/<id> 로 공약 원문을 받을 때 씀 */
  id: string;
  office: string;
  name: string;
  party_name: string | null; // 교육감은 정당 없음
  sd_name: string;
  sgg_name: string;
  votes: number | null;
  vote_rate: number | null;
  /** 공약 제목 목록 (내용 원문은 /api/politicians/<id>) */
  pledges: { no: number; realm: string | null; title: string | null }[];
}

type WinnerRow = Omit<LocalWinner, "id" | "office" | "pledges"> & { sg_id: string; sg_typecode: string; huboid: string };

/** 가장 최근 지방선거의 그 시도 당선인(시·도지사·교육감·구·시·군의 장)과 공약 제목 */
export async function regionLocal(code: string, regionNames: Map<string, string>) {
  const [el] = await rows<{ sg_id: string; name: string; election_date: string }>(sql`
    select sg_id, name, election_date::text as election_date from elections
    where sg_typecode in ('3', '4', '11') order by sg_id desc limit 1`);
  if (!el) return null;
  const merged = MERGED_SIDO.find((m) => m.codes.includes(code)) ?? null;
  const mergedName = merged?.name ?? null;
  const mine = sql`c.sg_id = ${el.sg_id} and c.sg_typecode in ('3', '4', '11') and c.is_winner
    and (c.region_code = ${code} or (c.region_code is null and c.sd_name = ${mergedName}::text))`;

  const [winners, pledges] = await Promise.all([
    rows<WinnerRow>(sql`
      select c.sg_id, c.sg_typecode, c.huboid, c.name, c.party_name, c.sd_name, c.sgg_name,
             c.votes::int as votes, c.vote_rate::float8 as vote_rate
      from election_candidates c where ${mine}
      order by c.sgg_name, c.name`),
    rows<{ sg_typecode: string; huboid: string; no: number; realm: string | null; title: string | null }>(sql`
      select p.sg_typecode, p.huboid, p.pledge_no::int as no, p.realm, p.title
      from election_pledges p join election_candidates c using (sg_id, sg_typecode, huboid)
      where ${mine}
      order by p.pledge_no`),
  ]);

  const byWinner = new Map<string, LocalWinner["pledges"]>();
  for (const { sg_typecode, huboid, ...pledge } of pledges) {
    const k = `${sg_typecode}:${huboid}`;
    byWinner.set(k, [...(byWinner.get(k) ?? []), pledge]);
  }
  const view = ({ sg_id, sg_typecode, huboid, ...w }: WinnerRow): LocalWinner => ({
    id: `${sg_id}:${sg_typecode}:${huboid}`,
    office: LOCAL_OFFICE[sg_typecode] ?? "",
    ...w,
    pledges: byWinner.get(`${sg_typecode}:${huboid}`) ?? [],
  });
  const of = (type: string) => winners.filter((w) => w.sg_typecode === type).map(view);
  return {
    // '제9회 전국동시지방선거(시·도지사선거)' → '제9회 전국동시지방선거'
    election: { sg_id: el.sg_id, name: el.name.replace(/\(.*\)$/, ""), date: el.election_date },
    merged: merged && { name: merged.name, regions: merged.codes.map((c) => regionNames.get(c) ?? c) },
    governor: of("3")[0] ?? null,
    superintendent: of("11")[0] ?? null,
    mayors: of("4"),
  };
}

const INDICATOR_ORDER = ["주민등록인구", "고령인구비율", "재정자립도"];

/** 시도 지표: 지표마다 가장 최근 연도 한 줄 (KOSIS) */
export async function regionIndicators(code: string) {
  const list = await rows<{ indicator: string; year: number; value: number; unit: string; source_org_id: string; source_tbl_id: string }>(sql`
    select distinct on (indicator) indicator, year::int as year, value::float8 as value, unit, source_org_id, source_tbl_id
    from region_indicators where region_code = ${code}
    order by indicator, year desc`);
  const rank = (name: string) => INDICATOR_ORDER.indexOf(name) + 1 || INDICATOR_ORDER.length + 1;
  return list.sort((a, b) => rank(a.indicator) - rank(b.indicator) || a.indicator.localeCompare(b.indicator, "ko"));
}

/** 지방선거 당선인 1명 + 공약 원문 (id = '<sgId>:<sgTypecode>:<huboid>'). 내용은 선관위 원문 그대로 */
export async function localWinnerDetail(id: string) {
  const parts = id.split(":");
  if (parts.length !== 3 || parts.some((x) => !x)) return null;
  const [sgId, sgTypecode, huboid] = parts;
  const [c] = await rows<{ name: string; party_name: string | null; sd_name: string; sgg_name: string }>(sql`
    select name, party_name, sd_name, sgg_name from election_candidates
    where sg_id = ${sgId} and sg_typecode = ${sgTypecode} and huboid = ${huboid}`);
  if (!c) return null;
  const pledges = await rows<{ no: number; realm: string | null; title: string | null; content: string | null }>(sql`
    select pledge_no::int as no, realm, title, content from election_pledges
    where sg_id = ${sgId} and sg_typecode = ${sgTypecode} and huboid = ${huboid}
    order by pledge_no`);
  return { id, office: LOCAL_OFFICE[sgTypecode] ?? "", ...c, pledges };
}

/** 지역 클릭 패널: 의원 점수·여론조사·지역 기사 (+ 선거구별 개표 결과, 지방선거 당선인·공약, 시도 지표) */
export async function apiRegionDetail(code: string) {
  const regions = await apiRegions();
  const r = regions.find((x) => x.code === code);
  if (!r) return null;
  const regionNames = new Map(regions.map((x) => [x.code, x.name]));
  const [politicians, support, news, results, local, indicators] = await Promise.all([
    memberScores(null, code),
    rows(sql`
      select distinct on (party_id) party_id, value::float8 as value, pollster, field_end::text as field_end, source_url
      from support_polls where region_code = ${code}
      order by party_id, field_end desc, id desc`),
    apiNews(code, 10),
    getDistrictResults(code),
    regionLocal(code, regionNames),
    regionIndicators(code),
  ]);
  // 공석: 최근 총선 지역구 중 지금 그 시도 의원이 아무도 없는 선거구 (사직·의원직 상실 후 재보궐 전 등). DB 값은 그대로, 화면에만 알림.
  // 국회 표기 '강원 원주시갑'·'세종특별자치시갑'(끝에 공백이 붙기도 함)의 마지막 토막 = 선관위 선거구 이름
  const seated = new Set(
    politicians.filter((p) => p.elect_type === "지역구" && p.district).map((p) => p.district!.trim().replace(/^.* /, "")),
  );
  const vacancies = results.districts.map((d) => d.sggName).filter((sgg) => !seated.has(sgg));
  const { heat: _heat, news_24h: _n, ...region } = r;
  return { ...region, politicians, vacancies, support, news, election: results.election, districts: results.districts, local, indicators };
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

/** 위쪽 숫자 카드 + 의정 활동 평균 + 날짜별 수집 기사 수. 아직 데이터가 없는 값(AI 분석 전의 편향 지수 등)은 null → 화면에 "—" */
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
      (select count(distinct bill_id)::int from bill_votes)                                                as voted_bills,
      (select count(*)::int from news_articles
        where (published_at at time zone 'Asia/Seoul')::date
              between (now() at time zone 'Asia/Seoul')::date - 27 and (now() at time zone 'Asia/Seoul')::date - 14) as news_prev_14d,
      (select count(*)::int from news_analysis)                                                            as analyzed,
      (select round(avg(bias))::int from news_analysis)                                                    as avg_bias`);
  // 최근 14일(오늘 포함, 한국 시간) 날짜별 수집 기사 수 — 기사가 없는 날은 0
  const news_daily = await rows<{ day: string; n: number }>(sql`
    select to_char(d, 'YYYY-MM-DD') as day, coalesce(a.n, 0)::int as n
    from generate_series((now() at time zone 'Asia/Seoul')::date - 13, (now() at time zone 'Asia/Seoul')::date, interval '1 day') d
    left join (
      select (published_at at time zone 'Asia/Seoul')::date as day, count(*) as n
      from news_articles where published_at > now() - interval '15 days' group by 1
    ) a on a.day = d::date
    order by d`);
  const scores = await memberScores(null, null);
  const withBills = scores.filter((m) => m.bills_proposed > 0);
  const voters = scores.filter((m) => m.vote_participation != null);
  return {
    ...s,
    news_daily,
    avg_vote_participation: voters.length
      ? Math.round((10 * voters.reduce((a, m) => a + m.vote_participation!, 0)) / voters.length) / 10
      : null,
    three_star: scores.filter((m) => m.stars === 3).length,
    avg_reflect_rate: withBills.length
      ? Math.round((10 * withBills.reduce((a, m) => a + (m.reflect_rate ?? 0), 0)) / withBills.length) / 10
      : null,
  };
}
