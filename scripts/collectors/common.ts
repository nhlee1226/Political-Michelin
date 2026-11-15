/** 수집기 공통: .env.local 읽기, DB 연결, 원본 응답 보관, 시도 이름 → 코드 */
import { config } from "dotenv";
import { createDb } from "../../src/db/client";
import { rawResponses, regions } from "../../src/db/schema";

// 내 PC 에서는 .env.local, GitHub Actions 에서는 Secrets 가 환경변수로 들어옴 (파일 없어도 오류 아님)
config({ path: ".env.local", quiet: true });

export function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`.env.local 에 ${name} 값이 없습니다`);
  return v;
}

export const { db, client } = createDb(env("DATABASE_URL"), { max: 1 });

/** 디버깅·재처리를 위해 외부 API 원본 응답을 보관 (키 값은 저장하지 않음) */
export async function saveRaw(source: string, params: Record<string, unknown>, payload: unknown) {
  const safe = Object.fromEntries(
    Object.entries(params).filter(([k]) => !["key", "servicekey", "client_secret"].includes(k.toLowerCase())),
  );
  await db.insert(rawResponses).values({ source, params: safe, payload: payload as object });
}

/** '서울', '서울특별시', '강원도'(옛 이름) → '11' 형태의 사전 */
export async function regionLookup(): Promise<Map<string, string>> {
  const rows = await db.select().from(regions);
  if (rows.length === 0) throw new Error("regions 테이블이 비어 있습니다. 먼저 npm run db:seed 를 실행하세요.");
  const m = new Map<string, string>([
    ["강원도", "32"],
    ["전라북도", "35"],
  ]);
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

/** 스크립트 진입점 공통 처리: 오류 출력, 종료 코드, DB 연결 닫기 */
export function run(main: () => Promise<void>) {
  main()
    .catch((e) => {
      console.error("[실패]", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => client.end());
}
