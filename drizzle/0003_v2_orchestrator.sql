CREATE TYPE "public"."weekly_plan_item_status" AS ENUM('pending', 'approved', 'rejected', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."weekly_plan_status" AS ENUM('draft', 'confirmed', 'production', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "weekly_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"workflow_type" "workflow_type" NOT NULL,
	"priority" varchar(4) DEFAULT 'P3' NOT NULL,
	"topic_score" numeric(4, 1),
	"status" "weekly_plan_item_status" DEFAULT 'pending' NOT NULL,
	"run_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_prefix" varchar(16) NOT NULL,
	"status" "weekly_plan_status" DEFAULT 'draft' NOT NULL,
	"quota" jsonb DEFAULT '{}'::jsonb,
	"scan_summary" jsonb DEFAULT '{}'::jsonb,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plans_week_prefix_unique" UNIQUE("week_prefix")
);
--> statement-breakpoint
CREATE TABLE "workflow_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_workflow_type" "workflow_type" NOT NULL,
	"child_workflow_type" "workflow_type" NOT NULL,
	"gate" varchar(20) DEFAULT 'all' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"workflow_type" "workflow_type" NOT NULL,
	"input_key" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_inputs" ADD CONSTRAINT "workflow_inputs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_plan_items_plan_idx" ON "weekly_plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "weekly_plan_items_topic_idx" ON "weekly_plan_items" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "weekly_plan_items_run_idx" ON "weekly_plan_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "weekly_plans_week_idx" ON "weekly_plans" USING btree ("week_prefix");--> statement-breakpoint
CREATE INDEX "workflow_dependencies_child_idx" ON "workflow_dependencies" USING btree ("child_workflow_type");--> statement-breakpoint
CREATE INDEX "workflow_dependencies_parent_idx" ON "workflow_dependencies" USING btree ("parent_workflow_type");--> statement-breakpoint
CREATE INDEX "workflow_inputs_run_idx" ON "workflow_inputs" USING btree ("run_id");