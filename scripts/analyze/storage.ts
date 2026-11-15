/**
 * Supabase DB 잔여 용량 계산 (DB 조회는 news.ts, 여기는 DB 없이 동작하는 순수 함수).
 *
 *   SUPABASE_DB_LIMIT_MB  요금제의 DB 용량 한도 (기본 500 = Supabase Free 요금제)
 *
 * 쓴 용량은 pg_database_size(현재 DB 전체, Supabase 대시보드의 Database size 와 같은 기준).
 * 소진 예상일은 '최근 7일 하루 평균 신규 기사 수 × 기사 1건이 차지하는 평균 용량'으로 어림한다.
 * 기사 1건 용량에는 기사 표뿐 아니라 언급·분석·근거 표까지 포함한다 (기사가 늘면 같이 늘어나는 표).
 */
const MB = 1024 * 1024;

export interface StorageInput {
  /** pg_database_size */
  dbBytes: number;
  /** 요금제 한도 */
  limitBytes: number;
  /** 기사와 함께 늘어나는 표들(news_articles·news_mentions·news_analysis·news_evidence)의 합계 */
  newsBytes: number;
  /** news_articles 행 수 */
  articleCount: number;
  /** 최근 7일 하루 평균 신규 기사 수 */
  articlesPerDay: number;
}

export interface StorageReport {
  usedMb: number;
  limitMb: number;
  freeMb: number;
  usedPct: number;
  /** 기사 1건당 평균 용량 (KB) */
  kbPerArticle: number;
  /** 하루 예상 증가량 (MB) */
  mbPerDay: number;
  /** 지금 속도로 한도까지 남은 날수. 증가가 없으면 null */
  daysLeft: number | null;
  /** 80% 이상이면 경고 문구 */
  warning?: string;
}

export function readLimitBytes(env: Record<string, string | undefined> = process.env): number {
  const mb = Number(env.SUPABASE_DB_LIMIT_MB ?? 500);
  if (!(mb > 0)) throw new Error(`SUPABASE_DB_LIMIT_MB 가 양수가 아닙니다: ${env.SUPABASE_DB_LIMIT_MB}`);
  return mb * MB;
}

export function storageReport(s: StorageInput): StorageReport {
  const free = Math.max(0, s.limitBytes - s.dbBytes);
  const perArticle = s.articleCount > 0 ? s.newsBytes / s.articleCount : 0;
  const perDay = perArticle * s.articlesPerDay;
  const usedPct = (s.dbBytes / s.limitBytes) * 100;
  const r: StorageReport = {
    usedMb: s.dbBytes / MB,
    limitMb: s.limitBytes / MB,
    freeMb: free / MB,
    usedPct,
    kbPerArticle: perArticle / 1024,
    mbPerDay: perDay / MB,
    daysLeft: perDay > 0 ? Math.floor(free / perDay) : null,
  };
  if (usedPct >= 95) r.warning = "DB 용량이 거의 찼습니다. 오래된 기사 정리나 요금제 변경이 필요합니다.";
  else if (usedPct >= 80) r.warning = "DB 용량이 80%를 넘었습니다. 정리 계획을 세우세요.";
  return r;
}

const f1 = (n: number) => n.toFixed(1);

/** 콘솔 한 줄 */
export function storageLine(r: StorageReport): string {
  const eta = r.daysLeft === null ? "증가 없음" : `지금 속도면 약 ${r.daysLeft.toLocaleString("ko-KR")}일 뒤 가득 참`;
  return (
    `Supabase DB ${f1(r.usedMb)} / ${f1(r.limitMb)} MB (${f1(r.usedPct)}%) · 남은 ${f1(r.freeMb)} MB` +
    ` · 하루 약 +${f1(r.mbPerDay)} MB (기사 1건 ${f1(r.kbPerArticle)} KB) · ${eta}` +
    (r.warning ? `\n   ⚠️ ${r.warning}` : "")
  );
}
