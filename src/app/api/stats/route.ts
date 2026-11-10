import { db } from "@/db";
import { apiStats } from "@/db/ui-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats — 화면 위쪽 숫자 카드용 실제 집계
 * three_star = 별점 3개 의원 수, avg_reflect_rate = 대표발의 1건 이상 의원의 평균 반영률(%).
 * 아직 데이터가 없는 값(AI 분석 전의 편향 지수 등)은 null 로 내려서 화면이 "—"로 보여주게 합니다.
 */
export async function GET() {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  return Response.json(await apiStats());
}
