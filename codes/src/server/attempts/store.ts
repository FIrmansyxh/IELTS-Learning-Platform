/** Akses data attempt bersama (dipakai AttemptService, Boss, dan Placement tanpa impor melingkar). */
import { and, asc, eq } from 'drizzle-orm';
import { assessmentSets, attemptAnswers, attempts, contentAssets } from '@/db/schema';
import type { Tx } from '../db';
import { notFound } from '../http/errors';
import { servedAudioMime } from './audio-asset';
import type { AnswerRow, AttemptRow, SetRow } from './dto';

/** Kunci baris attempt (`FOR UPDATE`) milik pengguna; bukan milik = tidak ada (404, tidak pernah 403). */
export async function loadLocked(tx: Tx, attemptId: string, userId: string): Promise<{ attempt: AttemptRow; set: SetRow }> {
  const [attempt] = await tx
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1)
    .for('update');
  if (!attempt) throw notFound();
  const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, attempt.assessmentSetId)).limit(1);
  if (!set) throw notFound();
  return { attempt, set };
}

export const loadAnswers = (tx: Tx, attemptId: string): Promise<AnswerRow[]> =>
  tx.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId)).orderBy(asc(attemptAnswers.answeredAt), asc(attemptAnswers.id));

export async function loadAudio(tx: Tx, set: Pick<SetRow, 'listeningAssetId'>) {
  if (!set.listeningAssetId) return null;
  const [a] = await tx
    .select({
      kind: contentAssets.kind,
      mimeType: contentAssets.mimeType,
      storageKey: contentAssets.storageKey,
      storageBackend: contentAssets.storageBackend,
      durationSec: contentAssets.durationSec,
    })
    .from(contentAssets)
    .where(eq(contentAssets.id, set.listeningAssetId))
    .limit(1);
  // F-11-03: hanya aset yang benar-benar dapat dilayani endpoint audio; MIME dinormalisasi sama seperti endpoint.
  const mime = servedAudioMime(a);
  return a && mime ? { mimeType: mime, durationSec: a.durationSec } : null;
}

