CREATE TYPE "public"."audit_action" AS ENUM('topic_create', 'topic_update', 'source_verify', 'workflow_run', 'content_update', 'publication_update', 'data_import', 'external_post_match', 'lead_create', 'system');--> statement-breakpoint
CREATE TYPE "public"."connector_status" AS ENUM('active', 'inactive', 'error');--> statement-breakpoint
CREATE TYPE "public"."connector_type" AS ENUM('xiaodouya', 'csv_import', 'manual', 'future_api');--> statement-breakpoint
CREATE TYPE "public"."conversion_event_type" AS ENUM('cta_click', 'registration', 'download', 'consultation', 'demo', 'sales_lead', 'deal');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('uploaded', 'detected', 'mapped', 'previewed', 'validated', 'importing', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."knowledge_relation_type" AS ENUM('upstream', 'related', 'downstream');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."lead_type" AS ENUM('inbound', 'outbound', 'demo', 'consultation', 'other');--> statement-breakpoint
CREATE TYPE "public"."mapping_status" AS ENUM('unmapped', 'mapped', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('unmatched', 'suggested', 'confirmed', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."prompt_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."social_account_status" AS ENUM('active', 'inactive', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."sync_type" AS ENUM('account', 'post', 'full', 'import');--> statement-breakpoint
CREATE TYPE "public"."topic_relation_type" AS ENUM('parent', 'source', 'derived', 'related');--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'kuaishou';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'other';--> statement-breakpoint
ALTER TYPE "public"."publication_status" ADD VALUE 'scheduled' BEFORE 'published';--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"email" varchar(200) NOT NULL,
	"name" varchar(200),
	"role" varchar(50) DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "knowledge_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_knowledge_topic_id" uuid NOT NULL,
	"target_knowledge_topic_id" uuid NOT NULL,
	"relation_type" "knowledge_relation_type" DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_topic_id" uuid NOT NULL,
	"target_topic_id" uuid NOT NULL,
	"relation_type" "topic_relation_type" DEFAULT 'source' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "topic_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(300) NOT NULL,
	"url" text,
	"source_type" "source_type" DEFAULT 'tech_media' NOT NULL,
	"publisher" varchar(200),
	"published_at" timestamp with time zone,
	"event_date" timestamp with time zone,
	"disclosure_date" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"change_summary" text,
	"created_by" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "platform" NOT NULL,
	"account_name" varchar(200) NOT NULL,
	"external_account_id" varchar(200),
	"avatar_url" text,
	"status" "social_account_status" DEFAULT 'active' NOT NULL,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"aspect_ratio" varchar(20),
	"layout_config" text,
	"brand_asset_ids" text[] DEFAULT '{}',
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"external_account_id" varchar(200),
	"external_account_name" varchar(200),
	"mapping_status" "mapping_status" DEFAULT 'unmapped' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"connector_type" "connector_type" DEFAULT 'csv_import' NOT NULL,
	"status" "connector_status" DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid,
	"file_name" varchar(300) NOT NULL,
	"file_type" varchar(20) DEFAULT 'csv' NOT NULL,
	"status" varchar(30) DEFAULT 'uploaded' NOT NULL,
	"total_rows" text,
	"success_rows" text,
	"failed_rows" text,
	"error_log" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid,
	"sync_type" varchar(30) DEFAULT 'post' NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"records_read" text,
	"records_created" text,
	"records_updated" text,
	"records_failed" text,
	"error_log" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid,
	"connector_id" uuid,
	"social_account_id" uuid,
	"external_post_id" varchar(200) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"title" varchar(500),
	"published_at" timestamp with time zone,
	"external_url" text,
	"match_status" "match_status" DEFAULT 'unmatched' NOT NULL,
	"match_confidence" varchar(10),
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"social_account_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"new_followers" integer DEFAULT 0 NOT NULL,
	"profile_visits" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"engagements" integer DEFAULT 0 NOT NULL,
	"raw_metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"label" varchar(120) NOT NULL,
	"category" varchar(40) NOT NULL,
	"unit" varchar(20) DEFAULT 'count' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "metric_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid,
	"source_field" varchar(120) NOT NULL,
	"metric_key" varchar(80) NOT NULL,
	"transform" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_post_id" uuid,
	"publication_id" uuid,
	"captured_at" timestamp with time zone NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"reads" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"completion_rate" numeric,
	"five_second_retention" numeric,
	"profile_visits" integer DEFAULT 0 NOT NULL,
	"raw_metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_performances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"period" varchar(8) NOT NULL,
	"traffic_score" numeric,
	"engagement_score" numeric,
	"lead_score" numeric,
	"conversion_score" numeric,
	"performance_score" numeric,
	"recommendation" varchar(60),
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid,
	"publication_id" uuid,
	"lead_id" uuid,
	"event_type" "conversion_event_type" NOT NULL,
	"event_value" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid,
	"publication_id" uuid,
	"source" varchar(100),
	"name" varchar(200) NOT NULL,
	"company" varchar(200),
	"contact" varchar(200),
	"lead_type" "lead_type" DEFAULT 'inbound' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(100) NOT NULL,
	"model_name" varchar(200) NOT NULL,
	"model_id" varchar(200) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"input_price" numeric,
	"output_price" numeric,
	"capabilities" text[] DEFAULT '{}',
	"context_window" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid,
	"model_id" uuid,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost" numeric,
	"latency" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"workflow_type" varchar(50) NOT NULL,
	"file_path" varchar(300) NOT NULL,
	"status" "prompt_status" DEFAULT 'draft' NOT NULL,
	"current_version" varchar(20) DEFAULT '1.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_template_id" uuid NOT NULL,
	"version" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"status" "prompt_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity_type" varchar(60),
	"entity_id" uuid,
	"actor" varchar(200),
	"before" jsonb,
	"after" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_scoring_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) DEFAULT 'default' NOT NULL,
	"b2b_weight" integer DEFAULT 25 NOT NULL,
	"traffic_weight" integer DEFAULT 20 NOT NULL,
	"conversion_weight" integer DEFAULT 20 NOT NULL,
	"timeliness_weight" integer DEFAULT 15 NOT NULL,
	"content_value_weight" integer DEFAULT 20 NOT NULL,
	"type_overrides" text,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_assets" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."brand_asset_type";--> statement-breakpoint
CREATE TYPE "public"."brand_asset_type" AS ENUM('logo', 'product_screenshot', 'template', 'background', 'icon', 'visual_reference', 'cta_asset');--> statement-breakpoint
ALTER TABLE "brand_assets" ALTER COLUMN "type" SET DATA TYPE "public"."brand_asset_type" USING "type"::"public"."brand_asset_type";--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "topic_score" integer;--> statement-breakpoint
ALTER TABLE "source_packet_items" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "source_packet_items" ADD COLUMN "comparison_object" text;--> statement-breakpoint
ALTER TABLE "source_packet_items" ADD COLUMN "applicable_scope" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "social_account_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_source_knowledge_topic_id_knowledge_topics_id_fk" FOREIGN KEY ("source_knowledge_topic_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_target_knowledge_topic_id_knowledge_topics_id_fk" FOREIGN KEY ("target_knowledge_topic_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_relations" ADD CONSTRAINT "topic_relations_source_topic_id_topics_id_fk" FOREIGN KEY ("source_topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_relations" ADD CONSTRAINT "topic_relations_target_topic_id_topics_id_fk" FOREIGN KEY ("target_topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_tags" ADD CONSTRAINT "topic_tags_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_tags" ADD CONSTRAINT "topic_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_asset_id_content_assets_id_fk" FOREIGN KEY ("content_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_accounts" ADD CONSTRAINT "connector_accounts_connector_id_data_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."data_connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_accounts" ADD CONSTRAINT "connector_accounts_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_import_batches" ADD CONSTRAINT "data_import_batches_connector_id_data_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."data_connectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sync_jobs" ADD CONSTRAINT "data_sync_jobs_connector_id_data_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."data_connectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_posts" ADD CONSTRAINT "external_posts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_posts" ADD CONSTRAINT "external_posts_connector_id_data_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."data_connectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_posts" ADD CONSTRAINT "external_posts_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_metric_snapshots" ADD CONSTRAINT "account_metric_snapshots_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_mappings" ADD CONSTRAINT "metric_mappings_metric_key_metric_definitions_key_fk" FOREIGN KEY ("metric_key") REFERENCES "public"."metric_definitions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metric_snapshots" ADD CONSTRAINT "post_metric_snapshots_external_post_id_external_posts_id_fk" FOREIGN KEY ("external_post_id") REFERENCES "public"."external_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metric_snapshots" ADD CONSTRAINT "post_metric_snapshots_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_performances" ADD CONSTRAINT "topic_performances_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_template_id_prompt_templates_id_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_relations_source_idx" ON "knowledge_relations" USING btree ("source_knowledge_topic_id");--> statement-breakpoint
CREATE INDEX "knowledge_relations_target_idx" ON "knowledge_relations" USING btree ("target_knowledge_topic_id");--> statement-breakpoint
CREATE INDEX "topic_relations_source_idx" ON "topic_relations" USING btree ("source_topic_id");--> statement-breakpoint
CREATE INDEX "topic_relations_target_idx" ON "topic_relations" USING btree ("target_topic_id");--> statement-breakpoint
CREATE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "topic_tags_topic_idx" ON "topic_tags" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_tags_tag_idx" ON "topic_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "sources_url_idx" ON "sources" USING btree ("url");--> statement-breakpoint
CREATE INDEX "sources_type_idx" ON "sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "content_versions_asset_idx" ON "content_versions" USING btree ("content_asset_id");--> statement-breakpoint
CREATE INDEX "social_accounts_platform_idx" ON "social_accounts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "connector_accounts_connector_idx" ON "connector_accounts" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "data_connectors_type_idx" ON "data_connectors" USING btree ("connector_type");--> statement-breakpoint
CREATE INDEX "external_posts_pub_idx" ON "external_posts" USING btree ("publication_id");--> statement-breakpoint
CREATE INDEX "external_posts_connector_idx" ON "external_posts" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "account_metric_snapshots_acc_idx" ON "account_metric_snapshots" USING btree ("social_account_id");--> statement-breakpoint
CREATE INDEX "account_metric_snapshots_time_idx" ON "account_metric_snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "metric_mappings_metric_idx" ON "metric_mappings" USING btree ("metric_key");--> statement-breakpoint
CREATE INDEX "post_metric_snapshots_post_idx" ON "post_metric_snapshots" USING btree ("external_post_id");--> statement-breakpoint
CREATE INDEX "post_metric_snapshots_pub_idx" ON "post_metric_snapshots" USING btree ("publication_id");--> statement-breakpoint
CREATE INDEX "post_metric_snapshots_time_idx" ON "post_metric_snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "topic_performances_topic_idx" ON "topic_performances" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_performances_period_idx" ON "topic_performances" USING btree ("period");--> statement-breakpoint
CREATE INDEX "conversion_events_topic_idx" ON "conversion_events" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "conversion_events_lead_idx" ON "conversion_events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_topic_idx" ON "leads" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_run_idx" ON "ai_usage_logs" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "prompt_versions_template_idx" ON "prompt_versions" USING btree ("prompt_template_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "source_packet_items" ADD CONSTRAINT "source_packet_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;