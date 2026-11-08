CREATE TABLE `ai_evaluations` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`submission_id` text NOT NULL,
	`run_number` integer DEFAULT 1 NOT NULL,
	`method` text DEFAULT 'AI_LOCAL' NOT NULL,
	`rubric_id` text,
	`model_name` text,
	`prompt_version` text,
	`output_schema_version` text DEFAULT '1' NOT NULL,
	`overall_band` real,
	`criteria_scores` text,
	`feedback_json` text,
	`raw_output` text,
	`latency_ms` integer,
	`error_code` text,
	`disclaimer_acknowledged` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rubric_id`) REFERENCES `grading_rubrics`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ai_eval_band_chk" CHECK("ai_evaluations"."overall_band" IS NULL OR ("ai_evaluations"."overall_band" >= 0 AND "ai_evaluations"."overall_band" <= 9 AND ("ai_evaluations"."overall_band" * 2) = cast("ai_evaluations"."overall_band" * 2 as integer)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_eval_submission_run_uq` ON `ai_evaluations` (`submission_id`,`run_number`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updated_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `assessment_sets` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`assessment_type` text NOT NULL,
	`title` text NOT NULL,
	`sub_module_id` text,
	`module_id` text,
	`tier_id` text,
	`parent_set_id` text,
	`skill_category` text,
	`time_limit_seconds` integer NOT NULL,
	`reading_passage_markdown` text,
	`listening_asset_id` text,
	`questions_json` text DEFAULT '[]' NOT NULL,
	`question_count` integer DEFAULT 0 NOT NULL,
	`pass_percent` integer,
	`origin` text NOT NULL,
	`source_id` text,
	`attribution_text` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`content_hash` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`sub_module_id`) REFERENCES `sub_modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_set_id`) REFERENCES `assessment_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listening_asset_id`) REFERENCES `content_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `content_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "assessment_sets_scope_chk" CHECK(
    ("assessment_sets"."assessment_type" = 'ACTIVE_DRILL'      AND "assessment_sets"."sub_module_id" IS NOT NULL AND "assessment_sets"."module_id" IS NULL AND "assessment_sets"."tier_id" IS NULL) OR
    ("assessment_sets"."assessment_type" = 'SKIP_MODULE_TEST'  AND "assessment_sets"."module_id"    IS NOT NULL AND "assessment_sets"."sub_module_id" IS NULL AND "assessment_sets"."tier_id" IS NULL) OR
    ("assessment_sets"."assessment_type" IN ('SKIP_TIER_TEST','TIER_BOSS_EXAM') AND "assessment_sets"."tier_id" IS NOT NULL AND "assessment_sets"."sub_module_id" IS NULL AND "assessment_sets"."module_id" IS NULL) OR
    ("assessment_sets"."assessment_type" = 'BOSS_SECTION'      AND "assessment_sets"."parent_set_id" IS NOT NULL) OR
    ("assessment_sets"."assessment_type" = 'PLACEMENT_TEST'    AND "assessment_sets"."sub_module_id" IS NULL AND "assessment_sets"."module_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `assessment_sets_sub_idx` ON `assessment_sets` (`sub_module_id`,`assessment_type`);--> statement-breakpoint
CREATE INDEX `assessment_sets_module_idx` ON `assessment_sets` (`module_id`,`assessment_type`);--> statement-breakpoint
CREATE INDEX `assessment_sets_tier_idx` ON `assessment_sets` (`tier_id`,`assessment_type`);--> statement-breakpoint
CREATE INDEX `assessment_sets_parent_idx` ON `assessment_sets` (`parent_set_id`);--> statement-breakpoint
CREATE TABLE `async_jobs` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`submission_id` text,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`stage` text,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `async_jobs_submission_idx` ON `async_jobs` (`submission_id`);--> statement-breakpoint
CREATE INDEX `async_jobs_status_idx` ON `async_jobs` (`status`,`kind`);--> statement-breakpoint
CREATE TABLE `attempt_answers` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`attempt_id` text NOT NULL,
	`assessment_set_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_type` text NOT NULL,
	`skill` text,
	`response` text,
	`is_correct` integer,
	`score` real DEFAULT '0' NOT NULL,
	`time_spent_ms` integer,
	`within_target_time` integer,
	`speed_streak_len` integer DEFAULT 0 NOT NULL,
	`answered_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_set_id`) REFERENCES `assessment_sets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_answers_uq` ON `attempt_answers` (`attempt_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `attempt_answers_set_q_idx` ON `attempt_answers` (`assessment_set_id`,`question_id`,`is_correct`);--> statement-breakpoint
CREATE TABLE `attempt_sections` (
	`attempt_id` text NOT NULL,
	`assessment_set_id` text NOT NULL,
	`skill` text NOT NULL,
	`raw_score` real,
	`max_score` real,
	`band_score` real,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	PRIMARY KEY(`attempt_id`, `assessment_set_id`),
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_set_id`) REFERENCES `assessment_sets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`user_id` text NOT NULL,
	`assessment_set_id` text NOT NULL,
	`assessment_version` integer NOT NULL,
	`mode` text DEFAULT 'PRACTICE' NOT NULL,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deadline_at` integer,
	`submitted_at` integer,
	`raw_score` real,
	`max_score` real,
	`score_percent` real,
	`band_score` real,
	`band_table_id` text,
	`passed` integer,
	`points_awarded` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_set_id`) REFERENCES `assessment_sets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`band_table_id`) REFERENCES `band_conversion_tables`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "attempts_band_chk" CHECK("attempts"."band_score" IS NULL OR ("attempts"."band_score" >= 0 AND "attempts"."band_score" <= 9 AND ("attempts"."band_score" * 2) = cast("attempts"."band_score" * 2 as integer)))
);
--> statement-breakpoint
CREATE INDEX `attempts_user_started_idx` ON `attempts` (`user_id`,"started_at" desc);--> statement-breakpoint
CREATE INDEX `attempts_user_set_idx` ON `attempts` (`user_id`,`assessment_set_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_one_active_uq` ON `attempts` (`user_id`,`assessment_set_id`) WHERE "attempts"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`ip_hash` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_log` (`actor_user_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_log` (`action`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `band_conversion_rows` (
	`table_id` text NOT NULL,
	`raw_min` integer NOT NULL,
	`raw_max` integer NOT NULL,
	`band` real NOT NULL,
	PRIMARY KEY(`table_id`, `raw_min`),
	FOREIGN KEY (`table_id`) REFERENCES `band_conversion_tables`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "band_rows_range_chk" CHECK("band_conversion_rows"."raw_min" >= 0 AND "band_conversion_rows"."raw_max" <= 40 AND "band_conversion_rows"."raw_min" <= "band_conversion_rows"."raw_max"),
	CONSTRAINT "band_rows_band_chk" CHECK("band_conversion_rows"."band" IS NULL OR ("band_conversion_rows"."band" >= 0 AND "band_conversion_rows"."band" <= 9 AND ("band_conversion_rows"."band" * 2) = cast("band_conversion_rows"."band" * 2 as integer)))
);
--> statement-breakpoint
CREATE TABLE `band_conversion_tables` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`skill` text NOT NULL,
	`version_label` text NOT NULL,
	`source_note` text,
	`is_active` integer DEFAULT false NOT NULL,
	`effective_from` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `band_tables_skill_version_uq` ON `band_conversion_tables` (`skill`,`version_label`);--> statement-breakpoint
CREATE UNIQUE INDEX `band_tables_one_active_uq` ON `band_conversion_tables` (`skill`) WHERE "band_conversion_tables"."is_active";--> statement-breakpoint
CREATE TABLE `content_assets` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`asset_code` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`source_id` text NOT NULL,
	`rights_status` text DEFAULT 'UNVERIFIED' NOT NULL,
	`storage_backend` text NOT NULL,
	`storage_key` text,
	`external_url` text,
	`external_ref` text,
	`mime_type` text,
	`size_bytes` integer,
	`sha256` text,
	`duration_sec` integer,
	`attribution_text` text,
	`license_verified_at` integer,
	`license_verified_by` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `content_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "content_assets_nocopy_chk" CHECK(NOT ("content_assets"."rights_status" IN ('LINK_ONLY','EMBED_ONLY') AND "content_assets"."storage_key" IS NOT NULL)),
	CONSTRAINT "content_assets_location_chk" CHECK(("content_assets"."storage_backend" = 'EXTERNAL' AND "content_assets"."external_url" IS NOT NULL) OR ("content_assets"."storage_backend" <> 'EXTERNAL' AND "content_assets"."storage_key" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `content_assets_source_idx` ON `content_assets` (`source_id`);--> statement-breakpoint
CREATE INDEX `content_assets_rights_idx` ON `content_assets` (`rights_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_assets_sha256_uq` ON `content_assets` (`sha256`) WHERE "content_assets"."sha256" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `content_assets_asset_code_uq` ON `content_assets` (`asset_code`) WHERE "content_assets"."asset_code" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `content_revisions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`changed_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_rev_entity_version_uq` ON `content_revisions` (`entity_type`,`entity_id`,`version`);--> statement-breakpoint
CREATE TABLE `content_sources` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`license_type` text NOT NULL,
	`license_note` text,
	`attribution_template` text,
	`share_alike` integer DEFAULT false NOT NULL,
	`non_commercial_only` integer DEFAULT false NOT NULL,
	`may_store_copy` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "content_sources_nocopy_chk" CHECK(NOT ("content_sources"."license_type" IN ('LINK_ONLY_COPYRIGHTED','EMBED_TOS') AND "content_sources"."may_store_copy"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_sources_code_unique` ON `content_sources` (`code`);--> statement-breakpoint
CREATE TABLE `grading_rubrics` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`skill` text NOT NULL,
	`version_label` text NOT NULL,
	`criteria` text NOT NULL,
	`source_id` text,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `content_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rubrics_skill_version_uq` ON `grading_rubrics` (`skill`,`version_label`);--> statement-breakpoint
CREATE UNIQUE INDEX `rubrics_one_active_uq` ON `grading_rubrics` (`skill`) WHERE "grading_rubrics"."is_active";--> statement-breakpoint
CREATE TABLE `learning_materials` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`sub_module_id` text NOT NULL,
	`article_markdown` text NOT NULL,
	`videos_json` text DEFAULT '[]' NOT NULL,
	`slides_json` text DEFAULT '[]' NOT NULL,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`mini_task_json` text DEFAULT '{}' NOT NULL,
	`origin` text NOT NULL,
	`source_id` text,
	`attribution_text` text,
	`content_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`sub_module_id`) REFERENCES `sub_modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `content_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_materials_sub_module_id_unique` ON `learning_materials` (`sub_module_id`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`tier_id` text NOT NULL,
	`module_code` text NOT NULL,
	`skill_category` text NOT NULL,
	`title` text NOT NULL,
	`order_index` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_module_code_unique` ON `modules` (`module_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `modules_tier_order_uq` ON `modules` (`tier_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `point_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`points` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `point_ledger_user_idx` ON `point_ledger` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX `point_ledger_once_uq` ON `point_ledger` (`user_id`,`source`,`source_id`) WHERE "point_ledger"."source" IN ('DRILL','SPEED_STREAK','CROWN','MINI_TASK','BOSS');--> statement-breakpoint
CREATE TABLE `speaking_recordings` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`submission_id` text NOT NULL,
	`storage_backend` text DEFAULT 'FILESYSTEM' NOT NULL,
	`storage_key` text,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`duration_ms` integer,
	`sha256` text,
	`transcript` text,
	`transcript_segments` text,
	`stt_engine` text,
	`stt_confidence` real,
	`retention_expires_at` integer,
	`purged_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recordings_submission_idx` ON `speaking_recordings` (`submission_id`);--> statement-breakpoint
CREATE INDEX `recordings_retention_idx` ON `speaking_recordings` (`retention_expires_at`) WHERE "speaking_recordings"."purged_at" IS NULL;--> statement-breakpoint
CREATE TABLE `sub_modules` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`module_id` text NOT NULL,
	`sub_module_code` text NOT NULL,
	`title` text NOT NULL,
	`passing_score_percent` integer DEFAULT 75 NOT NULL,
	`order_index` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`exam_module` text DEFAULT 'COMMON' NOT NULL,
	`content_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sub_modules_pass_chk" CHECK("sub_modules"."passing_score_percent" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sub_modules_sub_module_code_unique` ON `sub_modules` (`sub_module_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `sub_modules_module_order_uq` ON `sub_modules` (`module_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`attempt_id` text,
	`sub_module_id` text,
	`question_id` text,
	`prompt_snapshot` text NOT NULL,
	`response_text` text,
	`word_count` integer,
	`duration_sec` integer,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sub_module_id`) REFERENCES `sub_modules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submissions_user_created_idx` ON `submissions` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `submissions_attempt_idx` ON `submissions` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `tiers` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`tier_number` integer NOT NULL,
	`title` text NOT NULL,
	`cefr_level` text NOT NULL,
	`target_band_min` real NOT NULL,
	`target_band_max` real NOT NULL,
	`boss_gate_type` text NOT NULL,
	`boss_gate_value` real NOT NULL,
	`skip_threshold_percent` integer DEFAULT 85 NOT NULL,
	`skip_time_limit_seconds` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "tiers_band_min_chk" CHECK("tiers"."target_band_min" IS NULL OR ("tiers"."target_band_min" >= 0 AND "tiers"."target_band_min" <= 9 AND ("tiers"."target_band_min" * 2) = cast("tiers"."target_band_min" * 2 as integer))),
	CONSTRAINT "tiers_band_max_chk" CHECK("tiers"."target_band_max" IS NULL OR ("tiers"."target_band_max" >= 0 AND "tiers"."target_band_max" <= 9 AND ("tiers"."target_band_max" * 2) = cast("tiers"."target_band_max" * 2 as integer)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tiers_tier_number_unique` ON `tiers` (`tier_number`);--> statement-breakpoint
CREATE TABLE `user_band_predictions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`user_id` text NOT NULL,
	`overall_band` real NOT NULL,
	`components` text NOT NULL,
	`trigger` text NOT NULL,
	`attempt_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `band_pred_user_idx` ON `user_band_predictions` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `user_last_learned_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`active_tier_id` text,
	`active_module_id` text,
	`active_sub_module_id` text,
	`active_tab` text DEFAULT 'LEARN' NOT NULL,
	`active_learn_subtab` text,
	`active_video_id` text,
	`video_progress_sec` integer DEFAULT 0 NOT NULL,
	`last_question_index` integer,
	`active_attempt_id` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`active_module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`active_sub_module_id`) REFERENCES `sub_modules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`active_attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `user_module_progress` (
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`status` text DEFAULT 'LOCKED' NOT NULL,
	`unlock_source` text,
	`skip_best_percent` real,
	`completed_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `module_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_skill_scores` (
	`user_id` text NOT NULL,
	`skill` text NOT NULL,
	`score_percent` real NOT NULL,
	`estimated_band` real,
	`sample_size` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `skill`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_stats` (
	`user_id` text PRIMARY KEY NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`daily_streak_days` integer DEFAULT 0 NOT NULL,
	`longest_daily_streak` integer DEFAULT 0 NOT NULL,
	`last_active_date` integer,
	`best_speed_streak` integer DEFAULT 0 NOT NULL,
	`gold_crowns` integer DEFAULT 0 NOT NULL,
	`silver_crowns` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_sub_module_progress` (
	`user_id` text NOT NULL,
	`sub_module_id` text NOT NULL,
	`status` text DEFAULT 'LOCKED' NOT NULL,
	`unlock_source` text,
	`learn_completed_at` integer,
	`mini_task_completed_at` integer,
	`learn_active_seconds` integer DEFAULT 0 NOT NULL,
	`learn_visited_subtabs` text DEFAULT '[]' NOT NULL,
	`learn_last_ping_at` integer,
	`mastery_crown` text DEFAULT 'NONE' NOT NULL,
	`best_score_percent` integer DEFAULT 0 NOT NULL,
	`attempts_count` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `sub_module_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sub_module_id`) REFERENCES `sub_modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usmp_user_status_idx` ON `user_sub_module_progress` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `user_tier_progress` (
	`user_id` text NOT NULL,
	`tier_id` text NOT NULL,
	`status` text DEFAULT 'LOCKED' NOT NULL,
	`unlock_source` text,
	`boss_best_percent` real,
	`boss_best_band` real,
	`boss_passed_at` integer,
	`completed_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `tier_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`target_band` real,
	`placement_completed_at` integer,
	`last_login_at` integer,
	`token_version` integer DEFAULT 0 NOT NULL,
	`consent_recording_at` integer,
	`keep_recordings` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "users_target_band_chk" CHECK("users"."target_band" IS NULL OR ("users"."target_band" >= 0 AND "users"."target_band" <= 9 AND ("users"."target_band" * 2) = cast("users"."target_band" * 2 as integer)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_display_name_lower_uq` ON `users` (lower("display_name")) WHERE "users"."deleted_at" IS NULL;