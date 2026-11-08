/**
 * REFERENCE Drizzle schema (PostgreSQL 16) untuk ielts-learning-platform.
 * Owner: Data Architect. Status: Draft (menunggu review human).
 *
 * Kontrak struktur ada di data-model.md. File ini adalah terjemahan Drizzle-nya;
 * Backend Engineer menyalinnya ke codes/<app>/src/db/schema.ts lalu menjalankan
 * `drizzle-kit generate`. Jangan memakai `drizzle-kit push` di luar dev lokal.
 * Skema `pgboss` dikelola pg-boss sendiri; WAJIB dikecualikan:
 *   drizzle.config.ts -> schemaFilter: ['public']
 */
import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, varchar, text, integer, smallint, numeric, boolean,
  timestamp, jsonb, bigserial, index, uniqueIndex, primaryKey, check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
/** Band IELTS: 0.0-9.0 kelipatan 0.5 */
const band = (name: string) => numeric(name, { precision: 2, scale: 1 });
const bandCheck = (n: string, col: AnyPgColumn) =>
  check(n, sql`${col} IS NULL OR (${col} >= 0 AND ${col} <= 9 AND (${col} * 2) = floor(${col} * 2))`);

// ───────────────────────────── ENUMS ─────────────────────────────
export const userRole = pgEnum('user_role', ['learner', 'admin']);
export const userStatus = pgEnum('user_status', ['ACTIVE', 'DISABLED']);
export const skillCategory = pgEnum('skill_category', ['GRAMMAR', 'VOCAB', 'LISTENING', 'READING', 'WRITING', 'SPEAKING']);
export const gateType = pgEnum('gate_type', ['PERCENT', 'BAND']);
export const progressStatus = pgEnum('progress_status', ['LOCKED', 'UNLOCKED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']);
export const unlockSource = pgEnum('unlock_source', ['DEFAULT', 'SEQUENTIAL', 'SKIP_TEST', 'PLACEMENT', 'BOSS_PASS', 'ADMIN']);
export const crown = pgEnum('mastery_crown', ['NONE', 'SILVER', 'GOLD']);
export const activeTab = pgEnum('active_tab', ['LEARN', 'DRILL', 'MINI_TASK']);
export const learnSubtab = pgEnum('learn_subtab', ['ARTICLE', 'VIDEO', 'SLIDES']);
export const assessmentType = pgEnum('assessment_type', [
  'ACTIVE_DRILL', 'SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'PLACEMENT_TEST', 'BOSS_SECTION',
]);
export const reviewStatus = pgEnum('review_status', ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']);
/** Sengaja TIDAK ada nilai 'COPYRIGHTED_COPY': materi berhak cipta tidak boleh disalin ke DB. */
export const contentOrigin = pgEnum('content_origin', ['ORIGINAL_AUTHORED', 'AI_GENERATED_REVIEWED', 'OPEN_LICENSED_ADAPTED']);
export const licenseType = pgEnum('license_type', [
  'OWN', 'CC0', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'MIT', 'EMBED_TOS', 'LINK_ONLY_COPYRIGHTED', 'OTHER',
]);
export const rightsStatus = pgEnum('rights_status', ['UNVERIFIED', 'VERIFIED_OPEN', 'OWN_ORIGINAL', 'EMBED_ONLY', 'LINK_ONLY']);
export const assetKind = pgEnum('asset_kind', ['SLIDE_IMAGE', 'DOCUMENT', 'AUDIO_LISTENING', 'VIDEO_EMBED', 'IMAGE', 'REFERENCE_LINK']);
export const storageBackend = pgEnum('storage_backend', ['FILESYSTEM', 'MINIO', 'EXTERNAL']);
export const attemptMode = pgEnum('attempt_mode', ['PRACTICE', 'EXAM']);
export const attemptStatus = pgEnum('attempt_status', ['IN_PROGRESS', 'SUBMITTED', 'AWAITING_GRADING', 'GRADED', 'EXPIRED', 'ABANDONED']);
export const submissionKind = pgEnum('submission_kind', [
  'WRITING_TASK1', 'WRITING_TASK2', 'MINI_TASK_WRITING', 'SPEAKING_PART1', 'SPEAKING_PART2', 'SPEAKING_PART3', 'MINI_TASK_SPEAKING',
]);
export const submissionStatus = pgEnum('submission_status', ['RECEIVED', 'TRANSCRIBING', 'GRADING', 'GRADED', 'FALLBACK_SELF_ASSESSMENT', 'FAILED']);
export const asyncJobKind = pgEnum('async_job_kind', ['STT_TRANSCRIBE', 'GRADE_WRITING', 'GRADE_SPEAKING', 'IMPORT_VALIDATE', 'IMPORT_PUBLISH', 'RETENTION_PURGE']);
export const asyncJobStatus = pgEnum('async_job_status', ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']);
export const examModule = pgEnum('exam_module', ['COMMON', 'GENERAL_TRAINING', 'ACADEMIC']);
export const evalMethod = pgEnum('eval_method', ['AI_LOCAL', 'SELF_ASSESSMENT', 'EXTERNAL_AI']);
export const importFormat = pgEnum('import_format', ['JSON', 'CSV']);
export const importStatus = pgEnum('import_status', [
  'UPLOADED', 'VALIDATING', 'PREVIEW_READY', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'ROLLED_BACK',
]);
export const importItemStatus = pgEnum('import_item_status', ['VALID', 'INVALID', 'APPLIED', 'SKIPPED']);
export const importAction = pgEnum('import_action', ['CREATE', 'UPDATE', 'NOOP']);
export const bandTableSkill = pgEnum('band_table_skill', ['LISTENING', 'READING_ACADEMIC', 'READING_GENERAL']);
export const pointSource = pgEnum('point_source', ['DRILL', 'SPEED_STREAK', 'CROWN', 'MINI_TASK', 'BOSS', 'DAILY', 'ADJUSTMENT']);

// ───────────────────────────── AUTH ─────────────────────────────
// Auth.js Credentials => strategi JWT (httpOnly cookie), jadi tabel sessions/accounts TIDAK dibuat.
// Bila OAuth/adapter ditambahkan kelak: tambah accounts, sessions, verification_tokens lewat ADR.
export const users = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 254 }).notNull(),            // PII
  displayName: varchar('display_name', { length: 80 }).notNull(), // PII ringan
  passwordHash: text('password_hash').notNull(),                  // argon2id/bcrypt, tidak pernah dikembalikan API
  role: userRole('role').notNull().default('learner'),
  status: userStatus('status').notNull().default('ACTIVE'),
  targetBand: band('target_band'),
  placementCompletedAt: ts('placement_completed_at'),
  failedLoginCount: smallint('failed_login_count').notNull().default(0),
  lockedUntil: ts('locked_until'),
  lastLoginAt: ts('last_login_at'),
  // SPEC-001 (migrasi spec_001_auth_security)
  tokenVersion: integer('token_version').notNull().default(0),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  lastFailedLoginAt: ts('last_failed_login_at'),
  consentRecordingAt: ts('consent_recording_at'),               // dipakai SPEC-013
  keepRecordings: boolean('keep_recordings').notNull().default(true), // dipakai SPEC-013
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts('deleted_at'),                                    // soft delete -> anonymize
}, (t) => [
  uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
  bandCheck('users_target_band_chk', t.targetBand),
]);

// SPEC-001: undangan pendaftaran (hanya hash kode yang disimpan)
export const signupInvites = pgTable('signup_invites', {
  id: id(),
  codeHash: varchar('code_hash', { length: 64 }).notNull().unique(), // sha256 hex dari kode ternormalisasi (huruf besar, tanpa '-')
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('signup_invites_expires_idx').on(t.expiresAt)]);

// ───────────────────── SUMBER & LISENSI (dibaca duluan: dipakai tabel konten) ─────────────────────
export const contentSources = pgTable('content_sources', {
  id: id(),
  code: varchar('code', { length: 40 }).notNull().unique(),       // 'NGSL', 'TATOEBA', 'OWN', 'YOUTUBE', 'CAMBRIDGE_REF'
  name: varchar('name', { length: 150 }).notNull(),
  url: text('url'),
  licenseType: licenseType('license_type').notNull(),
  licenseNote: text('license_note'),                              // mis. versi CC, URL lisensi
  attributionTemplate: text('attribution_template'),
  shareAlike: boolean('share_alike').notNull().default(false),
  nonCommercialOnly: boolean('non_commercial_only').notNull().default(false),
  mayStoreCopy: boolean('may_store_copy').notNull().default(false),    // false utk LINK_ONLY_COPYRIGHTED/EMBED_TOS
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  // sumber berhak cipta tidak boleh ditandai boleh disimpan
  check('content_sources_nocopy_chk',
    sql`NOT (${t.licenseType} IN ('LINK_ONLY_COPYRIGHTED','EMBED_TOS') AND ${t.mayStoreCopy})`),
]);

export const contentAssets = pgTable('content_assets', {
  id: id(),
  assetCode: varchar('asset_code', { length: 80 }),               // SPEC-004 (spec_004_content_foundation)
  kind: assetKind('kind').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  sourceId: uuid('source_id').notNull().references(() => contentSources.id, { onDelete: 'restrict' }),
  rightsStatus: rightsStatus('rights_status').notNull().default('UNVERIFIED'),
  storageBackend: storageBackend('storage_backend').notNull(),
  storageKey: text('storage_key'),               // path relatif volume / key MinIO (null utk EXTERNAL)
  externalUrl: text('external_url'),             // YouTube watch URL / tautan rujukan
  externalRef: varchar('external_ref', { length: 64 }), // mis. YouTube video_id
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: integer('size_bytes'),
  sha256: varchar('sha256', { length: 64 }),
  durationSec: integer('duration_sec'),
  attributionText: text('attribution_text'),     // teks atribusi final yang ditampilkan di UI
  licenseVerifiedAt: ts('license_verified_at'),
  licenseVerifiedBy: uuid('license_verified_by').references(() => users.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('content_assets_source_idx').on(t.sourceId),
  index('content_assets_rights_idx').on(t.rightsStatus),
  uniqueIndex('content_assets_sha256_uq').on(t.sha256).where(sql`${t.sha256} IS NOT NULL`),
  uniqueIndex('content_assets_asset_code_uq').on(t.assetCode).where(sql`${t.assetCode} IS NOT NULL`),
  // LINK_ONLY / EMBED_ONLY: tidak boleh ada salinan tersimpan
  check('content_assets_nocopy_chk',
    sql`NOT (${t.rightsStatus} IN ('LINK_ONLY','EMBED_ONLY') AND ${t.storageKey} IS NOT NULL)`),
  check('content_assets_location_chk',
    sql`(${t.storageBackend} = 'EXTERNAL' AND ${t.externalUrl} IS NOT NULL) OR (${t.storageBackend} <> 'EXTERNAL' AND ${t.storageKey} IS NOT NULL)`),
]);

// ───────────────────────────── KURIKULUM ─────────────────────────────
export const tiers = pgTable('tiers', {
  id: id(),
  tierNumber: smallint('tier_number').notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  cefrLevel: varchar('cefr_level', { length: 20 }).notNull(),
  targetBandMin: band('target_band_min').notNull(),
  targetBandMax: band('target_band_max').notNull(),
  // pengganti required_boss_score ambigu di PRD
  bossGateType: gateType('boss_gate_type').notNull(),
  bossGateValue: numeric('boss_gate_value', { precision: 4, scale: 1 }).notNull(), // PERCENT: 80.0 | BAND: 5.0
  skipThresholdPercent: smallint('skip_threshold_percent').notNull().default(85),
  skipTimeLimitSeconds: integer('skip_time_limit_seconds'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  bandCheck('tiers_band_min_chk', t.targetBandMin),
  bandCheck('tiers_band_max_chk', t.targetBandMax),
]);

export const modules = pgTable('modules', {
  id: id(),
  tierId: uuid('tier_id').notNull().references(() => tiers.id, { onDelete: 'restrict' }),
  moduleCode: varchar('module_code', { length: 20 }).notNull().unique(), // '2.1'
  skillCategory: skillCategory('skill_category').notNull(),
  title: varchar('title', { length: 150 }).notNull(),
  orderIndex: integer('order_index').notNull(),
  status: reviewStatus('status').notNull().default('DRAFT'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('modules_tier_order_uq').on(t.tierId, t.orderIndex),
]);

export const subModules = pgTable('sub_modules', {
  id: id(),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'restrict' }),
  subModuleCode: varchar('sub_module_code', { length: 20 }).notNull().unique(), // '2.1.3'
  title: varchar('title', { length: 200 }).notNull(),
  passingScorePercent: smallint('passing_score_percent').notNull().default(75),
  orderIndex: integer('order_index').notNull(),
  status: reviewStatus('status').notNull().default('DRAFT'),
  /** ADR-004: COMMON dipakai kedua ujian; GENERAL_TRAINING/ACADEMIC hanya tampil bila sesuai EXAM_MODULE. */
  examModule: examModule('exam_module').notNull().default('COMMON'),
  contentVersion: integer('content_version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('sub_modules_module_order_uq').on(t.moduleId, t.orderIndex),
  check('sub_modules_pass_chk', sql`${t.passingScorePercent} BETWEEN 1 AND 100`),
]);

export const learningMaterials = pgTable('learning_materials', {
  id: id(),
  subModuleId: uuid('sub_module_id').notNull().unique().references(() => subModules.id, { onDelete: 'cascade' }),
  articleMarkdown: text('article_markdown').notNull(),
  // elemen JSONB menyimpan asset_id (uuid -> content_assets) + metadata tampilan, BUKAN url mentah
  videosJson: jsonb('videos_json').notNull().default(sql`'[]'::jsonb`),       // [{asset_id,start_sec,end_sec,language,title}]
  slidesJson: jsonb('slides_json').notNull().default(sql`'[]'::jsonb`),       // [{asset_id,order,caption}]
  attachmentsJson: jsonb('attachments_json').notNull().default(sql`'[]'::jsonb`), // [{asset_id,title,file_type}]
  miniTaskJson: jsonb('mini_task_json').notNull().default(sql`'{}'::jsonb`),  // {task_type,prompt,ai_rubric_criteria}
  origin: contentOrigin('origin').notNull(),
  sourceId: uuid('source_id').references(() => contentSources.id, { onDelete: 'restrict' }),
  attributionText: text('attribution_text'),
  contentVersion: integer('content_version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const assessmentSets = pgTable('assessment_sets', {
  id: id(),
  assessmentType: assessmentType('assessment_type').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  // scope; tepat satu terisi sesuai assessment_type (lihat CHECK)
  subModuleId: uuid('sub_module_id').references(() => subModules.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'cascade' }),
  tierId: uuid('tier_id').references(() => tiers.id, { onDelete: 'cascade' }),
  parentSetId: uuid('parent_set_id').references((): AnyPgColumn => assessmentSets.id, { onDelete: 'cascade' }), // Boss: induk -> section
  skillCategory: skillCategory('skill_category'),                   // untuk BOSS_SECTION / skor radar
  timeLimitSeconds: integer('time_limit_seconds').notNull(),
  readingPassageMarkdown: text('reading_passage_markdown'),
  listeningAssetId: uuid('listening_asset_id').references(() => contentAssets.id, { onDelete: 'restrict' }),
  questionsJson: jsonb('questions_json').notNull().default(sql`'[]'::jsonb`), // kontrak v1.1 (lihat data-model.md 3.x)
  questionCount: smallint('question_count').notNull().default(0),
  passPercent: smallint('pass_percent'),                            // override; null => ikut sub_modules/tiers
  origin: contentOrigin('origin').notNull(),
  sourceId: uuid('source_id').references(() => contentSources.id, { onDelete: 'restrict' }),
  attributionText: text('attribution_text'),
  status: reviewStatus('status').notNull().default('DRAFT'),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: ts('reviewed_at'),
  version: integer('version').notNull().default(1),
  contentHash: varchar('content_hash', { length: 64 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('assessment_sets_sub_idx').on(t.subModuleId, t.assessmentType),
  index('assessment_sets_module_idx').on(t.moduleId, t.assessmentType),
  index('assessment_sets_tier_idx').on(t.tierId, t.assessmentType),
  index('assessment_sets_parent_idx').on(t.parentSetId),
  check('assessment_sets_scope_chk', sql`
    (${t.assessmentType} = 'ACTIVE_DRILL'      AND ${t.subModuleId} IS NOT NULL AND ${t.moduleId} IS NULL AND ${t.tierId} IS NULL) OR
    (${t.assessmentType} = 'SKIP_MODULE_TEST'  AND ${t.moduleId}    IS NOT NULL AND ${t.subModuleId} IS NULL AND ${t.tierId} IS NULL) OR
    (${t.assessmentType} IN ('SKIP_TIER_TEST','TIER_BOSS_EXAM') AND ${t.tierId} IS NOT NULL AND ${t.subModuleId} IS NULL AND ${t.moduleId} IS NULL) OR
    (${t.assessmentType} = 'BOSS_SECTION'      AND ${t.parentSetId} IS NOT NULL) OR
    (${t.assessmentType} = 'PLACEMENT_TEST'    AND ${t.subModuleId} IS NULL AND ${t.moduleId} IS NULL)`),
]);

// ───────────────────────────── PROGRES & RESUME ─────────────────────────────
export const userTierProgress = pgTable('user_tier_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tierId: uuid('tier_id').notNull().references(() => tiers.id, { onDelete: 'cascade' }),
  status: progressStatus('status').notNull().default('LOCKED'),
  unlockSource: unlockSource('unlock_source'),
  bossBestPercent: numeric('boss_best_percent', { precision: 5, scale: 2 }),
  bossBestBand: band('boss_best_band'),
  bossPassedAt: ts('boss_passed_at'),
  completedAt: ts('completed_at'),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.tierId] })]);

export const userModuleProgress = pgTable('user_module_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  status: progressStatus('status').notNull().default('LOCKED'),
  unlockSource: unlockSource('unlock_source'),
  skipBestPercent: numeric('skip_best_percent', { precision: 5, scale: 2 }),
  completedAt: ts('completed_at'),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.moduleId] })]);

export const userSubModuleProgress = pgTable('user_sub_module_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subModuleId: uuid('sub_module_id').notNull().references(() => subModules.id, { onDelete: 'cascade' }),
  status: progressStatus('status').notNull().default('LOCKED'),
  unlockSource: unlockSource('unlock_source'),
  learnCompletedAt: ts('learn_completed_at'),
  miniTaskCompletedAt: ts('mini_task_completed_at'),
  // SPEC-005 (spec_005_learn_evidence): bukti belajar; ditulis hanya oleh PlayerService.
  learnActiveSeconds: integer('learn_active_seconds').notNull().default(0),
  learnVisitedSubtabs: text('learn_visited_subtabs').array().notNull().default(sql`'{}'::text[]`),
  learnLastPingAt: ts('learn_last_ping_at'),
  masteryCrown: crown('mastery_crown').notNull().default('NONE'),
  bestScorePercent: smallint('best_score_percent').notNull().default(0),
  attemptsCount: integer('attempts_count').notNull().default(0),
  completedAt: ts('completed_at'),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.subModuleId] }),
  index('usmp_user_status_idx').on(t.userId, t.status),
]);

export const userLastLearnedState = pgTable('user_last_learned_state', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  activeTierId: uuid('active_tier_id').references(() => tiers.id, { onDelete: 'set null' }),
  activeModuleId: uuid('active_module_id').references(() => modules.id, { onDelete: 'set null' }),
  activeSubModuleId: uuid('active_sub_module_id').references(() => subModules.id, { onDelete: 'set null' }),
  activeTab: activeTab('active_tab').notNull().default('LEARN'),
  activeLearnSubtab: learnSubtab('active_learn_subtab'),
  activeVideoId: varchar('active_video_id', { length: 64 }),
  videoProgressSec: integer('video_progress_sec').notNull().default(0),
  lastQuestionIndex: smallint('last_question_index'),
  activeAttemptId: uuid('active_attempt_id'), // FK ke attempts ditambahkan di migrasi (hindari impor melingkar)
  updatedAt: updatedAt(),
});

// ───────────────────────────── KONVERSI BAND (data yang dapat diubah) ─────────────────────────────
export const bandConversionTables = pgTable('band_conversion_tables', {
  id: id(),
  skill: bandTableSkill('skill').notNull(),
  versionLabel: varchar('version_label', { length: 60 }).notNull(),
  sourceNote: text('source_note'),                 // asal tabel + catatan "perkiraan"
  isActive: boolean('is_active').notNull().default(false),
  effectiveFrom: ts('effective_from'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('band_tables_skill_version_uq').on(t.skill, t.versionLabel),
  // maksimal satu tabel aktif per skill
  uniqueIndex('band_tables_one_active_uq').on(t.skill).where(sql`${t.isActive}`),
]);

export const bandConversionRows = pgTable('band_conversion_rows', {
  tableId: uuid('table_id').notNull().references(() => bandConversionTables.id, { onDelete: 'cascade' }),
  rawMin: smallint('raw_min').notNull(),
  rawMax: smallint('raw_max').notNull(),
  band: band('band').notNull(),
}, (t) => [
  primaryKey({ columns: [t.tableId, t.rawMin] }),
  check('band_rows_range_chk', sql`${t.rawMin} >= 0 AND ${t.rawMax} <= 40 AND ${t.rawMin} <= ${t.rawMax}`),
  bandCheck('band_rows_band_chk', t.band),
]);

// ───────────────────────────── ATTEMPT & JAWABAN ─────────────────────────────
export const attempts = pgTable('attempts', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assessmentSetId: uuid('assessment_set_id').notNull().references(() => assessmentSets.id, { onDelete: 'restrict' }),
  assessmentVersion: integer('assessment_version').notNull(),   // snapshot versi soal saat mulai
  mode: attemptMode('mode').notNull().default('PRACTICE'),
  status: attemptStatus('status').notNull().default('IN_PROGRESS'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  deadlineAt: ts('deadline_at'),                                // timer otoritatif di server
  submittedAt: ts('submitted_at'),
  rawScore: numeric('raw_score', { precision: 6, scale: 2 }),
  maxScore: numeric('max_score', { precision: 6, scale: 2 }),
  scorePercent: numeric('score_percent', { precision: 5, scale: 2 }),
  bandScore: band('band_score'),
  bandTableId: uuid('band_table_id').references(() => bandConversionTables.id, { onDelete: 'restrict' }),
  passed: boolean('passed'),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  state: jsonb('state').notNull().default(sql`'{}'::jsonb`),    // soal terlayani (placement adaptif), urutan acak, index terakhir
  resultJson: jsonb('result_json'),                             // placement: tier hasil; boss: ringkasan per skill
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('attempts_user_started_idx').on(t.userId, t.startedAt.desc()),
  index('attempts_user_set_idx').on(t.userId, t.assessmentSetId),
  uniqueIndex('attempts_one_active_uq').on(t.userId, t.assessmentSetId).where(sql`${t.status} = 'IN_PROGRESS'`),
  bandCheck('attempts_band_chk', t.bandScore),
]);

export const attemptSections = pgTable('attempt_sections', {
  attemptId: uuid('attempt_id').notNull().references(() => attempts.id, { onDelete: 'cascade' }),
  assessmentSetId: uuid('assessment_set_id').notNull().references(() => assessmentSets.id, { onDelete: 'restrict' }),
  skill: skillCategory('skill').notNull(),
  rawScore: numeric('raw_score', { precision: 6, scale: 2 }),
  maxScore: numeric('max_score', { precision: 6, scale: 2 }),
  bandScore: band('band_score'),
  status: attemptStatus('status').notNull().default('IN_PROGRESS'),
}, (t) => [primaryKey({ columns: [t.attemptId, t.assessmentSetId] })]);

export const attemptAnswers = pgTable('attempt_answers', {
  id: id(),
  attemptId: uuid('attempt_id').notNull().references(() => attempts.id, { onDelete: 'cascade' }),
  assessmentSetId: uuid('assessment_set_id').notNull().references(() => assessmentSets.id, { onDelete: 'restrict' }),
  questionId: varchar('question_id', { length: 40 }).notNull(), // 'Q-213-01', unik dalam set
  questionType: varchar('question_type', { length: 30 }).notNull(),
  skill: skillCategory('skill'),
  response: jsonb('response'),                                  // jawaban user (string | string[] | map)
  isCorrect: boolean('is_correct'),                             // null utk soal yang dinilai AI
  score: numeric('score', { precision: 5, scale: 2 }).notNull().default('0'),
  timeSpentMs: integer('time_spent_ms'),
  withinTargetTime: boolean('within_target_time'),
  speedStreakLen: smallint('speed_streak_len').notNull().default(0),
  answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('attempt_answers_uq').on(t.attemptId, t.questionId),   // idempoten: jawab ulang = UPSERT
  index('attempt_answers_set_q_idx').on(t.assessmentSetId, t.questionId, t.isCorrect),
]);

// ───────────────────────────── PENILAIAN AI (Writing & Speaking) ─────────────────────────────
export const gradingRubrics = pgTable('grading_rubrics', {
  id: id(),
  skill: skillCategory('skill').notNull(),                       // WRITING | SPEAKING
  versionLabel: varchar('version_label', { length: 60 }).notNull(),
  criteria: jsonb('criteria').notNull(),                         // [{key,name,descriptors:{5:"..",6:"..",7:".."}}]
  sourceId: uuid('source_id').references(() => contentSources.id, { onDelete: 'restrict' }),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('rubrics_skill_version_uq').on(t.skill, t.versionLabel),
  uniqueIndex('rubrics_one_active_uq').on(t.skill).where(sql`${t.isActive}`),
]);

export const submissions = pgTable('submissions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: submissionKind('kind').notNull(),
  attemptId: uuid('attempt_id').references(() => attempts.id, { onDelete: 'set null' }),
  subModuleId: uuid('sub_module_id').references(() => subModules.id, { onDelete: 'set null' }),
  questionId: varchar('question_id', { length: 40 }),
  promptSnapshot: text('prompt_snapshot').notNull(),            // teks soal saat dikirim
  responseText: text('response_text'),                          // Writing (PII-bearing), atau transkrip final Speaking
  wordCount: integer('word_count'),
  durationSec: integer('duration_sec'),
  status: submissionStatus('status').notNull().default('RECEIVED'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('submissions_user_created_idx').on(t.userId, t.createdAt.desc()),
  index('submissions_attempt_idx').on(t.attemptId),
]);

export const speakingRecordings = pgTable('speaking_recordings', {
  id: id(),
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  storageBackend: storageBackend('storage_backend').notNull().default('FILESYSTEM'),
  storageKey: text('storage_key'),                              // null setelah file dipurge
  mimeType: varchar('mime_type', { length: 60 }).notNull(),     // audio/webm | audio/ogg | audio/wav
  sizeBytes: integer('size_bytes').notNull(),
  durationMs: integer('duration_ms'),
  sha256: varchar('sha256', { length: 64 }),
  transcript: text('transcript'),
  transcriptSegments: jsonb('transcript_segments'),             // [{start_ms,end_ms,text,confidence}]
  sttEngine: varchar('stt_engine', { length: 60 }),             // 'whisper.cpp small-q5'
  sttConfidence: numeric('stt_confidence', { precision: 4, scale: 3 }),
  retentionExpiresAt: ts('retention_expires_at'),
  purgedAt: ts('purged_at'),
  createdAt: createdAt(),
}, (t) => [
  index('recordings_submission_idx').on(t.submissionId),
  index('recordings_retention_idx').on(t.retentionExpiresAt).where(sql`${t.purgedAt} IS NULL`),
]);

export const aiEvaluations = pgTable('ai_evaluations', {
  id: id(),
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  runNumber: smallint('run_number').notNull().default(1),       // regrade => run berikutnya; UI memakai terbaru
  method: evalMethod('method').notNull().default('AI_LOCAL'),
  rubricId: uuid('rubric_id').references(() => gradingRubrics.id, { onDelete: 'set null' }),
  modelName: varchar('model_name', { length: 100 }),            // 'qwen2.5:7b-instruct-q4_K_M'
  promptVersion: varchar('prompt_version', { length: 40 }),
  outputSchemaVersion: varchar('output_schema_version', { length: 20 }).notNull().default('1'),
  overallBand: band('overall_band'),
  criteriaScores: jsonb('criteria_scores'),                     // {task_response:6.0, coherence:6.5, lexical:6.0, grammar:5.5}
  feedbackJson: jsonb('feedback_json'),                         // output terstruktur tervalidasi Zod (umpan balik ID, koreksi ke Band 7)
  rawOutput: text('raw_output'),                                // keluaran mentah LLM untuk debug (retensi pendek)
  latencyMs: integer('latency_ms'),
  errorCode: varchar('error_code', { length: 40 }),
  disclaimerAcknowledged: boolean('disclaimer_acknowledged').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('ai_eval_submission_run_uq').on(t.submissionId, t.runNumber),
  bandCheck('ai_eval_band_chk', t.overallBand),
]);

// ───────────────────────────── ANTREAN (pg-boss) ─────────────────────────────
// pg-boss membuat/mengelola skema `pgboss` sendiri. Tabel ini hanya "jembatan" untuk UI polling.
export const asyncJobs = pgTable('async_jobs', {
  id: id(),
  kind: asyncJobKind('kind').notNull(),
  bossJobId: uuid('boss_job_id'),                               // id job di pgboss.job (tanpa FK lintas skema)
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  submissionId: uuid('submission_id').references(() => submissions.id, { onDelete: 'cascade' }),
  importBatchId: uuid('import_batch_id'),
  status: asyncJobStatus('status').notNull().default('QUEUED'),
  stage: varchar('stage', { length: 40 }),                      // 'TRANSCRIBING' | 'GRADING' | 'SAVING'
  progressPercent: smallint('progress_percent').notNull().default(0),
  errorCode: varchar('error_code', { length: 40 }),
  errorMessage: text('error_message'),
  attempt: smallint('attempt').notNull().default(0),
  createdAt: createdAt(),
  startedAt: ts('started_at'),
  finishedAt: ts('finished_at'),
}, (t) => [
  index('async_jobs_submission_idx').on(t.submissionId),
  index('async_jobs_status_idx').on(t.status, t.kind),
]);

// ───────────────────────────── GAMIFIKASI & ANALITIK ─────────────────────────────
export const userStats = pgTable('user_stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  totalPoints: integer('total_points').notNull().default(0),
  dailyStreakDays: integer('daily_streak_days').notNull().default(0),
  longestDailyStreak: integer('longest_daily_streak').notNull().default(0),
  lastActiveDate: ts('last_active_date'),
  bestSpeedStreak: integer('best_speed_streak').notNull().default(0),
  goldCrowns: integer('gold_crowns').notNull().default(0),
  silverCrowns: integer('silver_crowns').notNull().default(0),
  updatedAt: updatedAt(),
});

export const pointLedger = pgTable('point_ledger', {           // append-only
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  source: pointSource('source').notNull(),
  sourceId: uuid('source_id'),                                  // attempt_id / sub_module_id dll
  points: integer('points').notNull(),
  note: varchar('note', { length: 200 }),
  createdAt: createdAt(),
}, (t) => [
  index('point_ledger_user_idx').on(t.userId, t.createdAt.desc()),
  uniqueIndex('point_ledger_once_uq')
    .on(t.userId, t.source, t.sourceId)
    .where(sql`${t.source} IN ('DRILL','SPEED_STREAK','CROWN','MINI_TASK','BOSS')`),
]);

export const userSkillScores = pgTable('user_skill_scores', {   // sumber radar 6 sumbu
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skill: skillCategory('skill').notNull(),
  scorePercent: numeric('score_percent', { precision: 5, scale: 2 }).notNull(),
  estimatedBand: band('estimated_band'),
  sampleSize: integer('sample_size').notNull().default(0),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.skill] })]);

export const userBandPredictions = pgTable('user_band_predictions', { // riwayat; bukti metrik +0.5..+1.0/Tier
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  overallBand: band('overall_band').notNull(),
  components: jsonb('components').notNull(),                    // {LISTENING:6.0,READING:5.5,WRITING:5.5,SPEAKING:6.0}
  trigger: varchar('trigger', { length: 30 }).notNull(),        // 'BOSS' | 'PLACEMENT' | 'RECALC'
  attemptId: uuid('attempt_id').references(() => attempts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('band_pred_user_idx').on(t.userId, t.createdAt.desc())]);

// ───────────────────────────── ADMIN: IMPOR, REVISI, AUDIT, PENGATURAN ─────────────────────────────
export const importBatches = pgTable('import_batches', {
  id: id(),
  adminUserId: uuid('admin_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  format: importFormat('format').notNull(),
  contractVersion: varchar('contract_version', { length: 10 }).notNull(), // '1.1'
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSha256: varchar('file_sha256', { length: 64 }).notNull(),
  storageKey: text('storage_key'),                              // file asli (diretensi singkat)
  status: importStatus('status').notNull().default('UPLOADED'),
  totalItems: integer('total_items').notNull().default(0),
  validItems: integer('valid_items').notNull().default(0),
  invalidItems: integer('invalid_items').notNull().default(0),
  createdCount: integer('created_count').notNull().default(0),
  updatedCount: integer('updated_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  summary: jsonb('summary'),
  createdAt: createdAt(),
  validatedAt: ts('validated_at'),
  publishedAt: ts('published_at'),
}, (t) => [
  index('import_batches_status_idx').on(t.status, t.createdAt.desc()),
  uniqueIndex('import_batches_file_uq').on(t.fileSha256).where(sql`${t.status} IN ('PREVIEW_READY','PUBLISHING','PUBLISHED')`),
]);

export const importBatchItems = pgTable('import_batch_items', {
  id: id(),
  batchId: uuid('batch_id').notNull().references(() => importBatches.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  entityKind: varchar('entity_kind', { length: 30 }).notNull(), // 'SUB_MODULE' | 'ASSESSMENT_SET' | 'ASSET' | ...
  entityCode: varchar('entity_code', { length: 160 }),          // sub_module_code / kunci set / '<set_type>:<scope>:<question_id>' (SPEC-019)
  status: importItemStatus('status').notNull(),
  action: importAction('action'),
  errors: jsonb('errors'),                                      // [{path,code,message}]
  payload: jsonb('payload').notNull(),
  contentHash: varchar('content_hash', { length: 64 }),
  appliedEntityId: uuid('applied_entity_id'),
}, (t) => [
  uniqueIndex('import_items_batch_row_uq').on(t.batchId, t.rowNumber),
  index('import_items_batch_status_idx').on(t.batchId, t.status),
]);

export const contentRevisions = pgTable('content_revisions', {
  id: id(),
  entityType: varchar('entity_type', { length: 30 }).notNull(), // 'SUB_MODULE' | 'LEARNING_MATERIAL' | 'ASSESSMENT_SET'
  entityId: uuid('entity_id').notNull(),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  importBatchId: uuid('import_batch_id').references(() => importBatches.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('content_rev_entity_version_uq').on(t.entityType, t.entityId, t.version)]);

export const auditLog = pgTable('audit_log', {                 // append-only
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorUserId: uuid('actor_user_id'),                           // tanpa FK: tetap ada setelah user dihapus
  action: varchar('action', { length: 60 }).notNull(),          // 'AUTH_LOGIN_FAILED','CONTENT_PUBLISH','BAND_TABLE_ACTIVATE',...
  entityType: varchar('entity_type', { length: 40 }),
  entityId: varchar('entity_id', { length: 64 }),
  metadata: jsonb('metadata'),
  ipHash: varchar('ip_hash', { length: 64 }),                   // HMAC, bukan IP mentah
  createdAt: createdAt(),
}, (t) => [
  index('audit_actor_idx').on(t.actorUserId, t.createdAt.desc()),
  index('audit_entity_idx').on(t.entityType, t.entityId),
  index('audit_action_idx').on(t.action, t.createdAt.desc()),
]);

export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 80 }).primaryKey(),             // 'crown.silver_min','crown.gold_min','speed.target_ms_default',...
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
