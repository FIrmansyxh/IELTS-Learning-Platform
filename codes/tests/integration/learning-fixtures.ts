/** Fabrik data belajar untuk integration test SPEC-005/006/007 (BUKAN Golden Sample). */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, contentAssets, contentSources, learningMaterials } from '@/db/schema';
import { getDb } from '@/server/db';
import { ensureProgressRows } from '@/server/gatekeeping/service';
import { getStorage } from '@/server/storage';

const db = () => getDb();

// PNG 1x1 valid
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** Bersihkan data belajar antar tes (attempts dulu karena FK RESTRICT ke assessment_sets). */
export async function resetLearning() {
  await db().execute(sql`DELETE FROM attempts`);
  await db().execute(sql`DELETE FROM user_last_learned_state`);
  await db().execute(sql`DELETE FROM assessment_sets`);
  await db().execute(sql`DELETE FROM learning_materials`);
  await db().execute(sql`UPDATE sub_modules SET status = 'DRAFT'`);
  await db().execute(sql`UPDATE modules SET status = 'DRAFT'`);
}

export async function sourceId(code: string): Promise<string> {
  const [s] = await db().select({ id: contentSources.id }).from(contentSources).where(eq(contentSources.code, code));
  return s!.id;
}

export async function subId(code: string): Promise<string> {
  const r = await db().execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = ${code}`);
  return (r.rows[0] as { id: string }).id;
}

export async function publishSub(...codes: string[]) {
  for (const c of codes) {
    await db().execute(sql`UPDATE sub_modules SET status = 'PUBLISHED' WHERE sub_module_code = ${c}`);
    await db().execute(sql`UPDATE modules SET status = 'PUBLISHED' WHERE id = (SELECT module_id FROM sub_modules WHERE sub_module_code = ${c})`);
  }
}

export async function addVideoAsset(videoId: string, title = 'Video uji') {
  const [a] = await db()
    .insert(contentAssets)
    .values({
      kind: 'VIDEO_EMBED',
      title,
      sourceId: await sourceId('YOUTUBE'),
      rightsStatus: 'EMBED_ONLY',
      storageBackend: 'EXTERNAL',
      externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      externalRef: videoId,
    })
    .returning();
  return a!;
}

export async function addFileAsset(opts: { kind: 'SLIDE_IMAGE' | 'IMAGE' | 'DOCUMENT' | 'AUDIO_LISTENING'; mime: string; ext: string; title?: string; data?: Buffer; storeFile?: boolean }) {
  const base = opts.data ?? (opts.mime === 'image/png' ? Buffer.concat([PNG, randomBytes(8)]) : Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(24)]));
  const key = opts.storeFile === false ? `aa/${randomUUID()}.${opts.ext}` : await getStorage().put(base, opts.ext);
  const [a] = await db()
    .insert(contentAssets)
    .values({
      kind: opts.kind,
      title: opts.title ?? 'Aset uji',
      sourceId: await sourceId('OWN'),
      rightsStatus: 'OWN_ORIGINAL',
      storageBackend: 'FILESYSTEM',
      storageKey: key,
      mimeType: opts.mime,
      sizeBytes: base.length,
      sha256: createHash('sha256').update(base).digest('hex'),
    })
    .returning();
  return { asset: a!, data: base };
}

export interface MaterialOpts {
  article?: string;
  videoIds?: string[];
  slides?: number;
  attachments?: Array<{ title: string; mime?: string; type?: 'PDF' | 'DOCX' }>;
  miniTask?: 'SELF_CHECK' | 'AI_SHORT_WRITING' | 'AI_SHORT_SPEAKING' | null;
  attribution?: string | null;
}

/** Publikasikan sub-modul + isi materi; mengembalikan id aset yang dibuat. */
export async function seedMaterial(code: string, o: MaterialOpts = {}) {
  await publishSub(code);
  const id = await subId(code);
  const videos = [];
  for (const [i, v] of (o.videoIds ?? []).entries()) {
    const a = await addVideoAsset(v, `Video ${i + 1}`);
    videos.push({ asset_id: a.id, video_id: v, title: `Video ${i + 1}`, instructor_channel: 'Kanal Uji', language: 'ID', start_sec: 95, end_sec: 420 });
  }
  const slideAssets = [];
  const slides = [];
  for (let i = 0; i < (o.slides ?? 0); i++) {
    const { asset } = await addFileAsset({ kind: 'SLIDE_IMAGE', mime: 'image/png', ext: 'png', title: `Slide ${i + 1}` });
    slideAssets.push(asset.id);
    slides.push({ asset_id: asset.id, order: i + 1, caption: `Keterangan ${i + 1}`, alt: `Alt ${i + 1}` });
  }
  const docAssets = [];
  const attachments = [];
  for (const att of o.attachments ?? []) {
    const { asset } = await addFileAsset({ kind: 'DOCUMENT', mime: att.mime ?? 'application/pdf', ext: att.type === 'DOCX' ? 'docx' : 'pdf', title: att.title });
    docAssets.push(asset.id);
    attachments.push({ asset_id: asset.id, title: att.title, file_type: att.type ?? 'PDF' });
  }
  const miniTask =
    o.miniTask === null || o.miniTask === undefined
      ? {}
      : { task_type: o.miniTask, prompt: 'Tulis ulang kalimat berikut.', ai_rubric_criteria: 'RAHASIA: kriteria rubrik internal' };
  await db()
    .insert(learningMaterials)
    .values({
      subModuleId: id,
      articleMarkdown: o.article ?? '## Judul\nIsi **artikel** uji.',
      videosJson: videos,
      slidesJson: slides,
      attachmentsJson: attachments,
      miniTaskJson: miniTask,
      origin: 'ORIGINAL_AUTHORED',
      attributionText: o.attribution ?? null,
    });
  return { subId: id, slideAssets, docAssets };
}

export async function addDrill(code: string, questions: unknown[], over: Partial<typeof assessmentSets.$inferInsert> = {}) {
  const id = await subId(code);
  const [s] = await db()
    .insert(assessmentSets)
    .values({
      assessmentType: 'ACTIVE_DRILL',
      title: `Latihan ${code}`,
      subModuleId: id,
      timeLimitSeconds: 300,
      questionsJson: questions as object[],
      questionCount: questions.length,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
      ...over,
    })
    .returning();
  return s!;
}

/** Tandai materi selesai langsung di DB (jalan pintas untuk tes yang bukan tentang bukti belajar). */
export async function markLearnDone(userId: string, code: string) {
  await ensureProgressRows(db(), userId);
  await db().execute(sql`
    INSERT INTO user_sub_module_progress (user_id, sub_module_id, learn_completed_at)
    VALUES (${userId}::uuid, (SELECT id FROM sub_modules WHERE sub_module_code = ${code}), now())
    ON CONFLICT (user_id, sub_module_id) DO UPDATE SET learn_completed_at = now()`);
}

export async function progressOf(userId: string, code: string): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await db().execute(sql`
    SELECT p.* FROM user_sub_module_progress p JOIN sub_modules s ON s.id = p.sub_module_id
    WHERE p.user_id = ${userId}::uuid AND s.sub_module_code = ${code}`);
  return r.rows[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
