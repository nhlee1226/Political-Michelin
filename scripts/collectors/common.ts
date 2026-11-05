/** 수집기 공통: .env.local 읽기, DB 연결, 원본 응답 보관, 시도 이름 → 코드 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" }); // 내 PC 에서는 .env.local, GitHub Actions 에서는 Secrets 가 환경변수로 들어옴

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`.env.local 에 ${name} 값이 없습니다`);
  return v;
}

export const sql = postgres(env("DATABASE_URL"), { max: 1, prepare: false });

/** 디버깅·재처리를 위해 외부 API 원본 응답을 보관 (키는 저장하지 않음) */
export async function saveRaw(source: string, params: Record<string, unknown>, payload: unknown) {
  const safe = Object.fromEntries(Object.entries(params).filter(([k]) => !["key", "servicekey"].includes(k.toLowerCase())));
  await sql`insert into raw_responses (source, params, payload) values (${source}, ${sql.json(safe as never)}, ${sql.json(payload as never)})`;
}

/** '서울', '서울특별시' → '11' */
export async function regionLookup(): Promise<Map<string, string>> {
  const rows = await sql<{ code: string; name: string; short: string }[]>`select code, name, short from regions`;
  const m = new Map<string, string>([["강원도", "32"], ["전라북도", "35"]]); // 옛 이름 표기
  for (const r of rows) {
    m.set(r.name, r.code);
    m.set(r.short, r.code);
  }
  return m;
}

/** '서울 종로구' → '11', '비례대표' → null */
export function toRegionCode(text: string | null | undefined, lookup: Map<string, string>): string | null {
  if (!text) return null;
  return lookup.get(text.trim().split(/\s+/)[0]) ?? null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
