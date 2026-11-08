-- SPEC-025: aplikasi lokal satu perangkat. Tabel undangan dihapus; nama profil menjadi unik.
ALTER TABLE "signup_invites" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "signup_invites" CASCADE;--> statement-breakpoint
-- Data lama: tidak ada lagi alur ganti password, jadi bendera wajib-ganti tidak boleh mengunci siapa pun.
UPDATE "users" SET "must_change_password" = false WHERE "must_change_password" = true;--> statement-breakpoint
-- Nama kembar (tanpa memedulikan huruf besar/kecil) diberi akhiran dari id agar indeks unik dapat dibuat.
UPDATE "users" u SET "display_name" = left(u."display_name", 70) || ' (' || substr(u."id"::text, 1, 4) || ')'
WHERE u."deleted_at" IS NULL AND EXISTS (
  SELECT 1 FROM "users" o
  WHERE o."deleted_at" IS NULL AND o."id" <> u."id" AND lower(o."display_name") = lower(u."display_name")
    AND (o."created_at", o."id") < (u."created_at", u."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "users_display_name_lower_uq" ON "users" USING btree (lower("display_name")) WHERE "users"."deleted_at" IS NULL;
