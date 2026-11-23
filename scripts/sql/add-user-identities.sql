-- 카카오·네이버 로그인 — db:push 대신 이 파일만 실행 (npm run db:apply-social-login)
-- src/db/schema.ts 의 users(email·password_hash null 허용) · userIdentities 와 같은 정의.
-- 기존 사용자 데이터는 그대로 둠: NOT NULL 만 풀고, 새 표를 추가. 여러 번 실행해도 안전.
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음.

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "user_identities" (
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identities_provider_provider_user_id_pk" PRIMARY KEY ("provider", "provider_user_id"),
	CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

ALTER TABLE "user_identities" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "user_identities_user_idx" ON "user_identities" USING btree ("user_id");
