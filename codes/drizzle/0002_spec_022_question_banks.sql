-- migrator: foreign_keys=off
-- SPEC-022: pembangunan ulang assessment_sets, attempts, attempt_sections (satu-satunya migrasi rebuild; dipakai juga 021/023).
-- Urutan: DROP VIEW -> buat __new_* -> INSERT..SELECT -> DROP lama -> RENAME -> indeks -> buat ulang VIEW.
DROP VIEW IF EXISTS `v_publish_blockers`;--> statement-breakpoint
CREATE TABLE `__new_assessment_sets` (
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
	`bank_code` text,
	`bank_kind` text,
	`exam_module` text DEFAULT 'GENERAL_TRAINING' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
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
    ("assessment_type" = 'ACTIVE_DRILL'      AND "sub_module_id" IS NOT NULL AND "module_id" IS NULL AND "tier_id" IS NULL) OR
    ("assessment_type" = 'SKIP_MODULE_TEST'  AND "module_id"    IS NOT NULL AND "sub_module_id" IS NULL AND "tier_id" IS NULL) OR
    ("assessment_type" IN ('SKIP_TIER_TEST','TIER_BOSS_EXAM') AND "tier_id" IS NOT NULL AND "sub_module_id" IS NULL AND "module_id" IS NULL) OR
    ("assessment_type" = 'BOSS_SECTION'      AND "parent_set_id" IS NOT NULL) OR
    ("assessment_type" = 'PLACEMENT_TEST'    AND "sub_module_id" IS NULL AND "module_id" IS NULL) OR
    ("assessment_type" = 'QUESTION_BANK'     AND "bank_code" IS NOT NULL AND "bank_kind" IS NOT NULL AND "sub_module_id" IS NULL AND "module_id" IS NULL AND "tier_id" IS NULL AND "parent_set_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_assessment_sets`("id", "assessment_type", "title", "sub_module_id", "module_id", "tier_id", "parent_set_id", "skill_category", "time_limit_seconds", "reading_passage_markdown", "listening_asset_id", "questions_json", "question_count", "pass_percent", "origin", "source_id", "attribution_text", "status", "reviewed_by", "reviewed_at", "version", "content_hash", "created_at", "updated_at") SELECT "id", "assessment_type", "title", "sub_module_id", "module_id", "tier_id", "parent_set_id", "skill_category", "time_limit_seconds", "reading_passage_markdown", "listening_asset_id", "questions_json", "question_count", "pass_percent", "origin", "source_id", "attribution_text", "status", "reviewed_by", "reviewed_at", "version", "content_hash", "created_at", "updated_at" FROM `assessment_sets`;--> statement-breakpoint
DROP TABLE `assessment_sets`;--> statement-breakpoint
ALTER TABLE `__new_assessment_sets` RENAME TO `assessment_sets`;--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_sets_bank_code_uq` ON `assessment_sets` (`bank_code`) WHERE "assessment_sets"."bank_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `assessment_sets_bank_idx` ON `assessment_sets` (`bank_kind`,`status`) WHERE "assessment_sets"."bank_kind" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `assessment_sets_sub_idx` ON `assessment_sets` (`sub_module_id`,`assessment_type`);--> statement-breakpoint
CREATE INDEX `assessment_sets_module_idx` ON `assessment_sets` (`module_id`,`assessment_type`);--> statement-breakpoint
CREATE INDEX `assessment_sets_tier_idx` ON `assessment_sets` (`tier_id`,`assessment_type`);--> statement-breakpoint
CREATE INDEX `assessment_sets_parent_idx` ON `assessment_sets` (`parent_set_id`);--> statement-breakpoint
CREATE TABLE `__new_attempts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`user_id` text NOT NULL,
	`assessment_set_id` text,
	`assessment_type` text NOT NULL,
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
	CONSTRAINT "attempts_set_required_chk" CHECK("assessment_set_id" IS NOT NULL OR "assessment_type" IN ('MIX_PRACTICE','MOCK_TEST','TRACK_CHECKPOINT')),
	CONSTRAINT "attempts_band_chk" CHECK("band_score" IS NULL OR ("band_score" >= 0 AND "band_score" <= 9 AND ("band_score" * 2) = cast("band_score" * 2 as integer)))
);
--> statement-breakpoint
INSERT INTO `__new_attempts`("id", "user_id", "assessment_set_id", "assessment_type", "assessment_version", "mode", "status", "started_at", "deadline_at", "submitted_at", "raw_score", "max_score", "score_percent", "band_score", "band_table_id", "passed", "points_awarded", "state", "result_json", "created_at", "updated_at") SELECT a."id", a."user_id", a."assessment_set_id", s."assessment_type", a."assessment_version", a."mode", a."status", a."started_at", a."deadline_at", a."submitted_at", a."raw_score", a."max_score", a."score_percent", a."band_score", a."band_table_id", a."passed", a."points_awarded", a."state", a."result_json", a."created_at", a."updated_at" FROM `attempts` a LEFT JOIN `assessment_sets` s ON s."id" = a."assessment_set_id";--> statement-breakpoint
DROP TABLE `attempts`;--> statement-breakpoint
ALTER TABLE `__new_attempts` RENAME TO `attempts`;--> statement-breakpoint
CREATE INDEX `attempts_user_started_idx` ON `attempts` (`user_id`,"started_at" desc);--> statement-breakpoint
CREATE INDEX `attempts_user_set_idx` ON `attempts` (`user_id`,`assessment_set_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_one_active_uq` ON `attempts` (`user_id`,`assessment_set_id`) WHERE "attempts"."status" = 'IN_PROGRESS' AND "attempts"."assessment_set_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_one_active_mix_uq` ON `attempts` (`user_id`) WHERE "attempts"."status" = 'IN_PROGRESS' AND "attempts"."assessment_type" = 'MIX_PRACTICE';--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_one_active_mock_uq` ON `attempts` (`user_id`) WHERE "attempts"."status" = 'IN_PROGRESS' AND "attempts"."assessment_type" = 'MOCK_TEST';--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_one_active_checkpoint_uq` ON `attempts` (`user_id`) WHERE "attempts"."status" = 'IN_PROGRESS' AND "attempts"."assessment_type" = 'TRACK_CHECKPOINT';--> statement-breakpoint
CREATE TABLE `__new_attempt_sections` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`attempt_id` text NOT NULL,
	`assessment_set_id` text,
	`skill` text NOT NULL,
	`raw_score` real,
	`max_score` real,
	`band_score` real,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`time_limit_seconds` integer,
	`started_at` integer,
	`deadline_at` integer,
	`submitted_at` integer,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_set_id`) REFERENCES `assessment_sets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_attempt_sections`("attempt_id", "assessment_set_id", "skill", "raw_score", "max_score", "band_score", "status") SELECT "attempt_id", "assessment_set_id", "skill", "raw_score", "max_score", "band_score", "status" FROM `attempt_sections`;--> statement-breakpoint
DROP TABLE `attempt_sections`;--> statement-breakpoint
ALTER TABLE `__new_attempt_sections` RENAME TO `attempt_sections`;--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_sections_set_uq` ON `attempt_sections` (`attempt_id`,`assessment_set_id`) WHERE "attempt_sections"."assessment_set_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_sections_skill_uq` ON `attempt_sections` (`attempt_id`,`skill`) WHERE "attempt_sections"."assessment_set_id" IS NULL;--> statement-breakpoint
CREATE VIEW `v_publish_blockers` AS
SELECT 'LEARNING_MATERIAL' AS entity_type, lm.id AS entity_id, 'ASSET_UNVERIFIED' AS reason_code, 'asset ' || a.id AS detail
FROM learning_materials lm
JOIN (
  SELECT m.id AS lm_id, json_extract(e.value, '$.asset_id') AS aid
    FROM learning_materials m, json_each(CASE WHEN json_valid(m.videos_json) AND json_type(m.videos_json) = 'array' THEN m.videos_json ELSE '[]' END) e
  UNION
  SELECT m.id, json_extract(e.value, '$.asset_id')
    FROM learning_materials m, json_each(CASE WHEN json_valid(m.slides_json) AND json_type(m.slides_json) = 'array' THEN m.slides_json ELSE '[]' END) e
  UNION
  SELECT m.id, json_extract(e.value, '$.asset_id')
    FROM learning_materials m, json_each(CASE WHEN json_valid(m.attachments_json) AND json_type(m.attachments_json) = 'array' THEN m.attachments_json ELSE '[]' END) e
) refs ON refs.lm_id = lm.id
JOIN content_assets a ON a.id = refs.aid
WHERE a.rights_status = 'UNVERIFIED'
UNION ALL
SELECT 'ASSESSMENT_SET', s.id, 'ASSET_UNVERIFIED', 'asset ' || a.id
FROM assessment_sets s JOIN content_assets a ON a.id = s.listening_asset_id
WHERE a.rights_status = 'UNVERIFIED'
UNION ALL
SELECT 'LEARNING_MATERIAL', lm.id, 'SOURCE_MISSING', 'origin OPEN_LICENSED_ADAPTED tanpa source_id'
FROM learning_materials lm WHERE lm.origin = 'OPEN_LICENSED_ADAPTED' AND lm.source_id IS NULL
UNION ALL
SELECT 'ASSESSMENT_SET', s.id, 'SOURCE_MISSING', 'origin OPEN_LICENSED_ADAPTED tanpa source_id'
FROM assessment_sets s WHERE s.origin = 'OPEN_LICENSED_ADAPTED' AND s.source_id IS NULL;
