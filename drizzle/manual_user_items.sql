-- user_follows · user_bookmarks 테이블 (users 테이블은 이미 존재)
-- drizzle-kit push 의 대화형 프롬프트를 우회하기 위해 직접 적용
CREATE TABLE IF NOT EXISTS "user_bookmarks" (
	"user_id" text NOT NULL,
	"news_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_bookmarks_user_id_news_id_pk" PRIMARY KEY("user_id","news_id")
);
ALTER TABLE "user_bookmarks" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "user_follows" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_user_id_kind_target_id_pk" PRIMARY KEY("user_id","kind","target_id")
);
ALTER TABLE "user_follows" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "user_bookmarks"
	DROP CONSTRAINT IF EXISTS "user_bookmarks_user_id_users_id_fk";
ALTER TABLE "user_bookmarks"
	ADD CONSTRAINT "user_bookmarks_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "user_follows"
	DROP CONSTRAINT IF EXISTS "user_follows_user_id_users_id_fk";
ALTER TABLE "user_follows"
	ADD CONSTRAINT "user_follows_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "user_bookmarks_user_idx" ON "user_bookmarks" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_follows_user_idx" ON "user_follows" USING btree ("user_id");
