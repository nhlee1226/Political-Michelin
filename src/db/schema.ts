import { pgTable, text, integer, jsonb, smallint, real, timestamp } from "drizzle-orm/pg-core";
import type { PartyId, RegionIssue } from "@/lib/mock-data";

export const regions = pgTable("regions", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  short: text("short").notNull(),
  heat: integer("heat").notNull(),
  turnout: real("turnout").notNull(),
  seats: integer("seats").notNull(),
  support: jsonb("support").$type<Record<PartyId, number>>().notNull(),
  supportDelta: jsonb("support_delta").$type<Record<PartyId, number>>().notNull(),
  issues: jsonb("issues").$type<RegionIssue[]>().notNull(),
});

export const politicians = pgTable("politicians", {
  id: text("id").primaryKey(),
  regionCode: text("region_code").references(() => regions.code).notNull(),
  name: text("name").notNull(),
  party: text("party").$type<PartyId>().notNull(),
  role: text("role").notNull(),
  district: text("district").notNull(),
  term: integer("term").notNull(),
  pledgeRate: integer("pledge_rate").notNull(),
  attendance: integer("attendance").notNull(),
  bills: integer("bills").notNull(),
  michelin: smallint("michelin").$type<1 | 2 | 3>().notNull(),
});
/** 네이버 뉴스 검색 API 로 수집한 기사 (src/db/collect-news.ts 가 채움) */
export const newsArticles = pgTable("news_articles", {
  id: text("id").primaryKey(), // 원문 URL 의 SHA-1 해시
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  url: text("url").notNull(),
  naverUrl: text("naver_url").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  query: text("query").notNull(),
  matchedPoliticians: jsonb("matched_politicians").$type<string[]>().notNull(),
  matchedParties: jsonb("matched_parties").$type<string[]>().notNull(),
  source: text("source").notNull(),
  collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow().notNull(),
});
