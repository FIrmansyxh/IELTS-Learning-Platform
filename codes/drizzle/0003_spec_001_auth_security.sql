CREATE TABLE "signup_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_by" uuid,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_invites_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_failed_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "consent_recording_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "keep_recordings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "signup_invites" ADD CONSTRAINT "signup_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_invites" ADD CONSTRAINT "signup_invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signup_invites_expires_idx" ON "signup_invites" USING btree ("expires_at");