import { getPolitician } from "@/server/queries";

export const dynamic = "force-dynamic";

/** GET /api/politicians/<MONA_CD> — 의원 카드 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await getPolitician(id);
  if (!person) return Response.json({ detail: "없는 의원입니다" }, { status: 404 });
  return Response.json(person);
}
