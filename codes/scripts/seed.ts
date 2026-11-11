/** Seeder idempoten. Semua modul memakai ON CONFLICT DO NOTHING. Urutan = urutan array. */
import './_env';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, closeDb, type Tx } from '../src/server/db';
import * as schema from '../src/db/schema';
import { MODULE_SEEDS, SUB_MODULE_SEEDS, TIER_SEEDS } from '../src/server/content/curriculum-structure';
import {
  BAND_SEED_LABEL,
  BAND_SEED_LABEL_GT,
  BAND_SEED_NOTE,
  BAND_SEED_NOTE_GT,
  LISTENING_SEED_ROWS,
  READING_ACADEMIC_SEED_ROWS,
  READING_GENERAL_SEED_ROWS,
} from '../src/server/band/seed-data';

export interface SeedModule {
  name: string;
  run: (tx: Tx) => Promise<void>;
}

type SourceRow = typeof schema.contentSources.$inferInsert;

/** 14 sumber awal (data-model.md 3.11). */
export const CONTENT_SOURCES: SourceRow[] = [
  { code: 'OWN', name: 'Konten orisinal pemilik', licenseType: 'OWN', mayStoreCopy: true },
  { code: 'NGSL', name: 'New General Service List', licenseType: 'CC_BY_SA', shareAlike: true, mayStoreCopy: true },
  { code: 'NAWL', name: 'New Academic Word List', licenseType: 'CC_BY_SA', shareAlike: true, mayStoreCopy: true },
  { code: 'TATOEBA', name: 'Tatoeba', licenseType: 'CC_BY', mayStoreCopy: true },
  { code: 'COMMON_VOICE', name: 'Mozilla Common Voice', licenseType: 'CC0', mayStoreCopy: true },
  { code: 'TS_FSRS', name: 'ts-fsrs', licenseType: 'MIT', mayStoreCopy: true },
  { code: 'BAND_DESCRIPTORS', name: 'IELTS Band Descriptors (rujukan/parafrase)', licenseType: 'OTHER', licenseNote: 'Dirujuk/diparafrase, bukan disalin utuh' },
  { code: 'YOUTUBE', name: 'YouTube (embed)', licenseType: 'EMBED_TOS', mayStoreCopy: false },
  { code: 'OPENLEARN', name: 'OpenLearn', licenseType: 'CC_BY_NC', nonCommercialOnly: true, mayStoreCopy: true },
  { code: 'ENGLISH_PROFILE', name: 'English Profile', licenseType: 'CC_BY_NC', nonCommercialOnly: true, mayStoreCopy: true },
  { code: 'CAMBRIDGE_REF', name: 'Cambridge IELTS (rujukan)', licenseType: 'LINK_ONLY_COPYRIGHTED', mayStoreCopy: false },
  { code: 'MURPHY_REF', name: 'Murphy (rujukan)', licenseType: 'LINK_ONLY_COPYRIGHTED', mayStoreCopy: false },
  { code: 'AZAR_REF', name: 'Azar (rujukan)', licenseType: 'LINK_ONLY_COPYRIGHTED', mayStoreCopy: false },
  { code: 'IDP_BC_REF', name: 'IDP / British Council (rujukan)', licenseType: 'LINK_ONLY_COPYRIGHTED', mayStoreCopy: false },
];

function envInt(env: Record<string, string | undefined>, name: string, def: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) ? n : def;
}

/** Default app_settings (_api-contract.md bagian 8); tiga kunci disemai dari env. */
export function defaultSettings(env: Record<string, string | undefined> = process.env): Array<{ key: string; value: unknown; description: string }> {
  return [
    { key: 'learn.min_active_seconds', value: 60, description: 'Waktu belajar aktif minimal sebelum Selesai Belajar' },
    { key: 'drill.question_count', value: 10, description: 'Jumlah soal Active Drill' },
    { key: 'speed.default_target_ms', value: 20000, description: 'Target waktu per soal default' },
    { key: 'attempt.cooldown_minutes', value: 60, description: 'Jeda antar percobaan Skip/Boss' },
    { key: 'attempt.max_per_set_per_day', value: 3, description: 'Maks percobaan baru per set per 24 jam' },
    { key: 'placement.question_count', value: 25, description: 'Jumlah soal Placement' },
    { key: 'ai.daily_limit_per_user', value: envInt(env, 'AI_DAILY_LIMIT_PER_USER', 10), description: 'Kuota submission AI per 24 jam' },
    { key: 'ai.queue_max', value: 20, description: 'Maks job AI menunggu' },
    { key: 'retention.audio_days', value: envInt(env, 'AUDIO_RETENTION_DAYS', 90), description: 'Retensi rekaman Speaking' },
    { key: 'retention.ai_raw_output_days', value: 180, description: 'Retensi ai_evaluations.raw_output' },
    { key: 'crown.silver_min', value: 75, description: 'Ambang Silver' },
    { key: 'crown.gold_min', value: 90, description: 'Ambang Gold' },
    { key: 'points.correct_answer', value: 10, description: 'Poin per jawaban benar Drill' },
    { key: 'points.speed_streak_min', value: 3, description: 'Panjang streak minimal untuk bonus' },
    { key: 'points.speed_streak_bonus', value: 5, description: 'Bonus per jawaban ber-streak' },
    { key: 'points.crown_silver', value: 50, description: 'Poin mahkota Silver' },
    { key: 'points.crown_gold', value: 100, description: 'Poin mahkota Gold (total)' },
    { key: 'points.mini_task', value: 20, description: 'Poin Mini-Task' },
    { key: 'points.boss_pass', value: 200, description: 'Poin lulus Boss' },
    { key: 'points.daily_activity', value: 5, description: 'Poin aktivitas harian pertama' },
  ];
}

/** Registri modul seed. SPEC-003/004/009/012/013 menambahkan modul di sini. */
export const seedModules: SeedModule[] = [
  {
    name: 'content_sources',
    run: async (tx) => {
      await tx.insert(schema.contentSources).values(CONTENT_SOURCES).onConflictDoNothing();
    },
  },
  {
    name: 'app_settings',
    run: async (tx) => {
      await tx
        .insert(schema.appSettings)
        .values(defaultSettings().map((s) => ({ key: s.key, value: s.value, description: s.description })))
        .onConflictDoNothing();
    },
  },
  {
    // SPEC-002: kunci sistem tersembunyi (tidak muncul di GET /admin/settings, tidak dapat di-PUT).
    name: 'system_settings',
    run: async (tx) => {
      await tx
        .insert(schema.appSettings)
        .values({ key: 'system.worker_heartbeat_at', value: sql`'null'`, description: 'Penanda sistem (tersembunyi)' })
        .onConflictDoNothing();
    },
  },
  {
    // SPEC-004 + C-22: 4 Tier, 13 Modul, 40 Sub-Modul berstatus DRAFT.
    name: 'curriculum-structure',
    run: async (tx) => {
      await tx
        .insert(schema.tiers)
        .values(
          TIER_SEEDS.map((t) => ({
            tierNumber: t.tierNumber,
            title: t.title,
            cefrLevel: t.cefrLevel,
            targetBandMin: t.targetBandMin,
            targetBandMax: t.targetBandMax,
            bossGateType: t.bossGateType,
            bossGateValue: t.bossGateValue,
            skipThresholdPercent: t.skipThresholdPercent,
          })),
        )
        .onConflictDoNothing();
      const tierRows = await tx.select({ id: schema.tiers.id, n: schema.tiers.tierNumber }).from(schema.tiers);
      const tierId = new Map(tierRows.map((r) => [Number(r.n), r.id]));
      await tx
        .insert(schema.modules)
        .values(
          MODULE_SEEDS.map((m) => ({
            tierId: tierId.get(m.tier)!,
            moduleCode: m.code,
            skillCategory: m.skill,
            title: m.title,
            orderIndex: Number(m.code.split('.')[1]),
            status: 'DRAFT' as const,
          })),
        )
        .onConflictDoNothing();
      const modRows = await tx.select({ id: schema.modules.id, code: schema.modules.moduleCode }).from(schema.modules);
      const modId = new Map(modRows.map((r) => [r.code, r.id]));
      await tx
        .insert(schema.subModules)
        .values(
          SUB_MODULE_SEEDS.map((s) => {
            const parts = s.code.split('.');
            return {
              moduleId: modId.get(`${parts[0]}.${parts[1]}`)!,
              subModuleCode: s.code,
              title: s.title,
              passingScorePercent: 75,
              orderIndex: Number(parts[2]),
              status: 'DRAFT' as const,
              examModule: s.exam ?? ('COMMON' as const),
              contentVersion: 1,
            };
          }),
        )
        .onConflictDoNothing();
    },
  },
  {
    // SPEC-021 + C-22: 5 jalur belajar seed (GT-STRUCT, GT-WRITING, GT-READING, GT-SPRINT-4W, GT-GRAMMAR).
    name: 'learning-tracks',
    run: async (tx) => {
      const { readFileSync } = await import('node:fs');
      const path = await import('node:path');
      const { applyTracks } = await import('../src/server/content/tracks-import');
      const tracksPath = path.resolve('content/gt-tracks/tracks.json');
      const pkg = JSON.parse(readFileSync(tracksPath, 'utf8'));
      if (pkg.learning_tracks) {
        await applyTracks(tx, pkg.learning_tracks, 'PUBLISHED');
      }
    },
  },
  {
    // SPEC-009: tabel band Academic aktif per skill (idempoten; tidak menimpa tabel aktif lain yang sudah ada).
    name: 'band-tables',
    run: async (tx) => {
      const defs = [
        { skill: 'LISTENING' as const, rows: LISTENING_SEED_ROWS, label: BAND_SEED_LABEL, note: BAND_SEED_NOTE },
        { skill: 'READING_ACADEMIC' as const, rows: READING_ACADEMIC_SEED_ROWS, label: BAND_SEED_LABEL, note: BAND_SEED_NOTE },
        { skill: 'READING_GENERAL' as const, rows: READING_GENERAL_SEED_ROWS, label: BAND_SEED_LABEL_GT, note: BAND_SEED_NOTE_GT },
      ];
      for (const d of defs) {
        await tx
          .insert(schema.bandConversionTables)
          .values({ skill: d.skill, versionLabel: d.label, sourceNote: d.note, isActive: true, effectiveFrom: new Date(), createdBy: null })
          .onConflictDoNothing();
        const [t] = await tx
          .select({ id: schema.bandConversionTables.id })
          .from(schema.bandConversionTables)
          .where(and(eq(schema.bandConversionTables.skill, d.skill), eq(schema.bandConversionTables.versionLabel, d.label)));
        if (!t) continue;
        await tx
          .insert(schema.bandConversionRows)
          .values(d.rows.map((r) => ({ tableId: t.id, rawMin: r.raw_min, rawMax: r.raw_max, band: r.band.toFixed(1) })))
          .onConflictDoNothing();
      }
    },
  },
];

async function main() {
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      for (const m of seedModules) {
        await m.run(tx);
        console.log(`[seed] modul ${m.name} selesai`);
      }
    });
  } finally {
    await closeDb();
  }
}

// Jalankan hanya bila dieksekusi langsung (bukan saat diimpor oleh tes).
if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error('[seed] gagal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
