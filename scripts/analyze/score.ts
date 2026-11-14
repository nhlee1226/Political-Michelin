/**
 * 근거 → 점수 (DB·API 없이 동작하는 순수 함수).
 * AI 는 근거만 뽑고, 점수는 항상 여기 규칙으로 계산한다 → 화면의 점수와 "더보기" 근거가 어긋나지 않음.
 */
export type EvidenceType = "quote_balance" | "wording" | "headline_gap" | "fact_check";
export type Direction = "progressive" | "neutral" | "conservative";
export type Confidence = "low" | "medium" | "high";

export interface Evidence {
  type: EvidenceType;
  direction: Direction;
  /** 1 약함 ~ 3 강함 */
  strength: number;
  /** 근거가 된 원문 문장 */
  excerpt: string;
  explanation: string;
}

export const TYPE_LABEL: Record<EvidenceType, string> = {
  quote_balance: "인용 균형",
  wording: "표현",
  headline_gap: "제목·본문 차이",
  fact_check: "사실 검증",
};

const SIGN: Record<Direction, number> = { progressive: -1, neutral: 0, conservative: 1 };
/** 근거가 적을 때 점수가 ±100 으로 튀지 않게 하는 완충값 (약한 근거 1개 → ±25) */
const DAMPING = 3;

const squash = (s: string) => s.replace(/\s+/g, "");

/** AI 가 지어낸 인용 걸러 내기: excerpt 가 실제 기사 글에 그대로 있는 근거만 남김 (띄어쓰기 차이는 허용) */
export function keepGrounded<T extends { excerpt: string }>(evidence: T[], articleText: string): T[] {
  const hay = squash(articleText);
  return evidence.filter((e) => {
    const needle = squash(e.excerpt);
    return needle.length >= 4 && hay.includes(needle);
  });
}

export interface Score {
  /** -100(진보 시각) ~ +100(보수 시각). 판단 불가면 null */
  lean: number | null;
  /** 편향 크기 0~100 (= |lean|) */
  bias: number | null;
  confidence: Confidence | null;
  /** 화면 배지용 짧은 표시 (방향이 있는 근거의 종류) */
  signals: string[];
}

/**
 * lean = 100 × (방향별 강도 합) ÷ (전체 강도 합 + 완충값)
 * 확신 정도: 본문을 못 구했으면 '낮음' 고정. 본문이 있으면 근거 4개 이상 '높음', 2개 이상 '중간', 그 밖 '낮음'.
 */
export function score(evidence: Evidence[], opts: { assessable: boolean; hasBody: boolean }): Score {
  if (!opts.assessable) return { lean: null, bias: null, confidence: null, signals: [] };
  const net = evidence.reduce((n, e) => n + SIGN[e.direction] * e.strength, 0);
  const total = evidence.reduce((n, e) => n + e.strength, 0);
  const lean = Math.round((100 * net) / (total + DAMPING)) || 0; // -0 방지
  const confidence: Confidence = !opts.hasBody || evidence.length < 2 ? "low" : evidence.length >= 4 ? "high" : "medium";
  const signals = [...new Set(evidence.filter((e) => e.direction !== "neutral").map((e) => TYPE_LABEL[e.type]))];
  return { lean, bias: Math.abs(lean), confidence, signals };
}
