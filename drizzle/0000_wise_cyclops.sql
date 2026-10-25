CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post` text NOT NULL,
	`user` text NOT NULL,
	`parent` text,
	`body` text NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contestants` (
	`user` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`starter` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`texts` integer DEFAULT 0 NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`points` integer NOT NULL,
	`label` text NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `likes` (
	`id` text PRIMARY KEY NOT NULL,
	`post` text NOT NULL,
	`user` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation` text NOT NULL,
	`sender` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer` text NOT NULL,
	`recipient` text NOT NULL,
	`coins` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`body` text NOT NULL,
	`media` text DEFAULT '[]' NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`surname` text NOT NULL,
	`age` integer NOT NULL,
	`country` text NOT NULL,
	`state` text NOT NULL,
	`city` text NOT NULL,
	`origin_country` text NOT NULL,
	`origin_state` text NOT NULL,
	`avatar` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "nonnegative_balance" CHECK("profiles"."balance">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_username_unique` ON `profiles` (`username`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tv` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`poster` text DEFAULT '' NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`voter` text NOT NULL,
	`contestant` text NOT NULL,
	`coins` integer NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
