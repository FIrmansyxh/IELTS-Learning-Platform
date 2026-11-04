/**
 * Pipeline worker AI (SPEC-012 `ai-grade-writing`; SPEC-013 `stt-transcribe`, `ai-grade-speaking`).
 *
 * Kebijakan percobaan ulang: galat infrastruktur (LLM/STT tak terjangkau, timeout, 5xx, galat tak terduga) dilempar ulang agar
 * pg-boss mengulang (maks `AI_RETRY_LIMIT`, jeda 30 dtk + backoff). Hitungan percobaan = `async_jobs.attempt` (naik tiap eksekusi);
 * eksekusi terakhir yang gagal menandai job/submission `FAILED` dan TIDAK melempar. Kegagalan non-infrastruktur
 * (`LLM_INVALID_OUTPUT`, `AUDIO_*`, `STT_EMPTY`) langsung `FAILED` tanpa ulang.
 *
 * Log hanya memuat id, durasi, nama model, dan status; TIDAK PERNAH isi tulisan, transkrip, atau prompt.
 */
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { aiEvaluations, assessmentSets, asyncJobs, attempts, gradingRubrics, learningMaterials, speakingRecordings, submissions } from '@/db/schema';
import { SpeakingEvaluationOutputSchema, WritingEvaluationOutputSchema, type SubmissionKindName } from '@/contracts/ai';
import { AI_RETRY_LIMIT } from '@/worker/queues';
import { writeAudit } from '../audit';
import { config } from '../config';
import { getDb, type Tx } from '../db';
import { logger } from '../logger';
import { safeErr } from '../safe-error';
import { getStorage, type StorageDriver } from '../storage';
import { parseQuestions } from '../attempts/dto';
import { completeMiniTaskGraded } from '../player/service';
import { dispatchAiJob, cancelQueuedJobsIfDisabled } from './dispatch';
import { evaluateWithLlm } from './evaluate';
import { runEvaluationGradedHooks } from './hooks';
import { getLlmClient, llmModelName, LlmError, type LlmClient } from './llm';
import { convertToWav, MediaError, wavDurationMs } from './media';
import { AiLockTimeoutError, withAiLock } from './lock';
import { buildSpeakingPrompt, buildWritingPrompt } from './prompts';
import { removeFileQuietly, setRetention } from './recordings';
import { SPEAKING_RUBRIC_V1, WRITING_RUBRIC_V1, type RubricCriterion } from './rubric-seed';
import { scoreSpeaking, scoreWriting } from './scoring';
import { getSttClient, SttError, type SttClient } from './stt';
import { countWords, detectInjection, isNonEnglishSuspected } from './text';
import { EXT_BY_MIME, type RecordingMime } from './audio-type';

export interface AiJobData {
  submission_id: string;
  async_job_id: string;
}

export interface PipelineDeps {
  llm?: LlmClient;
  stt?: SttClient;
  storage?: StorageDriver;
  log?: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Jeda polling kunci advisory (ms); kecil di uji. */
  lockPollMs?: number;
}

const MAX_RUNS = AI_RETRY_LIMIT + 1;
const MAX_AUDIO_MS = 150_000;
const MIN_AUDIO_MS = 3_000;
const MAX_TRANSCRIPT_CHARS = 8000;
const MIN_TRANSCRIPT_WORDS = 5;

const timeoutSec = (): number => Number(process.env.AI_JOB_TIMEOUT_SEC ?? '180');
/** Batas waktu STT sebanding dengan durasi (kunci AI global tidak boleh ditahan lama oleh satu pengguna): 60 dtk + 2x durasi, maks timeout job. */
export const sttTimeoutMs = (durationMs: number): number => Math.min(timeoutSec() * 1000, 60_000 + durationMs * 2);
const numPredict = (): number => Number(process.env.AI_NUM_PREDICT ?? '1500');
const keepAlive = (): string => process.env.OLLAMA_KEEP_ALIVE ?? '5m';

type JobRow = typeof asyncJobs.$inferSelect;
type SubRow = typeof submissions.$inferSelect;

// ------------------------------------------------------------------ status job
async function beginRun(jobId: string, submissionStatus: SubRow['status'], stage: string): Promise<{ job: JobRow; sub: SubRow } | null> {
  return getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(asyncJobs).where(eq(asyncJobs.id, jobId)).for('update');
    if (!job || !job.submissionId || (job.status !== 'QUEUED' && job.status !== 'RUNNING')) return null;
    const [sub] = await tx.select().from(submissions).where(eq(submissions.id, job.submissionId)).for('update');
    if (!sub) return null;
    const now = new Date();
    const [updated] = await tx
      .update(asyncJobs)
      .set({ status: 'RUNNING', stage, progressPercent: 10, attempt: job.attempt + 1, startedAt: now, finishedAt: null, errorCode: null })
      .where(eq(asyncJobs.id, jobId))
      .returning();
    await tx.update(submissions).set({ status: submissionStatus, updatedAt: now }).where(eq(submissions.id, sub.id));
    return { job: updated!, sub };
  });
}

async function progress(jobId: string, percent: number, stage?: string): Promise<void> {
  await getDb()
    .update(asyncJobs)
    .set({ progressPercent: percent, ...(stage ? { stage } : {}) })
    .where(eq(asyncJobs.id, jobId));
}

async function failTerminal(jobId: string, submissionId: string, code: string, extra?: (tx: Tx) => Promise<void>): Promise<void> {
  await getDb().transaction(async (tx) => {
    const now = new Date();
    await tx.update(asyncJobs).set({ status: 'FAILED', errorCode: code, finishedAt: now }).where(eq(asyncJobs.id, jobId));
    await tx.update(submissions).set({ status: 'FAILED', updatedAt: now }).where(eq(submissions.id, submissionId));
    if (extra) await extra(tx);
    await setRetention(tx, submissionId);
  });
}

/**
 * F-13-02: pengguna dengan `keep_recordings=false` tidak boleh menyisakan berkas suara pada jalur gagal terminal.
 * Hapus fisik + tandai purged; tanpa efek bila tidak ada rekaman tersimpan atau pengguna mengizinkan penyimpanan.
 */
async function discardRecordingIfOptedOut(submissionId: string, userId: string, storage: StorageDriver): Promise<void> {
  try {
    const db = getDb();
    const r = await db.execute(sql`SELECT keep_recordings FROM users WHERE id = ${userId}::uuid`);
    if ((r.rows as Array<{ keep_recordings: boolean }>)[0]?.keep_recordings !== false) return;
    const recs = await db
      .select({ id: speakingRecordings.id, key: speakingRecordings.storageKey })
      .from(speakingRecordings)
      .where(and(eq(speakingRecordings.submissionId, submissionId), isNull(speakingRecordings.purgedAt)));
    for (const rec of recs) {
      await removeFileQuietly(storage, rec.key);
      await db.update(speakingRecordings).set({ storageKey: null, purgedAt: new Date() }).where(eq(speakingRecordings.id, rec.id));
    }
  } catch (e) {
    logger.warn({ err: safeErr(e), submission_id: submissionId }, 'recording_optout_discard_failed');
  }
}

async function submissionOwner(submissionId: string): Promise<string> {
  const [row] = await getDb().select({ u: submissions.userId }).from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  return row?.u ?? '00000000-0000-0000-0000-000000000000';
}

/** Galat infrastruktur: 'retry' (job kembali QUEUED, pemanggil melempar) atau 'final' (sudah FAILED). */
async function infraFailure(jobId: string, submissionId: string, code: string, retryStatus: SubRow['status']): Promise<'retry' | 'final'> {
  return getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(asyncJobs).where(eq(asyncJobs.id, jobId)).for('update');
    if (!job || job.status === 'FAILED' || job.status === 'SUCCEEDED' || job.status === 'CANCELLED') return 'final';
    const now = new Date();
    if (job.attempt >= MAX_RUNS) {
      await tx.update(asyncJobs).set({ status: 'FAILED', errorCode: code, finishedAt: now }).where(eq(asyncJobs.id, jobId));
      await tx.update(submissions).set({ status: 'FAILED', updatedAt: now }).where(eq(submissions.id, submissionId));
      await setRetention(tx, submissionId);
      return 'final';
    }
    await tx.update(asyncJobs).set({ status: 'QUEUED', stage: null, progressPercent: 0 }).where(eq(asyncJobs.id, jobId));
    await tx.update(submissions).set({ status: retryStatus, updatedAt: now }).where(eq(submissions.id, submissionId));
    return 'retry';
  });
}

function errorCodeOf(e: unknown): string {
  if (e instanceof LlmError) return e.code;
  if (e instanceof SttError) return e.code;
  return e instanceof AiLockTimeoutError ? 'INTERNAL' : 'INTERNAL';
}

/** Jalankan `body` di bawah kunci advisory global; galat infrastruktur mengikuti kebijakan ulang. */
async function guarded(data: AiJobData, retryStatus: SubRow['status'], deps: PipelineDeps, label: string, body: () => Promise<void>): Promise<void> {
  const log = deps.log ?? logger;
  if (!config.aiEnabled()) {
    await cancelQueuedJobsIfDisabled(data.async_job_id);
    log.info({ submission_id: data.submission_id, job: label, status: 'cancelled_ai_disabled' }, 'ai_job_cancelled');
    return;
  }
  try {
    await withAiLock(body, timeoutSec(), deps.lockPollMs);
  } catch (e) {
    const code = errorCodeOf(e);
    const outcome = await infraFailure(data.async_job_id, data.submission_id, code, retryStatus);
    log.warn({ err: safeErr(e), submission_id: data.submission_id, job: label, code, outcome }, 'ai_job_infra_failure');
    if (outcome === 'retry') throw e;
    await discardRecordingIfOptedOut(data.submission_id, await submissionOwner(data.submission_id), deps.storage ?? getStorage());
  }
}

// ------------------------------------------------------------------ rubrik
async function loadRubric(skill: 'WRITING' | 'SPEAKING'): Promise<{ id: string | null; criteria: RubricCriterion[] }> {
  const [row] = await getDb().select().from(gradingRubrics).where(and(eq(gradingRubrics.skill, skill), eq(gradingRubrics.isActive, true))).limit(1);
  const fallback = skill === 'WRITING' ? WRITING_RUBRIC_V1 : SPEAKING_RUBRIC_V1;
  const crit = row?.criteria;
  if (Array.isArray(crit) && crit.length === 4 && crit.every((c) => c && typeof c === 'object' && typeof (c as RubricCriterion).key === 'string' && typeof (c as RubricCriterion).descriptors === 'object')) {
    return { id: row!.id, criteria: crit as RubricCriterion[] };
  }
  return { id: row?.id ?? null, criteria: fallback };
}

async function miniTaskCriteria(subModuleId: string | null): Promise<string | null> {
  if (!subModuleId) return null;
  const [lm] = await getDb().select({ m: learningMaterials.miniTaskJson }).from(learningMaterials).where(eq(learningMaterials.subModuleId, subModuleId)).limit(1);
  const v = (lm?.m as { ai_rubric_criteria?: unknown } | null)?.ai_rubric_criteria;
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

const TASK_LABEL: Record<SubmissionKindName, string> = {
  WRITING_TASK1: 'IELTS Academic Writing Task 1',
  WRITING_TASK2: 'IELTS Writing Task 2 (essay)',
  MINI_TASK_WRITING: 'short writing mini-task',
  SPEAKING_PART1: 'IELTS Speaking Part 1',
  SPEAKING_PART2: 'IELTS Speaking Part 2 (long turn)',
  SPEAKING_PART3: 'IELTS Speaking Part 3',
  MINI_TASK_SPEAKING: 'short speaking mini-task',
};

// ------------------------------------------------------------------ simpan evaluasi
export interface SaveInput {
  jobId: string;
  sub: SubRow;
  rubricId: string | null;
  modelName: string;
  promptVersion: string;
  overallBand: number;
  criteriaScores: Record<string, number>;
  feedback: Record<string, unknown>;
  raw: string;
  latencyMs: number;
  flags: ReturnType<typeof scoreWriting>['flags'];
}

/** F-12-05: simpan hanya bila job masih RUNNING dan submission masih GRADING (kunci baris); selain itu hasil dibuang (false). */
export async function saveEvaluation(i: SaveInput): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [job] = await tx.select({ status: asyncJobs.status }).from(asyncJobs).where(eq(asyncJobs.id, i.jobId)).for('update');
    const [sub] = await tx.select().from(submissions).where(eq(submissions.id, i.sub.id)).for('update');
    if (!job || job.status !== 'RUNNING' || !sub || sub.status !== 'GRADING') return false;
    await tx.update(asyncJobs).set({ stage: 'SAVING', progressPercent: 90 }).where(eq(asyncJobs.id, i.jobId));
    const [{ max }] = (await tx
      .select({ max: sql<number>`coalesce(max(${aiEvaluations.runNumber}), 0)` })
      .from(aiEvaluations)
      .where(eq(aiEvaluations.submissionId, i.sub.id))) as [{ max: number }];
    const [ev] = await tx
      .insert(aiEvaluations)
      .values({
        submissionId: i.sub.id,
        runNumber: Number(max) + 1,
        method: 'AI_LOCAL',
        rubricId: i.rubricId,
        modelName: i.modelName,
        promptVersion: i.promptVersion,
        outputSchemaVersion: '1',
        overallBand: i.overallBand.toFixed(1),
        criteriaScores: i.criteriaScores,
        feedbackJson: i.feedback,
        rawOutput: i.raw,
        latencyMs: i.latencyMs,
        flags: i.flags,
      })
      .returning();
    const now = new Date();
    await tx.update(submissions).set({ status: 'GRADED', updatedAt: now }).where(eq(submissions.id, i.sub.id));
    await tx.update(asyncJobs).set({ status: 'SUCCEEDED', stage: 'SAVING', progressPercent: 100, finishedAt: now, errorCode: null }).where(eq(asyncJobs.id, i.jobId));
    await runEvaluationGradedHooks({
      tx,
      userId: i.sub.userId,
      submissionId: i.sub.id,
      kind: i.sub.kind,
      subModuleId: sub?.subModuleId ?? i.sub.subModuleId,
      evaluationId: ev!.id,
      method: 'AI_LOCAL',
      overallBand: i.overallBand,
      flags: i.flags,
    });
    if (i.sub.subModuleId && (i.sub.kind === 'MINI_TASK_WRITING' || i.sub.kind === 'MINI_TASK_SPEAKING')) {
      await completeMiniTaskGraded(tx, i.sub.userId, i.sub.subModuleId);
    }
    if (i.flags.injection_suspected) {
      await writeAudit(tx, { actorUserId: i.sub.userId, action: 'AI_INJECTION_SUSPECTED', entityType: 'submission', entityId: i.sub.id, metadata: { kind: i.sub.kind } });
    }
    await setRetention(tx, i.sub.id);
    return true;
  });
}

function feedbackOf(out: {
  criteria: Record<string, { band: number; comment_id: string }>;
  task_requirement_met: boolean;
  strengths_id: string[];
  improvements_id: string[];
  corrections: Array<{ original: string; improved: string; reason_id: string }>;
  band7_rewrite: string;
}) {
  return {
    comments: Object.fromEntries(Object.entries(out.criteria).map(([k, v]) => [k, v.comment_id])),
    task_requirement_met: out.task_requirement_met,
    strengths_id: out.strengths_id,
    improvements_id: out.improvements_id,
    corrections: out.corrections,
    band7_rewrite: out.band7_rewrite,
  };
}

// ------------------------------------------------------------------ ai-grade-writing
export async function runGradeWriting(data: AiJobData, deps: PipelineDeps = {}): Promise<void> {
  const log = deps.log ?? logger;
  await guarded(data, 'RECEIVED', deps, 'GRADE_WRITING', async () => {
    const run = await beginRun(data.async_job_id, 'GRADING', 'GRADING');
    if (!run) return;
    const { sub } = run;
    const started = Date.now();
    const text = sub.responseText ?? '';
    const kind = sub.kind as 'WRITING_TASK1' | 'WRITING_TASK2' | 'MINI_TASK_WRITING';

    const rubric = await loadRubric('WRITING');
    const mini = kind === 'MINI_TASK_WRITING';
    const wordCount = countWords(text);
    const injection = detectInjection(text);
    const nonEnglish = isNonEnglishSuspected(text);
    const minWords = mini ? null : await resolveMinWords(sub);

    const prompt = buildWritingPrompt({
      rubric: rubric.criteria,
      taskPrompt: sub.promptSnapshot,
      taskLabel: TASK_LABEL[kind],
      miniTaskCriteria: mini ? await miniTaskCriteria(sub.subModuleId) : null,
      userText: text,
    });
    const model = llmModelName('writing');
    const result = await evaluateWithLlm({
      llm: deps.llm ?? getLlmClient(),
      model,
      prompt,
      schema: WritingEvaluationOutputSchema,
      schemaKind: 'writing',
      numPredict: numPredict(),
      keepAlive: keepAlive(),
      timeoutMs: timeoutSec() * 1000,
    });
    await progress(data.async_job_id, 60);
    if (!result.ok) {
      await failTerminal(data.async_job_id, sub.id, 'LLM_INVALID_OUTPUT');
      log.warn({ submission_id: sub.id, model_name: model, status: 'FAILED', code: 'LLM_INVALID_OUTPUT', ms: Date.now() - started }, 'ai_grade_writing');
      return;
    }
    const out = result.data;
    const scores = { task_response: out.criteria.task_response.band, coherence: out.criteria.coherence.band, lexical: out.criteria.lexical.band, grammar: out.criteria.grammar.band };
    const scored = scoreWriting({ criteria: Object.values(scores), modelOverall: out.overall_band, kind, wordCount, minWords, nonEnglish, injection });
    const saved = await saveEvaluation({
      jobId: data.async_job_id,
      sub,
      rubricId: rubric.id,
      modelName: model,
      promptVersion: 'writing.v1',
      overallBand: scored.overall_band,
      criteriaScores: scores,
      feedback: feedbackOf(out),
      raw: result.raw,
      latencyMs: result.latencyMs,
      flags: scored.flags,
    });
    log.info({ submission_id: sub.id, model_name: model, status: saved ? 'GRADED' : 'discarded_stale', llm_calls: result.calls, ms: Date.now() - started }, 'ai_grade_writing');
  });
}

/** `min_words` soal pada set attempt (tanpa memeriksa status attempt: pengiriman sudah divalidasi saat dibuat). */
async function resolveMinWords(sub: SubRow): Promise<number | null> {
  if (!sub.attemptId || !sub.questionId) return null;
  const db = getDb();
  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, sub.attemptId)).limit(1);
  if (!attempt) return null;
  // Boss (SPEC-014): soal ada pada set anak section, bukan set induk.
  const sectionId = (attempt.state as { question_section?: Record<string, string> }).question_section?.[sub.questionId];
  const [set] = await db.select().from(assessmentSets).where(eq(assessmentSets.id, sectionId ?? attempt.assessmentSetId)).limit(1);
  if (!set) return null;
  const q = parseQuestions(set).get(sub.questionId);
  return q && q.question_type === 'WRITING_TASK' ? (q.min_words ?? null) : null;
}

// ------------------------------------------------------------------ ai-grade-speaking
export async function runGradeSpeaking(data: AiJobData, deps: PipelineDeps = {}): Promise<void> {
  const log = deps.log ?? logger;
  await guarded(data, 'GRADING', deps, 'GRADE_SPEAKING', async () => {
    const run = await beginRun(data.async_job_id, 'GRADING', 'GRADING');
    if (!run) return;
    const { sub } = run;
    const started = Date.now();
    const db = getDb();
    const transcript = sub.responseText ?? '';
    const kind = sub.kind as 'SPEAKING_PART1' | 'SPEAKING_PART2' | 'SPEAKING_PART3' | 'MINI_TASK_SPEAKING';
    const [rec] = await db.select().from(speakingRecordings).where(eq(speakingRecordings.submissionId, sub.id)).orderBy(desc(speakingRecordings.createdAt)).limit(1);
    const sttConfidence = rec?.sttConfidence === null || rec?.sttConfidence === undefined ? null : Number(rec.sttConfidence);

    const rubric = await loadRubric('SPEAKING');
    const mini = kind === 'MINI_TASK_SPEAKING';
    const wordCount = countWords(transcript);
    const injection = detectInjection(transcript);
    const nonEnglish = isNonEnglishSuspected(transcript);

    const prompt = buildSpeakingPrompt({
      rubric: rubric.criteria,
      taskPrompt: sub.promptSnapshot,
      taskLabel: TASK_LABEL[kind],
      miniTaskCriteria: mini ? await miniTaskCriteria(sub.subModuleId) : null,
      transcript,
      sttConfidence,
      durationSec: sub.durationSec,
    });
    const model = llmModelName('speaking');
    const result = await evaluateWithLlm({
      llm: deps.llm ?? getLlmClient(),
      model,
      prompt,
      schema: SpeakingEvaluationOutputSchema,
      schemaKind: 'speaking',
      numPredict: numPredict(),
      keepAlive: keepAlive(),
      timeoutMs: timeoutSec() * 1000,
    });
    await progress(data.async_job_id, 60);
    if (!result.ok) {
      await failTerminal(data.async_job_id, sub.id, 'LLM_INVALID_OUTPUT');
      await discardRecordingIfOptedOut(sub.id, sub.userId, deps.storage ?? getStorage());
      log.warn({ submission_id: sub.id, model_name: model, status: 'FAILED', code: 'LLM_INVALID_OUTPUT', ms: Date.now() - started }, 'ai_grade_speaking');
      return;
    }
    const out = result.data;
    const scores = { fluency: out.criteria.fluency.band, lexical: out.criteria.lexical.band, grammar: out.criteria.grammar.band, pronunciation: out.criteria.pronunciation.band };
    const scored = scoreSpeaking({ criteria: Object.values(scores), modelOverall: out.overall_band, kind, durationSec: sub.durationSec, wordCount, nonEnglish, injection, sttConfidence });
    const saved = await saveEvaluation({
      jobId: data.async_job_id,
      sub,
      rubricId: rubric.id,
      modelName: model,
      promptVersion: 'speaking.v1',
      overallBand: scored.overall_band,
      criteriaScores: scores,
      feedback: feedbackOf(out),
      raw: result.raw,
      latencyMs: result.latencyMs,
      flags: scored.flags,
    });
    log.info({ submission_id: sub.id, model_name: model, status: saved ? 'GRADED' : 'discarded_stale', llm_calls: result.calls, ms: Date.now() - started }, 'ai_grade_speaking');
  });
}

// ------------------------------------------------------------------ stt-transcribe
export async function runSttTranscribe(data: AiJobData, deps: PipelineDeps = {}): Promise<void> {
  const log = deps.log ?? logger;
  const storage = deps.storage ?? getStorage();
  await guarded(data, 'RECEIVED', deps, 'STT_TRANSCRIBE', async () => {
    const run = await beginRun(data.async_job_id, 'TRANSCRIBING', 'TRANSCRIBING');
    if (!run) return;
    const { sub } = run;
    const started = Date.now();
    const db = getDb();
    const [rec] = await db.select().from(speakingRecordings).where(eq(speakingRecordings.submissionId, sub.id)).orderBy(desc(speakingRecordings.createdAt)).limit(1);

    /** Kegagalan berkas: job FAILED tanpa ulang, berkas dihapus fisik dan ditandai purged, durasi (bila ada) dicatat. */
    const audioFail = async (code: 'AUDIO_UNREADABLE' | 'AUDIO_TOO_LONG' | 'AUDIO_TOO_SHORT', durationMs: number | null) => {
      await failTerminal(data.async_job_id, sub.id, code, async (tx) => {
        if (rec) {
          await tx
            .update(speakingRecordings)
            .set({ storageKey: null, purgedAt: new Date(), ...(durationMs !== null ? { durationMs } : {}) })
            .where(eq(speakingRecordings.id, rec.id));
        }
      });
      await removeFileQuietly(storage, rec?.storageKey);
      log.warn({ submission_id: sub.id, status: 'FAILED', code, ms: Date.now() - started }, 'stt_transcribe');
    };

    if (!rec || !rec.storageKey || rec.purgedAt) {
      await audioFail('AUDIO_UNREADABLE', null);
      return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'ielts-stt-'));
    try {
      let bytes: Buffer;
      try {
        bytes = await storage.get(rec.storageKey);
      } catch {
        await audioFail('AUDIO_UNREADABLE', null);
        return;
      }
      const ext = EXT_BY_MIME[rec.mimeType as RecordingMime] ?? 'bin';
      const input = path.join(dir, `in.${ext}`);
      await writeFile(input, bytes);

      // F-13-01: header kontainer tidak dipercaya (dapat dipalsukan). Konversi dibatasi 151 dtk dengan format masukan dipaksa;
      // durasi otoritatif = durasi WAV hasil konversi.
      const wav = path.join(dir, 'in.wav');
      try {
        await convertToWav(input, wav, undefined, rec.mimeType);
      } catch (e) {
        if (e instanceof MediaError) return audioFail('AUDIO_UNREADABLE', null);
        throw e;
      }
      const durationMs = wavDurationMs((await stat(wav)).size);
      if (durationMs > MAX_AUDIO_MS) return audioFail('AUDIO_TOO_LONG', durationMs);
      if (durationMs < MIN_AUDIO_MS) return audioFail('AUDIO_TOO_SHORT', durationMs);
      await progress(data.async_job_id, 40);

      const stt = await (deps.stt ?? getSttClient()).transcribe(wav, { language: 'en', timeoutMs: sttTimeoutMs(durationMs) });
      const text = stt.text.trim().slice(0, MAX_TRANSCRIPT_CHARS);
      const words = countWords(text);
      if (words < MIN_TRANSCRIPT_WORDS) {
        await failTerminal(data.async_job_id, sub.id, 'STT_EMPTY', async (tx) => {
          await tx.update(speakingRecordings).set({ durationMs }).where(eq(speakingRecordings.id, rec.id));
        });
        await discardRecordingIfOptedOut(sub.id, sub.userId, storage);
        log.warn({ submission_id: sub.id, status: 'FAILED', code: 'STT_EMPTY', ms: Date.now() - started }, 'stt_transcribe');
        return;
      }

      const dropFile = await getDb().transaction(async (tx) => {
        const [user] = await tx.execute(sql`SELECT keep_recordings FROM users WHERE id = ${sub.userId}::uuid`).then((r) => r.rows as Array<{ keep_recordings: boolean }>);
        const keep = user?.keep_recordings !== false;
        const now = new Date();
        await tx
          .update(speakingRecordings)
          .set({
            transcript: text,
            transcriptSegments: stt.segments,
            sttEngine: stt.engine.slice(0, 60),
            sttConfidence: stt.confidence === null ? null : stt.confidence.toFixed(3),
            durationMs,
            ...(keep ? {} : { storageKey: null, purgedAt: now }),
          })
          .where(eq(speakingRecordings.id, rec.id));
        await tx
          .update(submissions)
          .set({ responseText: text, wordCount: words, durationSec: Math.ceil(durationMs / 1000), status: 'GRADING', updatedAt: now })
          .where(eq(submissions.id, sub.id));
        await tx.update(asyncJobs).set({ status: 'SUCCEEDED', progressPercent: 100, finishedAt: now, errorCode: null }).where(eq(asyncJobs.id, data.async_job_id));
        const [next] = await tx.insert(asyncJobs).values({ kind: 'GRADE_SPEAKING', userId: sub.userId, submissionId: sub.id }).returning({ id: asyncJobs.id });
        return { key: keep ? null : rec.storageKey, nextJobId: next!.id };
      });
      if (dropFile.key) await removeFileQuietly(storage, dropFile.key);
      log.info({ submission_id: sub.id, engine: stt.engine, status: 'TRANSCRIBED', ms: Date.now() - started }, 'stt_transcribe');
      await dispatchAiJob(dropFile.nextJobId, 'GRADE_SPEAKING', sub.id);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

/** Bersihkan direktori sementara STT berumur > 1 jam (worker mati di tengah proses). Dipanggil saat worker start. */
export async function cleanupStaleTempDirs(maxAgeMs = 3600_000): Promise<number> {
  const { readdir } = await import('node:fs/promises');
  let removed = 0;
  for (const name of await readdir(tmpdir()).catch(() => [] as string[])) {
    if (!name.startsWith('ielts-stt-')) continue;
    const full = path.join(tmpdir(), name);
    const st = await stat(full).catch(() => null);
    if (st?.isDirectory() && Date.now() - st.mtimeMs > maxAgeMs) {
      await rm(full, { recursive: true, force: true }).catch(() => undefined);
      removed++;
    }
  }
  return removed;
}
