/**
 * 서버 전용 DB 연결 (브라우저 코드에서 import 하지 마세요).
 * DATABASE_URL 은 .env.local 에 두고, Supabase 의 pooler 주소를 씁니다.
 */
import postgres from "postgres";

const g = globalThis as unknown as { __sql?: postgres.Sql };

// 개발 중 핫리로드 때마다 연결이 새로 생기지 않도록 전역에 한 번만 만듭니다.
export const sql =
  g.__sql ??
  postgres(process.env.DATABASE_URL ?? "", {
    max: 3,          // Supabase 무료 티어 연결 수를 고려해 작게
    prepare: false,  // Supabase pooler(transaction 모드) 호환
    idle_timeout: 20,
    // count(*)·id(bigint)와 비율(numeric)을 문자열 대신 숫자로 받기 (화면 값 범위에서는 안전)
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });

if (process.env.NODE_ENV !== "production") g.__sql = sql;
