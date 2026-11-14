/**
 * 뉴스 편향 분석 → news_analysis(점수) + news_evidence(근거)
 *
 *   npm run analyze:news              # 아직 분석 안 된 최신 기사 20건
 *   npm run analyze:news -- 50        # 건수 지정
 *
 * 흐름: 본문 가져오기(저장 안 함) → Claude 가 근거 추출 → 원문에 없는 근거 버림 → 규칙으로 점수 계산 → 저장
 * 분석 버전(MODEL_VERSION)이 바뀌면 예전 버전으로 분석된 기사도 다시 분석한다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { desc, eq, isNull, ne, or } from "drizzle-orm";
import { newsAnalysis, newsArticles, newsEvidence } from "../../src/db/schema";
import { db, env, run, sleep } from "../collectors/common";
import { fetchBody } from "./body";
import { extractEvidence, MODEL_VERSION } from "./claude";
import { score } from "./score";

const DEFAULT_LIMIT = 20;

run(async () => {
  env("ANTHROPIC_API_KEY");
  const limit = Number(process.argv[2]) || DEFAULT_LIMIT;

  const todo = await db
    .select({ id: newsArticles.id, url: newsArticles.url, title: newsArticles.title, summary: newsArticles.summary })
    .from(newsArticles)
    .leftJoin(newsAnalysis, eq(newsAnalysis.newsId, newsArticles.id))
    .where(or(isNull(newsAnalysis.newsId), ne(newsAnalysis.modelVersion, MODEL_VERSION)))
    .orderBy(desc(newsArticles.publishedAt))
    .limit(limit);
  console.log(`분석 대상 ${todo.length}건 (${MODEL_VERSION})`);

  const count = { done: 0, noBody: 0, unassessable: 0, failed: 0 };
  for (const a of todo) {
    const fetched = await fetchBody(a.url);
    if (!fetched.body) count.noBody++;

    let result;
    try {
      result = await extractEvidence({ title: a.title, summary: a.summary, body: fetched.body });
    } catch (e) {
      // 키 오류는 모든 기사에서 똑같이 실패하므로 바로 멈춤. 그 밖(한도·일시 오류)은 SDK 가 재시도한 뒤이므로 이 기사만 건너뜀
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw e;
      if (!(e instanceof Anthropic.APIError)) throw e;
      result = { ok: false as const, reason: `API ${e.status ?? "연결"} 오류` };
    }
    if (!result.ok) {
      count.failed++;
      console.log(`  [건너뜀] ${a.title.slice(0, 40)} — ${result.reason}`);
      continue;
    }

    const s = score(result.evidence, { assessable: result.assessable, hasBody: !!fetched.body });
    if (s.lean === null) count.unassessable++;
    const analysis = { bias: s.bias, lean: s.lean, confidence: s.confidence, biasSignals: s.signals, modelVersion: MODEL_VERSION };
    const evidence = result.evidence;

    await db.transaction(async (tx) => {
      await tx
        .insert(newsAnalysis)
        .values({ newsId: a.id, ...analysis })
        .onConflictDoUpdate({ target: newsAnalysis.newsId, set: { ...analysis, analyzedAt: new Date() } });
      await tx.delete(newsEvidence).where(eq(newsEvidence.newsId, a.id));
      if (evidence.length) await tx.insert(newsEvidence).values(evidence.map((e) => ({ newsId: a.id, ...e })));
    });
    count.done++;
    await sleep(300); // 언론사 서버·API 과호출 방지
  }

  console.log(
    `✅ 분석 ${count.done}건 저장 (판단 불가 ${count.unassessable}건, 본문 없이 제목·요약만 ${count.noBody}건) · 건너뜀 ${count.failed}건`,
  );
});
