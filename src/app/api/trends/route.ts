import { getMentionTrends } from "@/db/queries";

export const dynamic = "force-dynamic";

const KINDS = ["party", "member", "candidate"] as const;

/** GET /api/trends?kind=party&days=7&top=10 — 기사 언급량 추이 (날짜별, KST) */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const kind = KINDS.find((k) => k === q.get("kind")) ?? "party";
  const days = Number(q.get("days") ?? 7) || 7;
  const top = Math.min(Number(q.get("top") ?? 10) || 10, 50);
  return Response.json(await getMentionTrends({ kind, days, top }));
}
