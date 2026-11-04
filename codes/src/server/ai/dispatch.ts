/** Pengiriman job AI ke pg-boss SETELAH commit (pola sama dengan impor SPEC-019) dan pemulihan job yang tertinggal. */
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { asyncJobs, submissions } from '@/db/schema';
import type { QueueName } from '@/worker/queues';
import { writeAudit } from '../audit';
import { config } from '../config';
import { getDb } from '../db';
import { enqueue } from '../jobs/queue';
import { logger } from '../logger';
import { safeErr } from '../safe-error';
import { setRetention } from './recordings';

export const QUEUE_BY_KIND = {
  GRADE_WRITING: 'ai-grade-writing',
  GRADE_SPEAKING: 'ai-grade-speaking',
  STT_TRANSCRIBE: 'stt-transcribe',
} as const satisfies Record<string, QueueName>;
export type AiJobKindName = keyof typeof QUEUE_BY_KIND;

/** Kirim job ke antrean; gagal -> job dan submission `FAILED` (`INTERNAL`). Mengembalikan true bila terkirim. */
export async function dispatchAiJob(jobId: string, kind: AiJobKindName, submissionId: string): Promise<boolean> {
  const db = getDb();
  try {
    const bossId = await enqueue(QUEUE_BY_KIND[kind], { submission_id: submissionId, async_job_id: jobId });
    if (!bossId) throw new Error('pg-boss menolak job');
    await db.update(asyncJobs).set({ bossJobId: bossId }).where(eq(asyncJobs.id, jobId));
    return true;
  } catch (e) {
    logger.error({ err: safeErr(e), submissionId, kind }, 'ai_enqueue_failed');
    await db.transaction(async (tx) => {
      await tx.update(asyncJobs).set({ status: 'FAILED', errorCode: 'INTERNAL', finishedAt: new Date() }).where(and(eq(asyncJobs.id, jobId), eq(asyncJobs.status, 'QUEUED')));
      await tx.update(submissions).set({ status: 'FAILED', updatedAt: new Date() }).where(eq(submissions.id, submissionId));
      await setRetention(tx, submissionId);
    });
    return false;
  }
}

/** AI dimatikan: job `QUEUED` dibatalkan dan submission -> `FALLBACK_SELF_ASSESSMENT` (SPEC-012 edge case). */
export async function cancelQueuedJobsIfDisabled(onlyJobId?: string): Promise<number> {
  if (config.aiEnabled()) return 0;
  const db = getDb();
  return db.transaction(async (tx) => {
    const cond = and(eq(asyncJobs.status, 'QUEUED'), inArray(asyncJobs.kind, ['GRADE_WRITING', 'GRADE_SPEAKING', 'STT_TRANSCRIBE']), ...(onlyJobId ? [eq(asyncJobs.id, onlyJobId)] : []));
    const rows = await tx.update(asyncJobs).set({ status: 'CANCELLED', finishedAt: new Date() }).where(cond).returning({ submissionId: asyncJobs.submissionId });
    const ids = rows.map((r) => r.submissionId).filter((x): x is string => x !== null);
    if (ids.length > 0) {
      await tx
        .update(submissions)
        .set({ status: 'FALLBACK_SELF_ASSESSMENT', updatedAt: new Date() })
        .where(and(inArray(submissions.id, ids), inArray(submissions.status, ['RECEIVED', 'TRANSCRIBING', 'GRADING'])));
      for (const id of ids) await setRetention(tx, id);
    }
    return rows.length;
  });
}

/**
 * Pemulihan (tugas terjadwal + saat worker start): (1) job `QUEUED` tanpa id pg-boss > 2 menit dikirim ulang;
 * (2) job `QUEUED`/`RUNNING` yang job pg-boss-nya sudah `failed`/`cancelled` (kedaluwarsa/habis percobaan) -> `FAILED INTERNAL`;
 * (3) job `QUEUED` saat `AI_ENABLED=false` dibatalkan.
 */
export async function recoverStuckAiJobs(): Promise<{ redispatched: number; failed: number; cancelled: number }> {
  const db = getDb();
  const cancelled = await cancelQueuedJobsIfDisabled();
  const orphans = await db
    .select({ id: asyncJobs.id, kind: asyncJobs.kind, submissionId: asyncJobs.submissionId })
    .from(asyncJobs)
    .where(and(eq(asyncJobs.status, 'QUEUED'), isNull(asyncJobs.bossJobId), inArray(asyncJobs.kind, ['GRADE_WRITING', 'GRADE_SPEAKING', 'STT_TRANSCRIBE']), lt(asyncJobs.createdAt, sql`now() - interval '2 minutes'`)));
  let redispatched = 0;
  for (const o of orphans) {
    if (o.submissionId && (await dispatchAiJob(o.id, o.kind as AiJobKindName, o.submissionId))) redispatched++;
  }
  const dead = await db.execute(sql`
    SELECT a.id, a.submission_id FROM async_jobs a
    WHERE a.kind IN ('GRADE_WRITING','GRADE_SPEAKING','STT_TRANSCRIBE') AND a.status IN ('QUEUED','RUNNING')
      AND a.boss_job_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM pgboss.job j WHERE j.id = a.boss_job_id AND j.state IN ('failed','cancelled'))`);
  let failed = 0;
  for (const row of dead.rows as Array<{ id: string; submission_id: string | null }>) {
    await db.transaction(async (tx) => {
      await tx.update(asyncJobs).set({ status: 'FAILED', errorCode: 'INTERNAL', finishedAt: new Date() }).where(eq(asyncJobs.id, row.id));
      if (row.submission_id) {
        await tx.update(submissions).set({ status: 'FAILED', updatedAt: new Date() }).where(eq(submissions.id, row.submission_id));
        await setRetention(tx, row.submission_id);
        await writeAudit(tx, { action: 'AI_JOB_RECOVERED_FAILED', entityType: 'submission', entityId: row.submission_id });
      }
    });
    failed++;
  }
  return { redispatched, failed, cancelled };
}
