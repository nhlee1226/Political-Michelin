/** KOSIS(국가통계포털) OpenAPI 호출 — collect:kosis, check:keys 가 씀. 키: .env.local 의 KOSIS_API_KEY */
import { env } from "./common";

const BASE = "https://kosis.kr/openapi";

/** 오류는 {err, errMsg} 로 옴 (예: 30 = 데이터가 존재하지 않습니다) */
export async function kosisGet<T = unknown>(path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ apiKey: env("KOSIS_API_KEY"), format: "json", jsonVD: "Y", ...params });
  const text = await (await fetch(`${BASE}/${path}?${q}`, { signal: AbortSignal.timeout(30_000) })).text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`KOSIS ${path} 응답이 JSON 이 아님: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  if (body && !Array.isArray(body) && body.err) throw new Error(`KOSIS ${path}: ${body.err} ${body.errMsg ?? ""}`.trim());
  return body as T;
}
