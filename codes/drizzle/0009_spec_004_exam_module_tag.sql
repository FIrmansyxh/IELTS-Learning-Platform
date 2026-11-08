CREATE TYPE "public"."exam_module" AS ENUM('COMMON', 'GENERAL_TRAINING', 'ACADEMIC');--> statement-breakpoint
ALTER TABLE "sub_modules" ADD COLUMN "exam_module" "exam_module" DEFAULT 'COMMON' NOT NULL;
--> statement-breakpoint
UPDATE "sub_modules" SET "exam_module" = 'ACADEMIC' WHERE "sub_module_code" IN ('3.3.1', '4.1.1');--> statement-breakpoint
UPDATE "tiers" SET "title" = 'Bridge to IELTS' WHERE "tier_number" = 2 AND "title" = 'Bridge to Academic';--> statement-breakpoint
UPDATE "modules" SET "title" = 'IELTS Reading Strategies' WHERE "module_code" = '3.2' AND "title" = 'IELTS Academic Reading Hacks';
