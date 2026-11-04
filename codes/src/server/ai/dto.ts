/** Pemetaan baris DB ke DTO kontrak (SPEC-012/013). Tidak pernah memuat raw_output, prompt_version, atau email. */
import { and, count, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { aiEvaluations, asyncJobs, speakingRecordings, submissions } from '@/db/schema';
import { DISCLAIMER, SPEAKING_CRITERIA, WRITING_CRITERIA, type EvaluationDTOType, type RecordingDTOType, type SubmissionDTOType, type SubmissionKindName } from '@/contracts/ai';
import type { DbOrTx } from '../db';
import { notFound } from '../http/errors';
import { AI_JOB_KINDS } from './quota';
import { normalizeFlags } from './scoring';

type SubmissionRow = typeof submissions.$inferSelect;
type EvalRow = typeof aiEvaluations.$inferSelect;
type JobRow = typeof asyncJobs.$inferSelect;
type RecRow = typeof speakingRecordings.$inferSelect;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export const criteriaDefs = (kind: string) => (kind.includes('SPEAKING') ? SPEAKING_CRITERIA : WRITING_CRITERIA);

interface FeedbackJson {
  comments?: Record<string, string>;
  task_requirement_met?: boolean;
  strengths_id?: string[];
  improvements_id?: string[];
  corrections?: Array<{ original: string; improved: string; reason_id: string }>;
  band7_rewrite?: string | null;
}

export function toEvaluationDTO(e: EvalRow, kind: string): EvaluationDTOType {
  const scores = (e.criteriaScores ?? {}) as Record<string, number>;
  const fb = (e.feedbackJson ?? {}) as FeedbackJson;
  const self = e.method === 'SELF_ASSESSMENT';
  return {
    id: e.id,
    run_number: e.runNumber,
    method: e.method,
    overall_band: Number(e.overallBand ?? 0),
    criteria: criteriaDefs(kind)
      .filter((c) => typeof scores[c.key] === 'number')
      .map((c) => ({ key: c.key, name: c.name, band: Number(scores[c.key]), comment_id: fb.comments?.[c.key] ?? null })),
    strengths_id: fb.strengths_id ?? [],
    improvements_id: fb.improvements_id ?? [],
    corrections: fb.corrections ?? [],
    band7_rewrite: self ? null : (fb.band7_rewrite ?? null),
    task_requirement_met: self ? null : (fb.task_requirement_met ?? null),
    flags: normalizeFlags(e.flags),
    model_name: self ? null : e.modelName,
    disclaimer: DISCLAIMER,
    created_at: e.createdAt.toISOString(),
  };
}

export function toRecordingDTO(r: RecRow): RecordingDTOType {
  return {
    id: r.id,
    mime_type: r.mimeType as RecordingDTOType['mime_type'],
    size_bytes: r.sizeBytes,
    duration_ms: r.durationMs,
    transcript: r.transcript,
    stt_confidence: r.sttConfidence === null ? null : Number(r.sttConfidence),
    available: r.storageKey !== null && r.purgedAt === null,
    retention_expires_at: iso(r.retentionExpiresAt),
    purged_at: iso(r.purgedAt),
  };
}

export async function toJobDTO(db: DbOrTx, j: JobRow): Promise<NonNullable<SubmissionDTOType['job']>> {
  let position: number | null = null;
  if (j.status === 'QUEUED') {
    const [r] = await db
      .select({ n: count() })
      .from(asyncJobs)
      .where(and(eq(asyncJobs.status, 'QUEUED'), inArray(asyncJobs.kind, [...AI_JOB_KINDS]), lt(asyncJobs.createdAt, j.createdAt)));
    position = 1 + Number(r?.n ?? 0);
  }
  return {
    id: j.id,
    kind: j.kind as NonNullable<SubmissionDTOType['job']>['kind'],
    status: j.status,
    stage: (j.stage as 'TRANSCRIBING' | 'GRADING' | 'SAVING' | null) ?? null,
    progress_percent: j.progressPercent,
    queue_position: position,
    error_code: j.errorCode,
    attempt: j.attempt,
  };
}

export async function latestJob(db: DbOrTx, submissionId: string): Promise<JobRow | null> {
  const [j] = await db
    .select()
    .from(asyncJobs)
    .where(eq(asyncJobs.submissionId, submissionId))
    .orderBy(desc(asyncJobs.createdAt), desc(asyncJobs.id))
    .limit(1);
  return j ?? null;
}

export async function latestEvaluation(db: DbOrTx, submissionId: string): Promise<EvalRow | null> {
  const [e] = await db.select().from(aiEvaluations).where(eq(aiEvaluations.submissionId, submissionId)).orderBy(desc(aiEvaluations.runNumber)).limit(1);
  return e ?? null;
}

export async function latestRecording(db: DbOrTx, submissionId: string): Promise<RecRow | null> {
  const [r] = await db
    .select()
    .from(speakingRecordings)
    .where(eq(speakingRecordings.submissionId, submissionId))
    .orderBy(desc(speakingRecordings.createdAt), desc(speakingRecordings.id))
    .limit(1);
  return r ?? null;
}

export async function buildSubmissionDTO(db: DbOrTx, s: SubmissionRow): Promise<SubmissionDTOType> {
  const [job, ev, rec] = await Promise.all([latestJob(db, s.id), latestEvaluation(db, s.id), latestRecording(db, s.id)]);
  return {
    id: s.id,
    kind: s.kind as SubmissionKindName,
    status: s.status,
    attempt_id: s.attemptId,
    sub_module_id: s.subModuleId,
    question_id: s.questionId,
    prompt_snapshot: s.promptSnapshot,
    response_text: s.responseText,
    word_count: s.wordCount,
    duration_sec: s.durationSec,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
    job: job ? await toJobDTO(db, job) : null,
    evaluation: ev ? toEvaluationDTO(ev, s.kind) : null,
    recording: rec ? toRecordingDTO(rec) : null,
  };
}

/** Muat submission milik `userId` (atau milik siapa pun bila `userId` null untuk admin); tidak ada -> 404. */
export async function loadSubmissionRow(db: DbOrTx, submissionId: string, userId: string | null): Promise<SubmissionRow> {
  const cond = userId ? and(eq(submissions.id, submissionId), eq(submissions.userId, userId)) : eq(submissions.id, submissionId);
  const [s] = await db.select().from(submissions).where(cond).limit(1);
  if (!s) throw notFound();
  return s;
}

export async function medianLatencyMs24h(db: DbOrTx): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS m
    FROM ai_evaluations
    WHERE method = 'AI_LOCAL' AND latency_ms IS NOT NULL AND created_at > now() - interval '24 hours'`);
  const v = (r.rows[0] as { m: number | string | null } | undefined)?.m;
  return v === null || v === undefined ? null : Number(v);
}
