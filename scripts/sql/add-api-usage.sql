-- api_usage (Claude API 호출 비용 기록) 표 만들기 — db:push 대신 이 파일만 실행
-- src/db/schema.ts 의 apiUsage 와 같은 정의. 기존 표는 건드리지 않음. 여러 번 실행해도 안전(IF NOT EXISTS).
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음.

CREATE TABLE IF NOT EXISTS "api_usage" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_usage_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"news_id" text,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "api_usage" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "api_usage_created_idx" ON "api_usage" USING btree ("created_at");
