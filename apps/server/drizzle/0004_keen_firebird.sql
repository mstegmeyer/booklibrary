CREATE TABLE `genre` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text,
	`name` text,
	CONSTRAINT "genre_key_or_name_check" CHECK("genre"."key" is not null or "genre"."name" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genre_key_unique` ON `genre` (`key`);--> statement-breakpoint
ALTER TABLE `book` ADD `genre_id` text REFERENCES genre(id) ON UPDATE no action ON DELETE restrict;--> statement-breakpoint
CREATE INDEX `book_genre_id_idx` ON `book` (`genre_id`);--> statement-breakpoint
-- The built-in genres are seeded here, once, so that one people delete stays deleted.
INSERT INTO `genre` (`id`, `key`) VALUES
	('14b53131-77ec-433b-b9c1-f6f3e0a9784b', 'novel'),
	('7ba6876e-9a30-4e52-9c59-876d8ae37232', 'crime'),
	('958ebed5-fdbc-44a7-bc1c-8af6633fa184', 'thriller'),
	('7e17a346-7973-49bf-9ae3-eebe01a326d5', 'fantasy'),
	('e65b7b88-8bb4-4ce8-9d8c-e2bb9cab6a9d', 'science-fiction'),
	('a665ecbd-9385-41b7-af49-62eae244874d', 'historical-novel'),
	('3e7db746-ea19-4ddc-8a14-a8b3bc8b1121', 'romance'),
	('3390e1ad-2fe8-417b-a8f4-def0ac3e66a7', 'horror'),
	('3917d008-2a25-45c2-bb9b-f50df60292f6', 'humour'),
	('7fb4fd11-fd52-47b2-813d-d58ad11eeec7', 'classic'),
	('847ff893-b0ed-43db-8592-f198335f26d0', 'childrens-book'),
	('24c78fd2-869a-4472-a4b1-9ab629da58e5', 'young-adult'),
	('b0eb1222-2765-4232-b9a9-becc62972dbd', 'comic'),
	('c8bde6b1-3db5-44f3-ac25-a552f54c0800', 'poetry-drama'),
	('f91117e2-3a4d-4cc1-a6a5-6a01e61c11c2', 'non-fiction'),
	('5cb39aa9-f381-4fe1-9489-2d4158522a1b', 'biography'),
	('895de3e1-90bc-4a19-b5e0-2a3f2026aedb', 'history'),
	('76665b67-5dbe-4fc7-8a99-a42e1a064f8e', 'politics-society'),
	('a58431e8-4ae2-43d0-b3c8-ba7e3e24e5ff', 'science-nature'),
	('28b2807a-4351-483b-9a97-8c23a6e81d84', 'guide'),
	('d4bdaafe-6b7d-4f79-92d0-bae986537234', 'cookbook'),
	('124ffce3-28b0-4c62-a76c-1b6101a41ad2', 'travel-guide'),
	('68957157-40d4-43b7-bc54-b821fed07567', 'art-photography'),
	('46dcd454-5436-4c1c-bc50-ee7f431bf71f', 'reference');
