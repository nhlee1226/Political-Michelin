/**
 * 빠른 메뉴 "법안 추적"·"국회 일정"용 응답 (GET /api/bills, GET /api/schedule).
 * 단계 날짜 열·일정 표는 법안·일정 수집기가 처음 돌 때 생기므로(scripts/sql/add-bill-stages.sql),
 * 그 전에는 오류 대신 ready: false 를 내려 화면이 "첫 수집 뒤에 채워짐"으로 보여 줌.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { billStage, type BillDates, type BillStage } from "@/lib/bill-stage";
import { db } from "./index";

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  if (!db) return [];
  return (await db.execute(query)) as unknown as T[];
}

/** 표·열이 아직 없을 때(42P01 undefined_table, 42703 undefined_column)만 '준비 전'으로 봄. 그 밖의 오류는 그대로 */
function notReady(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01" || code === "42703";
}

/* ───────── 법안 추적 ───────── */

export type BillView = "active" | "done";

export interface ApiBillTrack extends BillStage {
  bill_id: string;
  bill_no: string | null;
  title: string;
  committee: string | null;
  proposer: string | null;
  /** 대표발의 의원 MONA_CD (정치인 상세 페이지 링크) */
  proposer_mona_cd: string | null;
  detail_url: string | null;
  /** 본회의 표결 수 (bill_votes 에 있을 때만) */
  votes: { yes: number; no: number; abstain: number } | null;
}

type BillRow = BillDates & Omit<ApiBillTrack, keyof BillStage>;

const BILL_COLS = sql`
  b.bill_id, b.bill_no, b.title, b.committee, b.detail_url, m.name as proposer, b.proposer_mona_cd,
  b.propose_date::text as propose_date, b.committee_date::text as committee_date,
  b.cmt_present_date::text as cmt_present_date, b.cmt_proc_date::text as cmt_proc_date, b.cmt_proc_result,
  b.law_submit_date::text as law_submit_date, b.law_present_date::text as law_present_date,
  b.law_proc_date::text as law_proc_date, b.law_proc_result,
  b.proc_date::text as proc_date, b.proc_result,
  (select json_build_object('yes', count(*) filter (where v.result = '찬성'),
                            'no', count(*) filter (where v.result = '반대'),
                            'abstain', count(*) filter (where v.result = '기권'))
     from bill_votes v where v.bill_id = b.bill_id having count(*) > 0) as votes`;

/** 위원회 상정 이후 가장 최근 단계 날짜 (회부는 접수 직후 자동이라 '움직임'으로 치지 않음) */
const MOVED = sql`greatest(b.cmt_present_date, b.cmt_proc_date, b.law_submit_date, b.law_present_date, b.law_proc_date, b.proc_date)`;
const ANY_STEP = sql`greatest(b.propose_date, b.committee_date, ${MOVED})`;
/** src/lib/bill-stage.ts 의 isClosed 와 같은 기준 */
const CLOSED = sql`((nullif(trim(b.proc_result), '') is not null and trim(b.proc_result) <> '계류')
  or coalesce(b.cmt_proc_result, '') ~ '폐기|철회' or coalesce(b.law_proc_result, '') ~ '폐기|철회')`;

/**
 * ids  → 그 법안들 (추적 중인 법안)
 * q    → 제목 검색, 최근 단계 순
 * view → active: 아직 진행 중이면서 위원회 상정 이후 움직인 법안 / done: 처리가 끝난 법안, 최근 단계 순
 */
export async function apiBills(opts: { ids?: string[]; q?: string | null; view?: BillView; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 50);
  try {
    const [{ ready }] = await rows<{ ready: boolean }>(sql`select exists(select 1 from bills where committee_date is not null) as ready`);
    if (!ready) return { ready: false, rows: [] as ApiBillTrack[] };

    const from = sql`from bills b left join members m on m.mona_cd = b.proposer_mona_cd`;
    let list: BillRow[];
    if (opts.ids) {
      if (opts.ids.length === 0) return { ready: true, rows: [] as ApiBillTrack[] };
      list = await rows<BillRow>(sql`select ${BILL_COLS} ${from}
        where b.bill_id in (${sql.join(opts.ids.slice(0, 50).map((id) => sql`${id}`), sql`, `)})
        order by ${ANY_STEP} desc nulls last`);
    } else if (opts.q) {
      list = await rows<BillRow>(sql`select ${BILL_COLS} ${from}
        where b.unit = 22 and b.title ilike ${"%" + opts.q.replace(/[%_\\]/g, "\\$&") + "%"}
        order by ${ANY_STEP} desc nulls last, b.bill_no desc limit ${limit}`);
    } else if (opts.view === "done") {
      list = await rows<BillRow>(sql`select ${BILL_COLS} ${from}
        where b.unit = 22 and ${CLOSED} and ${MOVED} is not null
        order by ${MOVED} desc, b.bill_no desc limit ${limit}`);
    } else {
      list = await rows<BillRow>(sql`select ${BILL_COLS} ${from}
        where b.unit = 22 and not ${CLOSED} and ${MOVED} is not null
        order by ${MOVED} desc, b.bill_no desc limit ${limit}`);
    }
    return { ready: true, rows: list.map(({ votes, ...r }) => ({ ...r, votes: votes ?? null, ...billStage(r) })) };
  } catch (e) {
    if (notReady(e)) return { ready: false, rows: [] as ApiBillTrack[] };
    throw e;
  }
}

/* ───────── 국회 일정 ───────── */

export interface ApiScheduleItem {
  date: string; // YYYY-MM-DD
  time: string | null;
  kind: string | null;
  title: string;
  committee: string | null;
  place: string | null;
  host: string | null;
}

/** 어제(한국 날짜)부터 앞으로의 국회 일정, 날짜·시간 순 */
export async function apiSchedule(limit = 120) {
  try {
    const list = await rows<ApiScheduleItem>(sql`
      select sch_date::text as date, sch_time as time, kind, title, committee, place, host
      from assembly_schedule
      where sch_date >= (now() at time zone 'Asia/Seoul')::date - 1
      order by sch_date, sch_time nulls last, id
      limit ${Math.min(Math.max(limit, 1), 300)}`);
    const [u] = await rows<{ updated_at: string | null }>(sql`select to_json(max(updated_at))#>>'{}' as updated_at from assembly_schedule`);
    // 표는 일정 수집기가 처음 돌 때 생기므로, 읽기에 성공했으면 수집이 한 번은 돌았다는 뜻 (일정이 없는 기간이면 rows 가 빔)
    return { ready: true, updated_at: u?.updated_at ?? null, rows: list };
  } catch (e) {
    if (notReady(e)) return { ready: false, updated_at: null, rows: [] as ApiScheduleItem[] };
    throw e;
  }
}
