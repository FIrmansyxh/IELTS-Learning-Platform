/**
 * Speaking (SPEC-013): persetujuan rekaman, unggahan, pelayanan/penghapusan rekaman. Endpoint submission/job/retry/
 * self-assessment/status dibagi dengan Writing (`service.ts`); di sini hanya perbedaan Speaking.
 */
import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { asyncJobs, speakingRecordings, submissions, users } from '@/db/schema';
import { CreateSpeakingSubmissionFieldsSchema } from '@/contracts/ai';
import { writeAudit } from '../audit';
import { acquireAudioSlot, releaseOnEnd } from '../attempts/audio-limits';
import { parseAudioRange } from '../attempts/audio-range';
import { config } from '../config';
import type { Db, Tx } from '../db';
import { ApiError, notFound, validationError } from '../http/errors';
import { readMultipart } from '../http/multipart';
import { zodDetails } from '../http/zod-errors';
import { toSessionUser, type SessionUser } from '../auth/guards';
import { getStorage, type StorageDriver } from '../storage';
import { EXT_BY_MIME, detectRecordingMime } from './audio-type';
import { resolveAttemptQuestion, resolveMiniTask } from './context';
import { latestRecording, loadSubmissionRow } from './dto';
import { assertCanEnqueue, assertNotDuplicate, dispatchOrFail, getSubmission, lockUserSubmissions } from './service';
import { getQuota } from './quota';
import { removeFileQuietly, setRetention } from './recordings';

export const MIN_RECORDING_BYTES = 1024;
export const maxRecordingBytes = (): number => Number(process.env.UPLOAD_MAX_MB_RECORDING ?? '10') * 1024 * 1024;

// ------------------------------------------------------------------ persetujuan & preferensi
export async function giveRecordingConsent(db: Db, userId: string) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ consentRecordingAt: sql`now()`, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.consentRecordingAt)))
      .returning({ id: users.id });
    if (updated.length > 0) await writeAudit(tx, { actorUserId: userId, action: 'RECORDING_CONSENT_GIVEN', entityType: 'user', entityId: userId });
    const [row] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    return toSessionUser(row!);
  });
}

export async function setRecordingPreferences(db: Db, userId: string, keep: boolean): Promise<SessionUser> {
  const [row] = await db.update(users).set({ keepRecordings: keep, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
  return toSessionUser(row!);
}

// ------------------------------------------------------------------ POST /submissions/speaking
export async function createSpeakingSubmission(db: Db, user: SessionUser, req: Request, storage: StorageDriver = getStorage()) {
  if (!/^multipart\/form-data\s*;/i.test(req.headers.get('content-type') ?? '')) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  // Persetujuan diperiksa SEBELUM body dibaca: tidak ada byte yang dibaca/disimpan tanpa persetujuan.
  if (!user.consentRecordingAt) throw new ApiError('RECORDING_CONSENT_REQUIRED');

  const max = maxRecordingBytes();
  const { fields, files } = await readMultipart(req, { maxBytes: max });
  const audioParts = files.filter((f) => f.name === 'audio');
  if (files.some((f) => f.name !== 'audio')) throw validationError('', 'unexpected_field');
  if (audioParts.length > 1) throw validationError('audio', 'multiple_audio_parts');
  if (audioParts.length === 0) throw validationError('audio', 'audio_required');
  const parsed = CreateSpeakingSubmissionFieldsSchema.safeParse(fields);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', { details: zodDetails(parsed.error) });
  const input = parsed.data;

  const file = audioParts[0]!.file;
  if (file.size > max) throw new ApiError('PAYLOAD_TOO_LARGE');
  if (file.size < MIN_RECORDING_BYTES) throw validationError('audio', 'audio_too_small');
  const data = Buffer.from(await file.arrayBuffer());
  const mime = detectRecordingMime(data); // ekstensi/Content-Type klien diabaikan
  if (!mime) throw new ApiError('UNSUPPORTED_AUDIO_TYPE');

  const aiOn = config.aiEnabled();
  const stored: { key: string | null } = { key: null };
  try {
    const created = await db.transaction(async (tx) => {
      await lockUserSubmissions(tx, user.id);
      const mini = input.kind === 'MINI_TASK_SPEAKING';
      let prompt: string;
      if (mini) {
        prompt = (await resolveMiniTask(tx, user.id, input.sub_module_id!, 'AI_SHORT_SPEAKING')).prompt;
      } else {
        const part = Number(input.kind.slice(-1)) as 1 | 2 | 3;
        prompt = (await resolveAttemptQuestion(tx, user.id, input.attempt_id!, input.question_id!, { type: 'SPEAKING_TASK', part })).prompt;
      }
      if (!mini) await assertNotDuplicate(tx, user.id, input.attempt_id!, input.question_id!);
      if (aiOn) await assertCanEnqueue(tx, user.id);

      // Tanpa AI tidak ada transkripsi; pengguna yang menonaktifkan penyimpanan tidak menyimpan berkas sama sekali.
      const keepFile = aiOn || user.keepRecordings;
      if (keepFile) stored.key = await storage.put(data, EXT_BY_MIME[mime], 'private/recordings');

      const [sub] = await tx
        .insert(submissions)
        .values({
          userId: user.id,
          kind: input.kind,
          attemptId: mini ? null : input.attempt_id!,
          subModuleId: mini ? input.sub_module_id! : null,
          questionId: mini ? null : input.question_id!,
          promptSnapshot: prompt,
          status: aiOn ? 'RECEIVED' : 'FALLBACK_SELF_ASSESSMENT',
        })
        .returning();
      await tx.insert(speakingRecordings).values({
        submissionId: sub!.id,
        storageKey: stored.key,
        mimeType: mime,
        sizeBytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        purgedAt: keepFile ? null : new Date(),
      });
      let jobId: string | null = null;
      if (aiOn) {
        const [job] = await tx.insert(asyncJobs).values({ kind: 'STT_TRANSCRIBE', userId: user.id, submissionId: sub!.id }).returning({ id: asyncJobs.id });
        jobId = job!.id;
      } else {
        await setRetention(tx, sub!.id);
      }
      return { subId: sub!.id, jobId };
    });
    if (created.jobId) await dispatchOrFail(created.jobId, 'STT_TRANSCRIBE', created.subId);
    return { submission: await getSubmission(db, created.subId, user.id), quota: await getQuota(db, user.id) };
  } catch (e) {
    // Tidak ada berkas yatim bila transaksi dibatalkan (ENOSPC parsial sudah dibersihkan driver penyimpanan).
    if (stored.key && !(e instanceof ApiError && e.code === 'SERVICE_UNAVAILABLE')) await removeFileQuietly(storage, stored.key);
    throw e;
  }
}

// ------------------------------------------------------------------ GET rekaman (pemilik/admin)
const BASE_HEADERS = {
  'Accept-Ranges': 'bytes',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'inline',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export async function serveRecording(
  db: Db,
  p: { submissionId: string; ownerId: string | null; viewerId: string; admin?: { ipHash: string }; range: string | null },
  storage: StorageDriver = getStorage(),
): Promise<Response> {
  const sub = await loadSubmissionRow(db, p.submissionId, p.ownerId);
  const rec = await latestRecording(db, sub.id);
  if (!rec || !rec.storageKey || rec.purgedAt) throw notFound();
  let total: number;
  try {
    total = await storage.size(rec.storageKey);
  } catch {
    throw notFound(); // berkas hilang
  }
  const range = parseAudioRange(p.range, total);
  if (range.kind === 'invalid') {
    throw new ApiError('RANGE_NOT_SATISFIABLE', { headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' } });
  }
  if (p.admin) {
    await writeAudit(db, {
      actorUserId: p.viewerId,
      action: 'ADMIN_PLAYED_RECORDING',
      entityType: 'submission',
      entityId: sub.id,
      metadata: { submission_id: sub.id, owner_user_id: sub.userId },
      ipHash: p.admin.ipHash || null,
    });
  }
  const headers: Record<string, string> = { ...BASE_HEADERS, 'Content-Type': rec.mimeType };
  const release = acquireAudioSlot(p.viewerId);
  if (range.kind === 'range') {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${total}`;
    headers['Content-Length'] = String(range.end - range.start + 1);
    return new Response(releaseOnEnd(storage.openRange(rec.storageKey, range.start, range.end), release), { status: 206, headers });
  }
  headers['Content-Length'] = String(total);
  if (total === 0) {
    release();
    return new Response(null, { status: 200, headers });
  }
  return new Response(releaseOnEnd(storage.openRange(rec.storageKey, 0, total - 1), release), { status: 200, headers });
}

// ------------------------------------------------------------------ DELETE rekaman
export async function deleteRecording(db: Db, userId: string, submissionId: string, storage: StorageDriver = getStorage()): Promise<void> {
  const key = await db.transaction(async (tx: Tx) => {
    const [sub] = await tx.select().from(submissions).where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId))).for('update');
    if (!sub) throw notFound();
    const [rec] = await tx.select().from(speakingRecordings).where(eq(speakingRecordings.submissionId, sub.id)).orderBy(desc(speakingRecordings.createdAt)).limit(1);
    if (!rec || !rec.storageKey || rec.purgedAt) throw notFound();
    if (sub.status === 'RECEIVED' || sub.status === 'TRANSCRIBING') throw new ApiError('RECORDING_IN_USE');
    await tx.update(speakingRecordings).set({ storageKey: null, purgedAt: sql`now()` }).where(eq(speakingRecordings.id, rec.id));
    await writeAudit(tx, { actorUserId: userId, action: 'RECORDING_DELETED_BY_USER', entityType: 'submission', entityId: sub.id });
    return rec.storageKey;
  });
  await removeFileQuietly(storage, key);
}

