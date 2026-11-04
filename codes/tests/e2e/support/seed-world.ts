/**
 * Seed "dunia E2E" (DB ielts_e2e). Idempoten: berhenti bila marker sudah ada.
 * Konten SINTETIS (bukan konten produksi) + Golden Sample (dipublikasikan lewat SQL kecuali Boss GS yang tanpa audio).
 * Dijalankan: `. tests/e2e/e2e.env.sh && npx tsx tests/e2e/support/seed-world.ts [--force]`
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, contentAssets, tiers } from '@/db/schema';
import { getDb, closeDb } from '@/server/db';
import { getStorage } from '@/server/storage';
import { addFileAsset, addVideoAsset, seedMaterial, sourceId, subId, publishSub, addDrill } from '../../integration/learning-fixtures';
import { Q } from '../../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = getDb();
const MARK = 'e2e.world.v3';

export function toneWav(seconds: number, freq = 440): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-tone-'));
  const out = path.join(dir, 'tone.wav');
  const r = spawnSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`, '-ar', '16000', '-ac', '1', out]);
  if (r.status !== 0) throw new Error('ffmpeg gagal');
  return readFileSync(out);
}

async function audioAsset(title: string, seconds: number, freq = 440) {
  const data = toneWav(seconds, freq);
  const key = await getStorage().put(data, 'wav');
  const [a] = await db
    .insert(contentAssets)
    .values({
      kind: 'AUDIO_LISTENING',
      title,
      sourceId: await sourceId('OWN'),
      rightsStatus: 'OWN_ORIGINAL',
      storageBackend: 'FILESYSTEM',
      storageKey: key,
      mimeType: 'audio/wav',
      sizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      durationSec: seconds,
    })
    .returning();
  return a!;
}

/** Soal drill 1.1.1: 10 tipe non-AI; prompt unik agar mudah dicari lewat teks. */
export const DRILL_111 = [
  Q.mcq({ question_id: 'Q-D01', prompt: 'D01 pilih jawaban is', options: ['is', 'are', 'am'], correct_answers: ['is'], explanation_id: 'Pembahasan D01' }),
  Q.multi({ question_id: 'Q-D02', prompt: 'D02 pilih dua huruf a dan b', options: ['a', 'b', 'c', 'd'], correct_answers: ['a', 'b'], explanation_id: 'Pembahasan D02' }),
  Q.tfng({ question_id: 'Q-D03', prompt: 'D03 benar atau salah: pernyataan benar', correct_answers: ['True'], explanation_id: 'Pembahasan D03' }),
  Q.ynng({ question_id: 'Q-D04', prompt: 'D04 yes no not given: jawab Yes', correct_answers: ['Yes'], explanation_id: 'Pembahasan D04' }),
  Q.fill({ question_id: 'Q-D05', prompt: 'D05 isi: The bridge ___ (build) in 1990.', correct_answers: ['was built'], max_words: 2, explanation_id: 'Pembahasan D05' }),
  Q.short({ question_id: 'Q-D06', prompt: 'D06 jawab singkat: apa penyebabnya?', correct_answers: ['rainfall'], max_words: 3, explanation_id: 'Pembahasan D06' }),
  Q.drop({ question_id: 'Q-D07', prompt: 'D07 cocokkan dropdown', matching: { left: ['satu', 'dua'], right: ['x', 'y', 'z'] }, correct_answers: [0, 2], explanation_id: 'Pembahasan D07' }),
  Q.drag({ question_id: 'Q-D08', prompt: 'D08 cocokkan seret', matching: { left: ['uno', 'dos'], right: ['p', 'q', 'r'] }, correct_answers: [1, 0], explanation_id: 'Pembahasan D08' }),
  Q.reorder({ question_id: 'Q-D09', prompt: 'D09 susun kalimat', segments: ['The book', 'was written', 'by her'], explanation_id: 'Pembahasan D09' }),
  Q.error({ question_id: 'Q-D10', prompt: 'D10 temukan kesalahan', tokens: ['She', 'go', 'to', 'school'], correct_answers: [1], explanation_id: 'Pembahasan D10' }),
];

const simpleDrill = (tag: string, n = 2) =>
  Array.from({ length: n }, (_, i) =>
    Q.mcq({ question_id: `Q-${tag}${i + 1}`, prompt: `${tag}${i + 1} pilih benar`, options: [`benar-${tag}${i + 1}`, 'salah-1', 'salah-2'], correct_answers: [`benar-${tag}${i + 1}`], explanation_id: `Pembahasan ${tag}${i + 1}` }),
  );

export const PASSAGE = `# Urban Gardens

[A] Urban gardens have grown rapidly in many cities during the past decade. Residents convert empty lots into small farms.

[B] Researchers found that community gardens reduce summer temperatures in nearby streets by about two degrees.

[C] Critics argue that gardens occupy land that could be used for housing, although supporters note the benefits for mental health.
===PASSAGE===
# Night Markets

[A] Night markets attract tourists because they offer cheap food and local crafts in a lively atmosphere.

[B] Vendors say that rainy weather reduces sales by nearly half, so many of them now rent covered stalls.`;

export const READING_QS = [
  Q.mcq({ question_id: 'Q-R1', skill: 'READING', passage_no: 1, prompt: 'R1 apa yang dilakukan penduduk di lahan kosong?', options: ['Membuat kebun kecil', 'Membangun mal', 'Membuat parkir'], correct_answers: ['Membuat kebun kecil'], explanation_id: 'Pembahasan R1' }),
  Q.tfng({ question_id: 'Q-R2', skill: 'READING', passage_no: 1, prompt: 'R2 kebun komunitas menurunkan suhu jalan sekitar dua derajat', correct_answers: ['True'], explanation_id: 'Pembahasan R2' }),
  Q.tfng({ question_id: 'Q-R3', skill: 'READING', passage_no: 1, prompt: 'R3 semua kritikus mendukung perumahan', correct_answers: ['False'], explanation_id: 'Pembahasan R3' }),
  Q.fill({ question_id: 'Q-R4', skill: 'READING', passage_no: 2, prompt: 'R4 Night markets attract ___ because of cheap food.', correct_answers: ['tourists'], max_words: 1, explanation_id: 'Pembahasan R4' }),
  Q.short({ question_id: 'Q-R5', skill: 'READING', passage_no: 2, prompt: 'R5 apa yang dikurangi hujan?', correct_answers: ['sales'], max_words: 2, explanation_id: 'Pembahasan R5' }),
  Q.ynng({ question_id: 'Q-R6', skill: 'READING', passage_no: 2, prompt: 'R6 pedagang menyewa lapak tertutup', correct_answers: ['Yes'], explanation_id: 'Pembahasan R6' }),
];

const rightSet = (tag: string, n: number, skill: string, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) =>
    Q.mcq({ question_id: `Q-${tag}${i + 1}`, skill, prompt: `${tag}${i + 1} soal`, options: [`right-Q-${tag}${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-Q-${tag}${i + 1}`], explanation_id: 'p', points: 10, ...extra }),
  );

async function main() {
  const force = process.argv.includes('--force');
  const has = await db.execute(sql`SELECT 1 FROM app_settings WHERE key = ${MARK}`);
  if (has.rows.length && !force) {
    console.log('[seed-world] sudah ada; lewati');
    return;
  }

  // --- bersih (hanya konten & progres; admin tetap) ---
  for (const q of [
    'DELETE FROM attempts',
    'DELETE FROM submissions',
    'DELETE FROM import_batch_items',
    'DELETE FROM async_jobs WHERE import_batch_id IS NOT NULL',
    'DELETE FROM import_batches',
    'DELETE FROM content_revisions',
    'DELETE FROM assessment_sets',
    "DELETE FROM content_assets WHERE title IN ('Nada uji 10 detik','Audio Boss Tier 1','Aset uji','Lembar kerja') OR title ~ '^(Slide|Video) [0-9]'",
    'DELETE FROM learning_materials',
    "UPDATE sub_modules SET status='DRAFT'",
    "UPDATE modules SET status='DRAFT'",
  ])
    await db.execute(sql.raw(q));

  // --- Golden Sample (impor DRAFT, lalu publikasi bagian yang lengkap) ---
  const r = spawnSync('npx', ['tsx', 'scripts/content-import.ts', 'import', '--dir', 'content/golden-sample'], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw new Error('impor Golden Sample gagal');
  await db.execute(sql`UPDATE assessment_sets SET status='PUBLISHED' WHERE title LIKE 'Skip Test Modul 2.1%'
     OR (assessment_type='ACTIVE_DRILL' AND sub_module_id IN (SELECT id FROM sub_modules WHERE sub_module_code IN ('2.1.3','3.2.1')))`);
  await publishSub('2.1.3', '3.2.1');
  await db.execute(sql`UPDATE learning_materials SET origin='ORIGINAL_AUTHORED' WHERE sub_module_id IN (SELECT id FROM sub_modules WHERE sub_module_code IN ('2.1.3','3.2.1'))`);

  // --- Tier 1 sintetis ---
  await seedMaterial('1.1.1', { article: '## Present Simple\nIsi **artikel** uji E2E untuk 1.1.1.', videoIds: ['dQw4w9WgXcQ'], slides: 3, attachments: [{ title: 'Lembar kerja' }], miniTask: 'SELF_CHECK' });
  await addDrill('1.1.1', DRILL_111, { title: 'Drill 1.1.1 (10 tipe)' });
  await seedMaterial('1.1.2', { article: '## Writing mini\nTulis kalimat.', miniTask: 'AI_SHORT_WRITING' });
  await addDrill('1.1.2', simpleDrill('W', 2));
  await seedMaterial('1.1.3', { article: '## Speaking mini\nBicara.', miniTask: 'AI_SHORT_SPEAKING' });
  await addDrill('1.1.3', simpleDrill('S', 2));
  await seedMaterial('1.2.1', { article: '## Modul 1.2\nIsi.' });
  await addDrill('1.2.1', simpleDrill('M', 2));
  await seedMaterial('1.3.1', { article: '## Reading\nBaca teks.' });
  await addDrill('1.3.1', READING_QS, { title: 'Drill Reading 1.3.1', readingPassageMarkdown: PASSAGE, timeLimitSeconds: 600 });
  await seedMaterial('1.3.2', { article: '## Listening\nDengar.' });
  const tone = await audioAsset('Nada uji 10 detik', 10);
  await addDrill(
    '1.3.2',
    [1, 2, 3, 4].map((i) => Q.mcq({ question_id: `Q-L${i}`, skill: 'LISTENING', section_no: 1, prompt: `L${i} pilih jawaban`, options: [`dengar-${i}`, 'x', 'y'], correct_answers: [`dengar-${i}`], explanation_id: 'Pembahasan L' })),
    { title: 'Drill Listening 1.3.2', listeningAssetId: tone.id, timeLimitSeconds: 300 },
  );

  // --- Skip Test modul 1.2 (6 soal, 120 dtk) ---
  const [m12] = (await db.execute(sql`SELECT id FROM modules WHERE module_code='1.2'`)).rows as any[];
  await db.insert(assessmentSets).values({
    assessmentType: 'SKIP_MODULE_TEST',
    title: 'Skip Test Modul 1.2',
    moduleId: m12.id,
    timeLimitSeconds: 120,
    questionsJson: rightSet('K', 6, 'GRAMMAR') as object[],
    questionCount: 6,
    passPercent: 80,
    origin: 'ORIGINAL_AUTHORED',
    status: 'PUBLISHED',
  });

  // --- Boss Tier 1: L(4) + R(4) + W(1) + S(1) ---
  const [t1] = await db.select().from(tiers).where(eq(tiers.tierNumber, 1));
  const bossAudio = await audioAsset('Audio Boss Tier 1', 10, 523);
  const [parent] = await db
    .insert(assessmentSets)
    .values({ assessmentType: 'TIER_BOSS_EXAM', title: 'Boss Stage Tier 1 (E2E)', tierId: t1!.id, timeLimitSeconds: 1800, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
    .returning();
  const kid = async (skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING', qs: unknown[], extra: Partial<typeof assessmentSets.$inferInsert> = {}) =>
    db
      .insert(assessmentSets)
      .values({ assessmentType: 'BOSS_SECTION', title: `Boss ${skill} T1`, parentSetId: parent!.id, skillCategory: skill, timeLimitSeconds: 900, questionsJson: qs as object[], questionCount: qs.length, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED', ...extra })
      .returning();
  await kid('LISTENING', rightSet('BL', 4, 'LISTENING'), { listeningAssetId: bossAudio.id });
  await kid('READING', rightSet('BR', 4, 'READING'), { readingPassageMarkdown: '# Boss Passage\n\n[A] Teks bacaan untuk Boss.' });
  await kid('WRITING', [Q.writing({ question_id: 'Q-BW1', prompt: 'Tulis esai tentang teknologi dan pendidikan.', min_words: 50, task_kind: 'TASK2', time_limit_minutes: 20 })]);
  await kid('SPEAKING', [Q.speaking({ question_id: 'Q-BS1', prompt: 'Ceritakan tentang tempat favoritmu.', part: 2, prep_seconds: 5, record_seconds: 15, cue_points: ['where', 'why', 'when'] })]);

  // --- Placement: bank 50 soal MCQ, difficulty 1-5 ---
  const placementQs = Array.from({ length: 50 }, (_, i) =>
    Q.mcq({ question_id: `Q-P${String(i + 1).padStart(2, '0')}`, prompt: `P${String(i + 1).padStart(2, '0')} soal placement`, difficulty: (i % 5) + 1, options: [`benar-P${i + 1}`, 'x', 'y', 'z'], correct_answers: [`benar-P${i + 1}`], explanation_id: 'p' }),
  );
  await db.insert(assessmentSets).values({
    assessmentType: 'PLACEMENT_TEST',
    title: 'Placement E2E (50 soal)',
    timeLimitSeconds: 1500,
    questionsJson: placementQs as object[],
    questionCount: 50,
    origin: 'ORIGINAL_AUTHORED',
    status: 'PUBLISHED',
  });

  await db.execute(sql`INSERT INTO app_settings (key, value, description) VALUES (${MARK}, '1'::jsonb, 'marker seed E2E') ON CONFLICT (key) DO NOTHING`);
  const d = await db.execute(sql`SELECT count(*) FROM assessment_sets WHERE status='PUBLISHED'`);
  console.log('[seed-world] selesai; set PUBLISHED =', (d.rows[0] as any).count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb().catch(() => undefined));
void addFileAsset;
void addVideoAsset;
void subId;
