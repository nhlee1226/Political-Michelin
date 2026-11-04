/**
 * 네이버 뉴스 수집 → news_articles 테이블에 저장
 *
 *   npm run collect:news                 # 기본 검색어, 최근 24시간
 *   npm run collect:news -- 국회 법안     # 검색어 직접 지정
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { newsArticles, politicians } from "./schema";
import { PARTIES } from "../lib/mock-data";
import { collectNews, type EntityDict, type NewsArticle } from "../lib/naver-news";

const DEFAULT_QUERIES = ["국회", "국회의원", "정당", "선거", "법안"];
const SINCE_HOURS = 24;

async function main() {
  const args = process.argv.slice(2);
  const queries = args.length ? args : DEFAULT_QUERIES;
  const since = new Date(Date.now() - SINCE_HOURS * 3600 * 1000);

  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  // 인물·정당 사전: 정치인은 DB, 정당은 mock 의 PARTIES 에서
  const pols = await db.select({ id: politicians.id, name: politicians.name }).from(politicians);
  const dict: EntityDict = {
    politicians: pols,
    parties: Object.values(PARTIES).map((p) => ({ id: p.id, name: p.name })),
  };

  // 여러 검색어에서 같은 기사가 나오면 하나만 저장 (id 기준)
  const byId = new Map<string, NewsArticle>();
  for (const q of queries) {
    const items = await collectNews(q, dict, { since });
    console.log(`- "${q}": ${items.length}건`);
    for (const a of items) if (!byId.has(a.id)) byId.set(a.id, a);
  }

  const rows = [...byId.values()].map((a) => ({ ...a, publishedAt: new Date(a.publishedAt) }));
  if (rows.length) {
    await db
      .insert(newsArticles)
      .values(rows)
      .onConflictDoUpdate({
        target: newsArticles.id,
        set: {
          title: sql`excluded.title`,
          summary: sql`excluded.summary`,
          matchedPoliticians: sql`excluded.matched_politicians`,
          matchedParties: sql`excluded.matched_parties`,
        },
      });
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(newsArticles);
  console.log(`✅ ${rows.length}건 저장(신규+갱신) · 전체 ${count}건`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
