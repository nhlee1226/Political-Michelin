/**
 * 정치인 상세 페이지용 열·표(의원 연락처·약력 열, bill_cosponsors, member_attendance·assets·funds)를 만듦
 * (scripts/sql/add-politician-detail.sql 을 그대로 실행). 의원·법안 수집기와 import:records 도 시작할 때 자동으로 실행합니다.
 * 실행: npm run db:apply-politician-detail  (여러 번 실행해도 안전)
 */
import { sql } from "drizzle-orm";
import { db, run } from "./collectors/common";
import { applySqlFile } from "./collectors/sql-file";

run(async () => {
  await applySqlFile(db, "add-politician-detail.sql");
  for (const t of ["bill_cosponsors", "member_attendance", "member_assets", "member_funds"]) {
    const [r] = await db.execute(sql`select to_regclass(${"public." + t}) as t`);
    console.log(`${t}:`, (r as { t: string | null }).t ?? "❌ 없음");
  }
  console.log("✅ 완료");
});
