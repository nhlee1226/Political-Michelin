/**
 * 언론사 공식 RSS → news (제목·짧은 요약·링크만, 본문 저장 안 함)
 * 실행: npm run collect:news      키 필요 없음 (DATABASE_URL 만)
 *
 * 네이버 검색 API는 2026-07-31부터 신규 신청이 막혀서 쓰지 않습니다.
 * 피드 목록은 feeds.ts, 지역은 제목·요약에 나온 시도 이름으로 정합니다(없으면 전국 = null).
 */
import { XMLParser } from "fast-xml-parser";
import { sql } from "./common";
import { FEEDS, type Feed } from "./feeds";

const SUMMARY_MAX = 200; // 요약은 앞부분만 (저작권: 본문을 옮겨 오지 않음)
const MAX_AGE_DAYS = 7;

export interface NewsItem {
  url: string;
  headline: string;
  summary: string | null;
  publishedAt: Date;
}

/** HTML 엔티티 이름 → 글자 (한 번에 바꿔서 이중 변환을 막음) */
const ENTITIES: Record<string, string> = { nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", middot: "·", amp: "\u0026" };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u0026(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#"
        ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/\s+/g, " ")
    .trim();

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as object)) return String((v as { "#text": unknown })["#text"]);
  return "";
};

/** utm_* 같은 추적 파라미터를 지워서 같은 기사가 두 번 들어가지 않게 */
function cleanUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    for (const k of [...u.searchParams.keys()]) if (k.toLowerCase().startsWith("utm_")) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });
const asArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** RSS 2.0 과 Atom 둘 다 읽음 */
export function parseFeed(xml: string): NewsItem[] {
  const doc = parser.parse(xml);
  const rssItems = asArray(doc?.rss?.channel?.item);
  const atomItems = asArray(doc?.feed?.entry);
  const out: NewsItem[] = [];

  for (const it of rssItems as Record<string, unknown>[]) {
    const url = cleanUrl(text(it.link) || text(it.guid));
    const when = new Date(text(it.pubDate) || text(it["dc:date"]));
    if (url && text(it.title)) out.push(toItem(url, text(it.title), text(it.description), when));
  }
  for (const it of atomItems as Record<string, unknown>[]) {
    const links = asArray(it.link as Record<string, string> | Record<string, string>[]);
    const href = (links.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? links[0])?.["@href"] ?? "";
    const url = cleanUrl(href);
    const when = new Date(text(it.published) || text(it.updated));
    if (url && text(it.title)) out.push(toItem(url, text(it.title), text(it.summary), when));
  }
  return out;
}

function toItem(url: string, title: string, desc: string, when: Date): NewsItem {
  const s = decode(desc);
  return {
    url,
    headline: decode(title),
    summary: s ? (s.length > SUMMARY_MAX ? `${s.slice(0, SUMMARY_MAX)}…` : s) : null,
    publishedAt: Number.isNaN(when.getTime()) ? new Date() : when,
  };
}

/**
 * 제목·요약에 나온 시도 이름으로 지역 결정. 제목에 나오면 2점, 요약에 나오면 1점, 가장 높은 곳.
 * '경기'(경기 침체), '세종'(세종대왕), '광주'(경기 광주)처럼 헷갈리는 이름은 더 긴 표현만 인정.
 */
const REGION_WORDS: Record<string, string[]> = {
  "11": ["서울"],
  "21": ["부산"],
  "22": ["대구"],
  "23": ["인천"],
  "24": ["광주광역시", "광주시", "광주시장", "광주 광산", "광주 북구", "광주 서구", "광주 남구", "광주 동구"],
  "25": ["대전"],
  "26": ["울산"],
  "29": ["세종시", "세종특별자치시"],
  "31": ["경기도", "경기지사", "경기도지사", "경기도의회", "경기 남부", "경기 북부"],
  "32": ["강원"],
  "33": ["충북", "충청북도"],
  "34": ["충남", "충청남도"],
  "35": ["전북", "전라북도"],
  "36": ["전남", "전라남도"],
  "37": ["경북", "경상북도"],
  "38": ["경남", "경상남도"],
  "39": ["제주"],
};

export function detectRegion(headline: string, summary: string | null): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const [code, words] of Object.entries(REGION_WORDS)) {
    const score = words.reduce(
      (n, w) => n + (headline.includes(w) ? 2 : 0) + (summary?.includes(w) ? 1 : 0),
      0,
    );
    if (score > bestScore) [best, bestScore] = [code, score];
  }
  return best;
}

export async function fetchFeed(feed: Feed): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "political-michelin-collector/1.0 (student project)", Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let items = parseFeed(decodeBody(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type")));
  if (items.length === 0) throw new Error("기사 0건 (주소가 바뀌었을 수 있음)");
  if (feed.only) {
    items = items.filter((it) => it.url.includes(feed.only!));
    if (items.length === 0) throw new Error(`'${feed.only}' 기사 0건 (기사 주소 형식이 바뀌었을 수 있음)`);
  }
  return items;
}

/** EUC-KR 로 된 피드도 있어서, XML 선언이나 Content-Type 의 charset 을 보고 글자를 풂 */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const head = new TextDecoder("ascii").decode(bytes.slice(0, 200));
  const charset = (/encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? /charset=([\w-]+)/i.exec(contentType ?? "")?.[1] ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes); // 모르는 이름이면 UTF-8 로
  }
}

async function main() {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  let saved = 0;
  let okFeeds = 0;

  for (const [i, r] of results.entries()) {
    const feed = FEEDS[i];
    if (r.status === "rejected") {
      console.log(`[건너뜀] ${feed.outlet}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
      continue;
    }
    okFeeds++;
    let n = 0;
    for (const it of r.value) {
      if (it.publishedAt.getTime() < cutoff) continue;
      const res = await sql`
        insert into news (url, source, headline, summary, published_at, region_code, query)
        values (${it.url}, ${feed.outlet}, ${it.headline}, ${it.summary}, ${it.publishedAt},
                ${detectRegion(it.headline, it.summary)}, ${`rss:${feed.outlet}`})
        on conflict (url) do nothing`;
      n += res.count;
    }
    saved += n;
    console.log(`[성공] ${feed.outlet}: 피드 ${r.value.length}건 중 새 기사 ${n}건`);
  }

  console.log(`새 기사 ${saved}건 저장 (피드 ${okFeeds}/${FEEDS.length}개 성공)`);
  if (okFeeds === 0) process.exitCode = 1; // 전부 실패했을 때만 Actions 를 빨간불로
}

if (process.argv[1]?.endsWith("news.ts")) {
  main()
    .catch((e) => {
      console.error("[실패]", e.message ?? e);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
