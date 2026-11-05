/**
 * 화면·API 가 쓰는 읽기 쿼리 모음 (화면용 계산은 모두 여기 한 곳에서).
 * DB 가 없거나(DATABASE_URL 미설정) 연결에 실패하면 빈 값/ mock 으로 대신해서 화면은 계속 동작합니다.
 */
import "server-only";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "./index";
import {
  bills,
  electionCandidates,
  electionDistricts,
  elections,
  electionTurnout,
  members,
  newsAnalysis,
  newsArticles,
  newsMentions,
  parties,
  regions,
} from "./schema";
import { PARTIES, REGIONS, type NewsItem, type Region } from "@/lib/mock-data";
import type { DataSources, DistrictResult, ElectedMember } from "@/lib/live-types";

const NEUTRAL = PARTIES.ETC.color;
const DAY_MS = 24 * 3600 * 1000;

/* ───────── 공통 ───────── */

/** 가장 최근 국회의원 선거(지역구) — 의석 수·투표율·당선인의 기준 */
export async function getLatestAssemblyElection() {
  if (!db) return null;
  const [el] = await db.select().from(elections).where(eq(elections.sgTypecode, "2")).orderBy(desc(elections.sgId)).limit(1);
  return el ?? null;
}

async function partyColors(): Promise<Map<string, string>> {
  if (!db) return new Map();
  const rows = await db.select({ id: parties.id, color: parties.color }).from(parties);
  return new Map(rows.map((p) => [p.id, p.color]));
}

/* ───────── 지역 ───────── */

export interface RegionStats {
  code: string;
  name: string;
  short: string;
  seats: number | null; // 지역구 당선인 수 (선관위)
  turnout: number | null; // 시도 투표율 (선관위)
  news24h: number; // 최근 24시간 지역 기사 수 (네이버 뉴스)
  heat: number; // 0~100, 지역 간 최댓값 대비
}

/** 시도별 실데이터: 의석·투표율(선관위) + 이슈 활성도(최근 24시간 기사 수) */
export async function getRegionStats(): Promise<{ stats: RegionStats[]; election: string | null }> {
  if (!db) return { stats: [], election: null };
  const el = await getLatestAssemblyElection();
  const since = new Date(Date.now() - DAY_MS);

  const [regionRows, seatRows, turnoutRows, newsRows] = await Promise.all([
    db.select().from(regions).orderBy(regions.code),
    el
      ? db
          .select({ code: electionCandidates.regionCode, n: sql<number>`count(*)::int` })
          .from(electionCandidates)
          .where(
            and(
              eq(electionCandidates.sgId, el.sgId),
              eq(electionCandidates.sgTypecode, el.sgTypecode),
              eq(electionCandidates.isWinner, true),
            ),
          )
          .groupBy(electionCandidates.regionCode)
      : [],
    el
      ? db
          .select({ code: electionTurnout.regionCode, turnout: electionTurnout.turnout })
          .from(electionTurnout)
          .where(
            and(
              eq(electionTurnout.sgId, el.sgId),
              eq(electionTurnout.sgTypecode, el.sgTypecode),
              eq(electionTurnout.wiwName, ""),
            ),
          )
      : [],
    db
      .select({ code: newsArticles.regionCode, n: sql<number>`count(*)::int` })
      .from(newsArticles)
      .where(and(gte(newsArticles.publishedAt, since), isNotNull(newsArticles.regionCode)))
      .groupBy(newsArticles.regionCode),
  ]);

  const seats = new Map(seatRows.map((r) => [r.code, r.n]));
  const turnout = new Map(turnoutRows.map((r) => [r.code, r.turnout]));
  const news = new Map(newsRows.map((r) => [r.code, r.n]));
  const max = Math.max(0, ...news.values());

  return {
    election: el && (seats.size || turnout.size) ? el.name : null,
    stats: regionRows.map((r) => {
      const n = news.get(r.code) ?? 0;
      return {
        code: r.code,
        name: r.name,
        short: r.short,
        seats: seats.size ? (seats.get(r.code) ?? 0) : null,
        turnout: turnout.get(r.code) ?? null,
        news24h: n,
        heat: max ? Math.round((100 * n) / max) : 0,
      };
    }),
  };
}

/**
 * 대시보드용 Region[]: mock 을 바탕으로 실데이터가 있는 필드만 덮어씀.
 * 지역마다 섞이지 않도록 항목 단위로 결정 (예: 지역 기사가 하나라도 있으면 17개 지역 모두 실제 활성도).
 */
function overlayRegions(stats: RegionStats[]): { regions: Region[]; heatLive: boolean } {
  const byCode = new Map(stats.map((s) => [s.code, s]));
  const seatsLive = stats.some((s) => s.seats !== null);
  const turnoutLive = stats.some((s) => s.turnout !== null);
  const heatLive = stats.some((s) => s.news24h > 0);
  const regions = REGIONS.map((r) => {
    const s = byCode.get(r.code);
    if (!s) return r;
    return {
      ...r,
      seats: seatsLive ? (s.seats ?? 0) : r.seats,
      turnout: turnoutLive && s.turnout !== null ? s.turnout : r.turnout,
      heat: heatLive ? s.heat : r.heat,
    };
  });
  return { regions, heatLive };
}

/* ───────── 뉴스 ───────── */

/** "3분 전" / "5시간 전" / "11월 2일" */
function relativeTime(date: Date, now = new Date()): string {
  const min = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(date);
}

/** 최근 기사 (+ AI 분석이 있으면 편향 지수·객관화 요약). region 을 주면 그 시도 기사만 */
export async function getLatestNews(opts: { region?: string | null; limit?: number } = {}): Promise<NewsItem[]> {
  if (!db) return [];
  const rows = await db
    .select({ a: newsArticles, x: newsAnalysis })
    .from(newsArticles)
    .leftJoin(newsAnalysis, eq(newsAnalysis.newsId, newsArticles.id))
    .where(opts.region ? eq(newsArticles.regionCode, opts.region) : undefined)
    .orderBy(desc(newsArticles.publishedAt))
    .limit(Math.min(opts.limit ?? 100, 200));

  const now = new Date();
  return rows.map(({ a, x }) => ({
    id: a.id,
    source: a.source,
    time: relativeTime(a.publishedAt, now),
    publishedAt: a.publishedAt.toISOString(),
    category: a.query,
    headline: a.title,
    original: a.summary ?? "",
    url: a.url,
    objectiveHeadline: x?.objectiveHeadline ?? null,
    objective: x?.objectiveSummary ?? null,
    bias: x?.bias ?? null,
    biasSignals: x?.biasSignals ?? [],
    region: a.regionCode ?? undefined,
  }));
}

export async function countNewsSince(since: Date): Promise<number> {
  if (!db) return 0;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(newsArticles).where(gte(newsArticles.publishedAt, since));
  return n;
}

/** 언급량 추이: 최근 N일 동안 날짜(KST)별 언급 기사 수. kind 로 정당/인물 구분 */
export async function getMentionTrends(opts: { kind?: "party" | "member" | "candidate"; days?: number; top?: number } = {}) {
  if (!db) return [];
  const kind = opts.kind ?? "party";
  const days = Math.min(Math.max(opts.days ?? 7, 1), 90);
  const since = new Date(Date.now() - days * DAY_MS);
  const day = sql<string>`to_char(${newsArticles.publishedAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;

  const rows = await db
    .select({ ref: newsMentions.ref, label: newsMentions.label, day, n: sql<number>`count(*)::int` })
    .from(newsMentions)
    .innerJoin(newsArticles, eq(newsArticles.id, newsMentions.newsId))
    .where(and(eq(newsMentions.kind, kind), gte(newsArticles.publishedAt, since)))
    .groupBy(newsMentions.ref, newsMentions.label, day);

  const byRef = new Map<string, { ref: string; label: string; total: number; daily: Record<string, number> }>();
  for (const r of rows) {
    const e = byRef.get(r.ref) ?? { ref: r.ref, label: r.label, total: 0, daily: {} };
    e.total += r.n;
    e.daily[r.day] = r.n;
    byRef.set(r.ref, e);
  }
  return [...byRef.values()].sort((a, b) => b.total - a.total).slice(0, opts.top ?? 10);
}

/* ───────── 의원 · 선거 결과 ───────── */

/** 현역 의원 목록: 열린국회정보 members 가 있으면 그것, 없으면 최근 총선 지역구 당선인(선관위) */
export async function getElectedMembers(region?: string | null): Promise<{ list: ElectedMember[]; source: "assembly" | "nec" | null }> {
  if (!db) return { list: [], source: null };
  const colors = await partyColors();

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(members);
  if (n > 0) {
    const billCount = db
      .select({ monaCd: bills.proposerMonaCd, n: sql<number>`count(*)::int`.as("n") })
      .from(bills)
      .groupBy(bills.proposerMonaCd)
      .as("bc");
    const rows = await db
      .select({ m: members, bills: billCount.n })
      .from(members)
      .leftJoin(billCount, eq(billCount.monaCd, members.monaCd))
      .where(region ? eq(members.regionCode, region) : undefined);
    return {
      source: "assembly",
      list: rows.map(({ m, bills: b }) => ({
        id: m.monaCd,
        name: m.name,
        partyName: m.partyId,
        partyColor: (m.partyId && colors.get(m.partyId)) || NEUTRAL,
        regionCode: m.regionCode,
        district: m.district,
        term: m.term,
        billsProposed: b ?? 0,
        votes: null,
        voteRate: null,
        source: "assembly" as const,
      })),
    };
  }

  const el = await getLatestAssemblyElection();
  if (!el) return { list: [], source: null };
  const rows = await db
    .select()
    .from(electionCandidates)
    .where(
      and(
        eq(electionCandidates.sgId, el.sgId),
        eq(electionCandidates.sgTypecode, el.sgTypecode),
        eq(electionCandidates.isWinner, true),
        region ? eq(electionCandidates.regionCode, region) : undefined,
      ),
    );
  return {
    source: rows.length ? "nec" : null,
    list: rows.map((c) => ({
      id: `${c.sgId}:${c.sgTypecode}:${c.huboid}`,
      name: c.name,
      partyName: c.partyName,
      partyColor: (c.partyName && colors.get(c.partyName)) || NEUTRAL,
      regionCode: c.regionCode,
      district: c.sggName,
      term: null,
      billsProposed: null,
      votes: c.votes,
      voteRate: c.voteRate,
      source: "nec" as const,
    })),
  };
}

/** 시도의 선거구별 개표 결과 (후보·득표수·득표율) */
export async function getDistrictResults(region: string): Promise<{ election: string | null; districts: DistrictResult[] }> {
  if (!db) return { election: null, districts: [] };
  const el = await getLatestAssemblyElection();
  if (!el) return { election: null, districts: [] };
  const colors = await partyColors();

  const [cands, dists] = await Promise.all([
    db
      .select()
      .from(electionCandidates)
      .where(
        and(
          eq(electionCandidates.sgId, el.sgId),
          eq(electionCandidates.sgTypecode, el.sgTypecode),
          eq(electionCandidates.regionCode, region),
        ),
      ),
    db
      .select()
      .from(electionDistricts)
      .where(
        and(eq(electionDistricts.sgId, el.sgId), eq(electionDistricts.sgTypecode, el.sgTypecode), eq(electionDistricts.regionCode, region)),
      ),
  ]);

  const totals = new Map(dists.map((d) => [d.sggName, d]));
  const bySgg = new Map<string, DistrictResult>();
  for (const c of cands) {
    const d = bySgg.get(c.sggName) ?? {
      sggName: c.sggName,
      electors: totals.get(c.sggName)?.electors ?? null,
      voters: totals.get(c.sggName)?.voters ?? null,
      candidates: [],
    };
    d.candidates.push({
      huboid: c.huboid,
      name: c.name,
      partyName: c.partyName,
      partyColor: (c.partyName && colors.get(c.partyName)) || NEUTRAL,
      giho: c.giho,
      votes: c.votes,
      voteRate: c.voteRate,
      isWinner: c.isWinner,
    });
    bySgg.set(c.sggName, d);
  }
  const districts = [...bySgg.values()]
    .map((d) => ({
      ...d,
      // 득표수 많은 순 → 득표수 없으면 기호 순
      candidates: d.candidates.sort(
        (a, b) => (b.votes ?? -1) - (a.votes ?? -1) || Number(a.giho ?? 99) - Number(b.giho ?? 99),
      ),
    }))
    .sort((a, b) => a.sggName.localeCompare(b.sggName, "ko"));
  return { election: el.name, districts };
}

/** 의원 1명 상세 (+ 최근 대표 발의 법안 — 열린국회정보 연동 후) */
export async function getMember(id: string) {
  if (!db) return null;
  if (id.includes(":")) {
    const [sgId, sgTypecode, huboid] = id.split(":");
    const [c] = await db
      .select()
      .from(electionCandidates)
      .where(and(eq(electionCandidates.sgId, sgId), eq(electionCandidates.sgTypecode, sgTypecode), eq(electionCandidates.huboid, huboid)));
    return c ? { source: "nec" as const, candidate: c } : null;
  }
  const [m] = await db.select().from(members).where(eq(members.monaCd, id));
  if (!m) return null;
  const recentBills = await db
    .select()
    .from(bills)
    .where(eq(bills.proposerMonaCd, id))
    .orderBy(sql`${bills.proposeDate} desc nulls last`)
    .limit(10);
  return { source: "assembly" as const, member: m, recentBills };
}

export async function getParties() {
  if (!db) return [];
  return db.select().from(parties).where(eq(parties.isActive, true)).orderBy(parties.id);
}

/* ───────── 대시보드 한 번에 ───────── */

export interface DashboardData {
  regions: Region[];
  news: NewsItem[];
  newsCountToday: number;
  electedMembers: ElectedMember[];
  sources: DataSources;
}

const MOCK_SOURCES: DataSources = { db: false, news: false, regionHeat: false, election: null, members: null };

/** 첫 화면에 필요한 데이터. DB 오류 시 mock 으로 대신하고 서버 로그에만 남김 */
export async function getDashboardData(): Promise<DashboardData> {
  const mock: DashboardData = { regions: REGIONS, news: [], newsCountToday: 0, electedMembers: [], sources: MOCK_SOURCES };
  if (!db) return mock;
  try {
    const [{ stats, election }, news, newsCountToday, elected] = await Promise.all([
      getRegionStats(),
      getLatestNews({ limit: 150 }),
      countNewsSince(new Date(Date.now() - DAY_MS)),
      getElectedMembers(),
    ]);
    const { regions, heatLive } = overlayRegions(stats);
    return {
      regions,
      news,
      newsCountToday,
      electedMembers: elected.list,
      sources: { db: true, news: news.length > 0, regionHeat: heatLive, election, members: elected.source },
    };
  } catch (e) {
    console.error("[dashboard] DB 읽기 실패 — mock 데이터로 표시합니다:", e instanceof Error ? e.message : e);
    return mock;
  }
}

/** /api/health 용 테이블별 행 수 */
export async function getTableCounts() {
  if (!db) return null;
  const tables = { regions, parties, electionCandidates, newsArticles, newsMentions, members, bills } as const;
  const entries = await Promise.all(
    Object.entries(tables).map(async ([k, t]) => {
      const [{ n }] = await db!.select({ n: sql<number>`count(*)::int` }).from(t);
      return [k, n] as const;
    }),
  );
  return Object.fromEntries(entries);
}
