import { db } from "@/db";
import { localWinnerDetail, politicianDetail } from "@/db/ui-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/politicians/<MONA_CD> — 의원 상세 (정치인 표에서 한 명을 눌렀을 때)
 * 목록과 같은 점수(반영률·별점·본회의 표결 수) + 대표발의 법안 최근 10건(국회 의안정보시스템 링크 포함)
 *
 * GET /api/politicians/<sgId>:<sgTypecode>:<huboid> — 지방선거 당선인 1명 + 선거공약 원문 (선관위)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 mock 으로 표시합니다" }, { status: 503 });
  const { id } = await params;
  const person = id.includes(":") ? await localWinnerDetail(id) : await politicianDetail(id);
  if (!person) return Response.json({ detail: "없는 의원입니다" }, { status: 404 });
  return Response.json(person);
}
