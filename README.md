# 정치 미슐랭 — 메인 대시보드 (Next.js App Router)

다크 글래스모피즘 + 네온 라임/시안 액센트 대시보드.

## 데이터 출처
| 데이터 | 출처 | 비고 |
|---|---|---|
| 뉴스 기사 | **네이버 뉴스 검색 API (실제 기사)** → PostgreSQL `news_articles` | AI 편향 분석은 아직 없음 → 화면에 "분석 전"으로 표시 |
| 지역 · 정치인 | PostgreSQL `regions` · `politicians` | 내용은 `mock-data.ts` 를 시딩한 **가상 데이터** |
| 정당 · 차트 수치 · 커뮤니티 · 일정 · 법안 · 공약 | `src/lib/mock-data.ts` | **가상 Mock 데이터** |

## 실행
Node 20+ 와 Docker Desktop 이 필요합니다. 스택: Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · PostgreSQL 17 · Drizzle ORM · lucide-react · Recharts · Framer Motion

**1. 환경변수** — 프로젝트 루트에 `.env.local` 을 만듭니다 (git 에 올라가지 않음).
```
DATABASE_URL=postgres://michelin:michelin@localhost:5432/michelin
NAVER_HUB_CLIENT_ID=발급받은_Client_ID
NAVER_HUB_CLIENT_SECRET=발급받은_Client_Secret
```
네이버 키는 NAVER API HUB 콘솔에서 발급합니다. Secret 은 서버(스크립트)에서만 쓰이고 브라우저로 전달되지 않습니다.

**2. 처음 한 번**
```bash
npm install
docker compose up -d    # PostgreSQL 실행 (재부팅 후에도 이것만 다시 실행)
npm run db:push         # 테이블 생성 (src/db/schema.ts 기준)
npm run db:seed         # 지역·정치인 가상 데이터 넣기
npm run collect:news    # 네이버 뉴스 수집
```

**3. 개발 서버**
```bash
npm run dev             # http://localhost:3000
```

## npm 명령
| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run db:push` | `schema.ts` 변경 사항을 DB 에 반영 |
| `npm run db:seed` | `mock-data.ts` 의 지역·정치인을 DB 에 다시 넣기 (기존 행 삭제 후 삽입) |
| `npm run collect:news` | 기본 검색어(국회·국회의원·정당·선거·법안)로 최근 24시간 기사 수집 |
| `npm run collect:news -- 예산 국정감사` | 검색어를 직접 지정해 수집 |

뉴스 수집은 원문 URL 해시를 키로 저장하므로 여러 번 실행해도 중복으로 쌓이지 않습니다. 화면은 요청마다 DB 를 읽으므로, 수집 후 새로고침하면 바로 반영됩니다.

## 폴더 구조
```
docker-compose.yml          로컬 PostgreSQL
drizzle.config.ts           drizzle-kit 설정 (.env.local 의 DATABASE_URL 사용)
src/
├─ app/                     layout.tsx · page.tsx (서버에서 DB 조회) · globals.css (디자인 토큰)
├─ db/
│  ├─ schema.ts             테이블 정의 (regions · politicians · news_articles)
│  ├─ index.ts              DB 연결 (서버 전용)
│  ├─ queries.ts            화면용 조회 함수 (getRegions · getLatestNews)
│  ├─ seed.ts               mock 지역·정치인 → DB
│  └─ collect-news.ts       네이버 뉴스 수집 → DB
├─ components/
│  ├─ ui/primitives.tsx     shadcn 스타일 Card/Badge/Switch/Segmented/Stars
│  └─ dashboard/
│     ├─ political-michelin-dashboard.tsx  페이지 루트 (탭·AI모드·선택지역 상태)
│     ├─ header.tsx / sliding-tabs.tsx     헤더 + 엘라스틱 pill 탭 (영상 레퍼런스)
│     ├─ side-rail.tsx                     좌측 아이콘 레일
│     ├─ flip-counter.tsx                  스플릿 플랩 KPI 숫자
│     ├─ korea-map-card.tsx                도트 매트릭스 대한민국 지도 + 플로팅 패널
│     ├─ news-panel.tsx                    실제 뉴스 목록 · 편향 지수 · 객관화 변환 (분석된 기사만)
│     ├─ glossary-text.tsx                 [[용어]] → AI 정치 용어 해설 툴팁
│     ├─ kpi-charts.tsx                    공약 이행률 · 의정활동 · 지지도 비교 · 이슈 타임라인
│     ├─ community-feed.tsx                안전한 야차판 (AI 블라인드/사실검증 태그)
│     └─ extra-cards.tsx                   편향 리포트 · 정치인 랭킹 테이블
└─ lib/
   ├─ dashboard-data.tsx    서버가 읽은 DB 데이터를 컴포넌트에 공급 (useRegions · useNews)
   ├─ naver-news.ts         네이버 뉴스 검색 API 클라이언트 (재시도 · 정규화 · 인물/정당 매칭)
   ├─ mock-data.ts          타입 + 더미 데이터
   └─ korea-map-data.ts     scripts/gen_map.py 로 생성한 시·도 경로/도트
```

## 알려진 한계
- **AI 편향 분석 미구현**: 수집 기사의 편향 지수·객관화 요약이 비어 있어 "분석 전"으로 표시되고, "편향 높음/중립" 필터에는 아직 걸리는 기사가 없습니다. 상단 "평균 편향 지수" KPI 는 아직 Mock 값입니다.
- **인물·정당 매칭**: 매칭 사전이 가상 인물·정당 이름이라 실제 기사와 거의 매칭되지 않습니다. 열린국회정보·선관위 데이터로 사전을 채워야 의미가 있습니다.
- **출처 표시**: 네이버 API 가 언론사명을 주지 않아 원문 URL 의 도메인으로 표시합니다.

## 지도 데이터 재생성
`scripts/gen_map.py` 는 southkorea-maps(KOSTAT 2013) 시·도 GeoJSON 으로 도트 좌표를 만듭니다.
```bash
curl -o skorea.json https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_provinces_geo_simple.json
python3 scripts/gen_map.py skorea.json src/lib/korea-map-data.ts
```

## 중립성 원칙
- 정당은 "정당 A/B/C/기타"로 익명 표기, 실제 정당 색(적/청 등) 미사용 (색각이상 검증 팔레트)
- 지도 도트는 정당 색이 아닌 "이슈 활성도"로만 표시
- 미슐랭 스타 산식에 정당·이념 변수 미포함
- 실제 뉴스에는 AI 분석 전까지 편향 수치를 임의로 만들어 붙이지 않음
