/**
 * 뉴스 좋아요·싫어요 표(news_reactions)를 만듦 (scripts/sql/add-news-reactions.sql 을 그대로 실행).
 * db:push 를 쓰지 않는 이유: 팀 공용 DB 에 SQL 로만 만든 표가 있어 push 가 그 표를 지우려 할 수 있음.
 * 실행: npm run db:apply-news-reactions  (여러 번 실행해도 안전)
 */
import { sql } from "drizzle-orm";
import { db, run } from "./collectors/common";
import { applySqlFile } from "./collectors/sql-file";

run(async () => {
  await applySqlFile(db, "add-news-reactions.sql");
  const [r] = await db.execute(sql`select to_regclass('public.news_reactions') as t`);
  console.log("news_reactions:", (r as { t: string | null }).t ?? "❌ 없음");
  console.log("✅ 완료");
});
