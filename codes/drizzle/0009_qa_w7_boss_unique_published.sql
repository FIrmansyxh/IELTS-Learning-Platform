-- QA F-14-01. Perbaikan data (idempoten, hanya bila ada duplikat): arsipkan duplikat PUBLISHED lama sebelum unique index dibuat.
-- Dipertahankan: version tertinggi, lalu created_at terbaru, lalu id terbesar.
UPDATE "assessment_sets" s SET "status" = 'ARCHIVED', "updated_at" = now()
WHERE s."assessment_type" = 'BOSS_SECTION' AND s."status" = 'PUBLISHED' AND EXISTS (
  SELECT 1 FROM "assessment_sets" o
  WHERE o."assessment_type" = 'BOSS_SECTION' AND o."status" = 'PUBLISHED' AND o."parent_set_id" = s."parent_set_id"
    AND o."skill_category" IS NOT DISTINCT FROM s."skill_category" AND o."id" <> s."id"
    AND (o."version", o."created_at", o."id") > (s."version", s."created_at", s."id"));--> statement-breakpoint
UPDATE "assessment_sets" s SET "status" = 'ARCHIVED', "updated_at" = now()
WHERE s."assessment_type" = 'TIER_BOSS_EXAM' AND s."status" = 'PUBLISHED' AND EXISTS (
  SELECT 1 FROM "assessment_sets" o
  WHERE o."assessment_type" = 'TIER_BOSS_EXAM' AND o."status" = 'PUBLISHED' AND o."tier_id" = s."tier_id" AND o."id" <> s."id"
    AND (o."version", o."created_at", o."id") > (s."version", s."created_at", s."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_sets_boss_child_skill_uq" ON "assessment_sets" USING btree ("parent_set_id","skill_category") WHERE "assessment_sets"."assessment_type" = 'BOSS_SECTION' AND "assessment_sets"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_sets_boss_tier_published_uq" ON "assessment_sets" USING btree ("tier_id") WHERE "assessment_sets"."assessment_type" = 'TIER_BOSS_EXAM' AND "assessment_sets"."status" = 'PUBLISHED';