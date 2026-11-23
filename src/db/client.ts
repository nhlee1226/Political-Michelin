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
    // 한 연결에 쿼리를 이어 보내지 않음(파이프라이닝 끔). 6543 pooler 는 이어 보낸 쿼리에 답을 안 줘서
    // 연결 수보다 동시 쿼리가 많으면 영원히 멈춤 (Vercel 에서 / · /api/health 가 300초 타임아웃 나던 원인)
    max_pipeline: 1,
    idle_timeout: 20,
    onnotice: () => {}, // "relation already exists" 같은 NOTICE 로그 숨김
  });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
