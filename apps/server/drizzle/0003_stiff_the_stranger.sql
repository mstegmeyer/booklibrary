CREATE TABLE `book_file` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`format` text NOT NULL,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`upload_sha256` text NOT NULL,
	`is_protected` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "book_file_format_check" CHECK("book_file"."format" in ('epub', 'pdf'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_file_path_unique` ON `book_file` (`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `book_file_book_format_idx` ON `book_file` (`book_id`,`format`);--> statement-breakpoint
CREATE INDEX `book_file_sha256_idx` ON `book_file` (`sha256`);--> statement-breakpoint
CREATE INDEX `book_file_upload_sha256_idx` ON `book_file` (`upload_sha256`);