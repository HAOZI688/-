ALTER TABLE "ai_usage_logs" ADD COLUMN "total_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "fallback_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "estimated" boolean DEFAULT true NOT NULL;