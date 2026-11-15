/**
 * 네이버 뉴스 검색 API 클라이언트 (NAVER API HUB 기준, 2026)
 * - 수집 스크립트(scripts/collectors/news.ts)에서만 씀. Client Secret 을 프론트에 두지 말 것.
 * - 환경변수: NAVER_HUB_CLIENT_ID, NAVER_HUB_CLIENT_SECRET  (.env.local / GitHub Secrets)
 * - Node 18+ (내장 fetch)
 */

const BASE_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news";
const MAX_DISPLAY = 100; // display 1~100
const MAX_START = 1000; // start 1~1000 → 쿼리당 최대 약 1,000건까지만 조회 가능

// ── 원본 응답 타입 ─────────────────────────────────────────
interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string; // RFC822, 예: "Thu, 11 Jun 2026 18:34:00 +0900"
}
interface NaverNewsResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

// ── 앱에서 쓸 정규화 타입 ─────────────────────────────────
export interface NewsArticle {
  id: string; // 원문 URL 기반 해시 (중복 제거 키)
  title: string; // <b> 태그·HTML 엔티티 제거
  summary: string;
  url: string; // 원문 URL (없으면 네이버 링크)
  naverUrl: string;
  publishedAt: string; // ISO-8601
  query: string; // 어떤 검색어로 수집됐는지
}

// ── 유틸 ───────────────────────────────────────────────
const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " ", middot: "·" };
/** <b> 등 태그 제거 + HTML 엔티티(이름·숫자) 한 번에 변환 (이중 변환 방지) */
export function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#"
        ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** utm_* 같은 추적 파라미터·#해시를 지워서 같은 기사가 두 번 들어가지 않게 */
export function cleanUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    for (const k of [...u.searchParams.keys()]) if (k.toLowerCase().startsWith("utm_")) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

async function hash(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 단일 호출 (재시도 포함) ───────────────────────────────
async function callNaver(
  params: { query: string; display?: number; start?: number; sort?: "sim" | "date" },
  retries = 3,
): Promise<NaverNewsResponse> {
  const id = process.env.NAVER_HUB_CLIENT_ID;
  const secret = process.env.NAVER_HUB_CLIENT_SECRET;
  if (!id || !secret) throw new Error("NAVER_HUB_CLIENT_ID / SECRET 환경변수가 없습니다.");

  const qs = new URLSearchParams({
    query: params.query,
    display: String(params.display ?? MAX_DISPLAY),
    start: String(params.start ?? 1),
    sort: params.sort ?? "date",
    format: "json",
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE_URL}?${qs}`, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": id,
        "X-NCP-APIGW-API-KEY": secret,
      },
    });
    if (res.ok) return (await res.json()) as NaverNewsResponse;

    // 429(호출 한도)·5xx만 재시도, 400 계열(SE01~SE06)은 즉시 실패
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    throw new Error(`Naver API ${res.status}: ${await res.text()}`);
  }
  throw new Error("unreachable");
}

// ── 수집: 검색어 1개 → 최신순으로 since 이후 기사만 ─────────────
export async function collectNews(
  query: string,
  opts: { since?: Date; maxItems?: number } = {},
): Promise<NewsArticle[]> {
  const maxItems = Math.min(opts.maxItems ?? 300, MAX_START + MAX_DISPLAY - 1);
  const out: NewsArticle[] = [];
  const seen = new Set<string>();

  for (let start = 1; start <= MAX_START && out.length < maxItems; start += MAX_DISPLAY) {
    const data = await callNaver({ query, start, display: MAX_DISPLAY, sort: "date" });
    if (!data.items.length) break;

    let reachedOld = false;
    for (const it of data.items) {
      const publishedAt = new Date(it.pubDate);
      if (opts.since && publishedAt < opts.since) {
        reachedOld = true;
        break;
      }

      const url = cleanUrl(it.originallink) ?? cleanUrl(it.link) ?? it.link;
      const id = await hash(url);
      if (seen.has(id)) continue;
      seen.add(id);

      out.push({
        id,
        title: clean(it.title),
        summary: clean(it.description),
        url,
        naverUrl: it.link,
        publishedAt: publishedAt.toISOString(),
        query,
      });
      if (out.length >= maxItems) break;
    }
    if (reachedOld || data.start + data.display > data.total) break;
    await sleep(150); // 과호출 방지
  }
  return out;
}
