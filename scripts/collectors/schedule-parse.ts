/**
 * 열린국회정보 '국회 일정 통합'(ALLSCHEDULE) 응답 → assembly_schedule 줄. DB·네트워크 없이 테스트할 수 있는 순수 함수.
 * 필드: SCH_KIND(종류) · SCH_CN(내용) · SCH_DT(일자) · SCH_TM(시간) · CMIT_NM(위원회) · CONF_DIV(회의 구분)
 *       CONF_SESS(회기) · CONF_DGR(차수) · EV_INST_NM(행사 주체) · EV_PLC(장소)
 */
export const SCHEDULE_FIELD = {
  date: "SCH_DT",
  time: "SCH_TM",
  kind: "SCH_KIND",
  title: "SCH_CN",
  committee: "CMIT_NM",
  confDiv: "CONF_DIV",
  session: "CONF_SESS",
  degree: "CONF_DGR",
  host: "EV_INST_NM",
  place: "EV_PLC",
} as const;

export type ScheduleItem = Record<string, string | number | null | undefined>;

export interface ScheduleRow {
  schDate: string;
  schTime: string | null;
  kind: string | null;
  title: string;
  committee: string | null;
  confDiv: string | null;
  session: string | null;
  degree: string | null;
  host: string | null;
  place: string | null;
}

/** 줄바꿈·연속 공백을 한 칸으로, 빈 값은 null */
export const clean = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s || null;
};

/** '2026-11-20', '2026.11.20', '20261120' → '2026-11-20' */
export function isoDate(v: unknown): string | null {
  const m = String(v ?? "").trim().match(/^(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * 하루치 응답 → 줄. 요청한 날짜(day)와 다른 날짜의 줄은 버림 (그날 줄을 지우고 다시 넣으므로 다른 날이 섞이면 안 됨).
 * 내용이 없는 줄은 버리고, 같은 날·시간·종류·위원회·내용이 겹치면 하나만 남김.
 */
export function toScheduleRows(items: ScheduleItem[], day: string): ScheduleRow[] {
  const seen = new Set<string>();
  const out: ScheduleRow[] = [];
  for (const it of items) {
    const title = clean(it[SCHEDULE_FIELD.title]);
    if (!title) continue;
    const schDate = isoDate(it[SCHEDULE_FIELD.date]) ?? day;
    if (schDate !== day) continue;
    const row: ScheduleRow = {
      schDate,
      schTime: clean(it[SCHEDULE_FIELD.time]),
      kind: clean(it[SCHEDULE_FIELD.kind]),
      title,
      committee: clean(it[SCHEDULE_FIELD.committee]),
      confDiv: clean(it[SCHEDULE_FIELD.confDiv]),
      session: clean(it[SCHEDULE_FIELD.session]),
      degree: clean(it[SCHEDULE_FIELD.degree]),
      host: clean(it[SCHEDULE_FIELD.host]),
      place: clean(it[SCHEDULE_FIELD.place]),
    };
    const key = [row.schDate, row.schTime, row.kind, row.committee, row.title].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** 한국 날짜 'YYYY-MM-DD' */
export function kstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** today 기준 back 일 전부터 ahead 일 뒤까지 날짜 목록 (양 끝 포함) */
export function scheduleDays(today: string, back: number, ahead: number): string[] {
  const base = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: back + ahead + 1 }, (_, i) => new Date(base + (i - back) * 86_400_000).toISOString().slice(0, 10));
}
