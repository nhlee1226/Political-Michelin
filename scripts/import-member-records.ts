/**
 * 의원 출석·재산공개·정치자금 CSV 입력 → member_attendance · member_assets · member_funds
 * 실행: npm run import:records -- <attendance|assets|funds> <CSV 파일>
 *
 * 세 자료 모두 공식 Open API 가 없어서(국회 공보·관보 PDF, 선관위 정치자금 공개 화면) 원문에서 옮긴 CSV 를 넣습니다.
 * 머리글(첫 줄)은 아래 이름 그대로. 의원은 mona_cd 로, 없으면 name 으로 찾습니다 (동명이인은 mona_cd 필요).
 *   attendance: mona_cd,name,kind(본회의|위원회),period,attended,total,source_url
 *   assets    : mona_cd,name,year,total,real_estate,deposits,securities,debts,source_url   (단위 천원)
 *   funds     : mona_cd,name,year,income,expense,donations,source_url                     (단위 원)
 * 같은 (의원, 회기/연도) 줄은 덮어씁니다. 표가 없으면 scripts/sql/add-politician-detail.sql 로 먼저 만듭니다.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { memberAssets, memberAttendance, memberFunds, members } from "../src/db/schema";
import { db, run } from "./collectors/common";
import { parseCsv, RECORD_COLUMNS, recordRows, type RecordKind } from "./collectors/member-detail-parse";
import { applySqlFile } from "./collectors/sql-file";

const KINDS: RecordKind[] = ["attendance", "assets", "funds"];

run(async () => {
  const [kind, file] = process.argv.slice(2) as [RecordKind | undefined, string | undefined];
  if (!kind || !KINDS.includes(kind) || !file) {
    throw new Error(
      `사용법: npm run import:records -- <${KINDS.join("|")}> <CSV 파일>\n` +
        KINDS.map((k) => `  ${k}: ${[...RECORD_COLUMNS[k].optional.slice(0, 2), ...RECORD_COLUMNS[k].required].join(",")}`).join("\n"),
    );
  }
  await applySqlFile(db, "add-politician-detail.sql");

  const ms = await db.select({ monaCd: members.monaCd, name: members.name }).from(members);
  const known = new Set(ms.map((m) => m.monaCd));
  const byName = new Map<string, string | null>();
  for (const m of ms) byName.set(m.name, byName.has(m.name) ? null : m.monaCd);
  const resolve = (monaCd?: string, name?: string) =>
    monaCd && known.has(monaCd) ? monaCd : name ? (byName.get(name.trim()) ?? null) : null;

  const { values, issues } = recordRows(kind, parseCsv(readFileSync(file, "utf8")), resolve);
  for (const i of issues) console.log(`  [건너뜀] ${i.line}번째 줄: ${i.reason}`);
  if (values.length === 0) {
    console.log("저장할 줄이 없습니다.");
    return;
  }

  const now = sql`now()`;
  if (kind === "attendance") {
    await db
      .insert(memberAttendance)
      .values(values as unknown as (typeof memberAttendance.$inferInsert)[])
      .onConflictDoUpdate({
        target: [memberAttendance.monaCd, memberAttendance.kind, memberAttendance.period],
        set: { attended: sql`excluded.attended`, total: sql`excluded.total`, sourceUrl: sql`excluded.source_url`, updatedAt: now },
      });
  } else if (kind === "assets") {
    await db
      .insert(memberAssets)
      .values(values as unknown as (typeof memberAssets.$inferInsert)[])
      .onConflictDoUpdate({
        target: [memberAssets.monaCd, memberAssets.year],
        set: {
          total: sql`excluded.total`,
          realEstate: sql`excluded.real_estate`,
          deposits: sql`excluded.deposits`,
          securities: sql`excluded.securities`,
          debts: sql`excluded.debts`,
          sourceUrl: sql`excluded.source_url`,
          updatedAt: now,
        },
      });
  } else {
    await db
      .insert(memberFunds)
      .values(values as unknown as (typeof memberFunds.$inferInsert)[])
      .onConflictDoUpdate({
        target: [memberFunds.monaCd, memberFunds.year],
        set: {
          income: sql`excluded.income`,
          expense: sql`excluded.expense`,
          donations: sql`excluded.donations`,
          sourceUrl: sql`excluded.source_url`,
          updatedAt: now,
        },
      });
  }
  console.log(`${kind} ${values.length}줄 저장, 건너뜀 ${issues.length}줄`);
});
