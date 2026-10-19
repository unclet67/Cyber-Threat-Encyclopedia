CREATE TABLE `profiles` (
	`user_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`document` text,
	`revision` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `actor_id`)
);
