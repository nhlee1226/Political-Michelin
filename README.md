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
| `npm run check:keys` | DB·네이버·선관위·열린국회정보·KOSIS 연결 확인 (키 값은 출력 안 함) |
| `npm run collect:nec` | 선관위 → 후보·당선·득표수·득표율·선거구 합계·투표율, 정당(임시) |
| `npm run collect:news` | 네이버 뉴스 → 기사·지역 판별·정당/인물 언급 (최근 24시간) |
| `npm run collect:news -- 예산 국정감사` | 검색어 직접 지정 |
| `npm run collect:members` / `collect:bills` | 열린국회정보 (연동 예정, 키 발급 후 검증 필요) |
| `npm run collect:votes -- --limit 5` | 열린국회정보 본회의 표결 → `bill_votes` (members·bills 다음에 실행, `--limit` 은 법안 수 제한) |
| `npm run collect:local` | 선관위 → 제9회 지방선거(2026-06-03) 시·도지사·구시군장·교육감 당선인 (`elections` · `election_candidates`) |
| `npm run collect:pledges` | 선관위 → 지방선거 당선인 선거공약 원문 (`election_pledges`, collect:local 다음에 실행) |
| `npm run collect:kosis` | KOSIS → 시도별 주민등록인구·고령인구비율·재정자립도 (`region_indicators`, 17개 시도가 모두 있는 최신 연도) |
| `npm run auto` | **기관별 자동 수집 스케줄러** — 주기가 됐고 오늘 호출 한도가 남은 수집기만 실행 (아래 "기관별 자동 수집") |
| `npm run auto -- --dry` | 실행하지 않고 계획만 보기 (작업별 다음 예정·기관별 오늘 호출 수) |
| `npm run auto -- --job votes` / `--only kosis --force` | 작업 하나 / 기관 하나를 지금 실행 (주기 무시, 하루 한도는 지킴) |
| `npm run analyze:news` / `analyze:news -- 50` | Claude 로 뉴스 편향 근거 추출 → `news_analysis`·`news_evidence`·`api_usage` (기본 최대 15건, 예산 안에서) |

수집은 모두 덮어쓰기(upsert)라 여러 번 실행해도 중복이 쌓이지 않습니다. 외부 API 원본은 `raw_responses` 에 남으므로, 응답 필드 이름이 다르면 원본을 보고 각 수집기의 `FIELD` 만 고치면 됩니다. 자동 수집(GitHub Actions)은 두 개 — `.github/workflows/collect.yml`(30분마다 뉴스 + 편향 분석), `.github/workflows/auto-collect.yml`(매시간 기관별 자동 수집, 아래).

## 기관별 자동 수집 (`npm run auto`)
손으로 `npm run collect:*` 를 돌리지 않아도 데이터가 최신으로 유지되도록 만든 스케줄러입니다 (`scripts/auto/run.ts`).
우리가 가진 인증키(기관)마다 **성향**(데이터가 바뀌는 빠르기)과 **토큰**(인증키 하루 호출 한도)이 달라서, 수집기마다 주기와 예상 호출 수를 따로 정했습니다. 정의는 `src/lib/collect-schedule.ts` 한 곳에만 있습니다.

| 기관 (인증키) | 성향 | 하루 호출 한도 (자동 수집 몫 80%) | 작업 · 주기 |
|---|---|---|---|
| 열린국회정보 (`ASSEMBLY_API_KEY`) | 의원은 가끔, 법안은 매일, 표결은 본회의 날 | 3,000 (공개 한도 없음 → 자체 한도) | 의원·정당 하루 · 법안 하루 · 표결 하루(새로 표결된 법안만) |
| 공공데이터포털 선관위 (`DATA_GO_KR_KEY`) | 확정된 선거 결과라 거의 안 바뀜 | 10,000 (개발계정 API마다) | 총선 결과 30일 · 지방선거 당선인 30일 · 공약 30일 |
| KOSIS (`KOSIS_API_KEY`) | 1년 단위 통계 | 1,000 (공개 한도 없음, 분당 200회 → 0.3초 간격) | 시도 지표 7일 |

1. GitHub Actions 가 매시간 `npm run auto` 를 깨웁니다. GitHub 예약 실행은 늦거나 빠지는 일이 잦아서 **주기 판단은 GitHub 이 아니라 우리 코드가** 합니다.
2. 스케줄러는 `collect_log` 표에서 작업별 마지막 성공 시각과 기관별 오늘(한국 날짜) 쓴 호출 수를 읽고, 작업마다 순서대로 확인합니다: 인증키 있음 → 기관이 오늘 '한도 초과'로 답하지 않았음 → 같은 회차 앞 단계 성공 → 주기가 됨 → 오늘 남은 호출 ≥ 예상 호출.
3. 실행할 수집기는 별도 프로세스로 띄우고 "이번 최대 호출 수"를 넘겨 줍니다. 모든 기관 API 호출은 `scripts/collectors/api-fetch.ts` 를 지나가며 호출 수를 세고, 기관별 최소 간격을 지키고, 최대 호출에 닿으면 멈추고, 기관의 한도 초과 응답(공공데이터포털 코드 22, HTTP 429)을 알아챕니다.
4. 결과(성공·실패·한도 초과, 호출 수, 마지막 출력 줄)를 `collect_log` 에 한 줄씩 남기고, Actions 실행 화면 Summary 에 표로 보여 줍니다. 실패하면 2시간 뒤(주기가 더 짧으면 그 주기 뒤) 다시 시도하고, 한도 초과면 한국 자정까지 그 기관을 쉽니다.

`collect_log` 표는 스케줄러가 처음 실행될 때 `scripts/sql/add-collect-log.sql` 로 스스로 만듭니다. 현황은 `GET /api/collect-status`. 뉴스 수집·편향 분석은 `collect.yml` 이 따로 돌리며 이 스케줄러와 관계없습니다.

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
| `GET /api/collect-status` | 기관별 자동 수집 현황: 성향·하루 한도·오늘 호출 수, 작업별 주기·마지막 성공·다음 예정, 최근 실행 20줄 |

## 폴더 구조
```
docker-compose.yml            로컬 PostgreSQL
drizzle.config.ts             drizzle-kit 설정 (.env.local 의 DATABASE_URL)
.github/workflows/collect.yml 자동 수집 (뉴스 30분마다 + 편향 분석)
.github/workflows/auto-collect.yml 기관별 자동 수집 (매시간 스케줄러를 깨움)
scripts/
├─ seed.ts                    시도·선거 기준 데이터
├─ check-keys.ts              키·DB 연결 확인
├─ auto/                      기관별 자동 수집 스케줄러 (npm run auto)
│  ├─ run.ts                  때가 된 수집기만 실행 · 호출 수 기록 · 요약 표
│  ├─ log.ts                  collect_log 표 준비·기록
│  └─ auto.test.ts            주기·한도 규칙 테스트
└─ collectors/
   ├─ common.ts               .env.local 읽기 · DB 연결 · 원본 보관 · 시도명→코드
   ├─ api-fetch.ts            기관 API 호출 공통 창구 (호출 수 세기 · 간격 · 최대 호출 · 한도 초과 감지)
   ├─ nec.ts / nec-parse.ts   선관위 수집 / 응답→행 변환(순수 함수)
   ├─ local.ts / nec-api.ts   지방선거 당선인 수집 / 선관위 API 호출 공통 함수
   ├─ pledges.ts / pledges-parse.ts 선거공약 수집 / 응답→행 변환(순수 함수)
   ├─ kosis.ts / kosis-parse.ts / kosis-api.ts KOSIS 지역 지표 수집 / 연도·시도 고르기(순수 함수) / API 호출
   ├─ news.ts                 네이버 뉴스 수집 → 기사·언급
   ├─ naver-api.ts            네이버 뉴스 검색 API 클라이언트 (재시도 · 정규화)
   ├─ region.ts / mentions.ts 지역 판별 / 정당·인물 언급 찾기 (순수 함수)
   ├─ members.ts / bills.ts   열린국회정보 (연동 예정)
   ├─ votes.ts / votes-parse.ts 본회의 표결 수집 / 응답→행 변환(순수 함수)
   └─ collectors.test.ts      변환 로직 테스트
└─ analyze/                   AI 뉴스 편향 분석 (아래 "AI 편향 분석 알고리즘")
   ├─ news.ts                 실행 흐름 · 예산 확인 · 저장 · 비용/DB 용량 보고
   ├─ body.ts                 기사 본문 가져오기 (robots.txt 준수, 저장 안 함)
   ├─ claude.ts               Claude 프롬프트 · 근거 추출 · 비용 계산
   ├─ score.ts                근거 검증(keepGrounded) · 점수 공식 (순수 함수)
   ├─ budget.ts / storage.ts  예산 배분 / Supabase 잔여 용량
   └─ analyze.test.ts         테스트
src/
├─ app/
│  ├─ page.tsx                서버에서 DB 조회 → 대시보드
│  └─ api/                    위 API 라우트
├─ db/
│  ├─ schema.ts               통합 스키마 (유일한 정의, 출처별 섹션)
│  ├─ client.ts / index.ts    DB 연결 (스크립트 공용 / 서버 전용)
│  ├─ queries.ts              화면·API 조회 함수 (의석·투표율·활성도·언급량 계산은 여기 한 곳)
│  └─ collect-log.ts          자동 수집 기록 조회 (스케줄러·/api/collect-status 공용)
├─ components/                대시보드 UI (아래 참고)
└─ lib/
   ├─ collect-schedule.ts     기관·인증키별 성향·하루 한도, 작업별 주기, 실행 판단 규칙 (순수 함수)
   ├─ dashboard-data.tsx      서버 데이터 → 컴포넌트 공급 (useRegions · useNews · useElectedMembers · useDataSources)
   ├─ live-types.ts           실데이터 화면 타입
   ├─ mock-data.ts            타입 + 샘플 데이터
   └─ korea-map-data.ts       scripts/gen_map.py 로 생성한 시·도 경로/도트
```

컴포넌트: `political-michelin-dashboard.tsx`(페이지 루트) · `korea-map-card.tsx`(지도 + 현역 의원/이슈 패널) · `news-panel.tsx`(기사 · 편향 지수, 선택 지역 기사 우선) · `extra-cards.tsx`(편향 리포트 · 정치인 표) · `kpi-charts.tsx` · `community-feed.tsx` · `side-rail.tsx` · `header.tsx` 등.

## AI 편향 분석 알고리즘
**핵심 원칙: AI 는 근거만 찾고, 점수는 정해진 공식으로 계산한다.** Claude 는 숫자를 정하지 않으므로 화면의 점수와 "근거 보기"의 근거가 항상 일치합니다.

1. **기사 고르기** (`news.ts`): 제목에 정당·여야 표현(민주당·국민의힘·조국혁신당·개혁신당·진보당·여당·야당·與·野·대통령실·원내대표 등)이 있는 기사 중, 아직 분석하지 않았거나 이전 분석 버전(`모델/프롬프트 버전`)으로 분석한 기사를 최신순으로. 기사 1건마다 예산을 확인합니다 (`budget.ts`: 기간 총액 `ANALYZE_BUDGET_USD` 기본 $4.5 를 남은 날수로 나눈 하루 몫).
2. **본문 가져오기** (`body.ts`): robots.txt 를 지키고, 저작권 때문에 본문은 저장하지 않습니다. 마침표 등으로 끝나는 30자 이상 문장만 남겨 메뉴·광고·관련 기사·저작권 줄을 걸러 냅니다. 실패하면 제목·요약만으로 분석하고 확신 정도는 '낮음'.
3. **Claude 가 근거 추출** (`claude.ts`, 기본 Sonnet 5.5 · 프롬프트 v3): 언론사 이름은 넘기지 않습니다(평판이 아니라 글 자체로 판단).

   | 근거 종류 | 보는 것 |
   |---|---|
   | 인용 균형 `quote_balance` | 한쪽 발언만 싣거나 더 길게 실었는지, 반대쪽 입장을 빠뜨렸는지 |
   | 표현 `wording` | **기자 본인 문장**의 가치 판단·감정 표현 (인용된 사람의 말은 근거 아님) |
   | 제목·본문 차이 `headline_gap` | 제목이 본문보다 한쪽으로 과장·단정적인지 |

   근거마다 원문 문장 → 설명 → 유리한 쪽(민주당 계열 / 국민의힘 계열 / 어느 쪽도 아님) → 강도(1~3) 순으로 씁니다. 설명을 먼저 쓰고 방향을 정당 이름으로 고르게 한 것은 v2 에서 방향만 뒤집히는 오류가 있었기 때문입니다.
   판단 규칙: 불리한 *사실을 보도한 것*만으로는 편향이 아님(서술 방식만 봄) · 사실 여부를 AI 지식으로 판정하지 않음 · 외국 정치, 진영 쟁점이 없는 기사, 너무 짧은 기사는 '판단 불가' · 균형 근거도 찾고 치우친 근거를 억지로 만들지 않음.
4. **지어낸 근거 버리기** (`score.ts` `keepGrounded`): 근거 문장이 실제 기사(제목+요약+본문)에 글자 그대로 있어야 남깁니다 (띄어쓰기 차이만 허용, 4자 이상).
5. **점수 계산** (`score.ts` `score`):
   ```
   lean = 100 × Σ(방향 × 강도) ÷ (Σ강도 + 3)      방향: 민주당 계열 −1 · 어느 쪽도 아님 0 · 국민의힘 계열 +1
   ```
   - `lean` −100(진보 쪽) ~ +100(보수 쪽), `bias` = |lean|. 판단 불가면 둘 다 null.
   - 완충값 3: 근거가 적을 때 점수가 튀지 않게 (약한 근거 1개 → ±25, 강한 근거 4개가 모두 한쪽이어도 80).
   - '어느 쪽도 아님' 근거는 분모만 키워 점수를 0 쪽으로 당깁니다.
   - 확신 정도: 본문 없음 또는 근거 2개 미만 → 낮음, 2~3개 → 보통, 4개 이상 → 높음.
   - 예: 보수 쪽 표현(2) + 보수 쪽 인용 균형(1) + 균형 근거(1) → 100×3÷(4+3) = **+43**.
6. **화면 표시** (`news-panel.tsx`): |lean| < 15 균형(초록) · 15~39 "○○ 쪽 약간"(노랑) · 40 이상 "○○ 쪽 치우침"(빨강). 색은 정당색이 아니라 치우친 정도만 나타냅니다.

프롬프트를 바꾸면 `claude.ts` 의 `PROMPT_VERSION` 을 올립니다 → 이전 버전으로 분석된 기사가 다음 실행 때 다시 분석됩니다.

## 알려진 한계
- **AI 편향 분석 범위**: 제목에 정당·여야 표현이 있는 기사만, 예산 안에서 분석합니다. 나머지 기사는 "분석 전"으로 표시됩니다. 근거 종류 `fact_check`(사실 검증)는 점수·화면 라벨에는 있지만 프롬프트가 찾게 하지 않아 실제로는 생성되지 않습니다.
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
