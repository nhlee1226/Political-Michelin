import { db } from "@/db";
import { memberScores, SCORE_RULE } from "@/db/ui-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/politicians — 의원 전체 목록 (정치인 표용), ?region=11 로 시도 거르기
 * 각 의원: 기본 정보 + 대표발의 수, 반영 법안 수, 반영률(%), 별점(1~3), 표결 참여율(수집 전에는 null)
 * 응답 헤더 X-Score-Rule 에 별점 기준 문장이 들어 있어 화면 하단 "기준" 설명에 그대로 쓸 수 있음.
 */
export async function GET(req: Request) {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  const region = new URL(req.url).searchParams.get("region");
  const rows = await memberScores(null, region);
  return Response.json(rows, { headers: { "X-Score-Rule": encodeURIComponent(SCORE_RULE) } });
}
