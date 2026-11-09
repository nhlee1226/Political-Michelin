import { sql } from "@/server/db";
import { memberScores, SCORE_RULE } from "@/server/member-scores";

export const dynamic = "force-dynamic";

/**
 * GET /api/politicians/<MONA_CD> — 의원 상세 (정치인 표에서 한 명을 눌렀을 때)
 * 목록과 같은 점수(반영률·별점) + 대표발의 법안 최근 10건(국회 의안정보시스템 링크 포함)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [person] = await memberScores(id, null);
  if (!person) return Response.json({ detail: "없는 의원입니다" }, { status: 404 });
  const recent_bills = await sql`
    select bill_id, bill_no, title, propose_dt, committee, proc_result, detail_url
    from bills where proposer_mona_cd = ${id}
    order by propose_dt desc nulls last limit 10`;
  return Response.json({ ...person, bills_passed: person.bills_reflected, score_rule: SCORE_RULE, recent_bills });
}
