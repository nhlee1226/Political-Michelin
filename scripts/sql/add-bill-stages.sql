-- 법안 처리 단계 날짜 열 + 국회 일정(assembly_schedule) 표 — db:push 대신 이 파일만 실행
-- src/db/schema.ts 의 bills(단계 날짜 열)·assemblySchedule 과 같은 정의. 기존 열·줄은 건드리지 않음. 여러 번 실행해도 안전(IF NOT EXISTS).
-- 법안 수집기(collect:bills)와 국회 일정 수집기(collect:schedule)가 시작할 때 이 파일을 그대로 실행하므로, 손으로 안 돌려도 첫 실행 때 생김.
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음.

ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "committee_date" date;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "cmt_present_date" date;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "cmt_proc_date" date;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "cmt_proc_result" text;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "law_submit_date" date;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "law_present_date" date;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "law_proc_date" date;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "law_proc_result" text;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "proc_date" date;

CREATE TABLE IF NOT EXISTS "assembly_schedule" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assembly_schedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sch_date" date NOT NULL,
	"sch_time" text,
	"kind" text,
	"title" text NOT NULL,
	"committee" text,
	"conf_div" text,
	"session" text,
	"degree" text,
	"host" text,
	"place" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "assembly_schedule" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "assembly_schedule_date_idx" ON "assembly_schedule" USING btree ("sch_date");
