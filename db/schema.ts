import { integer, primaryKey, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), email: text('email'), passwordHash: text('password_hash'),
  authMethod: text('auth_method').notNull(), isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const authIdentities = sqliteTable('auth_identities', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), subject: text('subject').notNull(), createdAt: text('created_at').notNull(),
}, table => [uniqueIndex('identity_provider_subject').on(table.provider, table.subject), uniqueIndex('identity_provider_user').on(table.provider, table.userId)]);
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(), ageBand: text('age_band').notNull(), mode: text('mode').notNull(),
  difficulty: text('difficulty').notNull(), avatar: text('avatar').notNull(), interestsJson: text('interests_json').notNull(),
  pace: text('pace').notNull(), accessibilityJson: text('accessibility_json').notNull(),
  onboarded: integer('onboarded', { mode: 'boolean' }).notNull().default(false), diagnosticScore: integer('diagnostic_score'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [index('profiles_owner').on(table.userId)]);
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activeProfileId: text('active_profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  expiresAt: text('expires_at').notNull(), createdAt: text('created_at').notNull(),
}, table => [index('sessions_user').on(table.userId), index('sessions_expiry').on(table.expiresAt)]);
export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(), profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull(), mode: text('mode').notNull(), variantId: text('variant_id').notNull(),
  contentVersion: text('content_version').notNull(), assessmentVersion: text('assessment_version').notNull(),
  runtimeVersion: text('runtime_version').notNull(), runId: text('run_id').notNull(), idempotencyKey: text('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(), code: text('code').notNull().default(''), resultJson: text('result_json').notNull(),
  hintLevel: integer('hint_level').notNull().default(0), reflectionCorrect: integer('reflection_correct', { mode: 'boolean' }),
  accepted: integer('accepted', { mode: 'boolean' }).notNull(), reviewSkillsJson: text('review_skills_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
}, table => [uniqueIndex('submission_idempotency').on(table.profileId, table.idempotencyKey), uniqueIndex('submission_run_once').on(table.profileId, table.runId), index('submissions_profile_lesson').on(table.profileId, table.lessonId)]);
export const xpLedger = sqliteTable('xp_ledger', {
  id: text('id').primaryKey(), profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull(), submissionId: text('submission_id').notNull().references(() => submissions.id),
  points: integer('points').notNull(), awardedAt: text('awarded_at').notNull(),
}, table => [uniqueIndex('xp_once_per_core_lesson').on(table.profileId, table.lessonId)]);
export const skillEvidence = sqliteTable('skill_evidence', {
  id: text('id').primaryKey(), profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  skillId: text('skill_id').notNull(), lessonId: text('lesson_id').notNull(), mode: text('mode').notNull(),
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  accepted: integer('accepted', { mode: 'boolean' }).notNull(), assisted: integer('assisted', { mode: 'boolean' }).notNull(),
  independent: integer('independent', { mode: 'boolean' }).notNull(), wasReviewDue: integer('was_review_due', { mode: 'boolean' }).notNull(),
  recordedAt: text('recorded_at').notNull(),
}, table => [uniqueIndex('evidence_submission_skill').on(table.submissionId, table.skillId), index('evidence_profile_skill').on(table.profileId, table.skillId)]);
export const skillMastery = sqliteTable('skill_mastery', {
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }), skillId: text('skill_id').notNull(),
  level: integer('level').notNull().default(0), evidenceCount: integer('evidence_count').notNull().default(0),
  lastPracticed: text('last_practiced'), nextReviewAt: text('next_review_at'),
}, table => [primaryKey({ columns: [table.profileId, table.skillId] })]);
export const reviewQueue = sqliteTable('review_queue', {
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }), skillId: text('skill_id').notNull(),
  lessonId: text('lesson_id').notNull(), dueAt: text('due_at').notNull(), level: integer('level').notNull(),
}, table => [primaryKey({ columns: [table.profileId, table.skillId] }), index('reviews_due').on(table.profileId, table.dueAt)]);
export const storyFlags = sqliteTable('story_flags', {
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }), flag: text('flag').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [primaryKey({ columns: [table.profileId, table.flag] })]);
export const practiceDays = sqliteTable('practice_days', {
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }), day: text('day').notNull(),
}, table => [primaryKey({ columns: [table.profileId, table.day] })]);
export const drafts = sqliteTable('drafts', {
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }), lessonId: text('lesson_id').notNull(),
  mode: text('mode').notNull(), code: text('code').notNull(), revision: integer('revision').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.profileId, table.lessonId, table.mode] })]);
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull(), title: text('title').notNull(), mode: text('mode').notNull(), code: text('code').notNull(),
  filesJson: text('files_json').notNull(), configJson: text('config_json').notNull(), revision: integer('revision').notNull(),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [index('projects_owner').on(table.profileId)]);
export const projectRevisions = sqliteTable('project_revisions', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }), revision: integer('revision').notNull(),
  lessonId: text('lesson_id').notNull(), title: text('title').notNull(), mode: text('mode').notNull(), code: text('code').notNull(),
  filesJson: text('files_json').notNull(), configJson: text('config_json').notNull(),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [uniqueIndex('project_revision_number').on(table.projectId, table.revision)]);
export const tutorEvents = sqliteTable('tutor_events', {
  id: text('id').primaryKey(), profileId: text('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').notNull(), mode: text('mode').notNull(), hintLevel: integer('hint_level').notNull(),
  provider: text('provider').notNull(), message: text('message').notNull(), sharedCode: integer('shared_code', { mode: 'boolean' }).notNull(),
  usageJson: text('usage_json').notNull().default('{}'), createdAt: text('created_at').notNull(),
}, table => [index('tutor_profile_lesson').on(table.profileId, table.lessonId, table.createdAt)]);
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull().default(0), expiresAt: text('expires_at').notNull(),
}, table => [index('rate_limit_expiry').on(table.expiresAt)]);
