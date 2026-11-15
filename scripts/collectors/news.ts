/**
 * 네이버 뉴스 검색 API → news_articles(기사) + news_mentions(정당·인물 언급)
 *
 *   npm run collect:news                 # 기본 검색어, 최근 24시간
 *   npm run collect:news -- 국회 법안     # 검색어 직접 지정
 *
 * 지역은 제목·요약에 나온 시도 이름으로 정함(없으면 전국 = null). 기사 본문은 저장하지 않음.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { electionCandidates, elections, members, newsArticles, newsMentions, parties } from "../../src/db/schema";
import { db, run, saveRaw } from "./common";
import { INDEPENDENT } from "./nec-parse";
import { buildDictionary, findMentions, type DictEntry } from "./mentions";
import { collectNews, type NewsArticle } from "./naver-api";
import { detectRegion } from "./region";

const DEFAULT_QUERIES = ["국회", "국회의원", "정당", "선거", "법안"];
const SINCE_HOURS = 24;

/** 네이버 API 는 언론사명을 주지 않으므로 원문 URL 의 도메인으로 출처 표시 */
function sourceOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "");
  } catch {
    return "news.naver.com";
  }
}

/** 언급 사전: 정당 + 인물(의원 → 없으면 가장 최근 국회의원 선거 당선인) */
async function loadDictionary(): Promise<{ dict: ReturnType<typeof buildDictionary>; personSource: string }> {
  const entries: DictEntry[] = [];
  for (const p of await db.select().from(parties).where(eq(parties.isActive, true))) {
    if (p.id === INDEPENDENT) continue; // '무소속'은 정당이 아님
    entries.push({ kind: "party", ref: p.id, label: p.name, terms: [p.name, ...p.aliases] });
  }

  const ms = await db.select({ monaCd: members.monaCd, name: members.name }).from(members);
  if (ms.length) {
    for (const m of ms) entries.push({ kind: "member", ref: m.monaCd, label: m.name, terms: [m.name] });
    return { dict: buildDictionary(entries), personSource: `국회의원 ${ms.length}명` };
  }

  const [latest] = await db
    .select()
    .from(elections)
    .where(eq(elections.sgTypecode, "2"))
    .orderBy(desc(elections.sgId))
    .limit(1);
  if (latest) {
    const ws = await db
      .select({ huboid: electionCandidates.huboid, name: electionCandidates.name })
      .from(electionCandidates)
      .where(
        and(
          eq(electionCandidates.sgId, latest.sgId),
          eq(electionCandidates.sgTypecode, latest.sgTypecode),
          eq(electionCandidates.isWinner, true),
        ),
      );
    for (const w of ws) {
      entries.push({ kind: "candidate", ref: `${latest.sgId}:${latest.sgTypecode}:${w.huboid}`, label: w.name, terms: [w.name] });
    }
    return { dict: buildDictionary(entries), personSource: `${latest.name} 당선인 ${ws.length}명` };
  }
  return { dict: buildDictionary(entries), personSource: "없음 (npm run collect:nec 먼저 실행)" };
}

run(async () => {
  const args = process.argv.slice(2);
  const queries = args.length ? args : DEFAULT_QUERIES;
  const since = new Date(Date.now() - SINCE_HOURS * 3600 * 1000);

  // 여러 검색어에서 같은 기사가 나오면 처음 검색어로 하나만 저장 (id 기준)
  const byId = new Map<string, NewsArticle>();
  for (const q of queries) {
    const items = await collectNews(q, { since });
    console.log(`- "${q}": ${items.length}건`);
    for (const a of items) if (!byId.has(a.id)) byId.set(a.id, a);
  }
  const articles = [...byId.values()];
  if (articles.length) await saveRaw("naver:news", { queries, sample: 3 }, articles.slice(0, 3)); // 필드 확인용 샘플만

  const { dict, personSource } = await loadDictionary();

  const rows = articles.map((a) => ({
    id: a.id,
    url: a.url,
    naverUrl: a.naverUrl,
    source: sourceOf(a.url),
    title: a.title,
    summary: a.summary || null,
    publishedAt: new Date(a.publishedAt),
    regionCode: detectRegion(a.title, a.summary),
    query: a.query,
  }));
  const mentions = articles.flatMap((a) =>
    findMentions(`${a.title} ${a.summary}`, dict).map((m) => ({ newsId: a.id, ...m })),
  );

  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      await tx
        .insert(newsArticles)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: newsArticles.id,
          set: { title: sql`excluded.title`, summary: sql`excluded.summary`, regionCode: sql`excluded.region_code` },
        });
    }
    // 사전이 바뀌었을 수 있으니 이번 기사들의 언급은 지우고 다시 계산
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 1000) {
      await tx.delete(newsMentions).where(inArray(newsMentions.newsId, ids.slice(i, i + 1000)));
    }
    for (let i = 0; i < mentions.length; i += 1000) {
      await tx.insert(newsMentions).values(mentions.slice(i, i + 1000)).onConflictDoNothing();
    }
  });

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(newsArticles);
  const withRegion = rows.filter((r) => r.regionCode).length;
  console.log(
    `✅ 기사 ${rows.length}건 저장(신규+갱신, 지역 판별 ${withRegion}건) · 언급 ${mentions.length}건 · 전체 ${total}건\n   인물 사전: ${personSource}, 표기 ${dict.size}개`,
  );
});
