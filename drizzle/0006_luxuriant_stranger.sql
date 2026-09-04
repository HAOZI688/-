ALTER TABLE "data_import_batches" ADD COLUMN "file_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "data_import_batches" ADD COLUMN "data_type" varchar(30) DEFAULT 'posts' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_import_batches" ADD COLUMN "file_headers" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "data_import_batches" ADD COLUMN "failed_row_data" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "data_import_batches" ADD COLUMN "historical_import" integer DEFAULT 0 NOT NULL;