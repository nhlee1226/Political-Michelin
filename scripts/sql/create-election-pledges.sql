-- election_pledges (선거공약) 표 만들기 — db:push 대신 이 파일만 실행
-- src/db/schema.ts 의 electionPledges 와 같은 정의 (drizzle-kit export 결과에서 가져옴, 제약 이름도 같음).
-- 기존 표는 건드리지 않음: DROP·기존 표 ALTER 없음. 여러 번 실행해도 안전(IF NOT EXISTS).
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음 (권한은 Supabase 기본 권한으로 자동 부여).

CREATE TABLE IF NOT EXISTS "election_pledges" (
	"sg_id" text NOT NULL,
	"sg_typecode" text NOT NULL,
	"huboid" text NOT NULL,
	"pledge_no" smallint NOT NULL,
	"realm" text,
	"title" text,
	"content" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "election_pledges_sg_id_sg_typecode_huboid_pledge_no_pk" PRIMARY KEY("sg_id","sg_typecode","huboid","pledge_no"),
	CONSTRAINT "election_pledges_candidate_fk" FOREIGN KEY ("sg_id","sg_typecode","huboid") REFERENCES "public"."election_candidates"("sg_id","sg_typecode","huboid") ON DELETE no action ON UPDATE no action
);

ALTER TABLE "election_pledges" ENABLE ROW LEVEL SECURITY;
