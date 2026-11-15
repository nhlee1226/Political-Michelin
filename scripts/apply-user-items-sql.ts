/**
 * 임시: user_follows · user_bookmarks 테이블을 DB 에 직접 생성.
 * drizzle-kit push 가 대화형 프롬프트(TTY) 요구로 실패해서 우회용.
 * 실행: npm run db:apply-user-items
 *
 * users 테이블은 이미 존재하므로 제외. 새 테이블 2개 + FK + 인덱스만 생성 (IF NOT EXISTS 로 멱등).
 */
import { sql } from "drizzle-orm";
import { db, run } from "./collectors/common";

const DDL = [
  `CREATE TABLE IF NOT EXISTS "user_bookmarks" (
    "user_id" text NOT NULL,
    "news_id" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "user_bookmarks_user_id_news_id_pk" PRIMARY KEY("user_id","news_id")
  )`,
  `ALTER TABLE "user_bookmarks" ENABLE ROW LEVEL SECURITY`,
  `CREATE TABLE IF NOT EXISTS "user_follows" (
    "user_id" text NOT NULL,
    "kind" text NOT NULL,
    "target_id" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "user_follows_user_id_kind_target_id_pk" PRIMARY KEY("user_id","kind","target_id")
  )`,
  `ALTER TABLE "user_follows" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "user_bookmarks"
     DROP CONSTRAINT IF EXISTS "user_bookmarks_user_id_users_id_fk"`,
  `ALTER TABLE "user_bookmarks"
     ADD CONSTRAINT "user_bookmarks_user_id_users_id_fk"
     FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "user_follows"
     DROP CONSTRAINT IF EXISTS "user_follows_user_id_users_id_fk"`,
  `ALTER TABLE "user_follows"
     ADD CONSTRAINT "user_follows_user_id_users_id_fk"
     FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "user_bookmarks_user_idx" ON "user_bookmarks" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "user_follows_user_idx" ON "user_follows" USING btree ("user_id")`,
];

run(async () => {
  console.log(`▶ ${DDL.length}개 구문 실행 중…`);
  for (const stmt of DDL) {
    await db.execute(sql.raw(stmt));
  }

  const [b] = await db.execute(sql`select to_regclass('public.user_bookmarks') as t`);
  const [f] = await db.execute(sql`select to_regclass('public.user_follows') as t`);
  console.log("user_bookmarks:", (b as { t: string | null }).t ?? "❌ 없음");
  console.log("user_follows:", (f as { t: string | null }).t ?? "❌ 없음");
  console.log("✅ 완료");
});
