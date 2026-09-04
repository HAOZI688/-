CREATE TYPE "public"."trend_coverage_status" AS ENUM('uncovered', 'partial', 'covered', 'saturated');--> statement-breakpoint
CREATE TYPE "public"."trend_status" AS ENUM('emerging', 'rising', 'stable', 'declining', 'archived');--> statement-breakpoint
CREATE TYPE "public"."attribution_type" AS ENUM('direct', 'high_confidence', 'probable', 'assisted', 'unattributed');--> statement-breakpoint
ALTER TYPE "public"."weekly_plan_item_status" ADD VALUE 'paused' BEFORE 'running';--> statement-breakpoint
CREATE TABLE "trend_scoring_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) DEFAULT 'default' NOT NULL,
	"recurrence_weight" integer DEFAULT 15 NOT NULL,
	"velocity_weight" integer DEFAULT 15 NOT NULL,
	"source_diversity_weight" integer DEFAULT 10 NOT NULL,
	"technical_significance_weight" integer DEFAULT 15 NOT NULL,
	"b2b_weight" integer DEFAULT 15 NOT NULL,
	"content_performance_weight" integer DEFAULT 10 NOT NULL,
	"conversion_weight" integer DEFAULT 10 NOT NULL,
	"knowledge_gap_weight" integer DEFAULT 10 NOT NULL,
	"tech_keywords" text DEFAULT '["agent","ai","llm","model","mcp","rpa","automation"]',
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_id" uuid NOT NULL,
	"snapshot_date" timestamp with time zone DEFAULT now() NOT NULL,
	"current_score" numeric(4, 1),
	"velocity_score" numeric(4, 1),
	"source_count" integer DEFAULT 0 NOT NULL,
	"covered_topic_count" integer DEFAULT 0 NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_id" uuid NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"source_topic_id" uuid,
	"workflow_run_id" uuid,
	"weight" numeric(4, 2),
	"evidence" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"relation" varchar(20) DEFAULT 'source' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_key" varchar(120) NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"category" varchar(80) DEFAULT 'general',
	"status" "trend_status" DEFAULT 'emerging' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_score" numeric(4, 1),
	"velocity_score" numeric(4, 1),
	"b2b_relevance" integer,
	"source_diversity" numeric(4, 1),
	"coverage_status" "trend_coverage_status" DEFAULT 'uncovered' NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb,
	"config_version" varchar(32) DEFAULT '1.0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trends_trend_key_unique" UNIQUE("trend_key")
);
--> statement-breakpoint
CREATE TABLE "account_growth_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_account_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"avg_daily_growth" numeric(6, 2),
	"median_daily_growth" numeric(6, 2),
	"std_dev" numeric(6, 2),
	"anomaly_days" integer DEFAULT 0 NOT NULL,
	"sample_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"publication_id" uuid,
	"external_post_id" uuid,
	"topic_id" uuid,
	"attributed_followers" numeric(6, 1),
	"attribution_score" numeric(4, 3),
	"attribution_type" "attribution_type" DEFAULT 'assisted' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_account_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"model_version" varchar(32) DEFAULT 'v1' NOT NULL,
	"config_version" varchar(32) DEFAULT '1.0',
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"observed_growth" integer DEFAULT 0 NOT NULL,
	"expected_growth" integer DEFAULT 0 NOT NULL,
	"incremental_growth" integer DEFAULT 0 NOT NULL,
	"unattributed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_mapping_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_type" varchar(40) DEFAULT 'xiaodouya' NOT NULL,
	"data_type" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"version" varchar(20) DEFAULT '1.0' NOT NULL,
	"column_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_columns" text DEFAULT '[]',
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(40) NOT NULL,
	"severity" varchar(10) DEFAULT 'info' NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text,
	"link" varchar(300),
	"entity_type" varchar(60),
	"entity_id" varchar(64),
	"read" integer DEFAULT 0 NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_performance_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"period" varchar(8) NOT NULL,
	"traffic_score" numeric(4, 1),
	"engagement_score" numeric(4, 1),
	"follower_score" numeric(4, 1),
	"lead_score" numeric(4, 1),
	"conversion_score" numeric(4, 1),
	"trend_score" numeric(4, 1),
	"performance_score" numeric(4, 1),
	"recommendation" varchar(40),
	"reason_codes" text[] DEFAULT '{}',
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"config_version" varchar(32) DEFAULT '1.0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD COLUMN "content_role" "content_role";--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD COLUMN "base_score" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD COLUMN "trend_adjustment" numeric(4, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD COLUMN "performance_adjustment" numeric(4, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD COLUMN "conversion_adjustment" numeric(4, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD COLUMN "knowledge_gap_adjustment" numeric(4, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD COLUMN "final_score" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD COLUMN "reason_codes" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "trend_snapshots" ADD CONSTRAINT "trend_snapshots_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_sources" ADD CONSTRAINT "trend_sources_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_sources" ADD CONSTRAINT "trend_sources_source_topic_id_topics_id_fk" FOREIGN KEY ("source_topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_sources" ADD CONSTRAINT "trend_sources_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_topics" ADD CONSTRAINT "trend_topics_trend_id_trends_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_topics" ADD CONSTRAINT "trend_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_growth_baselines" ADD CONSTRAINT "account_growth_baselines_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_run_id_attribution_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."attribution_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_external_post_id_external_posts_id_fk" FOREIGN KEY ("external_post_id") REFERENCES "public"."external_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_results" ADD CONSTRAINT "attribution_results_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_runs" ADD CONSTRAINT "attribution_runs_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_performance_scores" ADD CONSTRAINT "topic_performance_scores_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trend_snapshots_trend_idx" ON "trend_snapshots" USING btree ("trend_id");--> statement-breakpoint
CREATE INDEX "trend_snapshots_date_idx" ON "trend_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "trend_sources_trend_idx" ON "trend_sources" USING btree ("trend_id");--> statement-breakpoint
CREATE INDEX "trend_sources_topic_idx" ON "trend_sources" USING btree ("source_topic_id");--> statement-breakpoint
CREATE INDEX "trend_topics_trend_idx" ON "trend_topics" USING btree ("trend_id");--> statement-breakpoint
CREATE INDEX "trend_topics_topic_idx" ON "trend_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "trends_status_idx" ON "trends" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trends_score_idx" ON "trends" USING btree ("current_score");--> statement-breakpoint
CREATE INDEX "trends_last_seen_idx" ON "trends" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_baselines_account_period_idx" ON "account_growth_baselines" USING btree ("social_account_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "attribution_results_run_idx" ON "attribution_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "attribution_results_topic_idx" ON "attribution_results" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "attribution_runs_account_idx" ON "attribution_runs" USING btree ("social_account_id");--> statement-breakpoint
CREATE INDEX "attribution_runs_period_idx" ON "attribution_runs" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "mapping_templates_type_idx" ON "import_mapping_templates" USING btree ("data_type");--> statement-breakpoint
CREATE INDEX "mapping_templates_active_idx" ON "import_mapping_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "topic_perf_scores_topic_idx" ON "topic_performance_scores" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_perf_scores_period_idx" ON "topic_performance_scores" USING btree ("period");