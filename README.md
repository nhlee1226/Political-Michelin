# 정치 미슐랭 — 메인 대시보드 (Next.js App Router)

다크 글래스모피즘 + 네온 라임/시안 액센트 대시보드.

## 데이터 출처 (기준 출처 = 정답)
| 데이터 | 기준 출처 | 테이블 | 상태 |
|---|---|---|---|
| 의원·정당·소속·지역구 | 열린국회정보 | `members` · `parties` | 연동 예정 (수집기 초안 있음, 그 전까지 선관위 당선인으로 대신) |
| 후보·득표수·득표율·투표율 | 선관위 (공공데이터포털) | `elections` · `election_candidates` · `election_districts` · `election_turnout` | **연동** |
| 법안·표결 | 열린국회정보 | `bills` · `bill_votes` | 연동 예정 (법안 수집기 초안 있음) |
| 이슈·언급량·최신 동향 | 네이버 뉴스 (NAVER API HUB) | `news_articles` · `news_mentions` · `news_analysis` | **연동** (AI 편향 분석은 아직) |
| 정당 지지도 | 여론조사 원문 (수기 입력) | `support_polls` | 입력 전 |

화면은 **실데이터가 들어온 항목만 실제 값**으로 바꾸고, 나머지(정당 지지도·이슈 목록·평가 지표·커뮤니티 등)는 `mock-data.ts` 샘플로 보여줍니다. 어떤 항목이 실데이터인지는 화면 하단과 각 패널에 표기됩니다. DB 가 없어도(`DATABASE_URL` 미설정) 화면은 샘플로 뜹니다.

## 실행
Node 20+ 필요. 스택: Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · PostgreSQL(로컬 docker 또는 Supabase) · Drizzle ORM · lucide-react · Recharts · Framer Motion

**1. 환경변수** — `.env.example` 을 `.env.local` 로 복사하고 값을 채웁니다 (git 에 올라가지 않음).
- DB 는 로컬(`docker compose up -d`)과 Supabase 중 하나. **둘 다 PostgreSQL 이라 `DATABASE_URL` 만 바꾸면 됩니다.**
- 네이버 키는 NAVER API HUB 콘솔, 선관위 키는 공공데이터포털(Decoding 키)에서 발급. 키는 수집 스크립트에서만 쓰이고 브라우저로 전달되지 않습니다.

**2. 처음 한 번**
```bash
npm install
docker compose up -d     # (로컬 DB 를 쓸 때만) PostgreSQL 실행
npm run db:push          # 테이블 생성 (src/db/schema.ts 기준)
npm run db:seed          # 시도 17개 + 수집 대상 선거
npm run check:keys       # 키·DB 연결 확인
npm run collect:nec      # 선관위: 22대 총선 후보·득표·투표율 (한 번만)
npm run collect:news     # 네이버 뉴스 (선관위 다음에 돌려야 인물 언급이 잡힘)
```

**3. 개발 서버**
```bash
npm run dev              # http://localhost:3000  (1분마다 DB 를 다시 읽어 갱신)
```

> 이전 브랜치(feature/namho-work1 · feature/joala-work1)에서 만든 DB 는 스키마가 달라서 그대로 못 씁니다.
> 로컬 docker 는 `docker compose down -v` 후 다시 시작, Supabase 는 새 프로젝트(또는 기존 테이블 삭제) 후 `npm run db:push` 하세요.

## npm 명령
| 명령 | 하는 일 |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | 타입 검사 |
| `npm test` | 수집기 변환 로직 테스트 (DB·키 불필요) |
| `npm run db:push` | `schema.ts` 변경을 DB 에 반영 |
| `npm run db:studio` | 브라우저에서 DB 테이블 보기 |
| `npm run db:seed` | 시도·선거 기준 데이터 (여러 번 실행해도 안전) |
| `npm run check:keys` | DB·네이버·선관위·열린국회정보 연결 확인 (키 값은 출력 안 함) |
| `npm run collect:nec` | 선관위 → 후보·당선·득표수·득표율·선거구 합계·투표율, 정당(임시) |
| `npm run collect:news` | 네이버 뉴스 → 기사·지역 판별·정당/인물 언급 (최근 24시간) |
| `npm run collect:news -- 예산 국정감사` | 검색어 직접 지정 |
| `npm run collect:members` / `collect:bills` | 열린국회정보 (연동 예정, 키 발급 후 검증 필요) |
| `npm run collect:votes -- --limit 5` | 열린국회정보 본회의 표결 → `bill_votes` (members·bills 다음에 실행, `--limit` 은 법안 수 제한) |
| `npm run collect:local` | 선관위 → 제9회 지방선거(2026-06-03) 시·도지사·구시군장·교육감 당선인 (`elections` · `election_candidates`) |

수집은 모두 덮어쓰기(upsert)라 여러 번 실행해도 중복이 쌓이지 않습니다. 외부 API 원본은 `raw_responses` 에 남으므로, 응답 필드 이름이 다르면 원본을 보고 각 수집기의 `FIELD` 만 고치면 됩니다. 자동 수집(GitHub Actions)은 `.github/workflows/collect.yml` — 30분마다 뉴스.

## API (Next.js 라우트, 같은 서버)
| 경로 | 내용 |
|---|---|
| `GET /api/health` | DB 연결 + 테이블별 행 수 |
| `GET /api/regions` | 시도 17개: 의석·투표율(선관위) + 이슈 활성도(최근 24시간 기사 수) |
| `GET /api/regions/11` | 지역 상세: 선거구별 후보·득표수·득표율, 현역 의원, 지역 기사 |
| `GET /api/politicians?region=11` | 현역 의원 (`source`: `assembly` 또는 `nec`) |
| `GET /api/politicians/<id>` | 의원 상세 (MONA_CD 또는 `sgId:sgTypecode:huboid`) |
| `GET /api/news?region=11&limit=20` | 수집 기사 (+ AI 분석 결과가 있으면 함께) |
| `GET /api/trends?kind=party&days=7` | 정당/인물 언급량 날짜별 추이 |
| `GET /api/parties` | 정당 이름·색 |

## 폴더 구조
```
docker-compose.yml            로컬 PostgreSQL
drizzle.config.ts             drizzle-kit 설정 (.env.local 의 DATABASE_URL)
.github/workflows/collect.yml 자동 수집 (뉴스 30분마다)
scripts/
├─ seed.ts                    시도·선거 기준 데이터
├─ check-keys.ts              키·DB 연결 확인
└─ collectors/
   ├─ common.ts               .env.local 읽기 · DB 연결 · 원본 보관 · 시도명→코드
   ├─ nec.ts / nec-parse.ts   선관위 수집 / 응답→행 변환(순수 함수)
   ├─ local.ts / nec-api.ts   지방선거 당선인 수집 / 선관위 API 호출 공통 함수
   ├─ news.ts                 네이버 뉴스 수집 → 기사·언급
   ├─ naver-api.ts            네이버 뉴스 검색 API 클라이언트 (재시도 · 정규화)
   ├─ region.ts / mentions.ts 지역 판별 / 정당·인물 언급 찾기 (순수 함수)
   ├─ members.ts / bills.ts   열린국회정보 (연동 예정)
   ├─ votes.ts / votes-parse.ts 본회의 표결 수집 / 응답→행 변환(순수 함수)
   └─ collectors.test.ts      변환 로직 테스트
src/
├─ app/
│  ├─ page.tsx                서버에서 DB 조회 → 대시보드
│  └─ api/                    위 API 라우트
├─ db/
│  ├─ schema.ts               통합 스키마 (유일한 정의, 출처별 섹션)
│  ├─ client.ts / index.ts    DB 연결 (스크립트 공용 / 서버 전용)
│  └─ queries.ts              화면·API 조회 함수 (의석·투표율·활성도·언급량 계산은 여기 한 곳)
├─ components/                대시보드 UI (아래 참고)
└─ lib/
   ├─ dashboard-data.tsx      서버 데이터 → 컴포넌트 공급 (useRegions · useNews · useElectedMembers · useDataSources)
   ├─ live-types.ts           실데이터 화면 타입
   ├─ mock-data.ts            타입 + 샘플 데이터
   └─ korea-map-data.ts       scripts/gen_map.py 로 생성한 시·도 경로/도트
```

컴포넌트: `political-michelin-dashboard.tsx`(페이지 루트) · `korea-map-card.tsx`(지도 + 현역 의원/이슈 패널) · `news-panel.tsx`(기사 · 편향 지수, 선택 지역 기사 우선) · `extra-cards.tsx`(편향 리포트 · 정치인 표) · `kpi-charts.tsx` · `community-feed.tsx` · `side-rail.tsx` · `header.tsx` 등.

## 알려진 한계
- **AI 편향 분석 미구현**: `news_analysis` 가 비어 있어 기사는 "분석 전"으로 표시됩니다. 상단 "평균 편향 지수" KPI 는 샘플 값입니다.
- **선관위 개표결과 필드**: 후보별 득표수(낙선 후보 포함)는 개표결과 API 의 `hbjNN/jdNN/dugsuNN` 형식을 가정했습니다. 실제와 다르면 당선인 득표만 들어가고 수집기가 `[건너뜀]` 으로 알려 줍니다 → `raw_responses` 의 `nec:counts` 를 보고 `nec-parse.ts` 의 `FIELD` 수정.
- **열린국회정보 미연동**: 그 전까지 정치인 표·지도 프로필은 22대 총선 지역구 당선인(254명, 비례대표 제외)이고 선수·대표 발의는 "—" 입니다. 이후 재보궐·당적 변경은 반영되지 않습니다.
- **정당 약칭**: 기사 속 정당 언급은 정식 명칭만 찾습니다. 약칭은 `parties.aliases` 에 직접 넣어 주세요.
- **출처 표시**: 네이버 API 가 언론사명을 주지 않아 원문 URL 의 도메인으로 표시합니다.

## 지도 데이터 재생성
`scripts/gen_map.py` 는 southkorea-maps(KOSTAT 2013) 시·도 GeoJSON 으로 도트 좌표를 만듭니다.
```bash
curl -o skorea.json https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_provinces_geo_simple.json
python3 scripts/gen_map.py skorea.json src/lib/korea-map-data.ts
```

## 중립성 원칙
- 실제 정당명을 쓰되 색은 실제 상징색이 아닌 중립 팔레트를 의석 순으로 배정 (무소속은 회색)
- 지도 도트는 정당 색이 아닌 "이슈 활성도"로만 표시
- 정치인 표는 실데이터일 때 이름순 정렬 (정당·성향과 무관)
- 공식 데이터가 없는 지표(공약 이행률·출석률 등)는 "—" 로 표시하고 수치를 만들지 않음
- 실제 뉴스에는 AI 분석 전까지 편향 수치를 임의로 만들어 붙이지 않음
