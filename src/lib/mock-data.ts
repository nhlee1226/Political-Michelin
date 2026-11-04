/**
 * 정치 미슐랭 — Mock Data
 * ------------------------------------------------------------------
 * ⚠️ 중립성 원칙
 *  - 모든 정당·정치인·뉴스·댓글은 "가상(fictional)" 데이터입니다.
 *  - 정당은 '정당 A/B/C' 로만 표기하며 실제 정당 색(적/청 등)을 쓰지 않습니다.
 *  - 지역별 수치는 정당 간 우열이 한쪽으로 쏠리지 않도록 고르게 분포시켰습니다.
 *  - 실제 API(FastAPI) 연동 시 이 파일의 타입을 그대로 응답 스키마로 사용하세요.
 */

/* ───────────────────────── Types ───────────────────────── */

export type PartyId = "A" | "B" | "C" | "ETC";

export interface Party {
  id: PartyId;
  name: string;
  short: string;
  color: string; // CSS 변수 값과 동일
}

export interface Politician {
  id: string;
  name: string;
  party: PartyId;
  role: "현역 의원" | "광역단체장" | "출마 예정" | "예비 후보";
  district: string;
  term: number; // 선수
  pledgeRate: number; // 공약 이행률 (%)
  attendance: number; // 본회의 출석률 (%)
  bills: number; // 대표 발의 법안 수
  michelin: 1 | 2 | 3; // 미슐랭 스타 (의정활동 종합 평가)
}

export interface RegionIssue {
  title: string;
  category: "경제" | "교통" | "주거" | "환경" | "복지" | "교육" | "안전";
  heat: number; // 0~100 화제도
}

export interface Region {
  code: string; // KOSTAT 시도 코드
  name: string;
  short: string;
  heat: number; // 지도 도트 밝기 = 이슈 활성도 (0~100)
  turnout: number; // 직전 선거 투표율
  seats: number; // 지역구 의석 수
  support: Record<PartyId, number>; // 정당 지지도 (합 100)
  supportDelta: Record<PartyId, number>; // 전주 대비 증감(%p)
  issues: RegionIssue[];
  politicians: Politician[];
}

export interface NewsItem {
  id: string;
  source: string;
  time: string;
  category: string;
  headline: string;
  /** AI 가 재작성한 중립 헤드라인 */
  objectiveHeadline: string;
  /** 원문 요약 — [[용어]] 표기는 AI 용어 해설 툴팁으로 렌더링 */
  original: string;
  /** AI 객관화 요약문 */
  objective: string;
  bias: number; // 편향 지수 0~100 (높을수록 감정적·일방적 서술)
  biasSignals: string[]; // 감지된 편향 신호
  region?: string;
}

export interface CommunityPost {
  id: string;
  author: string;
  avatarHue: number;
  time: string;
  body: string;
  likes: number;
  replies: number;
  tag: "fact" | "blind" | "review" | "clean";
  tagDetail?: string;
}

/* ───────────────────────── Parties ───────────────────────── */

export const PARTIES: Record<PartyId, Party> = {
  A: { id: "A", name: "정당 A", short: "A", color: "#14a894" },
  B: { id: "B", name: "정당 B", short: "B", color: "#8b6fe8" },
  C: { id: "C", name: "정당 C", short: "C", color: "#b87d0f" },
  ETC: { id: "ETC", name: "기타", short: "기타", color: "#6b7280" },
};
export const PARTY_ORDER: PartyId[] = ["A", "B", "C", "ETC"];

/* ───────────────────────── Glossary (AI 정치 용어 해설) ───────────────────────── */

export const GLOSSARY: Record<string, string> = {
  필리버스터: "소수 의견을 가진 의원이 장시간 발언 등으로 안건 표결을 합법적으로 지연시키는 제도. 국회법상 '무제한 토론'으로 규정되어 있습니다.",
  패스트트랙: "'신속처리안건 지정' 제도. 재적의원 3/5 이상 찬성 시 상임위 심사 기간을 정해 두고 자동으로 본회의에 부의되도록 하는 절차입니다.",
  국정감사: "국회가 매년 정기적으로 행정부 전반의 국정 운영 실태를 점검하는 활동. 상임위원회 단위로 피감기관을 감사합니다.",
  추경: "추가경정예산의 줄임말. 이미 확정된 본예산 외에 경기 대응·재난 등 사유로 추가 편성하는 예산입니다.",
  선거구획정: "인구 변화에 맞춰 국회의원 지역구의 경계와 수를 다시 정하는 절차. 선거구획정위원회가 안을 마련합니다.",
  비례대표: "정당 득표율에 따라 의석을 배분하는 방식으로 선출된 의원. 지역구 의원과 달리 특정 지역을 대표하지 않습니다.",
  거부권: "대통령이 국회를 통과한 법률안에 이의가 있을 때 국회에 재의를 요구하는 권한(재의요구권)입니다.",
  상임위원회: "국회 본회의 전에 소관 분야 법안·예산을 심사하는 위원회. 현재 17개 상임위가 운영됩니다.",
  여론조사: "표본을 추출해 집단의 의견을 추정하는 조사. 표본 수, 응답률, 오차범위(신뢰수준 95%)를 함께 확인해야 합니다.",
};

/* ───────────────────────── Helpers ───────────────────────── */

const s = (A: number, B: number, C: number): Record<PartyId, number> => ({ A, B, C, ETC: 100 - A - B - C });
const d = (A: number, B: number, C: number): Record<PartyId, number> => ({ A, B, C, ETC: +(-(A + B + C)).toFixed(1) });

let pid = 0;
const p = (
  name: string,
  party: PartyId,
  role: Politician["role"],
  district: string,
  term: number,
  pledgeRate: number,
  attendance: number,
  bills: number,
  michelin: 1 | 2 | 3,
): Politician => ({ id: `pol-${++pid}`, name, party, role, district, term, pledgeRate, attendance, bills, michelin });

/* ───────────────────────── Regions (17개 시·도) ───────────────────────── */

export const REGIONS: Region[] = [
  {
    code: "11", name: "서울특별시", short: "서울", heat: 96, turnout: 69.3, seats: 48,
    support: s(31, 30, 18), supportDelta: d(0.8, -0.4, 0.3),
    issues: [
      { title: "노후 아파트 재건축 규제 완화 논의", category: "주거", heat: 92 },
      { title: "지하철 요금 조정안 공청회", category: "교통", heat: 81 },
      { title: "도심 녹지 확충 예산 편성", category: "환경", heat: 63 },
    ],
    politicians: [
      p("한도윤", "A", "현역 의원", "서울 중구", 3, 72, 96, 41, 3),
      p("서지안", "B", "현역 의원", "서울 마포구", 2, 68, 94, 37, 2),
      p("문채원", "C", "출마 예정", "서울 강서구", 0, 0, 0, 0, 1),
    ],
  },
  {
    code: "21", name: "부산광역시", short: "부산", heat: 78, turnout: 66.1, seats: 18,
    support: s(29, 32, 17), supportDelta: d(-0.3, 0.6, 0.2),
    issues: [
      { title: "신공항 건설 일정 재검토", category: "교통", heat: 88 },
      { title: "북항 재개발 2단계 착수", category: "경제", heat: 71 },
      { title: "해양 산업 청년 일자리 지원", category: "경제", heat: 55 },
    ],
    politicians: [
      p("강태오", "B", "현역 의원", "부산 해운대구", 2, 65, 92, 29, 2),
      p("윤하람", "A", "현역 의원", "부산 사하구", 1, 58, 97, 22, 2),
    ],
  },
  {
    code: "22", name: "대구광역시", short: "대구", heat: 62, turnout: 64.7, seats: 12,
    support: s(30, 28, 22), supportDelta: d(0.2, -0.5, 0.6),
    issues: [
      { title: "도심 군공항 이전 부지 협의", category: "안전", heat: 77 },
      { title: "광역철도 노선 확정", category: "교통", heat: 64 },
    ],
    politicians: [
      p("배선우", "C", "현역 의원", "대구 수성구", 2, 70, 95, 33, 3),
      p("조은솔", "A", "예비 후보", "대구 북구", 0, 0, 0, 0, 1),
    ],
  },
  {
    code: "23", name: "인천광역시", short: "인천", heat: 74, turnout: 65.4, seats: 14,
    support: s(32, 29, 18), supportDelta: d(0.4, 0.1, -0.3),
    issues: [
      { title: "수도권 매립지 대체부지 선정", category: "환경", heat: 85 },
      { title: "GTX 노선 연장 요구", category: "교통", heat: 70 },
    ],
    politicians: [
      p("임가온", "A", "현역 의원", "인천 연수구", 1, 61, 98, 26, 2),
      p("홍서준", "B", "현역 의원", "인천 남동구", 3, 74, 91, 44, 3),
    ],
  },
  {
    code: "24", name: "광주광역시", short: "광주", heat: 58, turnout: 68.2, seats: 8,
    support: s(30, 27, 21), supportDelta: d(-0.2, 0.3, 0.4),
    issues: [
      { title: "AI 집적단지 2단계 예산", category: "경제", heat: 73 },
      { title: "도시철도 2호선 공정률 점검", category: "교통", heat: 52 },
    ],
    politicians: [
      p("정다인", "C", "현역 의원", "광주 서구", 1, 63, 96, 24, 2),
      p("오세린", "B", "출마 예정", "광주 북구", 0, 0, 0, 0, 1),
    ],
  },
  {
    code: "25", name: "대전광역시", short: "대전", heat: 55, turnout: 66.8, seats: 7,
    support: s(28, 29, 22), supportDelta: d(0.5, -0.2, 0.1),
    issues: [
      { title: "연구개발 예산 조정 영향 점검", category: "경제", heat: 79 },
      { title: "트램 건설 사업비 증액", category: "교통", heat: 58 },
    ],
    politicians: [
      p("신유찬", "A", "현역 의원", "대전 유성구", 2, 69, 93, 31, 2),
      p("류하은", "B", "현역 의원", "대전 서구", 1, 60, 95, 19, 2),
    ],
  },
  {
    code: "26", name: "울산광역시", short: "울산", heat: 49, turnout: 67.0, seats: 6,
    support: s(29, 31, 20), supportDelta: d(0.1, 0.2, -0.4),
    issues: [
      { title: "조선업 인력 수급 대책", category: "경제", heat: 66 },
      { title: "국가산단 안전 점검 강화", category: "안전", heat: 54 },
    ],
    politicians: [p("차민혁", "B", "현역 의원", "울산 남구", 2, 66, 94, 27, 2)],
  },
  {
    code: "29", name: "세종특별자치시", short: "세종", heat: 61, turnout: 70.1, seats: 2,
    support: s(31, 28, 21), supportDelta: d(0.3, 0.3, -0.2),
    issues: [
      { title: "국회 세종의사당 설계 공모", category: "경제", heat: 75 },
      { title: "BRT 노선 확충", category: "교통", heat: 44 },
    ],
    politicians: [p("남궁별", "C", "현역 의원", "세종 갑", 1, 64, 97, 21, 2)],
  },
  {
    code: "31", name: "경기도", short: "경기", heat: 90, turnout: 66.5, seats: 60,
    support: s(30, 30, 19), supportDelta: d(0.2, 0.2, 0.1),
    issues: [
      { title: "1기 신도시 정비 선도지구 지정", category: "주거", heat: 89 },
      { title: "광역버스 증차 및 노선 개편", category: "교통", heat: 76 },
      { title: "반도체 클러스터 용수·전력 공급", category: "경제", heat: 72 },
    ],
    politicians: [
      p("권이현", "A", "현역 의원", "경기 성남시", 2, 71, 95, 38, 3),
      p("노지우", "B", "현역 의원", "경기 수원시", 3, 69, 92, 46, 2),
      p("황보름", "C", "현역 의원", "경기 고양시", 1, 62, 98, 25, 2),
    ],
  },
  {
    code: "32", name: "강원도", short: "강원", heat: 44, turnout: 64.2, seats: 8,
    support: s(28, 31, 19), supportDelta: d(-0.1, 0.4, 0.2),
    issues: [
      { title: "산악관광 규제 특례 시행", category: "경제", heat: 59 },
      { title: "산불 대응 헬기 확충", category: "안전", heat: 57 },
    ],
    politicians: [p("소윤재", "A", "현역 의원", "강원 춘천시", 1, 59, 96, 18, 1)],
  },
  {
    code: "33", name: "충청북도", short: "충북", heat: 41, turnout: 64.9, seats: 8,
    support: s(29, 29, 21), supportDelta: d(0.2, -0.1, 0.3),
    issues: [
      { title: "오송 바이오 단지 확장", category: "경제", heat: 56 },
      { title: "지하차도 침수 방지 시설", category: "안전", heat: 61 },
    ],
    politicians: [p("탁서윤", "B", "현역 의원", "충북 청주시", 2, 67, 93, 30, 2)],
  },
  {
    code: "34", name: "충청남도", short: "충남", heat: 46, turnout: 64.0, seats: 11,
    support: s(30, 28, 20), supportDelta: d(0.1, 0.1, 0.1),
    issues: [
      { title: "석탄화력 폐지 지역 전환 지원", category: "환경", heat: 63 },
      { title: "서해선 복선전철 개통 준비", category: "교통", heat: 49 },
    ],
    politicians: [p("편지호", "C", "현역 의원", "충남 천안시", 2, 68, 94, 32, 2)],
  },
  {
    code: "35", name: "전라북도", short: "전북", heat: 43, turnout: 66.9, seats: 10,
    support: s(29, 27, 23), supportDelta: d(0.3, -0.3, 0.2),
    issues: [
      { title: "새만금 기반시설 예산 복원", category: "경제", heat: 70 },
      { title: "공공의대 설립 논의", category: "복지", heat: 52 },
    ],
    politicians: [p("엄다온", "A", "현역 의원", "전북 전주시", 1, 60, 97, 20, 2)],
  },
  {
    code: "36", name: "전라남도", short: "전남", heat: 39, turnout: 67.4, seats: 10,
    support: s(28, 29, 22), supportDelta: d(-0.2, 0.2, 0.3),
    issues: [
      { title: "해상풍력 주민 이익공유제", category: "환경", heat: 58 },
      { title: "섬 지역 의료 접근성 개선", category: "복지", heat: 47 },
    ],
    politicians: [p("방시후", "B", "현역 의원", "전남 여수시", 2, 65, 95, 28, 2)],
  },
  {
    code: "37", name: "경상북도", short: "경북", heat: 42, turnout: 65.1, seats: 13,
    support: s(29, 30, 20), supportDelta: d(0.1, -0.2, 0.4),
    issues: [
      { title: "통합신공항 연계 교통망", category: "교통", heat: 60 },
      { title: "지방 소멸 대응 기금 배분", category: "복지", heat: 55 },
    ],
    politicians: [p("국하린", "C", "현역 의원", "경북 포항시", 1, 61, 96, 23, 2)],
  },
  {
    code: "38", name: "경상남도", short: "경남", heat: 51, turnout: 65.9, seats: 16,
    support: s(30, 29, 20), supportDelta: d(0.4, 0.0, -0.1),
    issues: [
      { title: "우주항공청 연계 산업 육성", category: "경제", heat: 68 },
      { title: "부울경 광역교통망", category: "교통", heat: 57 },
    ],
    politicians: [p("명지환", "A", "현역 의원", "경남 창원시", 2, 70, 94, 34, 3)],
  },
  {
    code: "39", name: "제주특별자치도", short: "제주", heat: 37, turnout: 63.8, seats: 3,
    support: s(28, 28, 22), supportDelta: d(0.2, 0.1, 0.2),
    issues: [
      { title: "제2공항 환경영향평가", category: "환경", heat: 66 },
      { title: "행정체제 개편 주민투표", category: "복지", heat: 48 },
    ],
    politicians: [p("고은채", "B", "현역 의원", "제주 제주시", 1, 62, 97, 17, 2)],
  },
];

export const REGION_BY_CODE: Record<string, Region> = Object.fromEntries(REGIONS.map((r) => [r.code, r]));

/* ───────────────────────── News (크롤링 뉴스 + AI 편향 분석) ───────────────────────── */

export const NEWS: NewsItem[] = [
  {
    id: "n1", source: "가온일보", time: "3분 전", category: "국회", region: "11",
    headline: "\"민생 외면한 폭주\"… 예산안 처리 두고 또다시 충돌",
    objectiveHeadline: "국회, 내년도 예산안 처리 일정 두고 이견",
    original: "여야가 예산안을 놓고 정면충돌했다. 한쪽은 [[필리버스터]]까지 거론하며 '폭주를 막겠다'고 맞섰고, 상대측은 '발목잡기'라고 비난했다.",
    objective: "국회는 내년도 예산안 처리 일정을 두고 이견을 보이고 있습니다. 일부 의원은 [[필리버스터]] 가능성을 언급했고, 양측은 각자의 처리 시한과 조정안을 제시했습니다.",
    bias: 78, biasSignals: ["감정적 수식어 '폭주'", "일방 인용 비중 72%", "갈등 프레임 헤드라인"],
  },
  {
    id: "n2", source: "누리경제", time: "12분 전", category: "경제", region: "31",
    headline: "반도체 특별법 [[상임위원회]] 통과… 본회의 표결 앞둬",
    objectiveHeadline: "반도체 특별법 [[상임위원회]] 통과… 본회의 표결 예정",
    original: "반도체 산업 지원을 골자로 한 특별법이 [[상임위원회]]를 통과했다. 업계는 환영 입장을, 노동계는 근로시간 조항에 우려를 표했다.",
    objective: "반도체 산업 지원 특별법이 [[상임위원회]]를 통과해 본회의 표결을 앞두고 있습니다. 업계와 노동계는 근로시간 조항을 두고 각각 다른 입장을 밝혔습니다.",
    bias: 18, biasSignals: ["양측 입장 균형 인용"],
  },
  {
    id: "n3", source: "바른시사", time: "26분 전", category: "선거", region: "21",
    headline: "\"이대로면 필패\"… [[선거구획정]] 앞두고 술렁이는 지역 정가",
    objectiveHeadline: "[[선거구획정]] 논의 진행 중… 일부 지역구 경계 조정 가능성",
    original: "[[선거구획정]] 결과에 따라 지역 판세가 요동칠 전망이다. 관계자는 '이대로면 필패'라며 위기감을 감추지 못했다.",
    objective: "인구 변동을 반영한 [[선거구획정]] 논의가 진행 중입니다. 획정 결과에 따라 일부 지역구의 경계가 조정될 수 있습니다.",
    bias: 61, biasSignals: ["익명 관계자 단일 인용", "예측성 단정 표현"],
  },
  {
    id: "n4", source: "한결뉴스", time: "41분 전", category: "정책",
    headline: "정부, 2차 [[추경]] 편성 검토… 규모는 미정",
    objectiveHeadline: "정부, 2차 [[추경]] 편성 검토… 규모는 미정",
    original: "정부가 경기 대응을 위한 2차 [[추경]] 편성을 검토 중인 것으로 알려졌다. 구체적 규모와 시기는 정해지지 않았다.",
    objective: "정부가 경기 대응을 위한 2차 [[추경]] 편성을 검토 중입니다. 규모와 시기는 아직 확정되지 않았습니다.",
    bias: 9, biasSignals: [],
  },
  {
    id: "n5", source: "열린매체", time: "1시간 전", category: "국회",
    headline: "\"역대 최악 [[국정감사]]\" 비판 쏟아져… 막말·파행 얼룩",
    objectiveHeadline: "올해 [[국정감사]] 일부 상임위 정회… 정책 질의 비중 54%",
    original: "올해 [[국정감사]]가 막말과 파행으로 얼룩지며 '역대 최악'이라는 혹평이 쏟아지고 있다.",
    objective: "올해 [[국정감사]]에서 일부 상임위가 정회되는 등 진행 차질이 있었습니다. 시민단체 모니터링 결과 질의 시간 대비 정책 질의 비중은 54%로 집계됐습니다.",
    bias: 84, biasSignals: ["최상급 표현 '역대 최악'", "출처 불명확한 평가", "정량 근거 부재"],
  },
];

/* ───────────────────────── Community ("안전한 야차판") ───────────────────────── */

export const COMMUNITY_SEED: CommunityPost[] = [
  { id: "c1", author: "정책덕후", avatarHue: 190, time: "방금", body: "반도체 특별법 원문 읽어봤는데 근로시간 특례 조항이 5조 2항에 있네요. 원문 링크 공유합니다.", likes: 42, replies: 8, tag: "fact", tagDetail: "국회 의안정보시스템 원문 대조 완료" },
  { id: "c2", author: "익명의시민", avatarHue: 20, time: "1분 전", body: "", likes: 0, replies: 0, tag: "blind", tagDetail: "혐오 표현 감지 (특정 집단 비하)" },
  { id: "c3", author: "데이터로말해요", avatarHue: 75, time: "3분 전", body: "지역별 투표율 데이터 보면 세종이 70.1%로 제일 높네요. 연령 구성 영향일까요?", likes: 27, replies: 5, tag: "clean" },
  { id: "c4", author: "바다사나이", avatarHue: 140, time: "5분 전", body: "신공항 예산이 전액 삭감됐다는 글 봤는데 사실인가요?", likes: 13, replies: 11, tag: "review", tagDetail: "사실 여부 검증 중 · 출처 3건 대조" },
  { id: "c5", author: "청년유권자", avatarHue: 260, time: "8분 전", body: "의원별 출석률이 이렇게 한눈에 보이니까 좋네요. 정당 상관없이 성실한 사람 뽑고 싶어요.", likes: 88, replies: 14, tag: "clean" },
];

/** 실시간 피드 시뮬레이션용 풀 */
export const COMMUNITY_POOL: Omit<CommunityPost, "id" | "time">[] = [
  { author: "행정학도", avatarHue: 210, body: "[[패스트트랙]] 지정 요건이 재적 3/5 이상이라 생각보다 문턱이 높네요.", likes: 6, replies: 1, tag: "fact", tagDetail: "국회법 제85조의2 대조 완료" },
  { author: "익명", avatarHue: 0, body: "", likes: 0, replies: 0, tag: "blind", tagDetail: "욕설·인신공격 감지" },
  { author: "동네주민", avatarHue: 100, body: "우리 지역 의원 공약 이행률 72%네요. 남은 공약은 어떤 건지 궁금합니다.", likes: 3, replies: 0, tag: "clean" },
  { author: "팩트체커", avatarHue: 170, body: "어제 돌던 '투표소 변경' 이야기는 선관위 공지와 다릅니다. 공지 원문 확인해 보세요.", likes: 19, replies: 4, tag: "fact", tagDetail: "선관위 공지 원문 대조 완료" },
  { author: "출퇴근러", avatarHue: 45, body: "광역버스 증차 계획 발표 일정이 언제인지 아시는 분?", likes: 2, replies: 2, tag: "clean" },
  { author: "익명", avatarHue: 330, body: "", likes: 0, replies: 0, tag: "blind", tagDetail: "허위 정보 반복 게시 감지" },
];

/* ───────────────────────── Charts ───────────────────────── */

/** 정당별 지지도 주간 추이 (최근 12주) — 가상 여론조사 집계 */
export const SUPPORT_TREND = [
  { week: "8/17", A: 29.4, B: 29.9, C: 19.2 },
  { week: "8/24", A: 29.8, B: 29.5, C: 19.4 },
  { week: "8/31", A: 30.1, B: 29.2, C: 19.8 },
  { week: "9/7", A: 29.6, B: 29.8, C: 20.1 },
  { week: "9/14", A: 29.2, B: 30.3, C: 20.0 },
  { week: "9/21", A: 29.5, B: 30.1, C: 19.6 },
  { week: "9/28", A: 30.2, B: 29.7, C: 19.9 },
  { week: "10/5", A: 30.6, B: 29.4, C: 19.5 },
  { week: "10/12", A: 30.0, B: 29.9, C: 20.3 },
  { week: "10/19", A: 29.7, B: 30.2, C: 20.6 },
  { week: "10/26", A: 30.1, B: 29.8, C: 20.2 },
  { week: "11/2", A: 30.4, B: 29.6, C: 20.4 },
];

/** 이슈 타임라인 — 주요 이슈 언급량 (최근 14일, 단위: 천 건) */
export const ISSUE_TIMELINE = [
  { day: "10/20", volume: 18 },
  { day: "10/21", volume: 21 },
  { day: "10/22", volume: 19, event: "국정감사 개시" },
  { day: "10/23", volume: 34 },
  { day: "10/24", volume: 41 },
  { day: "10/25", volume: 29 },
  { day: "10/26", volume: 24 },
  { day: "10/27", volume: 27 },
  { day: "10/28", volume: 38, event: "반도체 특별법 상임위 상정" },
  { day: "10/29", volume: 45 },
  { day: "10/30", volume: 36 },
  { day: "10/31", volume: 31 },
  { day: "11/1", volume: 47, event: "예산안 처리 일정 충돌" },
  { day: "11/2", volume: 52 },
];

/** 의정 활동 평가 — 300명 전체 평균 (Lawmake 지표 구조 벤치마킹) */
export const ASSEMBLY_ACTIVITY = [
  { metric: "본회의 출석률", value: 94.6, unit: "%" },
  { metric: "상임위 출석률", value: 89.2, unit: "%" },
  { metric: "표결 참여율", value: 91.8, unit: "%" },
  { metric: "법안 가결률", value: 23.4, unit: "%" },
];

/** 공약 이행 현황 — 전체 공약 대비 */
export const PLEDGE_STATUS = {
  total: 4128,
  done: 1856,
  inProgress: 1402,
  notStarted: 870,
};

/** 상단 KPI */
export const HEADLINE_KPIS = {
  trackedPoliticians: 300,
  newsAnalyzedToday: 12847,
  avgBias: 41,
};

/* ───────────────────────── Side rail (빠른 메뉴) ───────────────────────── */

export interface ScheduleItem {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  kind: "국회" | "선거" | "정책";
  place: string;
}

/** 선거·국회 일정 (가상) */
export const SCHEDULE: ScheduleItem[] = [
  { id: "s1", date: "2026-11-04", title: "예산결산특별위원회 종합정책질의", kind: "국회", place: "국회 예결위 회의장" },
  { id: "s2", date: "2026-11-06", title: "반도체 특별법 본회의 표결", kind: "국회", place: "국회 본회의장" },
  { id: "s3", date: "2026-11-12", title: "선거구획정위원회 공청회", kind: "선거", place: "중앙선거관리위원회" },
  { id: "s4", date: "2026-11-20", title: "2차 추경 편성안 발표", kind: "정책", place: "기획재정부" },
  { id: "s5", date: "2026-12-02", title: "내년도 예산안 법정 처리 시한", kind: "국회", place: "국회 본회의장" },
  { id: "s6", date: "2026-12-09", title: "정기국회 폐회", kind: "국회", place: "국회" },
];

export const BILL_STAGES = ["발의", "위원회", "본회의", "공포"] as const;

export interface Bill {
  id: string;
  title: string;
  proposer: string; // 대표 발의 (가상)
  stage: 0 | 1 | 2 | 3; // BILL_STAGES index
  updated: string;
}

/** 법안 추적 (가상) */
export const BILLS: Bill[] = [
  { id: "b1", title: "반도체산업 경쟁력 강화 특별법안", proposer: "한도윤 의원 외 12인", stage: 2, updated: "10/28 상임위 통과" },
  { id: "b2", title: "공공주택 특별법 일부개정법률안", proposer: "서지안 의원 외 10인", stage: 1, updated: "10/30 소위 회부" },
  { id: "b3", title: "지방소멸 대응 기금법 일부개정안", proposer: "국하린 의원 외 15인", stage: 1, updated: "11/1 공청회" },
  { id: "b4", title: "광역교통 개선 특별법 일부개정안", proposer: "노지우 의원 외 9인", stage: 3, updated: "10/15 공포" },
  { id: "b5", title: "해상풍력 계획입지법안", proposer: "고은채 의원 외 11인", stage: 0, updated: "11/2 발의" },
];

export interface PledgeDoc {
  id: string;
  title: string;
  owner: string;
  region: string; // region code
  category: RegionIssue["category"];
  progress: number; // 이행률 %
}

/** 공약 문서 (가상) */
export const PLEDGE_DOCS: PledgeDoc[] = [
  { id: "p1", title: "노후 주거지 정비 촉진 공약집", owner: "한도윤", region: "11", category: "주거", progress: 72 },
  { id: "p2", title: "광역버스 30분 생활권 공약", owner: "서지안", region: "31", category: "교통", progress: 58 },
  { id: "p3", title: "북항 일자리 1만 개 공약", owner: "강태오", region: "21", category: "경제", progress: 41 },
  { id: "p4", title: "섬 지역 원격의료 확대 공약", owner: "방시후", region: "36", category: "복지", progress: 35 },
  { id: "p5", title: "제주 환경보전 기금 공약", owner: "고은채", region: "39", category: "환경", progress: 62 },
];
