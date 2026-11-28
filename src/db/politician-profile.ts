/**
 * 정치인 상세 페이지(/politicians/[id], GET /api/politicians/[id]) 데이터.
 * 모두 DB 에 이미 있는 공개 데이터로만 계산 — 국회(의원·법안·표결·일정), 선관위(후보·득표), 네이버 뉴스(언급), 회원 활동(즐겨찾기).
 * 나중에 생긴 표·열(공동발의·출석·재산·정치자금·일정·인적사항 열)은 없을 수 있어서, 없으면 오류 대신 null 로 내려 화면이 "수집 전"으로 보여 줌.
 * 점수 기준은 ui-api.ts 의 memberScores 와 같음 (정당·이념 변수 없음).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { billStage, type BillDates } from "@/lib/bill-stage";
import type { ApiNews } from "@/lib/api";
import type {
  CandidateBio,
  ElectionResult,
  LocalProfileData,
  MemberProfileData,
  MetricSet,
  ProfileBill,
  ProfileVote,
} from "@/lib/politician-profile";
import { db } from "./index";
import { LOCAL_OFFICE, memberScores, NEWS_COLUMNS, SCORE_RULE, type MemberScore } from "./ui-api";

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  if (!db) return [];
  return (await db.execute(query)) as unknown as T[];
}

/** 표·열이 아직 없을 때(42P01 undefined_table, 42703 undefined_column)만 null. 그 밖의 오류는 그대로 */
async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "42P01" || code === "42703") return null;
    throw e;
  }
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};
/** 1 + 나보다 값이 큰 사람 수 (값이 없으면 null) */
const rankOf = (mine: number | null, all: (number | null)[]) => (mine == null ? null : 1 + all.filter((x) => x != null && x > mine).length);

/* ───────── 선관위 후보 정보 · 선거 결과 ───────── */

interface CandidateRow {
  sg_id: string;
  sg_typecode: string;
  huboid: string;
  sd_name: string;
  sgg_name: string;
  name: string;
  hanja_name: string | null;
  gender: string | null;
  age: number | null;
  birthday: string | null;
  job: string | null;
  edu: string | null;
  career1: string | null;
  career2: string | null;
  votes: number | null;
  vote_rate: number | null;
  election: string;
}

const CANDIDATE_COLS = sql`c.sg_id, c.sg_typecode, c.huboid, c.sd_name, c.sgg_name, c.name, c.hanja_name, c.gender, c.age::int as age,
  c.birthday, c.job, c.edu, c.career1, c.career2, c.votes::int as votes, c.vote_rate::float8 as vote_rate, e.name as election`;

const bioOf = (c: CandidateRow): CandidateBio => ({
  hanja_name: c.hanja_name,
  gender: c.gender,
  age: c.age,
  birthday: c.birthday && /^\d{8}$/.test(c.birthday) ? `${c.birthday.slice(0, 4)}-${c.birthday.slice(4, 6)}-${c.birthday.slice(6)}` : c.birthday,
  job: text(c.job),
  edu: text(c.edu),
  career: [c.career1, c.career2].map(text).filter((x): x is string => !!x),
});

async function electionResult(c: CandidateRow): Promise<ElectionResult> {
  const key = sql`sg_id = ${c.sg_id} and sg_typecode = ${c.sg_typecode} and sd_name = ${c.sd_name} and sgg_name = ${c.sgg_name}`;
  const [[runner], [district]] = await Promise.all([
    rows<{ name: string; party_name: string | null; votes: number | null; vote_rate: number | null }>(sql`
      select name, party_name, votes::int as votes, vote_rate::float8 as vote_rate from election_candidates
      where ${key} and huboid <> ${c.huboid} and votes is not null
      order by votes desc limit 1`),
    rows<{ turnout: number | null }>(sql`
      select case when electors > 0 then round(100.0 * voters / electors, 1)::float8 end as turnout
      from election_districts where ${key}`),
  ]);
  return {
    election: c.election.replace(/\(.*\)$/, ""),
    sgg_name: c.sgg_name,
    votes: c.votes,
    vote_rate: c.vote_rate,
    runner_up: runner ?? null,
    margin_votes: runner && c.votes != null && runner.votes != null ? c.votes - runner.votes : null,
    margin_rate:
      runner && c.vote_rate != null && runner.vote_rate != null ? Math.round((c.vote_rate - runner.vote_rate) * 100) / 100 : null,
    turnout: district?.turnout ?? null,
  };
}

/* ───────── 뉴스 언급 ───────── */

async function mentionNews(kind: "member" | "candidate", ref: string): Promise<MemberProfileData["news"]> {
  const mention = sql`exists (select 1 from news_mentions nm where nm.news_id = a.id and nm.kind = ${kind} and nm.ref = ${ref})`;
  const [articles, daily, [agg]] = await Promise.all([
    rows<ApiNews>(sql`
      select ${NEWS_COLUMNS}
      from news_articles a left join news_analysis x on x.news_id = a.id
      where ${mention}
      order by a.published_at desc limit 12`),
    rows<{ day: string; n: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as day,
             (select count(*) from news_articles a
               where ${mention} and (a.published_at at time zone 'Asia/Seoul')::date = d)::int as n
      from generate_series((now() at time zone 'Asia/Seoul')::date - 29, (now() at time zone 'Asia/Seoul')::date, interval '1 day') as g(d)
      order by d`),
    rows<{ avg_lean: number | null; analyzed: number }>(sql`
      select round(avg(x.lean))::int as avg_lean, count(x.lean)::int as analyzed
      from news_articles a join news_analysis x on x.news_id = a.id
      where ${mention} and a.published_at >= now() - interval '30 days'`),
  ]);
  return {
    total_30d: daily.reduce((s, d) => s + d.n, 0),
    daily,
    avg_lean: agg?.avg_lean ?? null,
    analyzed: agg?.analyzed ?? 0,
    articles,
  };
}

/* ───────── 국회의원 ───────── */

const metricSet = (list: (MemberScore & { cosponsored: number | null })[]): MetricSet => ({
  n: list.length,
  bills_proposed: avg(list.map((p) => p.bills_proposed)),
  reflect_rate: avg(list.map((p) => p.reflect_rate)),
  vote_participation: avg(list.map((p) => p.vote_participation)),
  cosponsored: avg(list.map((p) => p.cosponsored)),
});

export async function memberProfile(monaCd: string): Promise<MemberProfileData | null> {
  const [m] = await rows<Record<string, unknown>>(sql`select to_jsonb(m) as j from members m where m.mona_cd = ${monaCd}`).then(
    (r) => r.map((x) => x.j as Record<string, unknown>),
  );
  if (!m) return null;

  const [all, coCounts] = await Promise.all([
    memberScores(null, null),
    optional(rows<{ mona_cd: string; n: number }>(sql`select mona_cd, count(*)::int as n from bill_cosponsors group by mona_cd`)),
  ]);
  const coMap = coCounts && new Map(coCounts.map((r) => [r.mona_cd, r.n]));
  const scored = all.map((p) => ({ ...p, cosponsored: coMap ? (coMap.get(p.mona_cd) ?? 0) : null }));
  const me = scored.find((p) => p.mona_cd === monaCd);
  if (!me) return null;

  const committees = [
    ...new Set(
      [text(m.committee), ...(text(m.committees)?.split(/[,，]/) ?? [])].map((s) => s?.trim()).filter((s): s is string => !!s),
    ),
  ];
  const inCommittees = committees.length ? sql`committee in (${sql.join(committees.map((c) => sql`${c}`), sql`, `)})` : sql`false`;
  const partyId = me.party_id;
  const hasParty = !!partyId && partyId !== "무소속";

  const [candidate] =
    me.elect_type === "비례대표"
      ? []
      : await rows<CandidateRow>(sql`
          select ${CANDIDATE_COLS}
          from election_candidates c join elections e using (sg_id, sg_typecode)
          where c.sg_typecode = '2' and c.is_winner and c.name = ${me.name}
            and c.sg_id = (select sg_id from elections where sg_typecode = '2' order by sg_id desc limit 1)
          order by (${me.district ?? ""}::text like '%' || c.sgg_name) desc, (c.region_code = ${me.region_code}::text) desc nulls last
          limit 1`);

  const [billRows, cosponsored, voteRows, news, followers, schedule, attendance, assets, funds] = await Promise.all([
    rows<{ j: Record<string, string | null> }>(sql`
      select to_jsonb(b) as j from bills b where b.proposer_mona_cd = ${monaCd}
      order by b.propose_date desc nulls last, b.bill_id desc limit 200`),
    optional(
      rows<NonNullable<MemberProfileData["cosponsored_bills"]>[number]>(sql`
        select b.bill_id, b.title, p.name as proposer, b.propose_date::text as propose_date, b.proc_result, b.detail_url
        from bill_cosponsors c join bills b using (bill_id) left join members p on p.mona_cd = b.proposer_mona_cd
        where c.mona_cd = ${monaCd}
        order by b.propose_date desc nulls last, b.bill_id desc limit 15`),
    ),
    rows<ProfileVote>(sql`
      with mine as (
        select bill_id, result, vote_date from bill_votes where mona_cd = ${monaCd}
      ), party as (
        select v.bill_id, v.result, count(*) as n
        from bill_votes v join members pm on pm.mona_cd = v.mona_cd
        where ${hasParty}::boolean and pm.party_id = ${partyId ?? ""} and v.result <> '불참'
          and v.bill_id in (select bill_id from mine)
        group by v.bill_id, v.result
      ), maj as (
        select distinct on (bill_id) bill_id, result, n, sum(n) over (partition by bill_id) as tot
        from party order by bill_id, n desc, result
      )
      select mine.bill_id, b.title, b.detail_url, mine.result, mine.vote_date::text as vote_date,
             maj.result as party_result, round(100.0 * maj.n / nullif(maj.tot, 0))::int as party_share
      from mine join bills b using (bill_id) left join maj using (bill_id)
      order by mine.vote_date desc, mine.bill_id desc`),
    mentionNews("member", monaCd),
    optional(
      rows<{ n: number }>(sql`select count(*)::int as n from user_follows where kind = 'politician' and target_id = ${monaCd}`).then(
        (r) => r[0]?.n ?? 0,
      ),
    ),
    optional(
      rows<NonNullable<MemberProfileData["schedule"]>[number]>(sql`
        select sch_date::text as date, sch_time as time, kind, title, committee, place
        from assembly_schedule
        where sch_date between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date + 14
          and (${inCommittees} or coalesce(kind, '') like '%본회의%' or title like '%본회의%')
        order by sch_date, sch_time nulls last, id limit 20`),
    ),
    optional(
      rows<NonNullable<MemberProfileData["records"]["attendance"]>[number]>(sql`
        select kind, period, attended, total, source_url from member_attendance where mona_cd = ${monaCd}
        order by kind, period desc`),
    ),
    optional(
      rows<NonNullable<MemberProfileData["records"]["assets"]>[number]>(sql`
        select year::int as year, total::float8 as total, real_estate::float8 as real_estate, deposits::float8 as deposits,
               securities::float8 as securities, debts::float8 as debts, source_url
        from member_assets where mona_cd = ${monaCd} order by year desc`),
    ),
    optional(
      rows<NonNullable<MemberProfileData["records"]["funds"]>[number]>(sql`
        select year::int as year, income::float8 as income, expense::float8 as expense, donations::float8 as donations, source_url
        from member_funds where mona_cd = ${monaCd} order by year desc`),
    ),
  ]);

  // 법안 처리 단계 (단계 날짜 열이 아직 없으면 to_jsonb 에 키가 없어 null 로 계산됨)
  const bills: ProfileBill[] = billRows.map(({ j }) => {
    const d: BillDates = {
      propose_date: j.propose_date ?? null,
      committee_date: j.committee_date ?? null,
      cmt_present_date: j.cmt_present_date ?? null,
      cmt_proc_date: j.cmt_proc_date ?? null,
      cmt_proc_result: j.cmt_proc_result ?? null,
      law_submit_date: j.law_submit_date ?? null,
      law_present_date: j.law_present_date ?? null,
      law_proc_date: j.law_proc_date ?? null,
      law_proc_result: j.law_proc_result ?? null,
      proc_date: j.proc_date ?? null,
      proc_result: j.proc_result ?? null,
    };
    return {
      bill_id: j.bill_id!,
      bill_no: j.bill_no ?? null,
      title: j.title ?? "",
      committee: j.committee ?? null,
      propose_date: d.propose_date,
      proc_result: d.proc_result,
      detail_url: j.detail_url ?? null,
      ...billStage(d),
    };
  });
  const byCommittee = new Map<string, number>();
  for (const b of bills) byCommittee.set(b.committee || "미정", (byCommittee.get(b.committee || "미정") ?? 0) + 1);

  const comparable = voteRows.filter((v) => v.result !== "불참" && v.party_result);
  const dissent = comparable.filter((v) => v.result !== v.party_result);

  const peersCommittee = me.committee ? scored.filter((p) => p.committee === me.committee) : [];

  return {
    kind: "member",
    id: monaCd,
    name: me.name,
    hanja_name: text(m.hanja_name) ?? candidate?.hanja_name ?? null,
    eng_name: text(m.eng_name),
    photo_url: text(m.photo_url),
    party_id: partyId,
    district: me.district,
    elect_type: me.elect_type,
    term: me.term,
    units: text(m.units),
    committee: me.committee,
    committees,
    job_title: text(m.job_title),
    birth_date: text(m.birth_date),
    gender: text(m.gender) ?? candidate?.gender ?? null,
    career: text(m.career),
    contact: {
      tel: text(m.tel),
      email: text(m.email),
      homepage: text(m.homepage),
      office: text(m.office),
      staff: text(m.staff),
      secretary: text(m.secretary),
      secretary2: text(m.secretary2),
    },
    bio: candidate ? bioOf(candidate) : null,
    election: candidate ? await electionResult(candidate) : null,

    stars: me.stars,
    score_rule: SCORE_RULE,
    bills_proposed: me.bills_proposed,
    bills_reflected: me.bills_reflected,
    reflect_rate: me.reflect_rate,
    total_votes: me.total_votes,
    votes_yes: me.votes_yes,
    votes_no: me.votes_no,
    votes_abstain: me.votes_abstain,
    votes_absent: me.votes_absent,
    vote_participation: me.vote_participation,
    cosponsored: me.cosponsored,

    ranks: {
      total: scored.length,
      bills_proposed: rankOf(me.bills_proposed, scored.map((p) => p.bills_proposed)),
      bills_reflected: rankOf(me.bills_reflected, scored.map((p) => p.bills_reflected)),
      reflect_rate: rankOf(me.reflect_rate, scored.map((p) => p.reflect_rate)),
      vote_participation: rankOf(me.vote_participation, scored.map((p) => p.vote_participation)),
      cosponsored: rankOf(me.cosponsored, scored.map((p) => p.cosponsored)),
    },
    compare: {
      me: metricSet([me]),
      party: hasParty ? metricSet(scored.filter((p) => p.party_id === partyId)) : null,
      committee: peersCommittee.length > 1 ? metricSet(peersCommittee) : null,
      all: metricSet(scored),
    },

    bills: {
      pending: bills.filter((b) => !b.closed).length,
      closed: bills.filter((b) => b.closed).length,
      list: bills,
      by_committee: [...byCommittee].map(([committee, n]) => ({ committee, n })).sort((a, b) => b.n - a.n),
    },
    cosponsored_bills: cosponsored,

    votes: { recent: voteRows.slice(0, 30), dissent: dissent.slice(0, 50), dissent_total: dissent.length, comparable: comparable.length },
    news,
    followers,
    schedule,
    records: { attendance, assets, funds },
    updated_at: new Date().toISOString(),
  };
}

/* ───────── 지방선거 당선인 ───────── */

export async function localProfile(id: string): Promise<LocalProfileData | null> {
  const parts = id.split(":");
  if (parts.length !== 3 || parts.some((x) => !x)) return null;
  const [sgId, sgTypecode, huboid] = parts;
  const [c] = await rows<CandidateRow & { party_name: string | null }>(sql`
    select ${CANDIDATE_COLS}, c.party_name
    from election_candidates c join elections e using (sg_id, sg_typecode)
    where c.sg_id = ${sgId} and c.sg_typecode = ${sgTypecode} and c.huboid = ${huboid}`);
  if (!c) return null;
  const [pledges, election, news] = await Promise.all([
    rows<LocalProfileData["pledges"][number]>(sql`
      select pledge_no::int as no, realm, title, content from election_pledges
      where sg_id = ${sgId} and sg_typecode = ${sgTypecode} and huboid = ${huboid}
      order by pledge_no`),
    electionResult(c),
    mentionNews("candidate", id),
  ]);
  return {
    kind: "local",
    id,
    office: LOCAL_OFFICE[sgTypecode] ?? "",
    name: c.name,
    party_name: c.party_name,
    sd_name: c.sd_name,
    sgg_name: c.sgg_name,
    bio: bioOf(c),
    election,
    pledges,
    news,
    updated_at: new Date().toISOString(),
  };
}

export function politicianProfile(id: string) {
  return id.includes(":") ? localProfile(id) : memberProfile(id);
}
