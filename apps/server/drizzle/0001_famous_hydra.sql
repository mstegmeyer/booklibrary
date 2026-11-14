PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_book` (
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
	`created_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_book`("id", "title", "subtitle", "authors", "description", "page_count", "published_year", "language", "cover_path", "metadata_source", "created_at", "created_by", "updated_at") SELECT "id", "title", "subtitle", "authors", "description", "page_count", "published_year", "language", "cover_path", "metadata_source", "created_at", "created_by", "updated_at" FROM `book`;--> statement-breakpoint
DROP TABLE `book`;--> statement-breakpoint
ALTER TABLE `__new_book` RENAME TO `book`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `book_title_idx` ON `book` (`title`);--> statement-breakpoint
CREATE INDEX `book_created_at_idx` ON `book` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_copy` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`location_id` text,
	`format` text,
	`note` text,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "copy_format_check" CHECK("__new_copy"."format" in ('paperback', 'hardcover', 'other'))
);
--> statement-breakpoint
INSERT INTO `__new_copy`("id", "book_id", "location_id", "format", "note", "created_at", "created_by") SELECT "id", "book_id", "location_id", "format", "note", "created_at", "created_by" FROM `copy`;--> statement-breakpoint
DROP TABLE `copy`;--> statement-breakpoint
ALTER TABLE `__new_copy` RENAME TO `copy`;--> statement-breakpoint
CREATE INDEX `copy_book_id_idx` ON `copy` (`book_id`);--> statement-breakpoint
CREATE INDEX `copy_location_id_idx` ON `copy` (`location_id`);--> statement-breakpoint
CREATE TABLE `__new_loan` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text NOT NULL,
	`book_id` text NOT NULL,
	`copy_id` text,
	`contact_id` text NOT NULL,
	`started_on` text NOT NULL,
	`ended_on` text,
	`note` text,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`copy_id`) REFERENCES `copy`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "loan_direction_check" CHECK("__new_loan"."direction" = 'lent' or "__new_loan"."copy_id" is null)
);
--> statement-breakpoint
INSERT INTO `__new_loan`("id", "direction", "book_id", "copy_id", "contact_id", "started_on", "ended_on", "note") SELECT "id", "direction", "book_id", "copy_id", "contact_id", "started_on", "ended_on", "note" FROM `loan`;--> statement-breakpoint
DROP TABLE `loan`;--> statement-breakpoint
ALTER TABLE `__new_loan` RENAME TO `loan`;--> statement-breakpoint
CREATE INDEX `loan_book_id_idx` ON `loan` (`book_id`);--> statement-breakpoint
CREATE INDEX `loan_copy_id_idx` ON `loan` (`copy_id`);--> statement-breakpoint
CREATE INDEX `loan_contact_id_idx` ON `loan` (`contact_id`);--> statement-breakpoint
CREATE INDEX `loan_ended_on_idx` ON `loan` (`ended_on`);