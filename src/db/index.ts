import "server-only";
import { createDb, type Db } from "./client";

// dev 모드에서 파일 저장(HMR)할 때마다 커넥션이 늘어나지 않도록 전역에 한 번만 만듦
const g = globalThis as unknown as { __pmDb?: Db };

/** DATABASE_URL 이 없으면 null → 화면은 mock 데이터로 동작 */
export const db: Db | null = process.env.DATABASE_URL
  ? (g.__pmDb ??= createDb(process.env.DATABASE_URL).db)
  : null;
