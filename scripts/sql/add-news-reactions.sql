-- news_reactions (뉴스 좋아요·싫어요) 표 만들기 — db:push 대신 이 파일만 실행 (npm run db:apply-news-reactions)
-- src/db/schema.ts 의 newsReactions 와 같은 정의. 기존 표는 건드리지 않음. 여러 번 실행해도 안전(IF NOT EXISTS).
-- 보안 설정은 기존 표와 같음: RLS ON + 정책 없음.

CREATE TABLE IF NOT EXISTS "news_reactions" (
	"user_id" text NOT NULL,
	"news_id" text NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_reactions_user_id_news_id_pk" PRIMARY KEY ("user_id", "news_id"),
	CONSTRAINT "news_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "news_reactions_value_check" CHECK ("value" in (1, -1))
);

ALTER TABLE "news_reactions" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "news_reactions_news_idx" ON "news_reactions" USING btree ("news_id");
