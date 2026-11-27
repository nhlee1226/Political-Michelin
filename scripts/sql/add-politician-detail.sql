-- 정치인 상세 페이지용 열·표 — db:push 대신 이 파일만 실행해도 됨
-- src/db/schema.ts 의 members(인적사항 열)·billCosponsors·memberAttendance·memberAssets·memberFunds 와 같은 정의.
-- 의원 수집기(collect:members)·법안 수집기(collect:bills)·기록 입력(import:records)이 시작할 때 자동 실행. 여러 번 실행해도 안전(IF NOT EXISTS).
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음.

-- 열린국회정보 '국회의원 인적사항'(nwvrqwxyaytdsfvhu) 의 연락처·약력
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "hanja_name" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "eng_name" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "birth_date" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "gender" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "job_title" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "committees" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "units" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "tel" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "homepage" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "office" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "staff" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "secretary" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "secretary2" text;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "career" text;

-- 공동발의 (법안 × 의원). 대표발의자는 bills.proposer_mona_cd 에 있고 여기에는 넣지 않음
CREATE TABLE IF NOT EXISTS "bill_cosponsors" (
	"bill_id" text NOT NULL REFERENCES "bills"("bill_id") ON DELETE CASCADE,
	"mona_cd" text NOT NULL REFERENCES "members"("mona_cd") ON DELETE CASCADE,
	CONSTRAINT "bill_cosponsors_pk" PRIMARY KEY ("bill_id", "mona_cd")
);
ALTER TABLE "bill_cosponsors" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "bill_cosponsors_member_idx" ON "bill_cosponsors" USING btree ("mona_cd");

-- 출석 (본회의·위원회). 국회 공보·회의록에서 회기 단위로 입력 (공식 API 없음)
CREATE TABLE IF NOT EXISTS "member_attendance" (
	"mona_cd" text NOT NULL REFERENCES "members"("mona_cd") ON DELETE CASCADE,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"attended" integer NOT NULL,
	"total" integer NOT NULL,
	"source_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_attendance_pk" PRIMARY KEY ("mona_cd", "kind", "period"),
	CONSTRAINT "member_attendance_kind_check" CHECK ("kind" in ('본회의', '위원회'))
);
ALTER TABLE "member_attendance" ENABLE ROW LEVEL SECURITY;

-- 재산공개 (국회공직자윤리위원회 관보). 단위 천원
CREATE TABLE IF NOT EXISTS "member_assets" (
	"mona_cd" text NOT NULL REFERENCES "members"("mona_cd") ON DELETE CASCADE,
	"year" smallint NOT NULL,
	"total" bigint NOT NULL,
	"real_estate" bigint,
	"deposits" bigint,
	"securities" bigint,
	"debts" bigint,
	"source_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_assets_pk" PRIMARY KEY ("mona_cd", "year")
);
ALTER TABLE "member_assets" ENABLE ROW LEVEL SECURITY;

-- 정치자금 (선관위 정치자금 회계보고). 단위 원
CREATE TABLE IF NOT EXISTS "member_funds" (
	"mona_cd" text NOT NULL REFERENCES "members"("mona_cd") ON DELETE CASCADE,
	"year" smallint NOT NULL,
	"income" bigint NOT NULL,
	"expense" bigint NOT NULL,
	"donations" bigint,
	"source_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_funds_pk" PRIMARY KEY ("mona_cd", "year")
);
ALTER TABLE "member_funds" ENABLE ROW LEVEL SECURITY;
