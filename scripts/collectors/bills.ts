/**
 * 열린국회정보 의원 발의법률안(22대) → bills  (정치인 표의 "대표 발의" 수, 빠른 메뉴 "법안 추적"의 처리 단계가 여기서 채워짐)
 * 실행: npm run collect:bills      (.env.local 의 ASSEMBLY_API_KEY)
 * 먼저 collect:members 를 돌려서 members 가 채워져 있어야 대표발의자를 연결할 수 있습니다.
 *
 * 같은 응답에 처리 단계 날짜(소관위 회부·상정·처리, 법사위 회부·상정·처리, 본회의 의결)가 들어 있어 함께 저장합니다.
 * 단계 날짜 열이 없으면 시작할 때 scripts/sql/add-bill-stages.sql 로 만듭니다 (db:push 필요 없음).
 * 응답 필드 이름이 다르면 raw_responses 의 assembly:bills 샘플을 보고 FIELD 만 고치면 됩니다.
 * 본회의 표결(bill_votes)은 이 수집기 다음에 collect:votes 로 채웁니다.
 */
import { sql } from "drizzle-orm";
import { bills, members } from "../../src/db/schema";
import { apiFetch } from "./api-fetch";
import { db, env, run, saveRaw } from "./common";
import { applySqlFile } from "./sql-file";

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
  // 처리 단계
  committeeDt: "COMMITTEE_DT", // 소관위 회부일
  cmtPresentDt: "CMT_PRESENT_DT", // 소관위 상정일
  cmtProcDt: "CMT_PROC_DT", // 소관위 처리일
  cmtResult: "CMT_PROC_RESULT_CD", // 소관위 처리결과
  lawSubmitDt: "LAW_SUBMIT_DT", // 법사위 회부일
  lawPresentDt: "LAW_PRESENT_DT", // 법사위 상정일
  lawProcDt: "LAW_PROC_DT", // 법사위 처리일
  lawResult: "LAW_PROC_RESULT_CD", // 법사위 처리결과
  procDt: "PROC_DT", // 본회의 의결일
} as const;

type Row = Record<string, string | null>;

async function fetchPage(page: number): Promise<{ rows: Row[]; total: number }> {
  const q = new URLSearchParams({ KEY: env("ASSEMBLY_API_KEY"), Type: "json", AGE: String(UNIT), pIndex: String(page), pSize: String(PAGE) });
  const body = await (await apiFetch("assembly", `${BASE}/${SERVICE}?${q}`, { signal: AbortSignal.timeout(30_000) })).json();
  if (!body[SERVICE]) {
    if (page === 1) throw new Error(JSON.stringify(body.RESULT ?? body));
    return { rows: [], total: 0 }; // 마지막 페이지 다음
  }
  return { rows: body[SERVICE][1].row, total: body[SERVICE][0].head[0].list_total_count };
}

/** '홍길동', '홍길동의원' → '홍길동' */
const cleanName = (s: string | null) => (s ?? "").trim().split(/[\s,(]/)[0].replace(/의원$/, "");

/** '2026-11-20', '2026-11-20 00:00:00', '20261120' → '2026-11-20' (빈 값·이상한 값은 null) */
const date = (s: string | null | undefined) => {
  const m = (s ?? "").trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const text = (s: string | null | undefined) => s?.trim() || null;

run(async () => {
  await applySqlFile(db, "add-bill-stages.sql"); // 단계 날짜 열이 없으면 만듦

  // 현재 의원 이름 → MONA_CD (동명이인은 이름으로 연결하지 않음)
  const ms = await db.select({ monaCd: members.monaCd, name: members.name }).from(members);
  const known = new Set(ms.map((m) => m.monaCd));
  const byName = new Map<string, string | null>();
  for (const m of ms) byName.set(m.name, byName.has(m.name) ? null : m.monaCd);

  let saved = 0;
  let linked = 0;
  let staged = 0; // 소관위 회부일이 있는 법안 수 (단계 날짜 필드 이름이 맞는지 확인용)
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
        if (date(r[FIELD.committeeDt])) staged++;
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
          committeeDate: date(r[FIELD.committeeDt]),
          cmtPresentDate: date(r[FIELD.cmtPresentDt]),
          cmtProcDate: date(r[FIELD.cmtProcDt]),
          cmtProcResult: text(r[FIELD.cmtResult]),
          lawSubmitDate: date(r[FIELD.lawSubmitDt]),
          lawPresentDate: date(r[FIELD.lawPresentDt]),
          lawProcDate: date(r[FIELD.lawProcDt]),
          lawProcResult: text(r[FIELD.lawResult]),
          procDate: date(r[FIELD.procDt]),
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
            committeeDate: sql`excluded.committee_date`,
            cmtPresentDate: sql`excluded.cmt_present_date`,
            cmtProcDate: sql`excluded.cmt_proc_date`,
            cmtProcResult: sql`excluded.cmt_proc_result`,
            lawSubmitDate: sql`excluded.law_submit_date`,
            lawPresentDate: sql`excluded.law_present_date`,
            lawProcDate: sql`excluded.law_proc_date`,
            lawProcResult: sql`excluded.law_proc_result`,
            procDate: sql`excluded.proc_date`,
            updatedAt: sql`now()`,
          },
        });
    }
    saved += values.length;
    console.log(`  ${page}페이지: ${values.length}건`);
    if (rows.length < PAGE || saved >= total) break;
  }

  console.log(`22대 발의 법안 ${saved}건 저장 (전체 ${total}건), 대표발의 의원 연결 ${linked}건, 처리 단계 날짜 ${staged}건`);
  if (saved > 0 && linked === 0) {
    console.log("[확인] 대표발의 의원이 하나도 연결되지 않았어요. raw_responses 의 assembly:bills 샘플에서 대표발의자 필드 이름을 확인하세요.");
  }
  if (saved > 0 && staged === 0) {
    console.log("[확인] 처리 단계 날짜가 하나도 없어요. raw_responses 의 assembly:bills 샘플에서 COMMITTEE_DT 등 필드 이름을 확인하세요.");
  }
});
