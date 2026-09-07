ALTER TYPE "public"."weekly_plan_status" ADD VALUE 'production_blocked';--> statement-breakpoint
ALTER TYPE "public"."weekly_plan_status" ADD VALUE 'needs_review';--> statement-breakpoint
ALTER TABLE "github_snapshot_items" ADD COLUMN "weekly_growth_source" varchar(40);--> statement-breakpoint
ALTER TABLE "github_snapshots" ADD COLUMN "statistics_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_snapshots" ADD COLUMN "statistics_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_snapshots" ADD COLUMN "immutable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_snapshots" ADD COLUMN "capture_source" varchar(40) DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_metric_snapshots" ADD COLUMN "excluded_from_production" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "post_metric_snapshots" ADD COLUMN "excluded_from_production" boolean DEFAULT false NOT NULL;