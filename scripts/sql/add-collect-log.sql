-- collect_log (기관별 자동 수집 기록) 표 만들기 — db:push 대신 이 파일만 실행
-- src/db/schema.ts 의 collectLog 와 같은 정의. 기존 표는 건드리지 않음. 여러 번 실행해도 안전(IF NOT EXISTS).
-- 자동 수집 스케줄러(npm run auto)가 시작할 때 이 파일을 그대로 실행하므로, 손으로 안 돌려도 첫 실행 때 생김.
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음.

CREATE TABLE IF NOT EXISTS "collect_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collect_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"agency" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "collect_log_status_check" CHECK ("collect_log"."status" in ('running', 'ok', 'failed', 'quota'))
);

ALTER TABLE "collect_log" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "collect_log_job_idx" ON "collect_log" USING btree ("job","started_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "collect_log_agency_idx" ON "collect_log" USING btree ("agency","started_at" DESC NULLS LAST);
