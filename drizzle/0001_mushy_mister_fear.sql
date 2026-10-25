ALTER TABLE `profiles` ADD `bonus` integer DEFAULT 0 NOT NULL CONSTRAINT nonnegative_bonus CHECK (`bonus` >= 0);
