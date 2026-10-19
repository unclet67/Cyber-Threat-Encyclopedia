CREATE TABLE `galaxy_reviews` (
	`user_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`document` text NOT NULL,
	`revision` integer NOT NULL,
	PRIMARY KEY(`user_id`, `actor_id`, `entry_id`, `snapshot_id`)
);
