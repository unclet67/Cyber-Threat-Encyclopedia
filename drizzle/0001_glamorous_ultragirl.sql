CREATE TABLE `research_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`base_revision` integer NOT NULL,
	`response_id` text,
	`status` text NOT NULL,
	`result` text,
	`created_at` integer NOT NULL
);
