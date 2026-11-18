CREATE TABLE `audits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audits_token_hash_unique` ON `audits` (`token_hash`);--> statement-breakpoint
CREATE INDEX `audits_domain_idx` ON `audits` (`domain`);--> statement-breakpoint
CREATE INDEX `audits_created_at_idx` ON `audits` (`created_at`);--> statement-breakpoint
CREATE INDEX `audits_expires_at_idx` ON `audits` (`expires_at`);--> statement-breakpoint
CREATE INDEX `audits_status_idx` ON `audits` (`status`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`audit_id` integer NOT NULL,
	`check_id` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`evidence` text,
	`recommendation` text NOT NULL,
	`effort` text NOT NULL,
	FOREIGN KEY (`audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `findings_audit_id_idx` ON `findings` (`audit_id`);