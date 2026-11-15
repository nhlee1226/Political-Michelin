/**
 * 임시: comments 테이블을 DB 에 직접 생성.
 * drizzle-kit push 가 대화형 프롬프트(TTY) 요구로 실패해서 우회용.
 * 실행: npm run db:apply-comments
 * 멱등 (IF NOT EXISTS).
 */
import { sql } from "drizzle-orm";
import { db, run } from "./collectors/common";

const DDL = [
  `CREATE TABLE IF NOT EXISTS "comments" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "target_type" text NOT NULL,
    "target_id" text NOT NULL,
    "parent_id" text,
    "body" text NOT NULL,
    "is_blinded" boolean DEFAULT false NOT NULL,
    "is_under_review" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY`,
  // self-reference FK (부모 댓글 삭제 시 답글도 cascade)
  `ALTER TABLE "comments"
     DROP CONSTRAINT IF EXISTS "comments_parent_id_fk"`,
  `ALTER TABLE "comments"
     ADD CONSTRAINT "comments_parent_id_fk"
     FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action`,
  // user FK
  `ALTER TABLE "comments"
     DROP CONSTRAINT IF EXISTS "comments_user_id_users_id_fk"`,
  `ALTER TABLE "comments"
     ADD CONSTRAINT "comments_user_id_users_id_fk"
     FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "comments_target_idx" ON "comments" USING btree ("target_type","target_id")`,
  `CREATE INDEX IF NOT EXISTS "comments_user_idx" ON "comments" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "comments_parent_idx" ON "comments" USING btree ("parent_id")`,
];

run(async () => {
  console.log(`▶ ${DDL.length}개 구문 실행 중…`);
  for (const stmt of DDL) {
    await db.execute(sql.raw(stmt));
  }
  const [r] = await db.execute(sql`select to_regclass('public.comments') as t`);
  console.log("comments:", (r as { t: string | null }).t ?? "❌ 없음");
  console.log("✅ 완료");
});
