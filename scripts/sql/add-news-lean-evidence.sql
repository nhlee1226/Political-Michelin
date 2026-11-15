-- 뉴스 편향 분석: news_analysis 에 lean·confidence 칸 추가 + news_evidence (편향 근거) 표 만들기 — db:push 대신 이 파일만 실행
-- src/db/schema.ts 의 newsAnalysis · newsEvidence 와 같은 정의 (drizzle-kit push 가 만든 SQL 에서 가져옴, 제약 이름도 같음).
-- 기존 데이터는 건드리지 않음: DROP 없음, 추가하는 칸은 비워 둘 수 있음. 여러 번 실행해도 안전.
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음 (권한은 Supabase 기본 권한으로 자동 부여).

ALTER TABLE "news_analysis" ADD COLUMN IF NOT EXISTS "lean" smallint;
ALTER TABLE "news_analysis" ADD COLUMN IF NOT EXISTS "confidence" text;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_analysis_lean_check') THEN
		ALTER TABLE "news_analysis" ADD CONSTRAINT "news_analysis_lean_check" CHECK ("news_analysis"."lean" between -100 and 100);
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_analysis_confidence_check') THEN
		ALTER TABLE "news_analysis" ADD CONSTRAINT "news_analysis_confidence_check" CHECK ("news_analysis"."confidence" in ('low', 'medium', 'high'));
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS "news_evidence" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"news_id" text NOT NULL,
	"type" text NOT NULL,
	"direction" text NOT NULL,
	"strength" smallint NOT NULL,
	"excerpt" text NOT NULL,
	"explanation" text NOT NULL,
	"source_url" text,
	CONSTRAINT "news_evidence_news_id_news_articles_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "news_evidence_type_check" CHECK ("news_evidence"."type" in ('quote_balance', 'wording', 'headline_gap', 'fact_check')),
	CONSTRAINT "news_evidence_direction_check" CHECK ("news_evidence"."direction" in ('progressive', 'neutral', 'conservative')),
	CONSTRAINT "news_evidence_strength_check" CHECK ("news_evidence"."strength" between 1 and 3)
);

ALTER TABLE "news_evidence" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "news_evidence_news_idx" ON "news_evidence" USING btree ("news_id");
