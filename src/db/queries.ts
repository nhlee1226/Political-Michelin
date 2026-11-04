import "server-only";
import { asc, count, desc, gte } from "drizzle-orm";
import { db } from "./index";
import { newsArticles, politicians, regions } from "./schema";
import type { NewsItem, Politician, Region } from "@/lib/mock-data";

/** DB 의 regions + politicians 를 기존 mock 과 동일한 Region[] 형태로 조립 */
export async function getRegions(): Promise<Region[]> {
  const [regionRows, politicianRows] = await Promise.all([
    db.select().from(regions).orderBy(asc(regions.code)),
    db.select().from(politicians),
  ]);

  // id 가 "pol-1, pol-2 … pol-10" 형태라 숫자 순으로 정렬해야 원래 순서가 유지됨
  politicianRows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  return regionRows.map((r) => ({
    ...r,
    politicians: politicianRows
      .filter((p) => p.regionCode === r.code)
      .map(({ regionCode: _, ...p }) => ({ ...p, role: p.role as Politician["role"] })),
  }));
}

/** "3분 전" / "5시간 전" / "11월 2일" */
function relativeTime(date: Date, now = new Date()): string {
  const min = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(date);
}

/** 네이버 API 는 언론사명을 주지 않으므로 원문 URL 의 도메인으로 출처를 표시 */
function sourceOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "");
  } catch {
    return "네이버 뉴스";
  }
}

/** 최근 수집 기사 → 뉴스 패널이 쓰는 NewsItem 형태 (AI 분석 필드는 아직 없음 = null) */
export async function getLatestNews(limit = 60): Promise<{ news: NewsItem[]; countToday: number }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(newsArticles).orderBy(desc(newsArticles.publishedAt)).limit(limit),
    db.select({ n: count() }).from(newsArticles).where(gte(newsArticles.publishedAt, since)),
  ]);

  const now = new Date();
  const news: NewsItem[] = rows.map((a) => ({
    id: a.id,
    source: sourceOf(a.url),
    time: relativeTime(a.publishedAt, now),
    category: a.query,
    headline: a.title,
    original: a.summary,
    url: a.url,
    objectiveHeadline: null,
    objective: null,
    bias: null,
    biasSignals: [],
  }));
  return { news, countToday: n };
}
