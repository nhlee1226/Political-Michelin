# 정치 미슐랭 — 메인 대시보드 (Next.js App Router)

다크 글래스모피즘 + 네온 라임/시안 액센트 대시보드. 모든 정당·인물·수치는 **가상 Mock 데이터**입니다.

## 실행
```bash
npm install
npm run dev     # http://localhost:3000
```
Node 20+ 권장. 스택: Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · lucide-react · Recharts · Framer Motion

## 폴더 구조
```
src/
├─ app/                     layout.tsx · page.tsx · globals.css (디자인 토큰)
├─ components/
│  ├─ ui/primitives.tsx     shadcn 스타일 Card/Badge/Switch/Segmented/Stars
│  └─ dashboard/
│     ├─ political-michelin-dashboard.tsx  페이지 루트 (탭·AI모드·선택지역 상태)
│     ├─ header.tsx / sliding-tabs.tsx     헤더 + 엘라스틱 pill 탭 (영상 레퍼런스)
│     ├─ side-rail.tsx                     좌측 아이콘 레일
│     ├─ flip-counter.tsx                  스플릿 플랩 KPI 숫자
│     ├─ korea-map-card.tsx                도트 매트릭스 대한민국 지도 + 플로팅 패널
│     ├─ news-panel.tsx                    AI 뉴스 · 편향 지수 · 객관화 변환
│     ├─ glossary-text.tsx                 [[용어]] → AI 정치 용어 해설 툴팁
│     ├─ kpi-charts.tsx                    공약 이행률 · 의정활동 · 지지도 비교 · 이슈 타임라인
│     ├─ community-feed.tsx                안전한 야차판 (AI 블라인드/사실검증 태그)
│     └─ extra-cards.tsx                   편향 리포트 · 정치인 랭킹 테이블
└─ lib/
   ├─ mock-data.ts          타입 + 더미 데이터 (API 응답 스키마로 재사용)
   └─ korea-map-data.ts     scripts/gen_map.py 로 생성한 시·도 경로/도트
```

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
