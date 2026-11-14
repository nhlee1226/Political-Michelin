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

export const MODEL = "claude-opus-5-5";
/** 모델이나 PROMPT 를 바꾸면 뒤 번호를 올린다 → 그 기사들을 다시 분석 */
export const MODEL_VERSION = `${MODEL}/v1`;

const Output = z.object({
  assessable: z.boolean().describe("정치적 시각을 판단할 수 있는 기사인가 (정치와 무관하거나 글이 너무 짧으면 false)"),
  evidence: z.array(
    z.object({
      type: z.enum(["quote_balance", "wording", "headline_gap"]),
      direction: z.enum(["progressive", "neutral", "conservative"]),
      strength: z.number().int().describe("1 약함, 2 보통, 3 강함"),
      excerpt: z.string().describe("근거가 된 원문 문장. 기사에 있는 글자 그대로, 한 문장 이내"),
      explanation: z.string().describe("왜 그렇게 봤는지 한두 문장. 일반 독자가 읽는 쉬운 말"),
    }),
  ),
});

const PROMPT = `너는 한국 정치 기사의 서술 방식을 분석하는 도구다. 기사가 진보 진영과 보수 진영 중 어느 쪽 시각에 가깝게 쓰였는지 보여 주는 "근거"를 찾는다. 점수는 매기지 않는다. 네가 찾은 근거로 다른 프로그램이 점수를 계산하고, 독자는 "더보기"를 눌러 네 근거를 직접 읽는다. 그래서 근거 하나하나가 원문으로 확인 가능해야 한다.

찾는 근거는 세 종류다.
- quote_balance (인용 균형): 한쪽 정당·진영의 발언만 싣거나 훨씬 길게 실었는지, 반대쪽 입장을 빠뜨렸는지.
- wording (표현): 기자 자신의 문장에 한쪽에 유리하거나 불리한 가치 판단·감정 표현이 있는지. 인용한 사람의 말에 들어 있는 표현은 그 사람의 것이므로 근거가 아니다.
- headline_gap (제목·본문 차이): 제목이 본문 내용보다 한쪽으로 과장되거나 단정적인지.

direction 은 그 근거가 어느 쪽에 유리하게 작용하는지다. 진보 진영(더불어민주당 계열 등)에 유리하면 progressive, 보수 진영(국민의힘 계열 등)에 유리하면 conservative. 양쪽 입장을 고르게 다룬 대목처럼 균형을 보여 주는 근거는 neutral 로 적는다. 균형 잡힌 기사에서는 neutral 근거를 찾는 것이 중요하다. 방향 있는 근거를 억지로 만들지 않는다.

지켜야 할 것:
- excerpt 는 주어진 기사 글에 있는 문장을 한 글자도 바꾸지 않고 옮긴다. 요약하거나 다듬은 문장은 자동으로 버려진다.
- 기사에 적힌 내용만 근거로 삼는다. 사실 여부를 네 지식으로 판정하지 않는다. 언론사나 기자의 평판도 고려하지 않는다.
- 어떤 정당에 불리한 사실을 보도했다는 것만으로는 편향이 아니다. 서술 방식(누구 말을 실었나, 어떤 말로 썼나)을 본다.
- 정치와 무관한 기사이거나 글이 너무 짧아 판단할 수 없으면 assessable 을 false 로 하고 evidence 를 비운다.
- 본문이 없고 제목과 요약만 주어지면 그 안에서 확인되는 것만 적는다.`;

export interface ArticleInput {
  title: string;
  summary: string | null;
  /** 본문을 못 구했으면 null */
  body: string | null;
}

export type Extraction = { ok: true; assessable: boolean; evidence: Evidence[] } | { ok: false; reason: string };

let client: Anthropic | undefined;

/** 모델에 보여 준 글 전체 — excerpt 가 여기 실제로 있는지 대조하는 기준 */
export const articleText = (a: ArticleInput) => [a.title, a.summary ?? "", a.body ?? ""].join("\n");

export async function extractEvidence(a: ArticleInput): Promise<Extraction> {
  client ??= new Anthropic();
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Output) },
    // 안전 분류기가 요청을 거절하면 권장 대체 모델로 같은 요청을 다시 실행
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `<제목>\n${a.title}\n</제목>\n<요약>\n${a.summary ?? "(없음)"}\n</요약>\n<본문>\n${a.body ?? "(본문을 가져오지 못함)"}\n</본문>`,
      },
    ],
  });
  if (res.stop_reason === "refusal") return { ok: false, reason: `모델이 거절 (${res.stop_details?.category ?? "사유 없음"})` };
  if (res.stop_reason === "max_tokens" || !res.parsed_output) return { ok: false, reason: `응답을 읽지 못함 (${res.stop_reason})` };

  const out = res.parsed_output;
  const evidence = keepGrounded(
    out.evidence.map((e) => ({ ...e, strength: Math.min(3, Math.max(1, e.strength)) })),
    articleText(a),
  );
  return { ok: true, assessable: out.assessable, evidence };
}
