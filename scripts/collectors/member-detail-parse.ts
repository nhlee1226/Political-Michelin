/**
 * 정치인 상세 페이지용 수집·입력 변환 (DB 없이 동작하는 순수 함수 → member-detail.test.ts)
 *  - 인적사항 API 의 연락처·약력 열
 *  - 공동발의자 이름 문자열 → 이름 목록
 *  - 출석·재산·정치자금 CSV → 행
 */

type Row = Record<string, string | null | undefined>;

/** 열린국회정보 '국회의원 인적사항'(nwvrqwxyaytdsfvhu) 필드 → members 의 상세 열 */
export const PROFILE_FIELD = {
  hanjaName: "HJ_NM",
  engName: "ENG_NM",
  birthDate: "BTH_DATE",
  gender: "SEX_GBN_NM",
  jobTitle: "JOB_RES_NM",
  committees: "CMITS",
  units: "UNITS",
  tel: "TEL_NO",
  email: "E_MAIL",
  homepage: "HOMEPAGE",
  office: "ASSEM_ADDR",
  staff: "STAFF",
  secretary: "SECRETARY",
  secretary2: "SECRETARY2",
  career: "MEM_TITLE",
} as const;

export type MemberProfile = { -readonly [K in keyof typeof PROFILE_FIELD]: string | null };

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").replace(/\r\n?/g, "\n").trim();
  return t ? t : null;
};

export function memberProfile(r: Row): MemberProfile {
  const out = {} as MemberProfile;
  for (const [k, f] of Object.entries(PROFILE_FIELD) as [keyof MemberProfile, string][]) out[k] = clean(r[f]);
  // 홈페이지는 링크로 쓰므로 http(s) 로 시작하게
  if (out.homepage && !/^https?:\/\//i.test(out.homepage)) out.homepage = /^[\w.-]+\.[a-z]{2,}/i.test(out.homepage) ? `http://${out.homepage}` : null;
  return out;
}

/**
 * 공동발의자 표기 → 이름 목록.
 * '홍길동,김철수', '홍길동의원 김철수의원', '홍길동(민주)·김철수' 모두 처리. 한글 2~5자만 이름으로 봄.
 */
export function cosponsorNames(text: string | null | undefined): string[] {
  if (!text) return [];
  const names = text
    .replace(/\([^)]*\)/g, " ")
    .split(/[,，·\s]+/)
    .map((s) => s.replace(/의원$/, "").trim())
    .filter((s) => /^[가-힣]{2,5}$/.test(s) && s !== "의원");
  return [...new Set(names)];
}

/* ───────── CSV 입력 (출석·재산·정치자금) ───────── */

/** 따옴표·쉼표·줄바꿈을 지원하는 작은 CSV 파서. 첫 줄 = 머리글. 빈 줄은 건너뜀. BOM 제거 */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((x) => x.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const head = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export type RecordKind = "attendance" | "assets" | "funds";

/** CSV 머리글 (README·오류 메시지에 그대로 보여줌). mona_cd 가 비면 name 으로 찾음 (동명이인은 건너뜀) */
export const RECORD_COLUMNS: Record<RecordKind, { required: string[]; optional: string[] }> = {
  attendance: { required: ["kind", "period", "attended", "total"], optional: ["mona_cd", "name", "source_url"] },
  assets: { required: ["year", "total"], optional: ["mona_cd", "name", "real_estate", "deposits", "securities", "debts", "source_url"] },
  funds: { required: ["year", "income", "expense"], optional: ["mona_cd", "name", "donations", "source_url"] },
};

/** '1,234', '-500', '' → 숫자 / null (천 단위 쉼표·원·천원 글자 허용) */
export function num(s: string | undefined): number | null {
  const t = (s ?? "").replace(/[,\s원천]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export interface RecordIssue {
  line: number; // CSV 줄 번호 (머리글 = 1)
  reason: string;
}

/**
 * CSV 행 → 저장할 값. resolve(mona_cd, name) 이 의원 코드를 돌려주지 못하면 그 줄은 issues 로.
 * 반환 값의 키는 drizzle 스키마(memberAttendance·memberAssets·memberFunds) 필드 이름과 같음.
 */
export function recordRows(
  kind: RecordKind,
  rows: Record<string, string>[],
  resolve: (monaCd: string | undefined, name: string | undefined) => string | null,
): { values: Record<string, string | number | null>[]; issues: RecordIssue[] } {
  const values: Record<string, string | number | null>[] = [];
  const issues: RecordIssue[] = [];
  const cols = RECORD_COLUMNS[kind];
  rows.forEach((r, i) => {
    const line = i + 2;
    const missing = cols.required.filter((c) => !r[c]);
    if (missing.length) return issues.push({ line, reason: `빈 칸: ${missing.join(", ")}` });
    const monaCd = resolve(r.mona_cd || undefined, r.name || undefined);
    if (!monaCd) return issues.push({ line, reason: `의원을 찾지 못함 (${r.mona_cd || r.name || "이름 없음"})` });
    const source = r.source_url || null;
    if (kind === "attendance") {
      const k = r.kind.trim();
      const attended = num(r.attended);
      const total = num(r.total);
      if (k !== "본회의" && k !== "위원회") return issues.push({ line, reason: `kind 는 본회의 또는 위원회 (${k})` });
      if (attended == null || total == null || total <= 0 || attended < 0 || attended > total)
        return issues.push({ line, reason: `attended·total 이 올바르지 않음 (${r.attended}/${r.total})` });
      values.push({ monaCd, kind: k, period: r.period.trim(), attended, total, sourceUrl: source });
    } else {
      const year = num(r.year);
      if (year == null || year < 2000 || year > 2100) return issues.push({ line, reason: `year 가 올바르지 않음 (${r.year})` });
      if (kind === "assets") {
        const total = num(r.total);
        if (total == null) return issues.push({ line, reason: `total 이 숫자가 아님 (${r.total})` });
        values.push({
          monaCd,
          year,
          total,
          realEstate: num(r.real_estate),
          deposits: num(r.deposits),
          securities: num(r.securities),
          debts: num(r.debts),
          sourceUrl: source,
        });
      } else {
        const income = num(r.income);
        const expense = num(r.expense);
        if (income == null || expense == null) return issues.push({ line, reason: `income·expense 가 숫자가 아님` });
        values.push({ monaCd, year, income, expense, donations: num(r.donations), sourceUrl: source });
      }
    }
  });
  return { values, issues };
}
