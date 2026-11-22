import { db } from "@/db";
import { apiBills } from "@/db/assembly-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/bills — 빠른 메뉴 "법안 추적" (22대 의원 발의법률안의 처리 단계)
 *   ?view=active (기본) 진행 중이면서 최근 움직인 법안 · ?view=done 처리가 끝난 법안
 *   ?q=반도체  제목 검색 · ?ids=PRC_…,PRC_…  추적 중인 법안
 * 각 법안: 단계(발의 → 소관위 → 법사위 → 본회의) 중 어디까지 왔는지, 지금 상태, 단계별 날짜, 본회의 찬성·반대·기권 수.
 * 단계 날짜를 아직 수집하기 전이면 { ready: false, rows: [] }.
 */
export async function GET(req: Request) {
  if (!db) return Response.json({ detail: "DATABASE_URL 이 없어 표시할 수 없습니다" }, { status: 503 });
  const p = new URL(req.url).searchParams;
  const ids = p.get("ids");
  const q = p.get("q")?.trim().slice(0, 40) || null;
  return Response.json(
    await apiBills({
      ids: ids == null ? undefined : ids.split(",").map((s) => s.trim()).filter(Boolean),
      q,
      view: p.get("view") === "done" ? "done" : "active",
      limit: Number(p.get("limit")) || undefined,
    }),
  );
}
