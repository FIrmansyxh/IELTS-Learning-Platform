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
  sqliteTable, text, integer, index, uniqueIndex, primaryKey, check, customType,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'node:crypto';

/*
 * SPEC-025 Fase 3: SQLite (node:sqlite). Lapisan kompatibilitas agar kode lama tetap bekerja:
 *  - uuid        -> TEXT (UUID v4 dibuat aplikasi)
 *  - timestamptz -> INTEGER epoch ms, dibaca sebagai Date
 *  - numeric     -> REAL, dibaca sebagai string berskala tetap ('75.00') seperti driver Postgres
 *  - jsonb/array -> TEXT berisi JSON
 *  - enum        -> TEXT dengan CHECK
 */
const NOW_MS = sql`(cast(unixepoch('subsec') * 1000 as integer))`;
/** UUID v4 dibuat aplikasi; default SQL menjaga INSERT mentah (tanpa id) tetap sah. */
const UUID_SQL = sql`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))`;
const id = () => text('id').primaryKey().$defaultFn(() => randomUUID()).default(UUID_SQL);
const uuid = (name: string) => text(name);
const varchar = (name: string, _o?: { length: number }) => text(name);
const smallint = (name: string) => integer(name);
const boolean = (name: string) => integer(name, { mode: 'boolean' });
const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });
const tsNow = (name: string) => ts(name).notNull().default(NOW_MS);
const createdAt = () => tsNow('created_at');
const updatedAt = () => tsNow('updated_at');

const numeric = (name: string, o: { scale: number }) =>
  customType<{ data: string; driverData: number }>({
    dataType: () => 'real',
    toDriver: (v) => Number(v),
    fromDriver: (v) => Number(v).toFixed(o.scale),
  })(name);
const jsonb = (name: string) =>
  customType<{ data: unknown; driverData: string }>({
    dataType: () => 'text',
    toDriver: (v) => JSON.stringify(v),
    fromDriver: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
  })(name);
const textArray = (name: string) =>
  customType<{ data: string[]; driverData: string }>({
    dataType: () => 'text',
    toDriver: (v) => JSON.stringify(v),
    fromDriver: (v) => (typeof v === 'string' ? (JSON.parse(v) as string[]) : v),
  })(name);
/** Kolom enum: TEXT bertipe sempit (tanpa CHECK di DB). Mengembalikan fungsi bernama seperti pgEnum agar kode pemanggil tak berubah. */
const enumOf = <const V extends readonly [string, ...string[]]>(values: V) => {
  const f = (name: string) => text(name, { enum: values });
  f.enumValues = values;
  return f;
};
/** Band IELTS: 0.0-9.0 kelipatan 0.5 */
const band = (name: string) => numeric(name, { scale: 1 });
const bandCheck = (n: string, col: AnySQLiteColumn) =>
  check(n, sql`${col} IS NULL OR (${col} >= 0 AND ${col} <= 9 AND (${col} * 2) = cast(${col} * 2 as integer))`);

// ───────────────────────────── ENUMS ─────────────────────────────
export const userStatus = enumOf(['ACTIVE', 'DISABLED'] as const);
export const skillCategory = enumOf(['GRAMMAR', 'VOCAB', 'LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const);
export const gateType = enumOf(['PERCENT', 'BAND'] as const);
export const progressStatus = enumOf(['LOCKED', 'UNLOCKED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'] as const);
export const unlockSource = enumOf(['DEFAULT', 'SEQUENTIAL', 'SKIP_TEST', 'PLACEMENT', 'BOSS_PASS', 'ADMIN'] as const);
export const crown = enumOf(['NONE', 'SILVER', 'GOLD'] as const);
export const activeTab = enumOf(['LEARN', 'DRILL', 'MINI_TASK'] as const);
export const learnSubtab = enumOf(['ARTICLE', 'VIDEO', 'SLIDES'] as const);
export const assessmentType = enumOf([
  'ACTIVE_DRILL', 'SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'PLACEMENT_TEST', 'BOSS_SECTION',
] as const);
export const reviewStatus = enumOf(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const);
/** Sengaja TIDAK ada nilai 'COPYRIGHTED_COPY': materi berhak cipta tidak boleh disalin ke DB. */
export const contentOrigin = enumOf(['ORIGINAL_AUTHORED', 'AI_GENERATED_REVIEWED', 'OPEN_LICENSED_ADAPTED'] as const);
export const licenseType = enumOf([
  'OWN', 'CC0', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'MIT', 'EMBED_TOS', 'LINK_ONLY_COPYRIGHTED', 'OTHER',
] as const);
export const rightsStatus = enumOf(['UNVERIFIED', 'VERIFIED_OPEN', 'OWN_ORIGINAL', 'EMBED_ONLY', 'LINK_ONLY'] as const);
export const assetKind = enumOf(['SLIDE_IMAGE', 'DOCUMENT', 'AUDIO_LISTENING', 'VIDEO_EMBED', 'IMAGE', 'REFERENCE_LINK'] as const);
export const storageBackend = enumOf(['FILESYSTEM', 'MINIO', 'EXTERNAL'] as const);
export const attemptMode = enumOf(['PRACTICE', 'EXAM'] as const);
export const attemptStatus = enumOf(['IN_PROGRESS', 'SUBMITTED', 'AWAITING_GRADING', 'GRADED', 'EXPIRED', 'ABANDONED'] as const);
export const submissionKind = enumOf([
  'WRITING_TASK1', 'WRITING_TASK2', 'MINI_TASK_WRITING', 'SPEAKING_PART1', 'SPEAKING_PART2', 'SPEAKING_PART3', 'MINI_TASK_SPEAKING',
] as const);
export const submissionStatus = enumOf(['RECEIVED', 'TRANSCRIBING', 'GRADING', 'GRADED', 'FALLBACK_SELF_ASSESSMENT', 'FAILED'] as const);
export const asyncJobKind = enumOf(['STT_TRANSCRIBE', 'GRADE_WRITING', 'GRADE_SPEAKING', 'RETENTION_PURGE'] as const);
export const asyncJobStatus = enumOf(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const);
export const examModule = enumOf(['COMMON', 'GENERAL_TRAINING', 'ACADEMIC'] as const);
export const evalMethod = enumOf(['AI_LOCAL', 'SELF_ASSESSMENT', 'EXTERNAL_AI'] as const);
export const bandTableSkill = enumOf(['LISTENING', 'READING_ACADEMIC', 'READING_GENERAL'] as const);
export const pointSource = enumOf(['DRILL', 'SPEED_STREAK', 'CROWN', 'MINI_TASK', 'BOSS', 'DAILY', 'ADJUSTMENT'] as const);

// ───────────────────────────── AUTH ─────────────────────────────
// Auth.js Credentials => strategi JWT (httpOnly cookie), jadi tabel sessions/accounts TIDAK dibuat.
// Bila OAuth/adapter ditambahkan kelak: tambah accounts, sessions, verification_tokens lewat ADR.
export const users = sqliteTable('users', {
  id: id(),
  displayName: varchar('display_name', { length: 80 }).notNull(), // PII ringan
  status: userStatus('status').notNull().default('ACTIVE'),
  targetBand: band('target_band'),
  placementCompletedAt: ts('placement_completed_at'),
  lastLoginAt: ts('last_login_at'),
  tokenVersion: integer('token_version').notNull().default(0),
  consentRecordingAt: ts('consent_recording_at'),               // dipakai SPEC-013
  keepRecordings: boolean('keep_recordings').notNull().default(true), // dipakai SPEC-013
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts('deleted_at'),                                    // soft delete -> anonymize
}, (t) => [
  // SPEC-025: nama profil unik (tanpa memedulikan huruf besar/kecil) di antara profil yang belum dihapus.
  uniqueIndex('users_display_name_lower_uq').on(sql`lower(${t.displayName})`).where(sql`${t.deletedAt} IS NULL`),
  bandCheck('users_target_band_chk', t.targetBand),
]);

export const contentSources = sqliteTable('content_sources', {
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

export const contentAssets = sqliteTable('content_assets', {
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
export const tiers = sqliteTable('tiers', {
  id: id(),
  tierNumber: smallint('tier_number').notNull().unique(),
  title: varchar('title', { length: 100 }).notNull(),
  cefrLevel: varchar('cefr_level', { length: 20 }).notNull(),
  targetBandMin: band('target_band_min').notNull(),
  targetBandMax: band('target_band_max').notNull(),
  // pengganti required_boss_score ambigu di PRD
  bossGateType: gateType('boss_gate_type').notNull(),
  bossGateValue: numeric('boss_gate_value', { scale: 1 }).notNull(), // PERCENT: 80.0 | BAND: 5.0
  skipThresholdPercent: smallint('skip_threshold_percent').notNull().default(85),
  skipTimeLimitSeconds: integer('skip_time_limit_seconds'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  bandCheck('tiers_band_min_chk', t.targetBandMin),
  bandCheck('tiers_band_max_chk', t.targetBandMax),
]);

export const modules = sqliteTable('modules', {
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

export const subModules = sqliteTable('sub_modules', {
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

export const learningMaterials = sqliteTable('learning_materials', {
  id: id(),
  subModuleId: uuid('sub_module_id').notNull().unique().references(() => subModules.id, { onDelete: 'cascade' }),
  articleMarkdown: text('article_markdown').notNull(),
  // elemen JSONB menyimpan asset_id (uuid -> content_assets) + metadata tampilan, BUKAN url mentah
  videosJson: jsonb('videos_json').notNull().default(sql`'[]'`),       // [{asset_id,start_sec,end_sec,language,title}]
  slidesJson: jsonb('slides_json').notNull().default(sql`'[]'`),       // [{asset_id,order,caption}]
  attachmentsJson: jsonb('attachments_json').notNull().default(sql`'[]'`), // [{asset_id,title,file_type}]
  miniTaskJson: jsonb('mini_task_json').notNull().default(sql`'{}'`),  // {task_type,prompt,ai_rubric_criteria}
  origin: contentOrigin('origin').notNull(),
  sourceId: uuid('source_id').references(() => contentSources.id, { onDelete: 'restrict' }),
  attributionText: text('attribution_text'),
  contentVersion: integer('content_version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const assessmentSets = sqliteTable('assessment_sets', {
  id: id(),
  assessmentType: assessmentType('assessment_type').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  // scope; tepat satu terisi sesuai assessment_type (lihat CHECK)
  subModuleId: uuid('sub_module_id').references(() => subModules.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'cascade' }),
  tierId: uuid('tier_id').references(() => tiers.id, { onDelete: 'cascade' }),
  parentSetId: uuid('parent_set_id').references((): AnySQLiteColumn => assessmentSets.id, { onDelete: 'cascade' }), // Boss: induk -> section
  skillCategory: skillCategory('skill_category'),                   // untuk BOSS_SECTION / skor radar
  timeLimitSeconds: integer('time_limit_seconds').notNull(),
  readingPassageMarkdown: text('reading_passage_markdown'),
  listeningAssetId: uuid('listening_asset_id').references(() => contentAssets.id, { onDelete: 'restrict' }),
  questionsJson: jsonb('questions_json').notNull().default(sql`'[]'`), // kontrak v1.1 (lihat data-model.md 3.x)
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
export const userTierProgress = sqliteTable('user_tier_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tierId: uuid('tier_id').notNull().references(() => tiers.id, { onDelete: 'cascade' }),
  status: progressStatus('status').notNull().default('LOCKED'),
  unlockSource: unlockSource('unlock_source'),
  bossBestPercent: numeric('boss_best_percent', { scale: 2 }),
  bossBestBand: band('boss_best_band'),
  bossPassedAt: ts('boss_passed_at'),
  completedAt: ts('completed_at'),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.tierId] })]);

export const userModuleProgress = sqliteTable('user_module_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  status: progressStatus('status').notNull().default('LOCKED'),
  unlockSource: unlockSource('unlock_source'),
  skipBestPercent: numeric('skip_best_percent', { scale: 2 }),
  completedAt: ts('completed_at'),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.moduleId] })]);

export const userSubModuleProgress = sqliteTable('user_sub_module_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subModuleId: uuid('sub_module_id').notNull().references(() => subModules.id, { onDelete: 'cascade' }),
  status: progressStatus('status').notNull().default('LOCKED'),
  unlockSource: unlockSource('unlock_source'),
  learnCompletedAt: ts('learn_completed_at'),
  miniTaskCompletedAt: ts('mini_task_completed_at'),
  // SPEC-005 (spec_005_learn_evidence): bukti belajar; ditulis hanya oleh PlayerService.
  learnActiveSeconds: integer('learn_active_seconds').notNull().default(0),
  learnVisitedSubtabs: textArray('learn_visited_subtabs').notNull().default(sql`'[]'`),
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

export const userLastLearnedState = sqliteTable('user_last_learned_state', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  activeTierId: uuid('active_tier_id').references(() => tiers.id, { onDelete: 'set null' }),
  activeModuleId: uuid('active_module_id').references(() => modules.id, { onDelete: 'set null' }),
  activeSubModuleId: uuid('active_sub_module_id').references(() => subModules.id, { onDelete: 'set null' }),
  activeTab: activeTab('active_tab').notNull().default('LEARN'),
  activeLearnSubtab: learnSubtab('active_learn_subtab'),
  activeVideoId: varchar('active_video_id', { length: 64 }),
  videoProgressSec: integer('video_progress_sec').notNull().default(0),
  lastQuestionIndex: smallint('last_question_index'),
  activeAttemptId: uuid('active_attempt_id').references((): AnySQLiteColumn => attempts.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});

// ───────────────────────────── KONVERSI BAND (data yang dapat diubah) ─────────────────────────────
export const bandConversionTables = sqliteTable('band_conversion_tables', {
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

export const bandConversionRows = sqliteTable('band_conversion_rows', {
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
export const attempts = sqliteTable('attempts', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assessmentSetId: uuid('assessment_set_id').notNull().references(() => assessmentSets.id, { onDelete: 'restrict' }),
  assessmentVersion: integer('assessment_version').notNull(),   // snapshot versi soal saat mulai
  mode: attemptMode('mode').notNull().default('PRACTICE'),
  status: attemptStatus('status').notNull().default('IN_PROGRESS'),
  startedAt: tsNow('started_at'),
  deadlineAt: ts('deadline_at'),                                // timer otoritatif di server
  submittedAt: ts('submitted_at'),
  rawScore: numeric('raw_score', { scale: 2 }),
  maxScore: numeric('max_score', { scale: 2 }),
  scorePercent: numeric('score_percent', { scale: 2 }),
  bandScore: band('band_score'),
  bandTableId: uuid('band_table_id').references(() => bandConversionTables.id, { onDelete: 'restrict' }),
  passed: boolean('passed'),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  state: jsonb('state').notNull().default(sql`'{}'`),    // soal terlayani (placement adaptif), urutan acak, index terakhir
  resultJson: jsonb('result_json'),                             // placement: tier hasil; boss: ringkasan per skill
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('attempts_user_started_idx').on(t.userId, sql`${t.startedAt} desc`),
  index('attempts_user_set_idx').on(t.userId, t.assessmentSetId),
  uniqueIndex('attempts_one_active_uq').on(t.userId, t.assessmentSetId).where(sql`${t.status} = 'IN_PROGRESS'`),
  bandCheck('attempts_band_chk', t.bandScore),
]);

export const attemptSections = sqliteTable('attempt_sections', {
  attemptId: uuid('attempt_id').notNull().references(() => attempts.id, { onDelete: 'cascade' }),
  assessmentSetId: uuid('assessment_set_id').notNull().references(() => assessmentSets.id, { onDelete: 'restrict' }),
  skill: skillCategory('skill').notNull(),
  rawScore: numeric('raw_score', { scale: 2 }),
  maxScore: numeric('max_score', { scale: 2 }),
  bandScore: band('band_score'),
  status: attemptStatus('status').notNull().default('IN_PROGRESS'),
}, (t) => [primaryKey({ columns: [t.attemptId, t.assessmentSetId] })]);

export const attemptAnswers = sqliteTable('attempt_answers', {
  id: id(),
  attemptId: uuid('attempt_id').notNull().references(() => attempts.id, { onDelete: 'cascade' }),
  assessmentSetId: uuid('assessment_set_id').notNull().references(() => assessmentSets.id, { onDelete: 'restrict' }),
  questionId: varchar('question_id', { length: 40 }).notNull(), // 'Q-213-01', unik dalam set
  questionType: varchar('question_type', { length: 30 }).notNull(),
  skill: skillCategory('skill'),
  response: jsonb('response'),                                  // jawaban user (string | string[] | map)
  isCorrect: boolean('is_correct'),                             // null utk soal yang dinilai AI
  score: numeric('score', { scale: 2 }).notNull().default('0'),
  timeSpentMs: integer('time_spent_ms'),
  withinTargetTime: boolean('within_target_time'),
  speedStreakLen: smallint('speed_streak_len').notNull().default(0),
  answeredAt: tsNow('answered_at'),
}, (t) => [
  uniqueIndex('attempt_answers_uq').on(t.attemptId, t.questionId),   // idempoten: jawab ulang = UPSERT
  index('attempt_answers_set_q_idx').on(t.assessmentSetId, t.questionId, t.isCorrect),
]);

// ───────────────────────────── PENILAIAN AI (Writing & Speaking) ─────────────────────────────
export const gradingRubrics = sqliteTable('grading_rubrics', {
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

export const submissions = sqliteTable('submissions', {
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
  index('submissions_user_created_idx').on(t.userId, sql`${t.createdAt} desc`),
  index('submissions_attempt_idx').on(t.attemptId),
]);

export const speakingRecordings = sqliteTable('speaking_recordings', {
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
  sttConfidence: numeric('stt_confidence', { scale: 3 }),
  retentionExpiresAt: ts('retention_expires_at'),
  purgedAt: ts('purged_at'),
  createdAt: createdAt(),
}, (t) => [
  index('recordings_submission_idx').on(t.submissionId),
  index('recordings_retention_idx').on(t.retentionExpiresAt).where(sql`${t.purgedAt} IS NULL`),
]);

export const aiEvaluations = sqliteTable('ai_evaluations', {
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

// ───────────────────────────── ANTREAN (dalam proses) ─────────────────────────────
// Antrean berjalan di dalam proses server; tabel ini menjadi "jembatan" status untuk UI polling.
export const asyncJobs = sqliteTable('async_jobs', {
  id: id(),
  kind: asyncJobKind('kind').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  submissionId: uuid('submission_id').references(() => submissions.id, { onDelete: 'cascade' }),
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
export const userStats = sqliteTable('user_stats', {
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

export const pointLedger = sqliteTable('point_ledger', {           // append-only
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  source: pointSource('source').notNull(),
  sourceId: uuid('source_id'),                                  // attempt_id / sub_module_id dll
  points: integer('points').notNull(),
  note: varchar('note', { length: 200 }),
  createdAt: createdAt(),
}, (t) => [
  index('point_ledger_user_idx').on(t.userId, sql`${t.createdAt} desc`),
  uniqueIndex('point_ledger_once_uq')
    .on(t.userId, t.source, t.sourceId)
    .where(sql`${t.source} IN ('DRILL','SPEED_STREAK','CROWN','MINI_TASK','BOSS')`),
]);

export const userSkillScores = sqliteTable('user_skill_scores', {   // sumber radar 6 sumbu
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skill: skillCategory('skill').notNull(),
  scorePercent: numeric('score_percent', { scale: 2 }).notNull(),
  estimatedBand: band('estimated_band'),
  sampleSize: integer('sample_size').notNull().default(0),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.skill] })]);

export const userBandPredictions = sqliteTable('user_band_predictions', { // riwayat; bukti metrik +0.5..+1.0/Tier
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  overallBand: band('overall_band').notNull(),
  components: jsonb('components').notNull(),                    // {LISTENING:6.0,READING:5.5,WRITING:5.5,SPEAKING:6.0}
  trigger: varchar('trigger', { length: 30 }).notNull(),        // 'BOSS' | 'PLACEMENT' | 'RECALC'
  attemptId: uuid('attempt_id').references(() => attempts.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('band_pred_user_idx').on(t.userId, sql`${t.createdAt} desc`)]);

// ───────────────────────────── REVISI KONTEN, AUDIT, PENGATURAN ─────────────────────────────
export const contentRevisions = sqliteTable('content_revisions', {
  id: id(),
  entityType: varchar('entity_type', { length: 30 }).notNull(), // 'SUB_MODULE' | 'LEARNING_MATERIAL' | 'ASSESSMENT_SET'
  entityId: uuid('entity_id').notNull(),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('content_rev_entity_version_uq').on(t.entityType, t.entityId, t.version)]);

export const auditLog = sqliteTable('audit_log', {                 // append-only
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorUserId: uuid('actor_user_id'),                           // tanpa FK: tetap ada setelah user dihapus
  action: varchar('action', { length: 60 }).notNull(),          // 'AUTH_LOGIN_FAILED','CONTENT_PUBLISH','BAND_TABLE_ACTIVATE',...
  entityType: varchar('entity_type', { length: 40 }),
  entityId: varchar('entity_id', { length: 64 }),
  metadata: jsonb('metadata'),
  ipHash: varchar('ip_hash', { length: 64 }),                   // HMAC, bukan IP mentah
  createdAt: createdAt(),
}, (t) => [
  index('audit_actor_idx').on(t.actorUserId, sql`${t.createdAt} desc`),
  index('audit_entity_idx').on(t.entityType, t.entityId),
  index('audit_action_idx').on(t.action, sql`${t.createdAt} desc`),
]);

export const appSettings = sqliteTable('app_settings', {
  key: varchar('key', { length: 80 }).primaryKey(),             // 'crown.silver_min','crown.gold_min','speed.target_ms_default',...
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
