CREATE TABLE "bill_votes" (
	"bill_id" text NOT NULL,
	"mona_cd" text NOT NULL,
	"result" text NOT NULL,
	"vote_date" date NOT NULL,
	CONSTRAINT "bill_votes_bill_id_mona_cd_pk" PRIMARY KEY("bill_id","mona_cd"),
	CONSTRAINT "bill_votes_result_check" CHECK ("bill_votes"."result" in ('찬성', '반대', '기권', '불참'))
);
--> statement-breakpoint
ALTER TABLE "bill_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bills" (
	"bill_id" text PRIMARY KEY NOT NULL,
	"bill_no" text,
	"title" text NOT NULL,
	"unit" smallint NOT NULL,
	"proposer_mona_cd" text,
	"propose_date" date,
	"committee" text,
	"proc_result" text,
	"detail_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "election_candidates" (
	"sg_id" text NOT NULL,
	"sg_typecode" text NOT NULL,
	"huboid" text NOT NULL,
	"name" text NOT NULL,
	"hanja_name" text,
	"party_name" text,
	"giho" text,
	"gender" text,
	"birthday" text,
	"age" smallint,
	"sd_name" text NOT NULL,
	"sgg_name" text NOT NULL,
	"wiw_name" text,
	"region_code" char(2),
	"job" text,
	"edu" text,
	"career1" text,
	"career2" text,
	"status" text,
	"votes" integer,
	"vote_rate" numeric(5, 2),
	"is_winner" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "election_candidates_sg_id_sg_typecode_huboid_pk" PRIMARY KEY("sg_id","sg_typecode","huboid")
);
--> statement-breakpoint
ALTER TABLE "election_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "election_districts" (
	"sg_id" text NOT NULL,
	"sg_typecode" text NOT NULL,
	"sd_name" text NOT NULL,
	"sgg_name" text NOT NULL,
	"region_code" char(2),
	"electors" integer,
	"voters" integer,
	"valid_votes" integer,
	"invalid_votes" integer,
	"abstentions" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "election_districts_sg_id_sg_typecode_sd_name_sgg_name_pk" PRIMARY KEY("sg_id","sg_typecode","sd_name","sgg_name")
);
--> statement-breakpoint
ALTER TABLE "election_districts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "election_pledges" (
	"sg_id" text NOT NULL,
	"sg_typecode" text NOT NULL,
	"huboid" text NOT NULL,
	"pledge_no" smallint NOT NULL,
	"realm" text,
	"title" text,
	"content" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "election_pledges_sg_id_sg_typecode_huboid_pledge_no_pk" PRIMARY KEY("sg_id","sg_typecode","huboid","pledge_no")
);
--> statement-breakpoint
ALTER TABLE "election_pledges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "election_turnout" (
	"sg_id" text NOT NULL,
	"sg_typecode" text NOT NULL,
	"sd_name" text NOT NULL,
	"wiw_name" text DEFAULT '' NOT NULL,
	"region_code" char(2),
	"electors" integer NOT NULL,
	"voters" integer NOT NULL,
	"turnout" numeric(5, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "election_turnout_sg_id_sg_typecode_sd_name_wiw_name_pk" PRIMARY KEY("sg_id","sg_typecode","sd_name","wiw_name")
);
--> statement-breakpoint
ALTER TABLE "election_turnout" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "elections" (
	"sg_id" text NOT NULL,
	"sg_typecode" text NOT NULL,
	"name" text NOT NULL,
	"election_date" date NOT NULL,
	CONSTRAINT "elections_sg_id_sg_typecode_pk" PRIMARY KEY("sg_id","sg_typecode")
);
--> statement-breakpoint
ALTER TABLE "elections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "members" (
	"mona_cd" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"party_id" text,
	"region_code" char(2),
	"district" text,
	"elect_type" text,
	"term" smallint,
	"committee" text,
	"unit" smallint DEFAULT 22 NOT NULL,
	"photo_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_elect_type_check" CHECK ("members"."elect_type" in ('지역구', '비례대표'))
);
--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "news_analysis" (
	"news_id" text PRIMARY KEY NOT NULL,
	"bias" smallint,
	"bias_signals" text[] DEFAULT '{}' NOT NULL,
	"objective_headline" text,
	"objective_summary" text,
	"model_version" text NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_analysis_bias_check" CHECK ("news_analysis"."bias" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "news_analysis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"naver_url" text,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"published_at" timestamp with time zone NOT NULL,
	"region_code" char(2),
	"query" text NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_articles_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "news_articles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "news_mentions" (
	"news_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "news_mentions_news_id_kind_ref_pk" PRIMARY KEY("news_id","kind","ref"),
	CONSTRAINT "news_mentions_kind_check" CHECK ("news_mentions"."kind" in ('party', 'member', 'candidate'))
);
--> statement-breakpoint
ALTER TABLE "news_mentions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL,
	"color" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "raw_responses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "raw_responses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"params" jsonb,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raw_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "region_indicators" (
	"region_code" char(2) NOT NULL,
	"indicator" text NOT NULL,
	"year" smallint NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"source_org_id" text NOT NULL,
	"source_tbl_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "region_indicators_region_code_indicator_year_pk" PRIMARY KEY("region_code","indicator","year")
);
--> statement-breakpoint
ALTER TABLE "region_indicators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regions" (
	"code" char(2) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_polls" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "support_polls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"region_code" char(2),
	"party_id" text NOT NULL,
	"value" numeric(4, 1) NOT NULL,
	"pollster" text NOT NULL,
	"field_start" date NOT NULL,
	"field_end" date NOT NULL,
	"sample_size" integer NOT NULL,
	"margin_of_error" numeric(3, 1),
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_polls_value_check" CHECK ("support_polls"."value" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "support_polls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_bookmarks" (
	"user_id" text NOT NULL,
	"news_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_bookmarks_user_id_news_id_pk" PRIMARY KEY("user_id","news_id")
);
--> statement-breakpoint
ALTER TABLE "user_bookmarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_follows" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_user_id_kind_target_id_pk" PRIMARY KEY("user_id","kind","target_id")
);
--> statement-breakpoint
ALTER TABLE "user_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bill_votes" ADD CONSTRAINT "bill_votes_bill_id_bills_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("bill_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_votes" ADD CONSTRAINT "bill_votes_mona_cd_members_mona_cd_fk" FOREIGN KEY ("mona_cd") REFERENCES "public"."members"("mona_cd") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_proposer_mona_cd_members_mona_cd_fk" FOREIGN KEY ("proposer_mona_cd") REFERENCES "public"."members"("mona_cd") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_candidates" ADD CONSTRAINT "election_candidates_region_code_regions_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_candidates" ADD CONSTRAINT "election_candidates_election_fk" FOREIGN KEY ("sg_id","sg_typecode") REFERENCES "public"."elections"("sg_id","sg_typecode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_districts" ADD CONSTRAINT "election_districts_region_code_regions_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_districts" ADD CONSTRAINT "election_districts_election_fk" FOREIGN KEY ("sg_id","sg_typecode") REFERENCES "public"."elections"("sg_id","sg_typecode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_pledges" ADD CONSTRAINT "election_pledges_candidate_fk" FOREIGN KEY ("sg_id","sg_typecode","huboid") REFERENCES "public"."election_candidates"("sg_id","sg_typecode","huboid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_turnout" ADD CONSTRAINT "election_turnout_region_code_regions_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_turnout" ADD CONSTRAINT "election_turnout_election_fk" FOREIGN KEY ("sg_id","sg_typecode") REFERENCES "public"."elections"("sg_id","sg_typecode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_region_code_regions_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_analysis" ADD CONSTRAINT "news_analysis_news_id_news_articles_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_region_code_regions_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_mentions" ADD CONSTRAINT "news_mentions_news_id_news_articles_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_indicators" ADD CONSTRAINT "region_indicators_region_code_regions_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_polls" ADD CONSTRAINT "support_polls_region_code_regions_code_fk" FOREIGN KEY ("region_code") REFERENCES "public"."regions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_polls" ADD CONSTRAINT "support_polls_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_votes_member_idx" ON "bill_votes" USING btree ("mona_cd");--> statement-breakpoint
CREATE INDEX "bills_proposer_idx" ON "bills" USING btree ("proposer_mona_cd");--> statement-breakpoint
CREATE INDEX "election_candidates_region_idx" ON "election_candidates" USING btree ("region_code");--> statement-breakpoint
CREATE INDEX "election_candidates_district_idx" ON "election_candidates" USING btree ("sg_id","sg_typecode","sgg_name");--> statement-breakpoint
CREATE INDEX "members_region_idx" ON "members" USING btree ("region_code");--> statement-breakpoint
CREATE INDEX "members_party_idx" ON "members" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "news_articles_published_idx" ON "news_articles" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_articles_region_idx" ON "news_articles" USING btree ("region_code","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_mentions_ref_idx" ON "news_mentions" USING btree ("kind","ref");--> statement-breakpoint
CREATE INDEX "raw_responses_source_idx" ON "raw_responses" USING btree ("source","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_polls_region_idx" ON "support_polls" USING btree ("region_code","field_end" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_bookmarks_user_idx" ON "user_bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_follows_user_idx" ON "user_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");