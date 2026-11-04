import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// dev 모드에서 파일 저장(HMR)할 때마다 커넥션이 늘어나지 않도록 전역에 캐시
const g = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = g.pg ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") g.pg = client;

export const db = drizzle(client, { schema });
