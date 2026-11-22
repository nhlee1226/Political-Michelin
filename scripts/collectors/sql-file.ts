/** scripts/sql/*.sql 파일을 그대로 실행 (IF NOT EXISTS 로 쓴 파일이라 여러 번 실행해도 안전). db:push 없이 새 표·열을 만들 때 씀 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "../../src/db/client";

export async function applySqlFile(db: Db, name: string) {
  const text = readFileSync(resolve(process.cwd(), "scripts/sql", name), "utf8").replace(/^--.*$/gm, "");
  for (const stmt of text.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
    await db.execute(sql.raw(stmt));
  }
}
