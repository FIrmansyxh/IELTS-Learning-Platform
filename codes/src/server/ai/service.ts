/**
 * Layanan submission AI (SPEC-012 Writing; SPEC-013 Speaking). SATU tempat untuk kuota, antrean, retry, penilaian sendiri,
 * dan status. Endpoint Speaking memakai fungsi yang sama (hanya perbedaan Speaking ada di `speaking.ts`).
 */
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { aiEvaluations, asyncJobs, auditLog, speakingRecordings, submissions } from '@/db/schema';
import {
  SPEAKING_CRITERIA,
  WRITING_CRITERIA,
  type CreateWritingSubmissionRequest,
  type EvaluationDTOType,
  type SelfAssessmentRequest,
  type SubmissionDTOType,
  type SubmissionKindName,
} from '@/contracts/ai';
import { roundToHalfBand } from '../band/convert';
import { writeAudit } from '../audit';
import { config } from '../config';
import type { Db, DbOrTx, Tx } from '../db';
import { ApiError, notFound, validationError } from '../http/errors';
import { completeMiniTaskGraded } from '../player/service';
import { getSetting } from '../settings/service';
import { resolveAttemptQuestion, resolveMiniTask } from './context';
import { buildSubmissionDTO, loadSubmissionRow, medianLatencyMs24h, toEvaluationDTO } from './dto';
import { dispatchAiJob } from './dispatch';
import { runEvaluationGradedHooks } from './hooks';
import { getLlmClient } from './llm';
import { assertDailyQuota, assertQueueNotFull, countQueuedJobs, getQuota, hasActiveSubmission } from './quota';
import { setRetention } from './recordings';
import { defaultFlags, meanBand } from './scoring';
import { countWords } from './text';

type SubRow = typeof submissions.$inferSelect;

/** Serialisasi per pengguna: pengiriman serentak oleh pengguna sama diproses berurutan (409 untuk yang kedua). */
export async function lockUserSubmissions(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-submission:${userId}`}, 0))`);
}

/** (5) duplikasi pengiriman untuk soal attempt yang sama: ada submission non-FAILED. */
export async function assertNotDuplicate(tx: Tx, userId: string, attemptId: string, questionId: string): Promise<void> {
  const rows = await tx
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), eq(submissions.attemptId, attemptId), eq(submissions.questionId, questionId), sql`${submissions.status} <> 'FAILED'`))
    .limit(1);
  if (rows.length > 0) throw new ApiError('SUBMISSION_ALREADY_EXISTS');
}

/** (6)-(8) pemeriksaan AI aktif: submission berjalan, kuota harian, antrean. */
export async function assertCanEnqueue(tx: Tx, userId: string): Promise<void> {
  if (await hasActiveSubmission(tx, userId)) throw new ApiError('AI_SUBMISSION_IN_PROGRESS');
  await assertDailyQuota(tx, userId);
  await assertQueueNotFull(tx);
}

// ------------------------------------------------------------------ POST /submissions/writing
export async function createWritingSubmission(db: Db, userId: string, input: CreateWritingSubmissionRequest) {
  const aiOn = config.aiEnabled();
  const created = await db.transaction(async (tx) => {
    await lockUserSubmissions(tx, userId);
    const mini = input.kind === 'MINI_TASK_WRITING';
    let prompt: string;
    if (mini) {
      prompt = (await resolveMiniTask(tx, userId, input.sub_module_id!, 'AI_SHORT_WRITING')).prompt;
    } else {
      const ctx = await resolveAttemptQuestion(tx, userId, input.attempt_id!, input.question_id!, {
        type: 'WRITING_TASK',
        taskKind: input.kind === 'WRITING_TASK1' ? 'TASK1' : 'TASK2',
      });
      prompt = ctx.prompt;
    }
    const wordCount = countWords(input.response_text);
    if (wordCount < (mini ? 5 : 20)) throw validationError('response_text', 'response_too_short', 'Jawaban terlalu pendek.');
    if (!mini) await assertNotDuplicate(tx, userId, input.attempt_id!, input.question_id!);
    if (aiOn) await assertCanEnqueue(tx, userId);

    const [sub] = await tx
      .insert(submissions)
      .values({
        userId,
        kind: input.kind,
        attemptId: mini ? null : input.attempt_id!,
        subModuleId: mini ? input.sub_module_id! : null,
        questionId: mini ? null : input.question_id!,
        promptSnapshot: prompt,
        responseText: input.response_text,
        wordCount,
        durationSec: input.duration_sec ?? null,
        status: aiOn ? 'RECEIVED' : 'FALLBACK_SELF_ASSESSMENT',
      })
      .returning();
    let jobId: string | null = null;
    if (aiOn) {
      const [job] = await tx.insert(asyncJobs).values({ kind: 'GRADE_WRITING', userId, submissionId: sub!.id }).returning({ id: asyncJobs.id });
      jobId = job!.id;
    }
    return { sub: sub!, jobId };
  });

  if (created.jobId) await dispatchOrFail(created.jobId, 'GRADE_WRITING', created.sub.id);
  return { submission: await buildSubmissionDTO(db, await loadSubmissionRow(db, created.sub.id, userId)), quota: await getQuota(db, userId) };
}

/** Kirim ke antrean; bila gagal kirim, submission sudah ditandai FAILED oleh `dispatchAiJob` dan klien menerima 503. */
export async function dispatchOrFail(jobId: string, kind: 'GRADE_WRITING' | 'GRADE_SPEAKING' | 'STT_TRANSCRIBE', submissionId: string): Promise<void> {
  if (!(await dispatchAiJob(jobId, kind, submissionId))) {
    throw new ApiError('SERVICE_UNAVAILABLE', { message: 'Antrean penilaian belum siap. Coba lagi sebentar lagi.' });
  }
}

// ------------------------------------------------------------------ GET
export async function getSubmission(db: Db, submissionId: string, userId: string | null): Promise<SubmissionDTOType> {
  return buildSubmissionDTO(db, await loadSubmissionRow(db, submissionId, userId));
}

export async function listSubmissions(db: Db, userId: string, q: { kind?: SubmissionKindName; page: number; page_size: number }) {
  const where = and(eq(submissions.userId, userId), ...(q.kind ? [eq(submissions.kind, q.kind)] : []));
  const [{ total }] = (await db.select({ total: count() }).from(submissions).where(where)) as [{ total: number }];
  const rows = await db
    .select()
    .from(submissions)
    .where(where)
    .orderBy(desc(submissions.createdAt), desc(submissions.id))
    .limit(q.page_size)
    .offset((q.page - 1) * q.page_size);
  const ids = rows.map((r) => r.id);
  const evals = ids.length
    ? await db.select().from(aiEvaluations).where(inArray(aiEvaluations.submissionId, ids)).orderBy(desc(aiEvaluations.runNumber))
    : [];
  const latest = new Map<string, (typeof evals)[number]>();
  for (const e of evals) if (!latest.has(e.submissionId)) latest.set(e.submissionId, e);
  return {
    total: Number(total),
    rows: rows.map((s) => {
      const ev = latest.get(s.id);
      return {
        id: s.id,
        kind: s.kind as SubmissionKindName,
        status: s.status,
        overall_band: ev ? Number(ev.overallBand) : null,
        method: ev ? ev.method : null,
        word_count: s.wordCount,
        prompt_excerpt: s.promptSnapshot.slice(0, 120),
        created_at: s.createdAt.toISOString(),
      };
    }),
  };
}

// ------------------------------------------------------------------ POST /submissions/{id}/retry
const NON_RETRYABLE_CODES = new Set(['AUDIO_UNREADABLE', 'AUDIO_TOO_LONG', 'AUDIO_TOO_SHORT', 'STT_EMPTY']);
export const MAX_RETRIES = 3;

export async function retrySubmission(db: Db, userId: string, submissionId: string) {
  const out = await db.transaction(async (tx) => {
    await lockUserSubmissions(tx, userId);
    const [sub] = await tx.select().from(submissions).where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId))).for('update');
    if (!sub) throw notFound();
    if (sub.status !== 'FAILED') throw new ApiError('SUBMISSION_NOT_RETRYABLE');
    const [last] = await tx.select().from(asyncJobs).where(eq(asyncJobs.submissionId, sub.id)).orderBy(desc(asyncJobs.createdAt), desc(asyncJobs.id)).limit(1);
    if (last?.errorCode && NON_RETRYABLE_CODES.has(last.errorCode)) throw new ApiError('SUBMISSION_NOT_RETRYABLE');
    const [{ n }] = (await tx
      .select({ n: count() })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'AI_SUBMISSION_RETRIED'), eq(auditLog.entityType, 'submission'), eq(auditLog.entityId, sub.id)))) as [{ n: number }];
    if (Number(n) >= MAX_RETRIES) throw new ApiError('RETRY_LIMIT_REACHED');
    if (!config.aiEnabled()) throw new ApiError('AI_DISABLED');
    if (await hasActiveSubmission(tx, userId, sub.id)) throw new ApiError('AI_SUBMISSION_IN_PROGRESS');
    await assertQueueNotFull(tx);

    let kind: 'GRADE_WRITING' | 'GRADE_SPEAKING' | 'STT_TRANSCRIBE';
    let status: SubRow['status'] = 'RECEIVED';
    if (sub.kind.includes('SPEAKING')) {
      const [rec] = await tx.select().from(speakingRecordings).where(eq(speakingRecordings.submissionId, sub.id)).orderBy(desc(speakingRecordings.createdAt)).limit(1);
      if (rec?.transcript) {
        kind = 'GRADE_SPEAKING';
        status = 'GRADING';
      } else {
        if (!rec || !rec.storageKey || rec.purgedAt) throw new ApiError('RECORDING_UNAVAILABLE');
        kind = 'STT_TRANSCRIBE';
      }
    } else {
      kind = 'GRADE_WRITING';
    }
    await tx.update(submissions).set({ status, updatedAt: new Date() }).where(eq(submissions.id, sub.id));
    const [job] = await tx.insert(asyncJobs).values({ kind, userId, submissionId: sub.id }).returning({ id: asyncJobs.id });
    await writeAudit(tx, { actorUserId: userId, action: 'AI_SUBMISSION_RETRIED', entityType: 'submission', entityId: sub.id, metadata: { kind } });
    return { jobId: job!.id, kind, subId: sub.id };
  });
  await dispatchOrFail(out.jobId, out.kind, out.subId);
  return { submission: await getSubmission(db, out.subId, userId), quota: await getQuota(db, userId) };
}

// ------------------------------------------------------------------ POST /submissions/{id}/self-assessment
export async function selfAssess(db: Db, userId: string, submissionId: string, input: SelfAssessmentRequest) {
  const out = await db.transaction(async (tx) => {
    const [sub] = await tx.select().from(submissions).where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId))).for('update');
    if (!sub) throw notFound();
    const defs = sub.kind.includes('SPEAKING') ? SPEAKING_CRITERIA : WRITING_CRITERIA;
    const keys = Object.keys(input.criteria_scores);
    const expected = defs.map((d) => d.key) as string[];
    if (keys.length !== expected.length || !expected.every((k) => keys.includes(k))) {
      throw new ApiError('VALIDATION_ERROR', {
        details: [{ path: 'criteria_scores', code: 'criteria_keys_mismatch', message: `Kunci harus tepat: ${expected.join(', ')}.` }],
      });
    }
    if (sub.status !== 'FAILED' && sub.status !== 'FALLBACK_SELF_ASSESSMENT') throw new ApiError('SELF_ASSESSMENT_NOT_ALLOWED');

    const scores = Object.fromEntries(expected.map((k) => [k, input.criteria_scores[k]!]));
    const overall = roundToHalfBand(meanBand(Object.values(scores)));
    const [{ max }] = (await tx
      .select({ max: sql<number>`coalesce(max(${aiEvaluations.runNumber}), 0)` })
      .from(aiEvaluations)
      .where(eq(aiEvaluations.submissionId, sub.id))) as [{ max: number }];
    const flags = defaultFlags();
    const [ev] = await tx
      .insert(aiEvaluations)
      .values({
        submissionId: sub.id,
        runNumber: Number(max) + 1,
        method: 'SELF_ASSESSMENT',
        outputSchemaVersion: '1',
        overallBand: overall.toFixed(1),
        criteriaScores: scores,
        feedbackJson: { comments: {}, strengths_id: [], improvements_id: [], corrections: [], band7_rewrite: null },
        flags,
      })
      .returning();
    const now = new Date();
    await tx.update(submissions).set({ status: 'GRADED', updatedAt: now }).where(eq(submissions.id, sub.id));
    // Job gagal terakhir tetap FAILED (riwayat); tidak ada job aktif pada status ini.
    await runEvaluationGradedHooks({
      tx,
      userId,
      submissionId: sub.id,
      kind: sub.kind,
      subModuleId: sub.subModuleId,
      evaluationId: ev!.id,
      method: 'SELF_ASSESSMENT',
      overallBand: overall,
      flags,
    });
    if (sub.subModuleId && (sub.kind === 'MINI_TASK_WRITING' || sub.kind === 'MINI_TASK_SPEAKING')) {
      await completeMiniTaskGraded(tx, userId, sub.subModuleId);
    }
    await setRetention(tx, sub.id);
    return { subId: sub.id, ev: ev! };
  });
  const submission = await getSubmission(db, out.subId, userId);
  const evaluation: EvaluationDTOType = toEvaluationDTO(out.ev, submission.kind);
  return { submission, evaluation };
}

// ------------------------------------------------------------------ GET /ai/status
let pingCache: { at: number; ok: boolean } | null = null;
export function resetPingCache(): void {
  pingCache = null;
}

async function llmAvailable(): Promise<boolean> {
  if (pingCache && Date.now() - pingCache.at < 30_000) return pingCache.ok;
  let ok = false;
  try {
    ok = await Promise.race([getLlmClient().ping(), new Promise<boolean>((r) => setTimeout(() => r(false), 2000))]);
  } catch {
    ok = false;
  }
  pingCache = { at: Date.now(), ok };
  return ok;
}

export async function aiStatus(db: DbOrTx, userId: string) {
  const enabled = config.aiEnabled();
  const [quota, waiting, retention, median] = await Promise.all([
    getQuota(db, userId),
    countQueuedJobs(db),
    getSetting<number>(db, 'retention.audio_days'),
    medianLatencyMs24h(db),
  ]);
  return {
    enabled,
    available: enabled ? await llmAvailable() : false,
    queue: { waiting, estimated_wait_sec: median === null ? null : Math.round((waiting * median) / 1000) },
    quota,
    recording_retention_days: retention,
  };
}

