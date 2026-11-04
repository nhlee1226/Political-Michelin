-- ============================================================
-- 정치 미슐랭 — 초기 스키마 (001_init.sql)
-- 대상: PostgreSQL 15+ (Supabase 기본)
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
-- 원칙: 화면 지표(발의 수, 표결 참여율 등)는 저장하지 않고 VIEW 로 계산한다.
--       → 계산식이 한 곳에 있어 모든 의원·정당에 같은 기준이 적용된다.
-- ============================================================

-- ---------- 기준 테이블 ----------

-- 정당: id 는 짧은 영문 코드(예: 'P01'). 화면 표기명·색은 여기서만 관리.
create table if not exists parties (
  id          text primary key,
  name        text not null,
  short       text not null,
  color       text not null,                      -- 예: '#14a894'
  is_active   boolean not null default true
);

-- 시도: 지도 GeoJSON 과 같은 2자리 코드(대시보드 mock-data 와 동일).
create table if not exists regions (
  code        char(2) primary key,
  name        text not null,
  short       text not null,
  seats       smallint,                           -- 지역구 의석 수 (선관위 데이터로 채움)
  turnout     numeric(4,1)                        -- 직전 총선 투표율(%)
);

-- 외부 원천의 지역 코드 → 우리 시도 코드 매핑 (선관위·국회 표기가 다를 때)
create table if not exists region_code_map (
  source       text not null,                     -- 'nec', 'assembly' 등
  source_value text not null,                     -- 원천의 코드 또는 지역명
  region_code  char(2) not null references regions(code),
  primary key (source, source_value)
);

-- ---------- 국회 데이터 ----------

-- 의원: 국회 Open API 의 MONA_CD 를 기본키로 사용.
create table if not exists members (
  mona_cd      text primary key,
  name         text not null,
  party_id     text references parties(id),
  region_code  char(2) references regions(code),  -- 비례대표는 NULL
  district     text,                              -- 예: '서울 종로구'
  elect_type   text check (elect_type in ('지역구','비례대표')),
  term         smallint,                          -- 선수
  committee    text,
  age          smallint not null default 22,      -- 대수
  photo_url    text,
  updated_at   timestamptz not null default now()
);
create index if not exists members_region_idx on members(region_code);
create index if not exists members_party_idx  on members(party_id);

-- 법안: BILL_ID(PRC_...) 기본키. 대표발의자만 FK 로 연결.
create table if not exists bills (
  bill_id          text primary key,
  bill_no          text,
  title            text not null,
  age              smallint not null,
  proposer_mona_cd text references members(mona_cd),
  propose_dt       date,
  committee        text,
  proc_result      text,                          -- 원안가결, 폐기, 계류 등 (원천 표기 그대로)
  detail_url       text,
  updated_at       timestamptz not null default now()
);
create index if not exists bills_proposer_idx on bills(proposer_mona_cd);

-- 의원별 표결
create table if not exists votes (
  bill_id     text not null references bills(bill_id),
  mona_cd     text not null references members(mona_cd),
  result      text not null check (result in ('찬성','반대','기권','불참')),
  vote_date   date not null,
  primary key (bill_id, mona_cd)
);
create index if not exists votes_member_idx on votes(mona_cd);

-- ---------- 뉴스 ----------

-- 본문은 저장하지 않는다(저작권). 제목·API 요약·링크만.
create table if not exists news (
  id            bigint generated always as identity primary key,
  url           text not null unique,             -- 중복 제거 키 (originallink 우선)
  source        text,                             -- 언론사명
  headline      text not null,
  summary       text,
  published_at  timestamptz not null,
  region_code   char(2) references regions(code),
  query         text,                             -- 어떤 검색어로 수집됐는지 (편중 점검용)
  fetched_at    timestamptz not null default now()
);
create index if not exists news_region_time_idx on news(region_code, published_at desc);

-- AI 분석 결과 (모델 버전별로 다시 돌릴 수 있게 분리)
create table if not exists news_analysis (
  news_id             bigint primary key references news(id) on delete cascade,
  bias                smallint check (bias between 0 and 100),
  bias_signals        text[] not null default '{}',
  objective_headline  text,
  objective_summary   text,
  model_version       text not null,
  analyzed_at         timestamptz not null default now()
);

-- ---------- 수기 입력 데이터 ----------

-- 정당 지지도: API 없음. 여론조사 발표 원문을 보고 팀이 입력. 출처 정보 필수.
create table if not exists support_polls (
  id               bigint generated always as identity primary key,
  region_code      char(2) references regions(code),  -- 전국 조사면 NULL
  party_id         text not null references parties(id),
  value            numeric(4,1) not null check (value between 0 and 100),
  pollster         text not null,                     -- 조사기관
  field_start      date not null,
  field_end        date not null,
  sample_size      integer not null,
  margin_of_error  numeric(3,1),                      -- ±%p
  source_url       text not null,
  created_at       timestamptz not null default now()
);
create index if not exists support_polls_region_idx on support_polls(region_code, field_end desc);

-- ---------- 원본 응답 보관 (디버깅·재처리) ----------
create table if not exists raw_responses (
  id          bigint generated always as identity primary key,
  source      text not null,                       -- 'assembly:nzmimeepazxkubdpn', 'naver:news' 등
  params      jsonb,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

-- ============================================================
-- VIEW: 화면 지표는 여기서 계산
-- ============================================================

-- 의원별 지표. '표결 참여율'은 본회의 표결 기록 기준이며 회의 출석률과 다르다(화면에 정의 표기).
create or replace view member_stats as
select
  m.mona_cd,
  m.name,
  m.party_id,
  m.region_code,
  m.district,
  m.term,
  (select count(*) from bills b where b.proposer_mona_cd = m.mona_cd)          as bills_proposed,
  v.total_votes,
  case when v.total_votes > 0
       then round(100.0 * v.participated / v.total_votes, 1) end              as vote_participation
from members m
left join lateral (
  select count(*)                                   as total_votes,
         count(*) filter (where result <> '불참')   as participated
  from votes where votes.mona_cd = m.mona_cd
) v on true;

-- 지역별 이슈 활성도: 최근 24시간 기사 수 → 지역 간 최댓값 대비 0~100
create or replace view region_heat as
with c as (
  select r.code,
         count(n.id) as news_24h
  from regions r
  left join news n
    on n.region_code = r.code
   and n.published_at > now() - interval '24 hours'
  group by r.code
)
select code,
       news_24h,
       case when max(news_24h) over () = 0 then 0
            else round(100.0 * news_24h / max(news_24h) over ())::int end as heat
from c;

-- 지역별 최신 지지도: 지역마다 가장 최근 조사 1건의 정당별 값
create or replace view region_support_latest as
select distinct on (region_code, party_id)
       region_code, party_id, value, pollster, field_start, field_end,
       sample_size, margin_of_error, source_url
from support_polls
order by region_code, party_id, field_end desc, id desc;

-- ============================================================
-- 보안: 프론트는 FastAPI 를 거쳐서만 읽는다.
-- RLS 를 켜고 정책을 만들지 않으면 Supabase 공개(anon) 키로는 접근 불가.
-- 백엔드는 DATABASE_URL(postgres 역할)로 직접 접속하므로 영향 없음.
-- ============================================================
alter table parties          enable row level security;
alter table regions          enable row level security;
alter table region_code_map  enable row level security;
alter table members          enable row level security;
alter table bills            enable row level security;
alter table votes            enable row level security;
alter table news             enable row level security;
alter table news_analysis    enable row level security;
alter table support_polls    enable row level security;
alter table raw_responses    enable row level security;

-- ============================================================
-- 초기 데이터: 시도 17개 (코드·이름은 대시보드 mock-data 와 동일)
-- seats / turnout 은 선관위 데이터 수집 후 채운다.
-- ============================================================
insert into regions (code, name, short) values
  ('11','서울특별시','서울'),
  ('21','부산광역시','부산'),
  ('22','대구광역시','대구'),
  ('23','인천광역시','인천'),
  ('24','광주광역시','광주'),
  ('25','대전광역시','대전'),
  ('26','울산광역시','울산'),
  ('29','세종특별자치시','세종'),
  ('31','경기도','경기'),
  ('32','강원특별자치도','강원'),
  ('33','충청북도','충북'),
  ('34','충청남도','충남'),
  ('35','전북특별자치도','전북'),
  ('36','전라남도','전남'),
  ('37','경상북도','경북'),
  ('38','경상남도','경남'),
  ('39','제주특별자치도','제주')
on conflict (code) do update set name = excluded.name, short = excluded.short;

-- 정당은 의원 수집 시 원천의 정당명을 보고 팀이 직접 등록한다(색 배정 기준을 팀 문서로 정해 둘 것).
