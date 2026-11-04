import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { regions, politicians } from "./schema";
import { REGIONS } from "../lib/mock-data";

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  // 다시 실행해도 중복 에러가 나지 않도록 기존 데이터를 먼저 비움
  await db.delete(politicians);
  await db.delete(regions);

  await db.insert(regions).values(REGIONS.map(({ politicians: _, ...r }) => r));
  await db.insert(politicians).values(
    REGIONS.flatMap((r) => r.politicians.map((p) => ({ ...p, regionCode: r.code })))
  );

  console.log("✅ 시딩 완료");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
