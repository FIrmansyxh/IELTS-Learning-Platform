-- custom: FK melingkar yang ditunda dari 0000_init (hindari impor melingkar di schema.ts)
ALTER TABLE "user_last_learned_state"
  ADD CONSTRAINT "user_last_learned_state_active_attempt_id_attempts_id_fk"
  FOREIGN KEY ("active_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "async_jobs"
  ADD CONSTRAINT "async_jobs_import_batch_id_import_batches_id_fk"
  FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
