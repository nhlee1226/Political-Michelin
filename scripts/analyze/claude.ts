/**
 * Claude API 로 기사에서 "편향 근거"만 뽑는다. 점수는 여기서 매기지 않음(score.ts 가 계산).
 *  - 언론사 이름은 넘기지 않는다 → 언론사 평판이 아니라 글 자체로 판단하게.
 *  - 근거의 excerpt 는 원문에 그대로 있는 문장이어야 하고, 없으면 keepGrounded 가 버린다.
 * 환경변수: ANTHROPIC_API_KEY (.env.local / GitHub Secrets)
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { keepGrounded, type Evidence } from "./score";

/**
 * 기본 모델: Sonnet 5.5 (건당 약 $0.01~0.02). 바꾸려면 ANALYZE_MODEL 환경변수.
 * 2026-11-15 비교: Haiku 5.5 는 건당 약 $0.0006 으로 싸지만 근거 설명과 방향(진보/보수 쪽)을 거꾸로 붙이는
 * 오류가 v3 프롬프트에서도 남았고, Sonnet 5.5 는 같은 기사에서 방향이 설명과 모두 맞았음. Opus 5.5 는 건당 약 $0.045.
 */
export const MODEL = process.env.ANALYZE_MODEL?.trim() || "claude-sonnet-5-5";
/**
 * PROMPT 를 바꾸면 뒤 번호를 올린다 → 그 기사들을 다시 분석
 * v3: 방향을 진보/보수로 바로 고르게 하지 않고 '어느 정당 쪽에 유리한가'를 설명 뒤에 고르게 함
 *     (v2 에서 Haiku 가 설명은 맞게 쓰고 방향 칸만 뒤집는 오류가 있었음)
 */
export const PROMPT_VERSION = "v3";
export const MODEL_VERSION = `${MODEL}/${PROMPT_VERSION}`;

/** 모델이 고르는 '유리한 쪽' → 저장하는 방향. 진보·보수라는 추상어 대신 정당 이름으로 묻는 편이 덜 헷갈림 */
export const FAVORS_TO_DIRECTION = {
  "민주당 계열": "progressive",
  "국민의힘 계열": "conservative",
  "어느 쪽도 아님": "neutral",
} as const;

const Output = z.object({
  assessable: z.boolean().describe("정치적 시각을 판단할 수 있는 기사인가 (정치와 무관하거나 글이 너무 짧으면 false)"),
  // 필드 순서가 생성 순서: 원문 → 설명 → 유리한 쪽 (설명을 먼저 쓰고 그에 맞춰 고르게)
  evidence: z.array(
    z.object({
      type: z.enum(["quote_balance", "wording", "headline_gap"]),
      excerpt: z.string().describe("근거가 된 원문 문장. 기사에 있는 글자 그대로, 한 문장 이내"),
      explanation: z.string().describe("왜 그렇게 봤는지 한두 문장. 일반 독자가 읽는 쉬운 말"),
      favors: z
        .enum(["민주당 계열", "국민의힘 계열", "어느 쪽도 아님"])
        .describe("이 대목 때문에 독자가 어느 정당 쪽을 더 좋게(또는 그 상대를 더 나쁘게) 보게 되는가"),
      strength: z.number().int().describe("1 약함, 2 보통, 3 강함"),
    }),
  ),
});

const PROMPT = `너는 한국 정치 기사의 서술 방식을 분석하는 도구다. 기사가 진보 진영과 보수 진영 중 어느 쪽 시각에 가깝게 쓰였는지 보여 주는 "근거"를 찾는다. 점수는 매기지 않는다. 네가 찾은 근거로 다른 프로그램이 점수를 계산하고, 독자는 "더보기"를 눌러 네 근거를 직접 읽는다. 그래서 근거 하나하나가 원문으로 확인 가능해야 한다.

찾는 근거는 세 종류다.
- quote_balance (인용 균형): 한쪽 정당·진영의 발언만 싣거나 훨씬 길게 실었는지, 반대쪽 입장을 빠뜨렸는지.
- wording (표현): 기자 자신의 문장에 한쪽에 유리하거나 불리한 가치 판단·감정 표현이 있는지. 인용한 사람의 말에 들어 있는 표현은 그 사람의 것이므로 근거가 아니다.
- headline_gap (제목·본문 차이): 제목이 본문 내용보다 한쪽으로 과장되거나 단정적인지.

각 근거마다 먼저 explanation 을 쓰고, 그 설명에 맞춰 favors 를 고른다. favors 는 그 대목 때문에 독자가 어느 정당 쪽을 더 좋게 보게 되는지(또는 그 상대 정당을 더 나쁘게 보게 되는지)다.
- 민주당 계열: 더불어민주당과 조국혁신당·진보당 등 범여권·진보 정당
- 국민의힘 계열: 국민의힘과 개혁신당 등 보수 정당
- 어느 쪽도 아님: 양쪽 입장을 고르게 다룬 대목처럼 균형을 보여 주는 근거

헷갈리기 쉬우니 이렇게 판단한다.
- 국민의힘 발언만 길게 실었다 → 국민의힘 주장이 더 크게 전달되므로 "국민의힘 계열".
- 기자가 국민의힘 발언을 "극언", "막말"처럼 깎아내리는 말로 묘사했다 → 국민의힘이 나빠 보이므로 "민주당 계열".
- 기자가 민주당의 반응을 "격앙된"처럼 감정적으로 묘사했다 → 민주당이 나빠 보이므로 "국민의힘 계열".
- 제목이 민주당의 주장만 앞세웠다 → "민주당 계열".
균형 잡힌 기사에서는 "어느 쪽도 아님" 근거를 찾는 것이 중요하다. 한쪽에 유리한 근거를 억지로 만들지 않는다.

지켜야 할 것:
- excerpt 는 주어진 기사 글에 있는 문장을 한 글자도 바꾸지 않고 옮긴다. 요약하거나 다듬은 문장은 자동으로 버려진다.
- 기사에 적힌 내용만 근거로 삼는다. 사실 여부를 네 지식으로 판정하지 않는다. 언론사나 기자의 평판도 고려하지 않는다.
- 어떤 정당에 불리한 사실을 보도했다는 것만으로는 편향이 아니다. 서술 방식(누구 말을 실었나, 어떤 말로 썼나)을 본다.
- 한국 국내 정치(한국의 정당·국회·정부·선거)를 다룬 기사만 판단한다. 미국 민주당·공화당 같은 외국 정당은 한국의 진보·보수 진영이 아니다. 외국 정치 기사는 한국 정치인의 발언이 일부 실려 있어도 그 대목에서만 근거를 찾고, 그런 대목이 없으면 assessable 을 false 로 한다.
- 지자체장의 건의나 행사 소식처럼 진영 간 쟁점이 없는 기사도 assessable 을 false 로 한다.
- 정치와 무관한 기사이거나 글이 너무 짧아 판단할 수 없으면 assessable 을 false 로 하고 evidence 를 비운다.
- 본문 끝에 다른 기사의 제목이나 광고 문구가 섞여 있을 수 있다. 이 기사 자체의 문장에서만 근거를 찾는다.
- 본문이 없고 제목과 요약만 주어지면 그 안에서 확인되는 것만 적는다.`;

export interface ArticleInput {
  title: string;
  summary: string | null;
  /** 본문을 못 구했으면 null */
  body: string | null;
}

/** 이번 호출에 든 토큰과 비용 (거절·실패한 호출도 요금이 나가므로 항상 채움) */
export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type Extraction =
  | { ok: true; assessable: boolean; evidence: Evidence[]; usage: Usage }
  | { ok: false; reason: string; usage: Usage | null };

/**
 * 100만 토큰당 달러 (Anthropic 공식 가격, 2026-10 기준). 응답의 model 로 찾음.
 * 표에 없는 모델(거절 시 대체 모델 등)은 비싼 쪽(UNKNOWN)으로 계산해 예산을 넘지 않게 함.
 */
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};
const UNKNOWN = { in: 5, out: 25 };

export function costOf(model: string, u: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }): number {
  const p = PRICE[model] ?? UNKNOWN;
  const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  return (input * p.in + u.output_tokens * p.out) / 1_000_000;
}

let client: Anthropic | undefined;

/** 모델에 보여 준 글 전체 — excerpt 가 여기 실제로 있는지 대조하는 기준 */
export const articleText = (a: ArticleInput) => [a.title, a.summary ?? "", a.body ?? ""].join("\n");

export async function extractEvidence(a: ArticleInput, model = MODEL): Promise<Extraction> {
  client ??= new Anthropic();
  const res = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Output) },
    // 안전 분류기가 요청을 거절하면 권장 대체 모델로 같은 요청을 다시 실행 (Haiku 는 지원 안 함)
    ...(model.includes("haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    system: [{ type: "text", text: PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `<제목>\n${a.title}\n</제목>\n<요약>\n${a.summary ?? "(없음)"}\n</요약>\n<본문>\n${a.body ?? "(본문을 가져오지 못함)"}\n</본문>`,
      },
    ],
  });
  const usage: Usage = {
    model: res.model,
    inputTokens: res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0),
    outputTokens: res.usage.output_tokens,
    costUsd: costOf(res.model, res.usage),
  };
  if (res.stop_reason === "refusal") return { ok: false, reason: `모델이 거절 (${res.stop_details?.category ?? "사유 없음"})`, usage };
  if (res.stop_reason === "max_tokens" || !res.parsed_output) return { ok: false, reason: `응답을 읽지 못함 (${res.stop_reason})`, usage };

  const out = res.parsed_output;
  const evidence = keepGrounded(
    out.evidence.map(({ favors, ...e }) => ({
      ...e,
      direction: FAVORS_TO_DIRECTION[favors],
      strength: Math.min(3, Math.max(1, e.strength)),
    })),
    articleText(a),
  );
  return { ok: true, assessable: out.assessable, evidence, usage };
}
