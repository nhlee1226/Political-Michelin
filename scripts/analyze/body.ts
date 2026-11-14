/**
 * 기사 본문 가져오기 — 분석에만 쓰고 저장하지 않는다(저작권).
 *  - robots.txt 가 막은 주소는 가져오지 않음
 *  - 실패하거나 본문이 너무 짧으면 null → 분석은 제목·요약만으로 하고 확신 정도를 '낮음'으로 제한
 * extractBody / robotsAllows 는 네트워크 없이 동작하는 순수 함수 (테스트 대상).
 */
const USER_AGENT = "PoliticalMichelinBot/0.1";
const TIMEOUT_MS = 10_000;
const MIN_BODY = 200; // 이보다 짧으면 본문 추출 실패로 봄
const MAX_BODY = 50_000; // 이보다 길면 기사 본문이 아닌 것으로 봄(목록·댓글 페이지 등)

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " ", middot: "·" };
const decodeEntities = (s: string) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** 기사 본문이 시작되는 자리로 흔히 쓰이는 표시 (없으면 문서 전체에서 찾음) */
const BODY_START = /<article[\s>]|itemprop=["']articleBody["']|id=["'](?:dic_area|articleBody|article-view-content-div|articeBody|article_body|newsct_article)["']/i;

/** HTML → 본문 글자. 문장 형태의 긴 줄만 남겨 메뉴·광고·기자 정보 줄을 걸러 냄 */
export function extractBody(html: string): string | null {
  let s = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|iframe|svg|figcaption)[\s\S]*?<\/\1>/gi, " ");
  const start = s.search(BODY_START);
  if (start >= 0) s = s.slice(start);
  const lines = decodeEntities(
    s.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 30 && /[가-힣]/.test(l) && /[.?!"”’]/.test(l))
    .filter((l) => !/무단\s*전재|재배포\s*금지|저작권자|Copyright|구독|제보/i.test(l));
  const body = [...new Set(lines)].join("\n");
  return body.length >= MIN_BODY && body.length <= MAX_BODY ? body : null;
}

/** robots.txt 내용으로 path 접근 가능 여부 판단 ('*' 와 우리 봇 이름 그룹의 Disallow 만 봄) */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  let applies = false;
  let inAgents = false; // User-agent 줄이 이어지는 동안은 같은 그룹
  const disallow: string[] = [];
  const allow: string[] = [];
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      const mine = value === "*" || USER_AGENT.toLowerCase().startsWith(value.toLowerCase());
      applies = inAgents ? applies || mine : mine;
      inAgents = true;
      continue;
    }
    inAgents = false;
    if (!applies || !value) continue;
    if (key === "disallow") disallow.push(value);
    if (key === "allow") allow.push(value);
  }
  const hit = (rules: string[]) =>
    Math.max(-1, ...rules.filter((r) => path.startsWith(r.replace(/\*.*$/, ""))).map((r) => r.length));
  return hit(allow) >= hit(disallow);
}

const robotsCache = new Map<string, string | null>();

async function get(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function allowedByRobots(u: URL): Promise<boolean> {
  if (!robotsCache.has(u.origin)) {
    const res = await get(`${u.origin}/robots.txt`);
    robotsCache.set(u.origin, res ? await res.text() : null);
  }
  const txt = robotsCache.get(u.origin);
  return txt ? robotsAllows(txt, u.pathname) : true; // robots.txt 가 없으면 제한 없음
}

/** 응답의 글자 인코딩(EUC-KR 사이트가 아직 있음)을 헤더·meta 에서 찾아 풀기 */
function decode(buf: ArrayBuffer, contentType: string | null): string {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 2048));
  const charset = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ?? /charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

export type BodyResult = { body: string; reason?: undefined } | { body: null; reason: "robots" | "fetch" | "extract" };

export async function fetchBody(url: string): Promise<BodyResult> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { body: null, reason: "fetch" };
  }
  if (!(await allowedByRobots(u))) return { body: null, reason: "robots" };
  const res = await get(url);
  if (!res || !/html/i.test(res.headers.get("content-type") ?? "html")) return { body: null, reason: "fetch" };
  const body = extractBody(decode(await res.arrayBuffer(), res.headers.get("content-type")));
  return body ? { body } : { body: null, reason: "extract" };
}
