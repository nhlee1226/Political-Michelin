/**
 * DB 연결 생성 (Next.js 서버와 수집 스크립트가 함께 씀).
 * 화면 코드는 src/db/index.ts 의 db 를 쓰고, 이 파일은 직접 import 하지 마세요.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, {
    max: opts.max ?? 5,
    // Supabase pooler(transaction 모드, 6543) 호환. 로컬 PostgreSQL 에도 문제없음
    prepare: false,
    idle_timeout: 20,
    onnotice: () => {}, // "relation already exists" 같은 NOTICE 로그 숨김
  });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
