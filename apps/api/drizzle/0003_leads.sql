CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`consent_at` integer NOT NULL,
	`consent_text_version` text NOT NULL,
	`domain` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leads_domain_idx` ON `leads` (`domain`);--> statement-breakpoint
CREATE INDEX `leads_created_at_idx` ON `leads` (`created_at`);--> statement-breakpoint
ALTER TABLE `audits` ADD `lead_id` integer REFERENCES leads(id);