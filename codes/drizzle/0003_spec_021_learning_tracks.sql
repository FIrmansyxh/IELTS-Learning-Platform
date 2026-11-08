CREATE TABLE `learning_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`kind` text NOT NULL,
	`layout` text DEFAULT 'LIST' NOT NULL,
	`delivery_style_default` text NOT NULL,
	`target_band_min` real NOT NULL,
	`target_band_max` real NOT NULL,
	`recommended_for` text NOT NULL,
	`sort_order` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`content_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `learning_tracks_band_min_chk` CHECK(`learning_tracks`.`target_band_min` >= 0 AND `learning_tracks`.`target_band_min` <= 9 AND (`learning_tracks`.`target_band_min` * 2) = CAST(`learning_tracks`.`target_band_min` * 2 AS INTEGER)),
	CONSTRAINT `learning_tracks_band_max_chk` CHECK(`learning_tracks`.`target_band_max` >= 0 AND `learning_tracks`.`target_band_max` <= 9 AND (`learning_tracks`.`target_band_max` * 2) = CAST(`learning_tracks`.`target_band_max` * 2 AS INTEGER)),
	CONSTRAINT `learning_tracks_band_range_chk` CHECK(`learning_tracks`.`target_band_min` <= `learning_tracks`.`target_band_max`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_tracks_code_unique` ON `learning_tracks` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_tracks_sort_order_uq` ON `learning_tracks` (`sort_order`);--> statement-breakpoint
CREATE TABLE `learning_track_items` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`item_kind` text NOT NULL,
	`sub_module_id` text,
	`order_index` integer NOT NULL,
	`week_no` integer,
	`day_no` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `learning_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sub_module_id`) REFERENCES `sub_modules`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `track_items_kind_chk` CHECK((`learning_track_items`.`item_kind` = 'SUB_MODULE' AND `learning_track_items`.`sub_module_id` IS NOT NULL) OR (`learning_track_items`.`item_kind` = 'CHECKPOINT' AND `learning_track_items`.`sub_module_id` IS NULL)),
	CONSTRAINT `track_items_sprint_chk` CHECK((`learning_track_items`.`week_no` IS NULL AND `learning_track_items`.`day_no` IS NULL) OR (`learning_track_items`.`week_no` BETWEEN 1 AND 4 AND `learning_track_items`.`day_no` BETWEEN 1 AND 5 AND `learning_track_items`.`item_kind` = 'SUB_MODULE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_items_track_order_uq` ON `learning_track_items` (`track_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `track_items_track_sub_uq` ON `learning_track_items` (`track_id`,`sub_module_id`) WHERE `sub_module_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `user_sub_module_styles` (
	`user_id` text NOT NULL,
	`sub_module_id` text NOT NULL,
	`style` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `sub_module_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sub_module_id`) REFERENCES `sub_modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `active_track_id` text REFERENCES `learning_tracks`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `learning_materials` ADD `style` text DEFAULT 'BASE' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `learning_materials_sub_module_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `learning_materials_sub_style_uq` ON `learning_materials` (`sub_module_id`,`style`);
