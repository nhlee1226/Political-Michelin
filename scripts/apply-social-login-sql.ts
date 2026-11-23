/**
 * 카카오·네이버 로그인용 DB 변경을 적용 (scripts/sql/add-user-identities.sql 을 그대로 실행).
 * db:push 를 쓰지 않는 이유: 팀 공용 DB 에 SQL 로만 만든 표가 있어 push 가 그 표를 지우려 할 수 있음.
 * 실행: npm run db:apply-social-login  (여러 번 실행해도 안전)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db, run } from "./collectors/common";

const SQL_FILE = resolve(process.cwd(), "scripts/sql/add-user-identities.sql");

run(async () => {
  const stmts = readFileSync(SQL_FILE, "utf8")
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log(`▶ ${stmts.length}개 구문 실행 중…`);
  for (const stmt of stmts) await db.execute(sql.raw(stmt));
  const [r] = await db.execute(sql`
    select to_regclass('public.user_identities') as t,
           (select is_nullable from information_schema.columns
             where table_schema = 'public' and table_name = 'users' and column_name = 'email') as email_nullable`);
  const row = r as { t: string | null; email_nullable: string };
  console.log("user_identities:", row.t ?? "❌ 없음", "· users.email null 허용:", row.email_nullable);
  console.log("✅ 완료");
});
