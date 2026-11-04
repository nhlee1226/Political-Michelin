/**
 * 열린국회정보 의원 발의법률안(22대) → bills  (정치인 표의 "대표 발의" 수가 여기서 채워짐)
 * 실행: npx tsx scripts/collectors/bills.ts      (.env.local 의 ASSEMBLY_API_KEY)
 * 먼저 collect:members 를 돌려서 members 가 채워져 있어야 대표발의자를 연결할 수 있습니다.
 *
 * 응답 필드 이름이 다르면 raw_responses 의 assembly:bills 샘플을 보고 FIELD 만 고치면 됩니다.
 */
import { env, saveRaw, sql } from "./common";

const SERVICE = "nzmimeepazxkubdpn"; // 국회의원 발의법률안
const BASE = "https://open.assembly.go.kr/portal/openapi";
const AGE = 22;
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
  const q = new URLSearchParams({ KEY: env("ASSEMBLY_API_KEY").trim(), Type: "json", AGE: String(AGE), pIndex: String(page), pSize: String(PAGE) });
  const body = await (await fetch(`${BASE}/${SERVICE}?${q}`)).json();
  if (!body[SERVICE]) {
    if (page === 1) throw new Error(JSON.stringify(body.RESULT ?? body));
    return { rows: [], total: 0 }; // 마지막 페이지 다음
  }
  return { rows: body[SERVICE][1].row, total: body[SERVICE][0].head[0].list_total_count };
}

/** '홍길동', '홍길동의원' → '홍길동' */
const cleanName = (s: string | null) => (s ?? "").trim().split(/[\s,(]/)[0].replace(/의원$/, "");

const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

async function main() {
  // 현재 의원 이름 → MONA_CD (동명이인은 이름으로 연결하지 않음)
  const members = await sql<{ mona_cd: string; name: string }[]>`select mona_cd, name from members`;
  const known = new Set(members.map((m) => m.mona_cd));
  const byName = new Map<string, string | null>();
  for (const m of members) byName.set(m.name, byName.has(m.name) ? null : m.mona_cd);

  let saved = 0;
  let linked = 0;
  let total = 0;
  for (let page = 1; ; page++) {
    const { rows, total: t } = await fetchPage(page);
    if (page === 1) {
      total = t;
      await saveRaw("assembly:bills", { AGE, sample: 3 }, rows.slice(0, 3)); // 필드 확인용 샘플만 (전체 저장은 너무 큼)
    }
    if (rows.length === 0) break;

    const values = rows
      .filter((r) => r[FIELD.id] && r[FIELD.title])
      .map((r) => {
        const direct = r[FIELD.leadMonaCd];
        const proposer = direct && known.has(direct) ? direct : (byName.get(cleanName(r[FIELD.leadName])) ?? null);
        if (proposer) linked++;
        return {
          bill_id: r[FIELD.id]!,
          bill_no: r[FIELD.no],
          title: r[FIELD.title]!,
          age: AGE,
          proposer_mona_cd: proposer,
          propose_dt: date(r[FIELD.proposeDt]),
          committee: r[FIELD.committee],
          proc_result: r[FIELD.result],
          detail_url: r[FIELD.url],
        };
      });

    if (values.length) {
      await sql`
        insert into bills ${sql(values, "bill_id", "bill_no", "title", "age", "proposer_mona_cd", "propose_dt", "committee", "proc_result", "detail_url")}
        on conflict (bill_id) do update set
          bill_no = excluded.bill_no, title = excluded.title, proposer_mona_cd = excluded.proposer_mona_cd,
          propose_dt = excluded.propose_dt, committee = excluded.committee, proc_result = excluded.proc_result,
          detail_url = excluded.detail_url, updated_at = now()`;
    }
    saved += values.length;
    console.log(`  ${page}페이지: ${values.length}건`);
    if (rows.length < PAGE || saved >= total) break;
  }

  console.log(`22대 발의 법안 ${saved}건 저장 (전체 ${total}건), 대표발의 의원 연결 ${linked}건`);
  if (saved > 0 && linked === 0) console.log("[확인] 대표발의 의원이 하나도 연결되지 않았어요. raw_responses 의 assembly:bills 샘플에서 대표발의자 필드 이름을 확인하세요.");
}

if (process.argv[1]?.endsWith("bills.ts")) {
  main()
    .catch((e) => {
      console.error("[실패]", e.message ?? e);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
