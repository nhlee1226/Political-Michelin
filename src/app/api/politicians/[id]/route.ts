import { db } from "@/db";
import { politicianProfile } from "@/db/politician-profile";

export const dynamic = "force-dynamic";

/**
 * GET /api/politicians/<MONA_CD> — 국회의원 상세 (정치인 상세 페이지 /politicians/<MONA_CD> 와 같은 데이터)
 *   점수·순위·정당/위원회 평균 비교, 인적사항·연락처, 총선 결과, 대표발의 법안(처리 단계), 공동발의, 표결(당 다수와 다른 표),
 *   뉴스 언급, 팔로워 수, 위원회 일정, 출석·재산·정치자금 (src/db/politician-profile.ts)
 *
 * GET /api/politicians/<sgId>:<sgTypecode>:<huboid> — 지방선거 당선인 1명: 후보 정보·선거 결과·선거공약 원문·뉴스 언급 (선관위)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  const { id } = await params;
  const person = await politicianProfile(decodeURIComponent(id));
  if (!person) return Response.json({ detail: "없는 정치인입니다" }, { status: 404 });
  return Response.json(person);
}
