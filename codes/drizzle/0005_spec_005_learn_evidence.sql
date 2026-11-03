ALTER TABLE "user_sub_module_progress" ADD COLUMN "learn_active_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sub_module_progress" ADD COLUMN "learn_visited_subtabs" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sub_module_progress" ADD COLUMN "learn_last_ping_at" timestamp with time zone;