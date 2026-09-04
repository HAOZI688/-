CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(30) NOT NULL,
	"priority" varchar(10) DEFAULT 'P2' NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"target_url" varchar(300),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"entity_type" varchar(60),
	"entity_id" varchar(64),
	"due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_acceptance_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_type" varchar(50) NOT NULL,
	"period" varchar(8) NOT NULL,
	"generated" integer DEFAULT 0 NOT NULL,
	"approved_directly" integer DEFAULT 0 NOT NULL,
	"approved_after_edit" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_type" varchar(40) DEFAULT 'generic' NOT NULL,
	"topic_id" uuid,
	"content_asset_id" uuid,
	"platform" varchar(50),
	"social_account_id" uuid,
	"github_snapshot_id" uuid,
	"title" varchar(300),
	"body" text,
	"primary_cta" text,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"visual_asset_ids" jsonb DEFAULT '[]'::jsonb,
	"fact_qa_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"brand_qa_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"content_qa_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"recommended_publish_at" timestamp with time zone,
	"publish_notes" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "needs_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD COLUMN "data_source" varchar(30) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_assets" ADD COLUMN "data_source" varchar(30) DEFAULT 'workflow' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "historical_import" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "data_source" varchar(30) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_posts" ADD COLUMN "match_method" varchar(30);--> statement-breakpoint
ALTER TABLE "external_posts" ADD COLUMN "matched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "external_posts" ADD COLUMN "manual_confirmed_by" varchar(120);--> statement-breakpoint
ALTER TABLE "external_posts" ADD COLUMN "data_source" varchar(30) DEFAULT 'xiaodouya_import' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_posts" ADD COLUMN "historical_import" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_metric_snapshots" ADD COLUMN "data_source" varchar(30) DEFAULT 'xiaodouya_import' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_metric_snapshots" ADD COLUMN "data_source" varchar(30) DEFAULT 'xiaodouya_import' NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_performances" ADD COLUMN "data_source" varchar(30) DEFAULT 'xiaodouya_import' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "provider" varchar(100);--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "model" varchar(200);--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "prompt_version" varchar(20);--> statement-breakpoint
ALTER TABLE "topic_performance_scores" ADD COLUMN "data_source" varchar(30) DEFAULT 'xiaodouya_import' NOT NULL;--> statement-breakpoint
ALTER TABLE "publish_packages" ADD CONSTRAINT "publish_packages_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_packages" ADD CONSTRAINT "publish_packages_content_asset_id_content_assets_id_fk" FOREIGN KEY ("content_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_packages" ADD CONSTRAINT "publish_packages_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_packages" ADD CONSTRAINT "publish_packages_github_snapshot_id_github_snapshots_id_fk" FOREIGN KEY ("github_snapshot_id") REFERENCES "public"."github_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_status_idx" ON "action_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "action_items_type_idx" ON "action_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "action_items_entity_idx" ON "action_items" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "acceptance_stats_wf_idx" ON "content_acceptance_stats" USING btree ("workflow_type","period");--> statement-breakpoint
CREATE INDEX "publish_packages_topic_idx" ON "publish_packages" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "publish_packages_status_idx" ON "publish_packages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "publish_packages_snapshot_idx" ON "publish_packages" USING btree ("github_snapshot_id");