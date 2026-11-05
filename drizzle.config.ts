import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) throw new Error(".env.local 에 DATABASE_URL 이 없습니다 (.env.example 참고)");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  // Supabase 의 auth·storage 등 다른 스키마는 건드리지 않음
  schemaFilter: ["public"],
});
