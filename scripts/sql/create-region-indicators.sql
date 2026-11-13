-- region_indicators (KOSIS 시도별 지역 지표) 표 만들기 — db:push 대신 이 파일만 실행
-- src/db/schema.ts 의 regionIndicators 와 같은 정의 (drizzle-kit export 결과에서 가져옴, 제약 이름도 같음).
-- 기존 표는 건드리지 않음: DROP·기존 표 ALTER 없음. 여러 번 실행해도 안전(IF NOT EXISTS).
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음 (권한은 Supabase 기본 권한으로 자동 부여).

CREATE TABLE IF NOT EXISTS "region_indicators" (
	"region_code" char(2) NOT NULL,
	"indicator" text NOT NULL,
	"year" smallint NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"source_org_id" text NOT NULL,
	"source_tbl_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "region_indicators_region_code_indicator_year_pk" PRIMARY KEY("region_code","indicator","year"),
	CONSTRAINT "region_indicators_region_code_regions_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action
);

ALTER TABLE "region_indicators" ENABLE ROW LEVEL SECURITY;
