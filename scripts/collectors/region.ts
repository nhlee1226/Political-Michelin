/**
 * 기사 제목·요약에 나온 시도 이름으로 지역 결정 (DB 없이 동작하는 순수 함수).
 * 제목에 나오면 2점, 요약에 나오면 1점 → 가장 높은 곳. 아무 데도 없으면 null(전국).
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
    const score = words.reduce((n, w) => n + (headline.includes(w) ? 2 : 0) + (summary?.includes(w) ? 1 : 0), 0);
    if (score > bestScore) [best, bestScore] = [code, score];
  }
  return best;
}
