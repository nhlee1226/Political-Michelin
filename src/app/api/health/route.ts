import { getTableCounts } from "@/db/queries";

export const dynamic = "force-dynamic"; // 항상 DB 에서 새로 읽기

/** GET /api/health — 서버·DB 연결 확인 + 테이블별 행 수 */
export async function GET() {
  try {
    const counts = await getTableCounts();
    if (!counts) return Response.json({ ok: true, db: false, detail: "DATABASE_URL 이 없어 mock 데이터로 동작 중" });
    return Response.json({ ok: true, db: true, counts });
  } catch (e) {
    return Response.json({ ok: false, db: false, detail: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
