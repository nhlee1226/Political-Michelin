/** 실데이터(DB)에서 오는 화면용 타입. mock-data.ts 의 타입과 같이 씀 */

/** 현역 의원 한 명 (열린국회정보 연동 전에는 선관위 당선인으로 대신) */
export interface ElectedMember {
  id: string; // mona_cd 또는 '<sgId>:<sgTypecode>:<huboid>'
  name: string;
  partyName: string | null;
  partyColor: string;
  regionCode: string | null;
  district: string | null;
  term: number | null; // 선수 (선관위 데이터에는 없음)
  billsProposed: number | null; // 대표 발의 (열린국회정보 연동 후)
  votes: number | null; // 득표수 (선관위)
  voteRate: number | null; // 득표율 % (선관위)
  source: "assembly" | "nec";
}

/** 지금 화면에 실데이터가 들어온 항목 (없으면 그 항목은 mock 으로 표시) */
export interface DataSources {
  db: boolean;
  news: boolean; // 네이버 뉴스 기사가 1건 이상
  regionHeat: boolean; // 지역 판별된 최근 24시간 기사가 1건 이상
  election: string | null; // 의석·투표율·당선인 출처 선거 이름
  members: "assembly" | "nec" | null; // 정치인 표 출처
}

export interface ElectionCandidateResult {
  huboid: string;
  name: string;
  partyName: string | null;
  partyColor: string;
  giho: string | null;
  votes: number | null;
  voteRate: number | null;
  isWinner: boolean;
}

export interface DistrictResult {
  sggName: string;
  electors: number | null;
  voters: number | null;
  candidates: ElectionCandidateResult[];
}
