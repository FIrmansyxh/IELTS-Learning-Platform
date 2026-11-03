CREATE TYPE "public"."active_tab" AS ENUM('LEARN', 'DRILL', 'MINI_TASK');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('ACTIVE_DRILL', 'SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'PLACEMENT_TEST', 'BOSS_SECTION');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('SLIDE_IMAGE', 'DOCUMENT', 'AUDIO_LISTENING', 'VIDEO_EMBED', 'IMAGE', 'REFERENCE_LINK');--> statement-breakpoint
CREATE TYPE "public"."async_job_kind" AS ENUM('STT_TRANSCRIBE', 'GRADE_WRITING', 'GRADE_SPEAKING', 'IMPORT_VALIDATE', 'IMPORT_PUBLISH', 'RETENTION_PURGE');--> statement-breakpoint
CREATE TYPE "public"."async_job_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."attempt_mode" AS ENUM('PRACTICE', 'EXAM');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'AWAITING_GRADING', 'GRADED', 'EXPIRED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."band_table_skill" AS ENUM('LISTENING', 'READING_ACADEMIC');--> statement-breakpoint
CREATE TYPE "public"."content_origin" AS ENUM('ORIGINAL_AUTHORED', 'AI_GENERATED_REVIEWED', 'OPEN_LICENSED_ADAPTED');--> statement-breakpoint
CREATE TYPE "public"."mastery_crown" AS ENUM('NONE', 'SILVER', 'GOLD');--> statement-breakpoint
CREATE TYPE "public"."eval_method" AS ENUM('AI_LOCAL', 'SELF_ASSESSMENT');--> statement-breakpoint
CREATE TYPE "public"."gate_type" AS ENUM('PERCENT', 'BAND');--> statement-breakpoint
CREATE TYPE "public"."import_action" AS ENUM('CREATE', 'UPDATE', 'NOOP');--> statement-breakpoint
CREATE TYPE "public"."import_format" AS ENUM('JSON', 'CSV');--> statement-breakpoint
CREATE TYPE "public"."import_item_status" AS ENUM('VALID', 'INVALID', 'APPLIED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('UPLOADED', 'VALIDATING', 'PREVIEW_READY', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'ROLLED_BACK');--> statement-breakpoint
CREATE TYPE "public"."learn_subtab" AS ENUM('ARTICLE', 'VIDEO', 'SLIDES');--> statement-breakpoint
CREATE TYPE "public"."license_type" AS ENUM('OWN', 'CC0', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'MIT', 'EMBED_TOS', 'LINK_ONLY_COPYRIGHTED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."point_source" AS ENUM('DRILL', 'SPEED_STREAK', 'CROWN', 'MINI_TASK', 'BOSS', 'DAILY', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."progress_status" AS ENUM('LOCKED', 'UNLOCKED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."rights_status" AS ENUM('UNVERIFIED', 'VERIFIED_OPEN', 'OWN_ORIGINAL', 'EMBED_ONLY', 'LINK_ONLY');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('GRAMMAR', 'VOCAB', 'LISTENING', 'READING', 'WRITING', 'SPEAKING');--> statement-breakpoint
CREATE TYPE "public"."storage_backend" AS ENUM('FILESYSTEM', 'MINIO', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "public"."submission_kind" AS ENUM('WRITING_TASK1', 'WRITING_TASK2', 'MINI_TASK_WRITING', 'SPEAKING_PART1', 'SPEAKING_PART2', 'SPEAKING_PART3', 'MINI_TASK_SPEAKING');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('RECEIVED', 'TRANSCRIBING', 'GRADING', 'GRADED', 'FALLBACK_SELF_ASSESSMENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."unlock_source" AS ENUM('DEFAULT', 'SEQUENTIAL', 'SKIP_TEST', 'PLACEMENT', 'BOSS_PASS', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('learner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TABLE "ai_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"run_number" smallint DEFAULT 1 NOT NULL,
	"method" "eval_method" DEFAULT 'AI_LOCAL' NOT NULL,
	"rubric_id" uuid,
	"model_name" varchar(100),
	"prompt_version" varchar(40),
	"output_schema_version" varchar(20) DEFAULT '1' NOT NULL,
	"overall_band" numeric(2, 1),
	"criteria_scores" jsonb,
	"feedback_json" jsonb,
	"raw_output" text,
	"latency_ms" integer,
	"error_code" varchar(40),
	"disclaimer_acknowledged" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_eval_band_chk" CHECK ("ai_evaluations"."overall_band" IS NULL OR ("ai_evaluations"."overall_band" >= 0 AND "ai_evaluations"."overall_band" <= 9 AND ("ai_evaluations"."overall_band" * 2) = floor("ai_evaluations"."overall_band" * 2)))
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_type" "assessment_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"sub_module_id" uuid,
	"module_id" uuid,
	"tier_id" uuid,
	"parent_set_id" uuid,
	"skill_category" "skill_category",
	"time_limit_seconds" integer NOT NULL,
	"reading_passage_markdown" text,
	"listening_asset_id" uuid,
	"questions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"question_count" smallint DEFAULT 0 NOT NULL,
	"pass_percent" smallint,
	"origin" "content_origin" NOT NULL,
	"source_id" uuid,
	"attribution_text" text,
	"status" "review_status" DEFAULT 'DRAFT' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_sets_scope_chk" CHECK (
    ("assessment_sets"."assessment_type" = 'ACTIVE_DRILL'      AND "assessment_sets"."sub_module_id" IS NOT NULL AND "assessment_sets"."module_id" IS NULL AND "assessment_sets"."tier_id" IS NULL) OR
    ("assessment_sets"."assessment_type" = 'SKIP_MODULE_TEST'  AND "assessment_sets"."module_id"    IS NOT NULL AND "assessment_sets"."sub_module_id" IS NULL AND "assessment_sets"."tier_id" IS NULL) OR
    ("assessment_sets"."assessment_type" IN ('SKIP_TIER_TEST','TIER_BOSS_EXAM') AND "assessment_sets"."tier_id" IS NOT NULL AND "assessment_sets"."sub_module_id" IS NULL AND "assessment_sets"."module_id" IS NULL) OR
    ("assessment_sets"."assessment_type" = 'BOSS_SECTION'      AND "assessment_sets"."parent_set_id" IS NOT NULL) OR
    ("assessment_sets"."assessment_type" = 'PLACEMENT_TEST'    AND "assessment_sets"."sub_module_id" IS NULL AND "assessment_sets"."module_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "async_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "async_job_kind" NOT NULL,
	"boss_job_id" uuid,
	"user_id" uuid,
	"submission_id" uuid,
	"import_batch_id" uuid,
	"status" "async_job_status" DEFAULT 'QUEUED' NOT NULL,
	"stage" varchar(40),
	"progress_percent" smallint DEFAULT 0 NOT NULL,
	"error_code" varchar(40),
	"error_message" text,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"assessment_set_id" uuid NOT NULL,
	"question_id" varchar(40) NOT NULL,
	"question_type" varchar(30) NOT NULL,
	"skill" "skill_category",
	"response" jsonb,
	"is_correct" boolean,
	"score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"time_spent_ms" integer,
	"within_target_time" boolean,
	"speed_streak_len" smallint DEFAULT 0 NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt_sections" (
	"attempt_id" uuid NOT NULL,
	"assessment_set_id" uuid NOT NULL,
	"skill" "skill_category" NOT NULL,
	"raw_score" numeric(6, 2),
	"max_score" numeric(6, 2),
	"band_score" numeric(2, 1),
	"status" "attempt_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	CONSTRAINT "attempt_sections_attempt_id_assessment_set_id_pk" PRIMARY KEY("attempt_id","assessment_set_id")
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"assessment_set_id" uuid NOT NULL,
	"assessment_version" integer NOT NULL,
	"mode" "attempt_mode" DEFAULT 'PRACTICE' NOT NULL,
	"status" "attempt_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"raw_score" numeric(6, 2),
	"max_score" numeric(6, 2),
	"score_percent" numeric(5, 2),
	"band_score" numeric(2, 1),
	"band_table_id" uuid,
	"passed" boolean,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_band_chk" CHECK ("attempts"."band_score" IS NULL OR ("attempts"."band_score" >= 0 AND "attempts"."band_score" <= 9 AND ("attempts"."band_score" * 2) = floor("attempts"."band_score" * 2)))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(40),
	"entity_id" varchar(64),
	"metadata" jsonb,
	"ip_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "band_conversion_rows" (
	"table_id" uuid NOT NULL,
	"raw_min" smallint NOT NULL,
	"raw_max" smallint NOT NULL,
	"band" numeric(2, 1) NOT NULL,
	CONSTRAINT "band_conversion_rows_table_id_raw_min_pk" PRIMARY KEY("table_id","raw_min"),
	CONSTRAINT "band_rows_range_chk" CHECK ("band_conversion_rows"."raw_min" >= 0 AND "band_conversion_rows"."raw_max" <= 40 AND "band_conversion_rows"."raw_min" <= "band_conversion_rows"."raw_max"),
	CONSTRAINT "band_rows_band_chk" CHECK ("band_conversion_rows"."band" IS NULL OR ("band_conversion_rows"."band" >= 0 AND "band_conversion_rows"."band" <= 9 AND ("band_conversion_rows"."band" * 2) = floor("band_conversion_rows"."band" * 2)))
);
--> statement-breakpoint
CREATE TABLE "band_conversion_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill" "band_table_skill" NOT NULL,
	"version_label" varchar(60) NOT NULL,
	"source_note" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"title" varchar(200) NOT NULL,
	"source_id" uuid NOT NULL,
	"rights_status" "rights_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"storage_backend" "storage_backend" NOT NULL,
	"storage_key" text,
	"external_url" text,
	"external_ref" varchar(64),
	"mime_type" varchar(100),
	"size_bytes" integer,
	"sha256" varchar(64),
	"duration_sec" integer,
	"attribution_text" text,
	"license_verified_at" timestamp with time zone,
	"license_verified_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_assets_nocopy_chk" CHECK (NOT ("content_assets"."rights_status" IN ('LINK_ONLY','EMBED_ONLY') AND "content_assets"."storage_key" IS NOT NULL)),
	CONSTRAINT "content_assets_location_chk" CHECK (("content_assets"."storage_backend" = 'EXTERNAL' AND "content_assets"."external_url" IS NOT NULL) OR ("content_assets"."storage_backend" <> 'EXTERNAL' AND "content_assets"."storage_key" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" uuid,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(150) NOT NULL,
	"url" text,
	"license_type" "license_type" NOT NULL,
	"license_note" text,
	"attribution_template" text,
	"share_alike" boolean DEFAULT false NOT NULL,
	"non_commercial_only" boolean DEFAULT false NOT NULL,
	"may_store_copy" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_sources_code_unique" UNIQUE("code"),
	CONSTRAINT "content_sources_nocopy_chk" CHECK (NOT ("content_sources"."license_type" IN ('LINK_ONLY_COPYRIGHTED','EMBED_TOS') AND "content_sources"."may_store_copy"))
);
--> statement-breakpoint
CREATE TABLE "grading_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill" "skill_category" NOT NULL,
	"version_label" varchar(60) NOT NULL,
	"criteria" jsonb NOT NULL,
	"source_id" uuid,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"entity_kind" varchar(30) NOT NULL,
	"entity_code" varchar(40),
	"status" "import_item_status" NOT NULL,
	"action" "import_action",
	"errors" jsonb,
	"payload" jsonb NOT NULL,
	"content_hash" varchar(64),
	"applied_entity_id" uuid
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"format" "import_format" NOT NULL,
	"contract_version" varchar(10) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_sha256" varchar(64) NOT NULL,
	"storage_key" text,
	"status" "import_status" DEFAULT 'UPLOADED' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"valid_items" integer DEFAULT 0 NOT NULL,
	"invalid_items" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at" timestamp with time zone,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "learning_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_module_id" uuid NOT NULL,
	"article_markdown" text NOT NULL,
	"videos_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slides_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mini_task_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" "content_origin" NOT NULL,
	"source_id" uuid,
	"attribution_text" text,
	"content_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_materials_sub_module_id_unique" UNIQUE("sub_module_id")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_id" uuid NOT NULL,
	"module_code" varchar(20) NOT NULL,
	"skill_category" "skill_category" NOT NULL,
	"title" varchar(150) NOT NULL,
	"order_index" integer NOT NULL,
	"status" "review_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_module_code_unique" UNIQUE("module_code")
);
--> statement-breakpoint
CREATE TABLE "point_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "point_source" NOT NULL,
	"source_id" uuid,
	"points" integer NOT NULL,
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaking_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"storage_backend" "storage_backend" DEFAULT 'FILESYSTEM' NOT NULL,
	"storage_key" text,
	"mime_type" varchar(60) NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_ms" integer,
	"sha256" varchar(64),
	"transcript" text,
	"transcript_segments" jsonb,
	"stt_engine" varchar(60),
	"stt_confidence" numeric(4, 3),
	"retention_expires_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"sub_module_code" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"passing_score_percent" smallint DEFAULT 75 NOT NULL,
	"order_index" integer NOT NULL,
	"status" "review_status" DEFAULT 'DRAFT' NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_modules_sub_module_code_unique" UNIQUE("sub_module_code"),
	CONSTRAINT "sub_modules_pass_chk" CHECK ("sub_modules"."passing_score_percent" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "submission_kind" NOT NULL,
	"attempt_id" uuid,
	"sub_module_id" uuid,
	"question_id" varchar(40),
	"prompt_snapshot" text NOT NULL,
	"response_text" text,
	"word_count" integer,
	"duration_sec" integer,
	"status" "submission_status" DEFAULT 'RECEIVED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_number" smallint NOT NULL,
	"title" varchar(100) NOT NULL,
	"cefr_level" varchar(20) NOT NULL,
	"target_band_min" numeric(2, 1) NOT NULL,
	"target_band_max" numeric(2, 1) NOT NULL,
	"boss_gate_type" "gate_type" NOT NULL,
	"boss_gate_value" numeric(4, 1) NOT NULL,
	"skip_threshold_percent" smallint DEFAULT 85 NOT NULL,
	"skip_time_limit_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiers_tier_number_unique" UNIQUE("tier_number"),
	CONSTRAINT "tiers_band_min_chk" CHECK ("tiers"."target_band_min" IS NULL OR ("tiers"."target_band_min" >= 0 AND "tiers"."target_band_min" <= 9 AND ("tiers"."target_band_min" * 2) = floor("tiers"."target_band_min" * 2))),
	CONSTRAINT "tiers_band_max_chk" CHECK ("tiers"."target_band_max" IS NULL OR ("tiers"."target_band_max" >= 0 AND "tiers"."target_band_max" <= 9 AND ("tiers"."target_band_max" * 2) = floor("tiers"."target_band_max" * 2)))
);
--> statement-breakpoint
CREATE TABLE "user_band_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"overall_band" numeric(2, 1) NOT NULL,
	"components" jsonb NOT NULL,
	"trigger" varchar(30) NOT NULL,
	"attempt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_last_learned_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"active_tier_id" uuid,
	"active_module_id" uuid,
	"active_sub_module_id" uuid,
	"active_tab" "active_tab" DEFAULT 'LEARN' NOT NULL,
	"active_learn_subtab" "learn_subtab",
	"active_video_id" varchar(64),
	"video_progress_sec" integer DEFAULT 0 NOT NULL,
	"last_question_index" smallint,
	"active_attempt_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_module_progress" (
	"user_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"status" "progress_status" DEFAULT 'LOCKED' NOT NULL,
	"unlock_source" "unlock_source",
	"skip_best_percent" numeric(5, 2),
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_module_progress_user_id_module_id_pk" PRIMARY KEY("user_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "user_skill_scores" (
	"user_id" uuid NOT NULL,
	"skill" "skill_category" NOT NULL,
	"score_percent" numeric(5, 2) NOT NULL,
	"estimated_band" numeric(2, 1),
	"sample_size" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_skill_scores_user_id_skill_pk" PRIMARY KEY("user_id","skill")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"daily_streak_days" integer DEFAULT 0 NOT NULL,
	"longest_daily_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" timestamp with time zone,
	"best_speed_streak" integer DEFAULT 0 NOT NULL,
	"gold_crowns" integer DEFAULT 0 NOT NULL,
	"silver_crowns" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sub_module_progress" (
	"user_id" uuid NOT NULL,
	"sub_module_id" uuid NOT NULL,
	"status" "progress_status" DEFAULT 'LOCKED' NOT NULL,
	"unlock_source" "unlock_source",
	"learn_completed_at" timestamp with time zone,
	"mini_task_completed_at" timestamp with time zone,
	"mastery_crown" "mastery_crown" DEFAULT 'NONE' NOT NULL,
	"best_score_percent" smallint DEFAULT 0 NOT NULL,
	"attempts_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sub_module_progress_user_id_sub_module_id_pk" PRIMARY KEY("user_id","sub_module_id")
);
--> statement-breakpoint
CREATE TABLE "user_tier_progress" (
	"user_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"status" "progress_status" DEFAULT 'LOCKED' NOT NULL,
	"unlock_source" "unlock_source",
	"boss_best_percent" numeric(5, 2),
	"boss_best_band" numeric(2, 1),
	"boss_passed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tier_progress_user_id_tier_id_pk" PRIMARY KEY("user_id","tier_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'learner' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"target_band" numeric(2, 1),
	"placement_completed_at" timestamp with time zone,
	"failed_login_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_target_band_chk" CHECK ("users"."target_band" IS NULL OR ("users"."target_band" >= 0 AND "users"."target_band" <= 9 AND ("users"."target_band" * 2) = floor("users"."target_band" * 2)))
);
--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_rubric_id_grading_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."grading_rubrics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sets" ADD CONSTRAINT "assessment_sets_sub_module_id_sub_modules_id_fk" FOREIGN KEY ("sub_module_id") REFERENCES "public"."sub_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sets" ADD CONSTRAINT "assessment_sets_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sets" ADD CONSTRAINT "assessment_sets_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sets" ADD CONSTRAINT "assessment_sets_parent_set_id_assessment_sets_id_fk" FOREIGN KEY ("parent_set_id") REFERENCES "public"."assessment_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sets" ADD CONSTRAINT "assessment_sets_listening_asset_id_content_assets_id_fk" FOREIGN KEY ("listening_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sets" ADD CONSTRAINT "assessment_sets_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sets" ADD CONSTRAINT "assessment_sets_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "async_jobs" ADD CONSTRAINT "async_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "async_jobs" ADD CONSTRAINT "async_jobs_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_assessment_set_id_assessment_sets_id_fk" FOREIGN KEY ("assessment_set_id") REFERENCES "public"."assessment_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_sections" ADD CONSTRAINT "attempt_sections_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_sections" ADD CONSTRAINT "attempt_sections_assessment_set_id_assessment_sets_id_fk" FOREIGN KEY ("assessment_set_id") REFERENCES "public"."assessment_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assessment_set_id_assessment_sets_id_fk" FOREIGN KEY ("assessment_set_id") REFERENCES "public"."assessment_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_band_table_id_band_conversion_tables_id_fk" FOREIGN KEY ("band_table_id") REFERENCES "public"."band_conversion_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_conversion_rows" ADD CONSTRAINT "band_conversion_rows_table_id_band_conversion_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."band_conversion_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_conversion_tables" ADD CONSTRAINT "band_conversion_tables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_license_verified_by_users_id_fk" FOREIGN KEY ("license_verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_rubrics" ADD CONSTRAINT "grading_rubrics_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_sub_module_id_sub_modules_id_fk" FOREIGN KEY ("sub_module_id") REFERENCES "public"."sub_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_recordings" ADD CONSTRAINT "speaking_recordings_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_modules" ADD CONSTRAINT "sub_modules_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sub_module_id_sub_modules_id_fk" FOREIGN KEY ("sub_module_id") REFERENCES "public"."sub_modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_band_predictions" ADD CONSTRAINT "user_band_predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_band_predictions" ADD CONSTRAINT "user_band_predictions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_learned_state" ADD CONSTRAINT "user_last_learned_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_learned_state" ADD CONSTRAINT "user_last_learned_state_active_tier_id_tiers_id_fk" FOREIGN KEY ("active_tier_id") REFERENCES "public"."tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_learned_state" ADD CONSTRAINT "user_last_learned_state_active_module_id_modules_id_fk" FOREIGN KEY ("active_module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_learned_state" ADD CONSTRAINT "user_last_learned_state_active_sub_module_id_sub_modules_id_fk" FOREIGN KEY ("active_sub_module_id") REFERENCES "public"."sub_modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_module_progress" ADD CONSTRAINT "user_module_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_module_progress" ADD CONSTRAINT "user_module_progress_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skill_scores" ADD CONSTRAINT "user_skill_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sub_module_progress" ADD CONSTRAINT "user_sub_module_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sub_module_progress" ADD CONSTRAINT "user_sub_module_progress_sub_module_id_sub_modules_id_fk" FOREIGN KEY ("sub_module_id") REFERENCES "public"."sub_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tier_progress" ADD CONSTRAINT "user_tier_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tier_progress" ADD CONSTRAINT "user_tier_progress_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_eval_submission_run_uq" ON "ai_evaluations" USING btree ("submission_id","run_number");--> statement-breakpoint
CREATE INDEX "assessment_sets_sub_idx" ON "assessment_sets" USING btree ("sub_module_id","assessment_type");--> statement-breakpoint
CREATE INDEX "assessment_sets_module_idx" ON "assessment_sets" USING btree ("module_id","assessment_type");--> statement-breakpoint
CREATE INDEX "assessment_sets_tier_idx" ON "assessment_sets" USING btree ("tier_id","assessment_type");--> statement-breakpoint
CREATE INDEX "assessment_sets_parent_idx" ON "assessment_sets" USING btree ("parent_set_id");--> statement-breakpoint
CREATE INDEX "async_jobs_submission_idx" ON "async_jobs" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "async_jobs_status_idx" ON "async_jobs" USING btree ("status","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_answers_uq" ON "attempt_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "attempt_answers_set_q_idx" ON "attempt_answers" USING btree ("assessment_set_id","question_id","is_correct");--> statement-breakpoint
CREATE INDEX "attempts_user_started_idx" ON "attempts" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attempts_user_set_idx" ON "attempts" USING btree ("user_id","assessment_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_one_active_uq" ON "attempts" USING btree ("user_id","assessment_set_id") WHERE "attempts"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "band_tables_skill_version_uq" ON "band_conversion_tables" USING btree ("skill","version_label");--> statement-breakpoint
CREATE UNIQUE INDEX "band_tables_one_active_uq" ON "band_conversion_tables" USING btree ("skill") WHERE "band_conversion_tables"."is_active";--> statement-breakpoint
CREATE INDEX "content_assets_source_idx" ON "content_assets" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "content_assets_rights_idx" ON "content_assets" USING btree ("rights_status");--> statement-breakpoint
CREATE UNIQUE INDEX "content_assets_sha256_uq" ON "content_assets" USING btree ("sha256") WHERE "content_assets"."sha256" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "content_rev_entity_version_uq" ON "content_revisions" USING btree ("entity_type","entity_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "rubrics_skill_version_uq" ON "grading_rubrics" USING btree ("skill","version_label");--> statement-breakpoint
CREATE UNIQUE INDEX "rubrics_one_active_uq" ON "grading_rubrics" USING btree ("skill") WHERE "grading_rubrics"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "import_items_batch_row_uq" ON "import_batch_items" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "import_items_batch_status_idx" ON "import_batch_items" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_file_uq" ON "import_batches" USING btree ("file_sha256") WHERE "import_batches"."status" IN ('PREVIEW_READY','PUBLISHING','PUBLISHED');--> statement-breakpoint
CREATE UNIQUE INDEX "modules_tier_order_uq" ON "modules" USING btree ("tier_id","order_index");--> statement-breakpoint
CREATE INDEX "point_ledger_user_idx" ON "point_ledger" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recordings_submission_idx" ON "speaking_recordings" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "recordings_retention_idx" ON "speaking_recordings" USING btree ("retention_expires_at") WHERE "speaking_recordings"."purged_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sub_modules_module_order_uq" ON "sub_modules" USING btree ("module_id","order_index");--> statement-breakpoint
CREATE INDEX "submissions_user_created_idx" ON "submissions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "submissions_attempt_idx" ON "submissions" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "band_pred_user_idx" ON "user_band_predictions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "usmp_user_status_idx" ON "user_sub_module_progress" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));