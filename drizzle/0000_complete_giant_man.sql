CREATE TYPE "public"."asset_status" AS ENUM('draft', 'in_review', 'needs_revision', 'ready', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('ai_weekly_script', 'short_video_script', 'wechat_article', 'github_card', 'xiaohongshu', 'sales_material', 'infographic', 'cover');--> statement-breakpoint
CREATE TYPE "public"."brand_asset_type" AS ENUM('logo', 'template', 'product_screenshot', 'background', 'cta_card', 'ui_screenshot', 'visual_reference');--> statement-breakpoint
CREATE TYPE "public"."content_role" AS ENUM('traffic', 'cognition', 'scenario', 'product', 'conversion');--> statement-breakpoint
CREATE TYPE "public"."history_dedupe_status" AS ENUM('not_checked', 'duplicate', 'related', 'confirmed_new');--> statement-breakpoint
CREATE TYPE "public"."knowledge_content_status" AS ENUM('to_research', 'to_produce', 'script_done', 'wechat_done', 'graphic_done', 'published', 'high_performing', 'needs_remake');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('uncovered', 'partial', 'basic_explanation', 'deep_explanation', 'needs_update', 'mature');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('wechat', 'douyin', 'xiaohongshu', 'bilibili', 'wechat_video');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('P0', 'P1', 'P2', 'P3');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('planned', 'ready', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."selection_basis" AS ENUM('pure_weekly_rank', 'value_filtered', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."snapshot_type" AS ENUM('original', 'replay');--> statement-breakpoint
CREATE TYPE "public"."source_consistency" AS ENUM('unverified', 'partially_verified', 'verified', 'conflict', 'needs_update');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('official', 'github', 'official_docs', 'authoritative_media', 'tech_media', 'community', 'internal');--> statement-breakpoint
CREATE TYPE "public"."topic_status" AS ENUM('draft', 'researching', 'ready_for_production', 'producing', 'review', 'needs_revision', 'ready_to_publish', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."topic_type" AS ENUM('hot', 'evergreen', 'technical_project', 'scenario', 'product', 'conversion', 'trend', 'knowledge');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'partially_verified', 'verified', 'conflict', 'needs_update');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."workflow_type" AS ENUM('orchestrator', 'ai_weekly', 'github_weekly', 'evergreen', 'wechat_deep_dive');--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"parent_topic_id" uuid,
	"source_topic_ids" uuid[] DEFAULT '{}',
	"topic_type" "topic_type" DEFAULT 'trend' NOT NULL,
	"trend_tags" text[] DEFAULT '{}',
	"b2b_relevance" integer,
	"traffic_potential" integer,
	"conversion_potential" integer,
	"timeliness" integer,
	"content_value" integer,
	"priority" "priority" DEFAULT 'P3' NOT NULL,
	"status" "topic_status" DEFAULT 'draft' NOT NULL,
	"primary_cta" text,
	"business_relevance" text,
	"history_dedupe_status" "history_dedupe_status" DEFAULT 'not_checked' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_topic_id_unique" UNIQUE("topic_id")
);
--> statement-breakpoint
CREATE TABLE "source_packet_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_packet_id" uuid NOT NULL,
	"source_name" varchar(300) NOT NULL,
	"source_url" text,
	"source_type" "source_type" DEFAULT 'tech_media' NOT NULL,
	"published_at" timestamp with time zone,
	"event_date" timestamp with time zone,
	"disclosure_date" timestamp with time zone,
	"core_facts" text,
	"key_numbers" jsonb,
	"number_test_conditions" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_packets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"consistency" "source_consistency" DEFAULT 'unverified' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"concept" varchar(200) NOT NULL,
	"category" varchar(100),
	"knowledge_status" "knowledge_status" DEFAULT 'uncovered' NOT NULL,
	"content_status" "knowledge_content_status" DEFAULT 'to_research' NOT NULL,
	"b2b_relevance" integer,
	"user_learning_cost" integer,
	"long_term_value" integer,
	"current_heat" integer,
	"upstream_concepts" text[] DEFAULT '{}',
	"related_concepts" text[] DEFAULT '{}',
	"downstream_concepts" text[] DEFAULT '{}',
	"existing_content" text,
	"next_action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_topics_topic_id_unique" UNIQUE("topic_id")
);
--> statement-breakpoint
CREATE TABLE "github_snapshot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"repository" varchar(200) NOT NULL,
	"project_name" varchar(200),
	"weekly_growth" varchar(50),
	"total_stars" bigint,
	"repo_url" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"elimination_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" varchar(32) NOT NULL,
	"snapshot_type" "snapshot_type" DEFAULT 'original' NOT NULL,
	"week" varchar(8) NOT NULL,
	"capture_time" timestamp with time zone DEFAULT now() NOT NULL,
	"selection_basis" "selection_basis" DEFAULT 'pure_weekly_rank' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_snapshots_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"output_type" varchar(64) NOT NULL,
	"label" varchar(200),
	"content" text,
	"ref_topic_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_type" "workflow_type" NOT NULL,
	"template_id" uuid,
	"topic_id" uuid,
	"batch_id" varchar(64),
	"input_payload" jsonb DEFAULT '{}'::jsonb,
	"source_packet_id" uuid,
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"output" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"task_key" varchar(64) NOT NULL,
	"label" varchar(120),
	"status" "workflow_run_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb,
	"output" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_type" "workflow_type" NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"prompt_file" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "brand_asset_type" NOT NULL,
	"file_url" text,
	"version" integer DEFAULT 1 NOT NULL,
	"usage_notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"asset_type" "asset_type" NOT NULL,
	"platform" "platform",
	"title" varchar(300) NOT NULL,
	"content" text,
	"content_role" "content_role",
	"cta" text,
	"status" "asset_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"platform" "platform",
	"metric_date" date,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"reads" bigint DEFAULT 0 NOT NULL,
	"completion_rate" numeric,
	"five_second_retention" numeric,
	"save_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"profile_visits" integer DEFAULT 0 NOT NULL,
	"cta_clicks" integer DEFAULT 0 NOT NULL,
	"dm_count" integer DEFAULT 0 NOT NULL,
	"registrations" integer DEFAULT 0 NOT NULL,
	"material_downloads" integer DEFAULT 0 NOT NULL,
	"demo_requests" integer DEFAULT 0 NOT NULL,
	"consultations" integer DEFAULT 0 NOT NULL,
	"sales_leads" integer DEFAULT 0 NOT NULL,
	"deals" integer DEFAULT 0 NOT NULL,
	"revenue" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"asset_id" uuid,
	"platform" "platform" NOT NULL,
	"scheduled_date" date,
	"published_date" timestamp with time zone,
	"published_url" text,
	"status" "publication_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_radar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar(64),
	"title" varchar(300) NOT NULL,
	"summary" text,
	"source_url" text,
	"event_date" timestamp with time zone,
	"industry_impact" text,
	"user_perception" text,
	"tech_change" text,
	"application_value" text,
	"spread_potential" text,
	"selected" boolean DEFAULT false NOT NULL,
	"elimination_reason" text,
	"promoted_topic_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_topic_id_topics_id_fk" FOREIGN KEY ("parent_topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_packet_items" ADD CONSTRAINT "source_packet_items_source_packet_id_source_packets_id_fk" FOREIGN KEY ("source_packet_id") REFERENCES "public"."source_packets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_packets" ADD CONSTRAINT "source_packets_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_topics" ADD CONSTRAINT "knowledge_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_snapshot_items" ADD CONSTRAINT "github_snapshot_items_snapshot_id_github_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."github_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_outputs" ADD CONSTRAINT "workflow_outputs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_outputs" ADD CONSTRAINT "workflow_outputs_ref_topic_id_topics_id_fk" FOREIGN KEY ("ref_topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_source_packet_id_source_packets_id_fk" FOREIGN KEY ("source_packet_id") REFERENCES "public"."source_packets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_radar_items" ADD CONSTRAINT "trend_radar_items_promoted_topic_id_topics_id_fk" FOREIGN KEY ("promoted_topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topics_status_idx" ON "topics" USING btree ("status");--> statement-breakpoint
CREATE INDEX "topics_priority_idx" ON "topics" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "topics_type_idx" ON "topics" USING btree ("topic_type");--> statement-breakpoint
CREATE INDEX "topics_parent_idx" ON "topics" USING btree ("parent_topic_id");--> statement-breakpoint
CREATE INDEX "source_packet_items_packet_idx" ON "source_packet_items" USING btree ("source_packet_id");--> statement-breakpoint
CREATE INDEX "source_packets_topic_idx" ON "source_packets" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "github_snapshot_items_snapshot_idx" ON "github_snapshot_items" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "github_snapshots_week_idx" ON "github_snapshots" USING btree ("week");--> statement-breakpoint
CREATE INDEX "workflow_runs_type_idx" ON "workflow_runs" USING btree ("workflow_type");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_runs_batch_idx" ON "workflow_runs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_topic_idx" ON "workflow_runs" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "workflow_tasks_run_idx" ON "workflow_tasks" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "content_assets_topic_idx" ON "content_assets" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "content_assets_type_idx" ON "content_assets" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "content_metrics_topic_idx" ON "content_metrics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "content_metrics_date_idx" ON "content_metrics" USING btree ("metric_date");--> statement-breakpoint
CREATE INDEX "publications_topic_idx" ON "publications" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "trend_radar_batch_idx" ON "trend_radar_items" USING btree ("batch_id");