ALTER TABLE "attempts" DROP CONSTRAINT "attempts_band_table_id_band_conversion_tables_id_fk";
--> statement-breakpoint
ALTER TABLE "import_batch_items" ALTER COLUMN "entity_code" SET DATA TYPE varchar(160);--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_band_table_id_band_conversion_tables_id_fk" FOREIGN KEY ("band_table_id") REFERENCES "public"."band_conversion_tables"("id") ON DELETE restrict ON UPDATE no action;