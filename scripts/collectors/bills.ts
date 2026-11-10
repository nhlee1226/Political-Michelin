/**
 * [연동 예정] 열린국회정보 의원 발의법률안(22대) → bills  (정치인 표의 "대표 발의" 수가 여기서 채워짐)
 * 실행: npm run collect:bills      (.env.local 의 ASSEMBLY_API_KEY)
 * 먼저 collect:members 를 돌려서 members 가 채워져 있어야 대표발의자를 연결할 수 있습니다.
 *
 * 아직 실제 키로 검증하지 않은 초안입니다. 응답 필드 이름이 다르면 raw_responses 의 assembly:bills 샘플을 보고
 * FIELD 만 고치면 됩니다. 표결(bill_votes) 수집기는 아직 없습니다.
 */
import { sql } from "drizzle-orm";
import { bills, members } from "../../src/db/schema";
import { db, env, run, saveRaw } from "./common";

const SERVICE = "nzmimeepazxkubdpn"; // 국회의원 발의법률안
const BASE = "https://open.assembly.go.kr/portal/openapi";
const UNIT = 22;
const PAGE = 1000;

const FIELD = {
  id: "BILL_ID",
  no: "BILL_NO",
  title: "BILL_NAME",
  committee: "COMMITTEE",
  proposeDt: "PROPOSE_DT",
  result: "PROC_RESULT",
  url: "DETAIL_LINK",
  leadName: "RST_PROPOSER", // 대표발의자 이름
  leadMonaCd: "RST_MONA_CD", // 응답에 있으면 이름 대신 이걸로 연결
} as const;

type Row = Record<string, string | null>;

async function fetchPage(page: number): Promise<{ rows: Row[]; total: number }> {
  const q = new URLSearchParams({ KEY: env("ASSEMBLY_API_KEY"), Type: "json", AGE: String(UNIT), pIndex: String(page), pSize: String(PAGE) });
  const body = await (await fetch(`${BASE}/${SERVICE}?${q}`, { signal: AbortSignal.timeout(30_000) })).json();
  if (!body[SERVICE]) {
    if (page === 1) throw new Error(JSON.stringify(body.RESULT ?? body));
    return { rows: [], total: 0 }; // 마지막 페이지 다음
  }
  return { rows: body[SERVICE][1].row, total: body[SERVICE][0].head[0].list_total_count };
}

/** '홍길동', '홍길동의원' → '홍길동' */
const cleanName = (s: string | null) => (s ?? "").trim().split(/[\s,(]/)[0].replace(/의원$/, "");

const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

run(async () => {
  // 현재 의원 이름 → MONA_CD (동명이인은 이름으로 연결하지 않음)
  const ms = await db.select({ monaCd: members.monaCd, name: members.name }).from(members);
  const known = new Set(ms.map((m) => m.monaCd));
  const byName = new Map<string, string | null>();
  for (const m of ms) byName.set(m.name, byName.has(m.name) ? null : m.monaCd);

  let saved = 0;
  let linked = 0;
  let total = 0;
  for (let page = 1; ; page++) {
    const { rows, total: t } = await fetchPage(page);
    if (page === 1) {
      total = t;
      await saveRaw("assembly:bills", { AGE: UNIT, sample: 3 }, rows.slice(0, 3)); // 필드 확인용 샘플만
    }
    if (rows.length === 0) break;

    const values = rows
      .filter((r) => r[FIELD.id] && r[FIELD.title])
      .map((r) => {
        const direct = r[FIELD.leadMonaCd];
        const proposer = direct && known.has(direct) ? direct : (byName.get(cleanName(r[FIELD.leadName])) ?? null);
        if (proposer) linked++;
        return {
          billId: r[FIELD.id]!,
          billNo: r[FIELD.no],
          title: r[FIELD.title]!,
          unit: UNIT,
          proposerMonaCd: proposer,
          proposeDate: date(r[FIELD.proposeDt]),
          committee: r[FIELD.committee],
          procResult: r[FIELD.result],
          detailUrl: r[FIELD.url],
        };
      });

    if (values.length) {
      await db
        .insert(bills)
        .values(values)
        .onConflictDoUpdate({
          target: bills.billId,
          set: {
            billNo: sql`excluded.bill_no`,
            title: sql`excluded.title`,
            proposerMonaCd: sql`excluded.proposer_mona_cd`,
            proposeDate: sql`excluded.propose_date`,
            committee: sql`excluded.committee`,
            procResult: sql`excluded.proc_result`,
            detailUrl: sql`excluded.detail_url`,
            updatedAt: sql`now()`,
          },
        });
    }
    saved += values.length;
    console.log(`  ${page}페이지: ${values.length}건`);
    if (rows.length < PAGE || saved >= total) break;
  }

  console.log(`22대 발의 법안 ${saved}건 저장 (전체 ${total}건), 대표발의 의원 연결 ${linked}건`);
  if (saved > 0 && linked === 0) {
    console.log("[확인] 대표발의 의원이 하나도 연결되지 않았어요. raw_responses 의 assembly:bills 샘플에서 대표발의자 필드 이름을 확인하세요.");
  }
});
