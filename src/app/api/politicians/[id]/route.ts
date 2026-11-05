import { getMember } from "@/db/queries";

export const dynamic = "force-dynamic";

/** GET /api/politicians/<MONA_CD 또는 sgId:sgTypecode:huboid> — 의원 상세 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await getMember(decodeURIComponent(id));
  if (!person) return Response.json({ detail: "없는 의원입니다" }, { status: 404 });
  return Response.json(person);
}
