CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `book` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`authors` text DEFAULT '[]' NOT NULL,
	`description` text,
	`page_count` integer,
	`published_year` integer,
	`language` text,
	`cover_path` text,
	`metadata_source` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `book_title_idx` ON `book` (`title`);--> statement-breakpoint
CREATE INDEX `book_created_at_idx` ON `book` (`created_at`);--> statement-breakpoint
CREATE TABLE `book_identifier` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`isbn13` text NOT NULL,
	`label` text,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_identifier_isbn13_unique` ON `book_identifier` (`isbn13`);--> statement-breakpoint
CREATE INDEX `book_identifier_book_id_idx` ON `book_identifier` (`book_id`);--> statement-breakpoint
CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_name_idx` ON `contact` (`name`);--> statement-breakpoint
CREATE TABLE `copy` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`location_id` text,
	`format` text,
	`note` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "copy_format_check" CHECK("copy"."format" in ('paperback', 'hardcover', 'other'))
);
--> statement-breakpoint
CREATE INDEX `copy_book_id_idx` ON `copy` (`book_id`);--> statement-breakpoint
CREATE INDEX `copy_location_id_idx` ON `copy` (`location_id`);--> statement-breakpoint
CREATE TABLE `loan` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text NOT NULL,
	`book_id` text NOT NULL,
	`copy_id` text,
	`contact_id` text NOT NULL,
	`started_on` text NOT NULL,
	`ended_on` text,
	`note` text,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`copy_id`) REFERENCES `copy`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "loan_direction_check" CHECK(("loan"."direction" = 'lent' and "loan"."copy_id" is not null) or ("loan"."direction" = 'borrowed' and "loan"."copy_id" is null))
);
--> statement-breakpoint
CREATE INDEX `loan_book_id_idx` ON `loan` (`book_id`);--> statement-breakpoint
CREATE INDEX `loan_copy_id_idx` ON `loan` (`copy_id`);--> statement-breakpoint
CREATE INDEX `loan_contact_id_idx` ON `loan` (`contact_id`);--> statement-breakpoint
CREATE INDEX `loan_ended_on_idx` ON `loan` (`ended_on`);--> statement-breakpoint
CREATE TABLE `location` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `location_parent_id_idx` ON `location` (`parent_id`,`position`);--> statement-breakpoint
CREATE TABLE `reading` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`status` text NOT NULL,
	`started_on` text,
	`ended_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reading_status_check" CHECK("reading"."status" in ('want', 'reading', 'read', 'abandoned'))
);
--> statement-breakpoint
CREATE INDEX `reading_user_book_idx` ON `reading` (`user_id`,`book_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reading_book_id_idx` ON `reading` (`book_id`);--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`reading_id` text NOT NULL,
	`date` text NOT NULL,
	`page` integer NOT NULL,
	FOREIGN KEY (`reading_id`) REFERENCES `reading`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_progress_reading_id_idx` ON `reading_progress` (`reading_id`,`date`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);