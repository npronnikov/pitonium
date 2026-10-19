CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_provider_subject` ON `auth_identities` (`provider`,`subject`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`profile_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`mode` text NOT NULL,
	`code` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `lesson_id`, `mode`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `practice_days` (
	`profile_id` text NOT NULL,
	`day` text NOT NULL,
	PRIMARY KEY(`profile_id`, `day`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`age_band` text NOT NULL,
	`mode` text NOT NULL,
	`difficulty` text NOT NULL,
	`avatar` text NOT NULL,
	`interests_json` text NOT NULL,
	`pace` text NOT NULL,
	`accessibility_json` text NOT NULL,
	`onboarded` integer DEFAULT false NOT NULL,
	`diagnostic_score` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profiles_owner` ON `profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `project_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`revision` integer NOT NULL,
	`lesson_id` text NOT NULL,
	`title` text NOT NULL,
	`mode` text NOT NULL,
	`code` text NOT NULL,
	`files_json` text NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_revision_number` ON `project_revisions` (`project_id`,`revision`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`title` text NOT NULL,
	`mode` text NOT NULL,
	`code` text NOT NULL,
	`files_json` text NOT NULL,
	`config_json` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_owner` ON `projects` (`profile_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `review_queue` (
	`profile_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`due_at` text NOT NULL,
	`level` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `skill_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reviews_due` ON `review_queue` (`profile_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`active_profile_id` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `skill_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`mode` text NOT NULL,
	`submission_id` text NOT NULL,
	`accepted` integer NOT NULL,
	`assisted` integer NOT NULL,
	`independent` integer NOT NULL,
	`was_review_due` integer NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_submission_skill` ON `skill_evidence` (`submission_id`,`skill_id`);--> statement-breakpoint
CREATE INDEX `evidence_profile_skill` ON `skill_evidence` (`profile_id`,`skill_id`);--> statement-breakpoint
CREATE TABLE `skill_mastery` (
	`profile_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`last_practiced` text,
	`next_review_at` text,
	PRIMARY KEY(`profile_id`, `skill_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `story_flags` (
	`profile_id` text NOT NULL,
	`flag` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `flag`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`mode` text NOT NULL,
	`variant_id` text NOT NULL,
	`content_version` text NOT NULL,
	`assessment_version` text NOT NULL,
	`runtime_version` text NOT NULL,
	`run_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`result_json` text NOT NULL,
	`hint_level` integer DEFAULT 0 NOT NULL,
	`reflection_correct` integer,
	`accepted` integer NOT NULL,
	`review_skills_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_idempotency` ON `submissions` (`profile_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `submission_run_once` ON `submissions` (`profile_id`,`run_id`);--> statement-breakpoint
CREATE INDEX `submissions_profile_lesson` ON `submissions` (`profile_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `tutor_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`mode` text NOT NULL,
	`hint_level` integer NOT NULL,
	`provider` text NOT NULL,
	`message` text NOT NULL,
	`shared_code` integer NOT NULL,
	`usage_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tutor_profile_lesson` ON `tutor_events` (`profile_id`,`lesson_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`password_hash` text,
	`auth_method` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `xp_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`points` integer NOT NULL,
	`awarded_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xp_once_per_core_lesson` ON `xp_ledger` (`profile_id`,`lesson_id`);