-- SPEC-026: jadwal ulang soal yang dijawab salah (pengulangan berjarak, Leitner 5 kotak). Hanya tabel baru.
CREATE TABLE `question_reviews` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`user_id` text NOT NULL,
	`assessment_set_id` text NOT NULL,
	`question_id` text NOT NULL,
	`skill` text,
	`box` integer DEFAULT 1 NOT NULL,
	`due_at` integer,
	`lapses` integer DEFAULT 1 NOT NULL,
	`last_answered_at` integer NOT NULL,
	`mastered_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_set_id`) REFERENCES `assessment_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `question_reviews_box_chk` CHECK(`question_reviews`.`box` >= 1 AND `question_reviews`.`box` <= 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_reviews_uq` ON `question_reviews` (`user_id`,`assessment_set_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `question_reviews_due_idx` ON `question_reviews` (`user_id`,`due_at`);
