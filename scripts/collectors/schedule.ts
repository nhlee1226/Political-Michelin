/**
 * 열린국회정보 '국회 일정 통합'(ALLSCHEDULE) → assembly_schedule  (빠른 메뉴 "국회 일정"이 여기서 채워짐)
 * 실행: npm run collect:schedule      (.env.local 의 ASSEMBLY_API_KEY, 법안·의원과 같은 키)
 *
 * 오늘 기준 3일 전 ~ 14일 뒤를 하루에 1번씩 부름 (날짜 1개 = 호출 1번, 약 18번).
 * 날짜마다 그날 줄을 지우고 새로 넣어서 취소·변경된 일정도 반영됨. 표가 없으면 scripts/sql/add-bill-stages.sql 로 만듦.
 * 응답 필드 이름이 다르면 raw_responses 의 assembly:schedule 샘플을 보고 schedule-parse.ts 의 SCHEDULE_FIELD 만 고치면 됩니다.
 */
import { eq } from "drizzle-orm";
import { assemblySchedule } from "../../src/db/schema";
import { apiFetch } from "./api-fetch";
import { db, env, run, saveRaw } from "./common";
import { kstDate, scheduleDays, toScheduleRows, type ScheduleItem } from "./schedule-parse";
import { applySqlFile } from "./sql-file";

const SERVICE = "ALLSCHEDULE"; // 국회 일정 통합
const BASE = "https://open.assembly.go.kr/portal/openapi";
const BACK = 3;
const AHEAD = 14;
const PAGE = 300;

/** 하루치 일정 전부. 일정이 없는 날은 빈 배열 (INFO-200 '해당하는 데이터가 없습니다') */
async function fetchDay(day: string): Promise<ScheduleItem[]> {
  const rows: ScheduleItem[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ KEY: env("ASSEMBLY_API_KEY"), Type: "json", SCH_DT: day, pIndex: String(page), pSize: String(PAGE) });
    const body = await (await apiFetch("assembly", `${BASE}/${SERVICE}?${q}`, { signal: AbortSignal.timeout(30_000) })).json();
    if (!body[SERVICE]) {
      if (body.RESULT?.CODE === "INFO-200") break;
      throw new Error(JSON.stringify(body.RESULT ?? body)); // 키 오류·호출 한도 등
    }
    const batch: ScheduleItem[] = body[SERVICE][1]?.row ?? [];
    const total = Number(body[SERVICE][0]?.head?.[0]?.list_total_count ?? 0);
    rows.push(...batch);
    if (batch.length < PAGE || rows.length >= total) break;
  }
  return rows;
}

run(async () => {
  await applySqlFile(db, "add-bill-stages.sql"); // 표가 없으면 만듦

  const days = scheduleDays(kstDate(new Date()), BACK, AHEAD);
  let saved = 0;
  let busyDays = 0;
  let sampled = false;
  for (const day of days) {
    const items = await fetchDay(day);
    if (!sampled && items.length) {
      await saveRaw("assembly:schedule", { SCH_DT: day, sample: 3 }, items.slice(0, 3)); // 필드 확인용 샘플만
      sampled = true;
    }
    const rows = toScheduleRows(items, day);
    await db.transaction(async (tx) => {
      await tx.delete(assemblySchedule).where(eq(assemblySchedule.schDate, day));
      if (rows.length) await tx.insert(assemblySchedule).values(rows);
    });
    if (rows.length) busyDays++;
    saved += rows.length;
  }

  console.log(`국회 일정 ${days[0]} ~ ${days[days.length - 1]} (${days.length}일) 중 ${busyDays}일, ${saved}건 저장`);
});
