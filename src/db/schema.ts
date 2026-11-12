/**
 * 정치 미슐랭 — 통합 DB 스키마 (이 파일이 유일한 정의)
 * ------------------------------------------------------------------
 * 테이블 생성·변경: npm run db:push   (로컬 docker PostgreSQL · Supabase 모두 DATABASE_URL 만 바꾸면 됨)
 *
 * 데이터별 기준 출처(정답)
 * | 데이터                      | 기준 출처        | 테이블                                                    | 상태      |
 * | 의원·정당·소속·지역구        | 열린국회정보     | members, parties                                          | 연동 예정 |
 * | 후보·득표수·득표율           | 선관위           | elections, election_candidates, election_districts, election_turnout | 연동      |
 * | 선거공약(지방선거 당선인)     | 선관위           | election_pledges                                          | 연동      |
 * | 시도 인구·고령화율·재정자립도 | KOSIS            | region_indicators                                         | 연동      |
 * | 법안·표결                   | 열린국회정보     | bills, bill_votes                                         | 연동 예정 |
 * | 이슈·언급량·최신 동향        | 네이버 뉴스      | news_articles, news_mentions, news_analysis               | 연동      |
 *
 * 원칙
 *  - 원천 표기(정당명·선거구명 등)는 가공하지 않고 그대로 저장한다. 화면용 계산(의석 수, 투표율 합산,
 *    이슈 활성도, 언급량)은 저장하지 않고 src/db/queries.ts 에서 계산한다 → 모든 지역·인물에 같은 기준.
 *  - 기사 본문은 저장하지 않는다(저작권). 제목·API 요약·링크만.
 *  - 모든 테이블 RLS ON + 정책 없음 → Supabase 공개(anon) 키로는 읽을 수 없고,
 *    서버(DATABASE_URL, 테이블 소유자)만 접근한다.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

/* ═══════════════════════════ 기준 테이블 ═══════════════════════════ */

/** 시도 17개. 코드는 지도 GeoJSON·mock-data 와 같은 2자리 (scripts/seed.ts 가 채움) */
export const regions = pgTable("regions", {
  code: char("code", { length: 2 }).primaryKey(),
  name: text("name").notNull(), // 서울특별시
  short: text("short").notNull(), // 서울
}).enableRLS();

/**
 * 시도별 지역 지표 (KOSIS 국가통계포털). (시도, 지표, 연도) 한 줄.
 * KOSIS 시도 코드는 regions 코드와 달라서 시도 이름으로 연결해 저장한다(collect:kosis).
 */
export const regionIndicators = pgTable(
  "region_indicators",
  {
    regionCode: char("region_code", { length: 2 })
      .notNull()
      .references(() => regions.code),
    indicator: text("indicator").notNull(), // 주민등록인구 / 고령인구비율 / 재정자립도
    year: smallint("year").notNull(),
    value: numeric("value", { mode: "number" }).notNull(), // 원천 값 그대로 (자릿수 제한 없음)
    unit: text("unit").notNull(), // 명 / %
    sourceOrgId: text("source_org_id").notNull(), // KOSIS 기관 ID (orgId)
    sourceTblId: text("source_tbl_id").notNull(), // KOSIS 통계표 ID (tblId)
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.regionCode, t.indicator, t.year] })],
).enableRLS();

/**
 * 정당. id 는 원천 표기 정당명 그대로(예: 국회 POLY_NM, 선관위 jdName).
 * 기준 출처는 열린국회정보 — 연동 전에는 선관위 후보 데이터의 정당명으로 임시 등록(source = 'nec').
 * 색은 실제 상징색이 아니라 중립 팔레트를 의석 순으로 배정한다.
 */
export const parties = pgTable("parties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  short: text("short").notNull(),
  color: text("color").notNull(),
  /** 기사에서 정당을 찾을 때 쓰는 다른 표기(약칭 등). 팀이 직접 입력 */
  aliases: text("aliases").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  source: text("source").notNull(), // 'assembly' | 'nec' | 'manual'
  updatedAt: updatedAt(),
}).enableRLS();

/* ═══════════════════════════ 선관위 (공공데이터포털 9760000) ═══════════════════════════ */

/** 선거. sgId = 선거일(YYYYMMDD), sgTypecode = 선거종류(2 국회의원 지역구, 7 비례대표 …) */
export const elections = pgTable(
  "elections",
  {
    sgId: text("sg_id").notNull(),
    sgTypecode: text("sg_typecode").notNull(),
    name: text("name").notNull(), // 제22대 국회의원선거(지역구)
    electionDate: date("election_date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sgId, t.sgTypecode] })],
).enableRLS();

/** 후보 + 개표 결과(득표수·득표율·당선 여부). huboid 는 선관위 후보 ID */
export const electionCandidates = pgTable(
  "election_candidates",
  {
    sgId: text("sg_id").notNull(),
    sgTypecode: text("sg_typecode").notNull(),
    huboid: text("huboid").notNull(),
    name: text("name").notNull(),
    hanjaName: text("hanja_name"),
    partyName: text("party_name"), // 원천 jdName 그대로 (무소속 포함)
    giho: text("giho"),
    gender: text("gender"),
    birthday: text("birthday"), // YYYYMMDD
    age: smallint("age"),
    sdName: text("sd_name").notNull(), // 시도명
    sggName: text("sgg_name").notNull(), // 선거구명
    wiwName: text("wiw_name"), // 구시군명
    regionCode: char("region_code", { length: 2 }).references(() => regions.code),
    job: text("job"),
    edu: text("edu"),
    career1: text("career1"),
    career2: text("career2"),
    status: text("status"), // 등록 / 사퇴 / 등록무효 (원천 표기)
    votes: integer("votes"), // 득표수 (개표 전·데이터 없음 = null)
    voteRate: numeric("vote_rate", { precision: 5, scale: 2, mode: "number" }), // 득표율(%)
    isWinner: boolean("is_winner").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.sgId, t.sgTypecode, t.huboid] }),
    foreignKey({ name: "election_candidates_election_fk", columns: [t.sgId, t.sgTypecode], foreignColumns: [elections.sgId, elections.sgTypecode] }),
    index("election_candidates_region_idx").on(t.regionCode),
    index("election_candidates_district_idx").on(t.sgId, t.sgTypecode, t.sggName),
  ],
).enableRLS();

/** 선거구별 개표 합계 (선거인수·투표수·유효/무효표) — 득표율 분모 */
export const electionDistricts = pgTable(
  "election_districts",
  {
    sgId: text("sg_id").notNull(),
    sgTypecode: text("sg_typecode").notNull(),
    sdName: text("sd_name").notNull(),
    sggName: text("sgg_name").notNull(),
    regionCode: char("region_code", { length: 2 }).references(() => regions.code),
    electors: integer("electors"), // 선거인수
    voters: integer("voters"), // 투표수
    validVotes: integer("valid_votes"),
    invalidVotes: integer("invalid_votes"),
    abstentions: integer("abstentions"), // 기권수
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.sgId, t.sgTypecode, t.sdName, t.sggName] }),
    foreignKey({ name: "election_districts_election_fk", columns: [t.sgId, t.sgTypecode], foreignColumns: [elections.sgId, elections.sgTypecode] }),
  ],
).enableRLS();

/** 투표율 (선관위 투표결과). wiwName = '' 은 시도 합계 줄 */
export const electionTurnout = pgTable(
  "election_turnout",
  {
    sgId: text("sg_id").notNull(),
    sgTypecode: text("sg_typecode").notNull(),
    sdName: text("sd_name").notNull(),
    wiwName: text("wiw_name").notNull().default(""),
    regionCode: char("region_code", { length: 2 }).references(() => regions.code),
    electors: integer("electors").notNull(), // 총선거인수
    voters: integer("voters").notNull(), // 총투표자수
    turnout: numeric("turnout", { precision: 5, scale: 2, mode: "number" }), // 원천 투표율(%)
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.sgId, t.sgTypecode, t.sdName, t.wiwName] }),
    foreignKey({ name: "election_turnout_election_fk", columns: [t.sgId, t.sgTypecode], foreignColumns: [elections.sgId, elections.sgTypecode] }),
  ],
).enableRLS();

/**
 * 선거공약 (선관위 선거공약 정보, 후보 1명당 최대 10개). (후보, 순번) 한 줄.
 * 분야·제목·내용은 API 원문 그대로 저장(요약·정리하지 않음). 빈 칸만 null.
 */
export const electionPledges = pgTable(
  "election_pledges",
  {
    sgId: text("sg_id").notNull(),
    sgTypecode: text("sg_typecode").notNull(),
    huboid: text("huboid").notNull(), // = API 의 cnddtId
    pledgeNo: smallint("pledge_no").notNull(), // 공약 순번 (prmsOrdN)
    realm: text("realm"), // 분야 (prmsRealmNameN, 시·도지사만 채워져 옴)
    title: text("title"), // 제목 (prmsTitleN)
    content: text("content"), // 내용 (prmmContN)
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.sgId, t.sgTypecode, t.huboid, t.pledgeNo] }),
    foreignKey({
      name: "election_pledges_candidate_fk",
      columns: [t.sgId, t.sgTypecode, t.huboid],
      foreignColumns: [electionCandidates.sgId, electionCandidates.sgTypecode, electionCandidates.huboid],
    }),
  ],
).enableRLS();

/* ═══════════════════════════ 열린국회정보 (연동 예정) ═══════════════════════════ */

/** 의원. 국회 Open API 의 MONA_CD 가 기본키 */
export const members = pgTable(
  "members",
  {
    monaCd: text("mona_cd").primaryKey(),
    name: text("name").notNull(),
    partyId: text("party_id").references(() => parties.id),
    regionCode: char("region_code", { length: 2 }).references(() => regions.code), // 비례대표 = null
    district: text("district"), // 서울 종로구 / 비례대표
    electType: text("elect_type"), // 지역구 / 비례대표
    term: smallint("term"), // 선수
    committee: text("committee"),
    unit: smallint("unit").notNull().default(22), // 대수
    photoUrl: text("photo_url"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("members_region_idx").on(t.regionCode),
    index("members_party_idx").on(t.partyId),
    check("members_elect_type_check", sql`${t.electType} in ('지역구', '비례대표')`),
  ],
).enableRLS();

/** 법안. BILL_ID 가 기본키, 대표발의자만 연결 */
export const bills = pgTable(
  "bills",
  {
    billId: text("bill_id").primaryKey(),
    billNo: text("bill_no"),
    title: text("title").notNull(),
    unit: smallint("unit").notNull(),
    proposerMonaCd: text("proposer_mona_cd").references(() => members.monaCd),
    proposeDate: date("propose_date"),
    committee: text("committee"),
    procResult: text("proc_result"), // 원안가결·폐기·계류 등 원천 표기
    detailUrl: text("detail_url"),
    updatedAt: updatedAt(),
  },
  (t) => [index("bills_proposer_idx").on(t.proposerMonaCd)],
).enableRLS();

/** 본회의 표결 (의원 × 법안) */
export const billVotes = pgTable(
  "bill_votes",
  {
    billId: text("bill_id")
      .notNull()
      .references(() => bills.billId),
    monaCd: text("mona_cd")
      .notNull()
      .references(() => members.monaCd),
    result: text("result").notNull(),
    voteDate: date("vote_date").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.billId, t.monaCd] }),
    index("bill_votes_member_idx").on(t.monaCd),
    check("bill_votes_result_check", sql`${t.result} in ('찬성', '반대', '기권', '불참')`),
  ],
).enableRLS();

/* ═══════════════════════════ 네이버 뉴스 (NAVER API HUB) ═══════════════════════════ */

/** 수집 기사. id = 원문 URL 의 SHA-1 (여러 검색어에서 같은 기사가 나와도 한 줄) */
export const newsArticles = pgTable(
  "news_articles",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(), // 원문 URL (없으면 네이버 링크)
    naverUrl: text("naver_url"),
    source: text("source").notNull(), // 언론사 도메인 (네이버 API 는 언론사명을 주지 않음)
    title: text("title").notNull(),
    summary: text("summary"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    regionCode: char("region_code", { length: 2 }).references(() => regions.code), // 제목·요약의 시도명, 없으면 전국
    query: text("query").notNull(), // 처음 수집된 검색어 (편중 점검용)
    collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("news_articles_published_idx").on(t.publishedAt.desc()),
    index("news_articles_region_idx").on(t.regionCode, t.publishedAt.desc()),
  ],
).enableRLS();

/**
 * 기사 속 언급 (언급량·동향 계산용).
 *  kind = 'party'     ref = parties.id
 *         'member'    ref = members.mona_cd            (열린국회정보 연동 후)
 *         'candidate' ref = '<sgId>:<sgTypecode>:<huboid>' (그 전까지 선관위 당선인으로 대신)
 */
export const newsMentions = pgTable(
  "news_mentions",
  {
    newsId: text("news_id")
      .notNull()
      .references(() => newsArticles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    ref: text("ref").notNull(),
    label: text("label").notNull(), // 표시용 이름
  },
  (t) => [
    primaryKey({ columns: [t.newsId, t.kind, t.ref] }),
    index("news_mentions_ref_idx").on(t.kind, t.ref),
    check("news_mentions_kind_check", sql`${t.kind} in ('party', 'member', 'candidate')`),
  ],
).enableRLS();

/** AI 편향 분석 결과 (모델 버전별로 다시 돌릴 수 있게 분리) */
export const newsAnalysis = pgTable(
  "news_analysis",
  {
    newsId: text("news_id")
      .primaryKey()
      .references(() => newsArticles.id, { onDelete: "cascade" }),
    bias: smallint("bias"),
    biasSignals: text("bias_signals").array().notNull().default([]),
    objectiveHeadline: text("objective_headline"),
    objectiveSummary: text("objective_summary"),
    modelVersion: text("model_version").notNull(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [check("news_analysis_bias_check", sql`${t.bias} between 0 and 100`)],
).enableRLS();

/* ═══════════════════════════ 수기 입력 · 운영 ═══════════════════════════ */

/** 정당 지지도: 공식 API 없음. 여론조사 발표 원문을 보고 팀이 입력 (출처 필수) */
export const supportPolls = pgTable(
  "support_polls",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    regionCode: char("region_code", { length: 2 }).references(() => regions.code), // 전국 조사 = null
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    value: numeric("value", { precision: 4, scale: 1, mode: "number" }).notNull(),
    pollster: text("pollster").notNull(),
    fieldStart: date("field_start").notNull(),
    fieldEnd: date("field_end").notNull(),
    sampleSize: integer("sample_size").notNull(),
    marginOfError: numeric("margin_of_error", { precision: 3, scale: 1, mode: "number" }), // ±%p
    sourceUrl: text("source_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("support_polls_region_idx").on(t.regionCode, t.fieldEnd.desc()),
    check("support_polls_value_check", sql`${t.value} between 0 and 100`),
  ],
).enableRLS();

/** 외부 API 원본 응답 (필드 이름 확인·재처리용, 키는 저장하지 않음) */
export const rawResponses = pgTable(
  "raw_responses",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    source: text("source").notNull(), // 'nec:winners', 'naver:news', 'assembly:members' …
    params: jsonb("params"),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("raw_responses_source_idx").on(t.source, t.fetchedAt.desc())],
).enableRLS();
