import { createHash, randomUUID } from 'node:crypto';
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  aiEvaluations,
  asyncJobs,
  attempts,
  attemptSections,
  learningMaterials,
  speakingRecordings,
  submissions,
  subModules,
  users,
} from '@/db/schema';
import type { Db } from '../db';
import { config } from '../config';
import { ApiError, notFound } from '../http/errors';
import { logger } from '../logger';
import { writeAudit } from '../audit';
import { enqueue } from '../jobs/queue';
import { safeErr } from '../safe-error';
import { getLlmClient } from './llm';
import { countWords, roundToHalfBand } from './scoring';
import { processWritingEvaluation } from './pipeline';
import { evaluationGradedHooks } from './hooks';
import {
  processSpeakingEvaluation,
  processSttTranscription,
} from './speaking-pipeline';
import type {
  CreateWritingSubmissionRequest,
  EvaluationDTO,
  ExternalSpeakingEvaluationRequest,
  JobDTO,
  RecordingDTO,
  SubmissionDTO,
  SubmissionKindName,
  SubmissionQuotaDTO,
} from '@/contracts/ai';
import { assertSubModuleAccessible } from '../gatekeeping/service';
import { attemptQuestionList } from './attempt-questions';
import { completeAiMiniTask } from '../player/service';
import { getStorage } from '../storage';
import {
  detectAudioMime,
  UPLOAD_MAX_BYTES_RECORDING,
  UPLOAD_MIN_BYTES_RECORDING,
} from './audio';
import { parseByteRange } from '@/lib/audio/range';

const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const WRITING_KEYS = ['task_response', 'coherence', 'lexical', 'grammar'] as const;
const SPEAKING_KEYS = ['fluency', 'lexical', 'grammar', 'pronunciation'] as const;

export async function createWritingSubmission(
  db: Db,
  userId: string,
  input: CreateWritingSubmissionRequest,
): Promise<{ submission: SubmissionDTO; quota: SubmissionQuotaDTO }> {
  const responseText = input.response_text.normalize('NFC').trim();
  if (responseText.length > 5000) {
    throw new ApiError('VALIDATION_ERROR', {
      details: [{ path: 'response_text', code: 'too_long', message: 'Teks maksimal 5000 karakter.' }],
    });
  }
  if (CONTROL_CHARS_REGEX.test(responseText)) {
    throw new ApiError('VALIDATION_ERROR', {
      details: [{ path: 'response_text', code: 'control_char', message: 'Teks tidak boleh mengandung karakter kontrol.' }],
    });
  }

  const wordCount = countWords(responseText);
  const isMini = input.kind === 'MINI_TASK_WRITING';
  const minRequiredWords = isMini ? 5 : 20;
  if (wordCount < minRequiredWords) {
    throw new ApiError('VALIDATION_ERROR', {
      details: [{ path: 'response_text', code: 'response_too_short', message: `Minimal ${minRequiredWords} kata.` }],
    });
  }

  let promptSnapshot = '';
  if (isMini) {
    if (!input.sub_module_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'sub_module_id', code: 'sub_module_required', message: 'Sub-modul wajib untuk Mini-Task.' }] });
    }
    if (input.attempt_id || input.question_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'attempt_id', code: 'unexpected_field', message: 'Attempt tidak boleh diisi untuk Mini-Task.' }] });
    }

    const [subMod] = await db
      .select({ id: subModules.id, status: subModules.status })
      .from(subModules)
      .where(eq(subModules.id, input.sub_module_id))
      .limit(1);

    if (!subMod) throw notFound();

    const [mat] = await db
      .select({ miniTaskJson: learningMaterials.miniTaskJson })
      .from(learningMaterials)
      .where(eq(learningMaterials.subModuleId, input.sub_module_id))
      .limit(1);

    const miniTask = mat?.miniTaskJson as { task_type?: string; prompt?: string } | null;
    if (!miniTask || miniTask.task_type !== 'AI_SHORT_WRITING') {
      throw new ApiError('MINI_TASK_TYPE_MISMATCH');
    }
    promptSnapshot = miniTask.prompt ?? 'Mini-Task Writing';

    const access = await assertSubModuleAccessible(db, userId, input.sub_module_id);
    if (!access.progress.learnCompleted) throw new ApiError('LEARN_NOT_COMPLETED');
  } else {
    if (!input.attempt_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'attempt_id', code: 'attempt_required', message: 'Attempt wajib untuk tugas esai.' }] });
    }
    if (!input.question_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'question_id', code: 'question_required', message: 'Soal wajib untuk tugas esai.' }] });
    }
    if (input.sub_module_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'sub_module_id', code: 'unexpected_field', message: 'Sub-modul tidak boleh diisi untuk tugas esai.' }] });
    }

    const [attempt] = await db
      .select({
        id: attempts.id,
        userId: attempts.userId,
        status: attempts.status,
        assessmentSetId: attempts.assessmentSetId,
        assessmentType: attempts.assessmentType,
        state: attempts.state,
      })
      .from(attempts)
      .where(eq(attempts.id, input.attempt_id))
      .limit(1);

    if (!attempt || attempt.userId !== userId) throw notFound();
    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');

    if (attempt.assessmentType === 'MOCK_TEST') {
      const [wSec] = await db
        .select()
        .from(attemptSections)
        .where(and(eq(attemptSections.attemptId, input.attempt_id), eq(attemptSections.skill, 'WRITING')))
        .limit(1);
      if (!wSec || !wSec.startedAt || wSec.status !== 'IN_PROGRESS') {
        throw new ApiError('SECTION_NOT_ACTIVE');
      }
      if (wSec.deadlineAt && new Date().getTime() > new Date(wSec.deadlineAt).getTime() + 5000) {
        throw new ApiError('SECTION_EXPIRED');
      }
    }

    // SPEC-022: attempt tanpa set (MIX_PRACTICE) membaca soal dari attempts.state.
    const setRow = { questionsJson: await attemptQuestionList(db, attempt) };

    // Soal tersimpan dalam bentuk kontrak konten (`question_id`, `task_kind` = TASK1|TASK2).
    const questions = (setRow?.questionsJson ?? []) as Array<{ question_id?: string; id?: string; question_type: string; task_kind?: string; prompt?: string; part?: number }>;
    const foundQuestion = questions.find((q) => (q.question_id ?? q.id) === input.question_id) ?? null;

    if (!foundQuestion) throw notFound();
    if (foundQuestion.question_type !== 'WRITING_TASK') {
      throw new ApiError('QUESTION_TYPE_MISMATCH');
    }
    if (foundQuestion.task_kind && `WRITING_${foundQuestion.task_kind}` !== input.kind) {
      throw new ApiError('QUESTION_TYPE_MISMATCH');
    }
    promptSnapshot = foundQuestion.prompt ?? 'Writing Task Prompt';

    const [existingSub] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.attemptId, input.attempt_id),
          eq(submissions.questionId, input.question_id),
          sql`${submissions.status} <> 'FAILED'`,
        ),
      )
      .limit(1);

    if (existingSub) throw new ApiError('SUBMISSION_ALREADY_EXISTS');
  }

  const enabled = process.env.AI_ENABLED !== 'false';
  const now = new Date();
  const submissionId = randomUUID();
  const jobId = randomUUID();

  if (!enabled) {
    const subRecord = {
      id: submissionId,
      userId,
      kind: input.kind,
      status: 'FALLBACK_SELF_ASSESSMENT' as const,
      attemptId: input.attempt_id ?? null,
      subModuleId: input.sub_module_id ?? null,
      questionId: input.question_id ?? null,
      promptSnapshot,
      responseText,
      wordCount,
      durationSec: input.duration_sec ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const [inserted] = await db.insert(submissions).values(subRecord).returning();

    return {
      submission: buildSubmissionDTO(inserted!, null, null, null),
      quota: { limit: 0, used: 0, remaining: 0, resets_at: null },
    };
  }

  const [activeSub] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        inArray(submissions.status, ['RECEIVED', 'TRANSCRIBING', 'GRADING']),
      ),
    )
    .limit(1);

  if (activeSub) {
    throw new ApiError('AI_SUBMISSION_IN_PROGRESS');
  }

  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [{ count: dailyCount }] = await db
    .select({ count: count() })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        gte(submissions.createdAt, since24h),
        sql`${submissions.status} <> 'FAILED'`,
      ),
    );

  const dailyLimit = 10;
  if (dailyCount >= dailyLimit) {
    const resetTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const resetHours = resetTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    throw new ApiError('AI_DAILY_LIMIT_REACHED', {
      status: 429,
      headers: { 'Retry-After': '3600' },
      message: `Batas penilaian AI hari ini (${dailyLimit}) sudah tercapai. Coba lagi setelah ${resetHours} WIB.`,
    });
  }

  const [{ count: queueCount }] = await db
    .select({ count: count() })
    .from(asyncJobs)
    .where(eq(asyncJobs.status, 'QUEUED'));

  const queueMax = 20;
  if (queueCount >= queueMax) {
    throw new ApiError('AI_QUEUE_FULL', {
      status: 503,
      headers: { 'Retry-After': '60' },
      message: 'Antrean penilaian penuh. Coba lagi dalam 1 menit.',
    });
  }

  const queuePosition = queueCount + 1;
  const sub = {
    id: submissionId,
    userId,
    kind: input.kind,
    status: 'RECEIVED' as const,
    attemptId: input.attempt_id ?? null,
    subModuleId: input.sub_module_id ?? null,
    questionId: input.question_id ?? null,
    promptSnapshot,
    responseText,
    wordCount,
    durationSec: input.duration_sec ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const job = {
    id: jobId,
    kind: 'GRADE_WRITING' as const,
    userId,
    submissionId,
    status: 'QUEUED' as const,
    stage: null,
    progressPercent: 0,
    attempt: 0,
    createdAt: now,
  };

  let insertedSub: typeof submissions.$inferSelect;
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(submissions).values(sub).returning();
    insertedSub = row!;
    await tx.insert(asyncJobs).values(job);
  });

  try {
    await enqueue('ai-grade-writing', { submission_id: submissionId, async_job_id: jobId });
  } catch (err) {
    logger.warn({ err: safeErr(err), submissionId }, 'job_enqueue_failed');
  }

  if (process.env.LLM_DRIVER === 'mock' || process.env.NODE_ENV === 'test') {
    void processWritingEvaluation(submissionId, jobId).catch((e) =>
      logger.error({ err: safeErr(e), submissionId }, 'inline_worker_error'),
    );
  }

  const jobDto: JobDTO = {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: null,
    progress_percent: 0,
    queue_position: queuePosition,
    error_code: null,
    attempt: 0,
  };

  const quotaDto: SubmissionQuotaDTO = {
    limit: dailyLimit,
    used: dailyCount + 1,
    remaining: Math.max(0, dailyLimit - dailyCount - 1),
    resets_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };

  return {
    submission: buildSubmissionDTO(insertedSub!, jobDto, null, null),
    quota: quotaDto,
  };
}

export interface CreateSpeakingSubmissionInput {
  kind: 'SPEAKING_PART1' | 'SPEAKING_PART2' | 'SPEAKING_PART3' | 'MINI_TASK_SPEAKING';
  attempt_id?: string;
  question_id?: string;
  sub_module_id?: string;
  duration_sec?: number;
}

export async function createSpeakingSubmission(
  db: Db,
  userId: string,
  input: CreateSpeakingSubmissionInput,
  audioBuffer: Buffer,
): Promise<{ submission: SubmissionDTO; quota: SubmissionQuotaDTO }> {
  // 0. MVP (ADR-004): penilaian Speaking otomatis dimatikan; latihan Speaking memakai prompt AI eksternal.
  if (!config.speakingAiEnabled()) {
    throw new ApiError('AI_DISABLED', {
      status: 409,
      message: 'Penilaian Speaking otomatis belum aktif. Gunakan prompt latihan untuk AI suara (Claude, GPT, atau Gemini).',
    });
  }

  // 1. Periksa consent rekaman
  const [userRow] = await db
    .select({
      consentRecordingAt: users.consentRecordingAt,
      keepRecordings: users.keepRecordings,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow || !userRow.consentRecordingAt) {
    throw new ApiError('RECORDING_CONSENT_REQUIRED', {
      status: 409,
      message: 'Setujui pemberitahuan rekaman suara terlebih dahulu.',
    });
  }

  // 2. Validasi ukuran audio
  if (audioBuffer.length < UPLOAD_MIN_BYTES_RECORDING) {
    throw new ApiError('VALIDATION_ERROR', {
      details: [{ path: 'audio', code: 'audio_too_small', message: 'Berkas audio minimal 1 KB.' }],
    });
  }
  if (audioBuffer.length > UPLOAD_MAX_BYTES_RECORDING) {
    throw new ApiError('PAYLOAD_TOO_LARGE', {
      status: 413,
      message: 'Ukuran rekaman audio melebihi batas 10 MB.',
    });
  }

  // 3. Deteksi magic bytes
  const { mimeType, extension } = detectAudioMime(audioBuffer);
  const sha256 = createHash('sha256').update(audioBuffer).digest('hex');

  // 4. Validasi konteks & kepemilikan
  const isMini = input.kind === 'MINI_TASK_SPEAKING';
  let promptSnapshot = '';

  if (isMini) {
    if (!input.sub_module_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'sub_module_id', code: 'sub_module_required', message: 'Sub-modul wajib untuk Mini-Task.' }] });
    }
    if (input.attempt_id || input.question_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'attempt_id', code: 'unexpected_field', message: 'Attempt tidak boleh diisi untuk Mini-Task.' }] });
    }

    const [subMod] = await db
      .select({ id: subModules.id, status: subModules.status })
      .from(subModules)
      .where(eq(subModules.id, input.sub_module_id))
      .limit(1);

    if (!subMod) throw notFound();

    const [mat] = await db
      .select({ miniTaskJson: learningMaterials.miniTaskJson })
      .from(learningMaterials)
      .where(eq(learningMaterials.subModuleId, input.sub_module_id))
      .limit(1);

    const miniTask = mat?.miniTaskJson as { task_type?: string; prompt?: string } | null;
    if (!miniTask || miniTask.task_type !== 'AI_SHORT_SPEAKING') {
      throw new ApiError('MINI_TASK_TYPE_MISMATCH');
    }
    promptSnapshot = miniTask.prompt ?? 'Mini-Task Speaking';

    const access = await assertSubModuleAccessible(db, userId, input.sub_module_id);
    if (!access.progress.learnCompleted) throw new ApiError('LEARN_NOT_COMPLETED');
  } else {
    if (!input.attempt_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'attempt_id', code: 'attempt_required', message: 'Attempt wajib untuk tugas speaking.' }] });
    }
    if (!input.question_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'question_id', code: 'question_required', message: 'Soal wajib untuk tugas speaking.' }] });
    }
    if (input.sub_module_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'sub_module_id', code: 'unexpected_field', message: 'Sub-modul tidak boleh diisi untuk tugas speaking.' }] });
    }

    const [attempt] = await db
      .select({
        id: attempts.id,
        userId: attempts.userId,
        status: attempts.status,
        assessmentSetId: attempts.assessmentSetId,
        assessmentType: attempts.assessmentType,
        state: attempts.state,
      })
      .from(attempts)
      .where(eq(attempts.id, input.attempt_id))
      .limit(1);

    if (!attempt || attempt.userId !== userId) throw notFound();
    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');

    if (attempt.assessmentType === 'MOCK_TEST') {
      const [wSec] = await db
        .select()
        .from(attemptSections)
        .where(and(eq(attemptSections.attemptId, input.attempt_id), eq(attemptSections.skill, 'WRITING')))
        .limit(1);
      if (!wSec || !wSec.startedAt || wSec.status !== 'IN_PROGRESS') {
        throw new ApiError('SECTION_NOT_ACTIVE');
      }
      if (wSec.deadlineAt && new Date().getTime() > new Date(wSec.deadlineAt).getTime() + 5000) {
        throw new ApiError('SECTION_EXPIRED');
      }
    }

    // SPEC-022: attempt tanpa set (MIX_PRACTICE) membaca soal dari attempts.state.
    const setRow = { questionsJson: await attemptQuestionList(db, attempt) };

    const questions = (setRow?.questionsJson ?? []) as Array<{ question_id?: string; id?: string; question_type: string; part?: number; prompt?: string }>;
    const foundQuestion = questions.find((q) => (q.question_id ?? q.id) === input.question_id) ?? null;

    if (!foundQuestion) throw notFound();
    if (foundQuestion.question_type !== 'SPEAKING_TASK') {
      throw new ApiError('QUESTION_TYPE_MISMATCH');
    }
    // Periksa part cocok
    const expectedPartStr = input.kind.replace('SPEAKING_PART', '');
    const expectedPart = parseInt(expectedPartStr, 10);
    if (foundQuestion.part && foundQuestion.part !== expectedPart) {
      throw new ApiError('QUESTION_TYPE_MISMATCH');
    }
    promptSnapshot = foundQuestion.prompt ?? 'Speaking Task Prompt';

    const [existingSub] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.attemptId, input.attempt_id),
          eq(submissions.questionId, input.question_id),
          sql`${submissions.status} <> 'FAILED'`,
        ),
      )
      .limit(1);

    if (existingSub) throw new ApiError('SUBMISSION_ALREADY_EXISTS');
  }

  const enabled = process.env.AI_ENABLED !== 'false';
  const now = new Date();
  const submissionId = randomUUID();
  const recordingId = randomUUID();
  const jobId = randomUUID();

  // Simpan berkas ke storage privat
  const storage = getStorage();
  const storageKey = await storage.put(audioBuffer, extension, 'private/recordings');

  if (!enabled) {
    const subRecord = {
      id: submissionId,
      userId,
      kind: input.kind,
      status: 'FALLBACK_SELF_ASSESSMENT' as const,
      attemptId: input.attempt_id ?? null,
      subModuleId: input.sub_module_id ?? null,
      questionId: input.question_id ?? null,
      promptSnapshot,
      responseText: null,
      wordCount: null,
      durationSec: input.duration_sec ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const recRecord = {
      id: recordingId,
      submissionId,
      storageBackend: 'FILESYSTEM' as const,
      storageKey,
      mimeType,
      sizeBytes: audioBuffer.length,
      durationMs: null,
      sha256,
      transcript: null,
      transcriptSegments: null,
      sttEngine: null,
      sttConfidence: null,
      retentionExpiresAt: new Date(now.getTime() + 90 * 24 * 3600 * 1000),
      purgedAt: null,
      createdAt: now,
    };

    let insertedSub: typeof submissions.$inferSelect;
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(submissions).values(subRecord).returning();
      insertedSub = row!;
      await tx.insert(speakingRecordings).values(recRecord);
    });

    const recordingDto: RecordingDTO = {
      id: recordingId,
      mime_type: mimeType,
      size_bytes: audioBuffer.length,
      duration_ms: null,
      transcript: null,
      stt_confidence: null,
      available: true,
      retention_expires_at: recRecord.retentionExpiresAt.toISOString(),
      purged_at: null,
    };

    return {
      submission: buildSubmissionDTO(insertedSub!, null, null, recordingDto),
      quota: { limit: 0, used: 0, remaining: 0, resets_at: null },
    };
  }

  // Cek jika ada submission aktif
  const [activeSub] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        inArray(submissions.status, ['RECEIVED', 'TRANSCRIBING', 'GRADING']),
      ),
    )
    .limit(1);

  if (activeSub) {
    await storage.remove(storageKey).catch(() => {});
    throw new ApiError('AI_SUBMISSION_IN_PROGRESS');
  }

  // Cek kuota harian
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [{ count: dailyCount }] = await db
    .select({ count: count() })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        gte(submissions.createdAt, since24h),
        sql`${submissions.status} <> 'FAILED'`,
      ),
    );

  const dailyLimit = 10;
  if (dailyCount >= dailyLimit) {
    await storage.remove(storageKey).catch(() => {});
    const resetTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const resetHours = resetTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    throw new ApiError('AI_DAILY_LIMIT_REACHED', {
      status: 429,
      headers: { 'Retry-After': '3600' },
      message: `Batas penilaian AI hari ini (${dailyLimit}) sudah tercapai. Coba lagi setelah ${resetHours} WIB.`,
    });
  }

  const [{ count: queueCount }] = await db
    .select({ count: count() })
    .from(asyncJobs)
    .where(eq(asyncJobs.status, 'QUEUED'));

  if (queueCount >= 20) {
    await storage.remove(storageKey).catch(() => {});
    throw new ApiError('AI_QUEUE_FULL', {
      status: 503,
      headers: { 'Retry-After': '60' },
      message: 'Antrean penilaian penuh. Coba lagi dalam 1 menit.',
    });
  }

  const queuePosition = queueCount + 1;
  const sub = {
    id: submissionId,
    userId,
    kind: input.kind,
    status: 'RECEIVED' as const,
    attemptId: input.attempt_id ?? null,
    subModuleId: input.sub_module_id ?? null,
    questionId: input.question_id ?? null,
    promptSnapshot,
    responseText: null,
    wordCount: null,
    durationSec: input.duration_sec ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const rec = {
    id: recordingId,
    submissionId,
    storageBackend: 'FILESYSTEM' as const,
    storageKey,
    mimeType,
    sizeBytes: audioBuffer.length,
    durationMs: null,
    sha256,
    transcript: null,
    transcriptSegments: null,
    sttEngine: null,
    sttConfidence: null,
    retentionExpiresAt: new Date(now.getTime() + 90 * 24 * 3600 * 1000),
    purgedAt: null,
    createdAt: now,
  };

  const job = {
    id: jobId,
    kind: 'STT_TRANSCRIBE' as const,
    userId,
    submissionId,
    status: 'QUEUED' as const,
    stage: null,
    progressPercent: 0,
    attempt: 0,
    createdAt: now,
  };

  let insertedSpeakingSub: typeof submissions.$inferSelect;
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(submissions).values(sub).returning();
    insertedSpeakingSub = row!;
    await tx.insert(speakingRecordings).values(rec);
    await tx.insert(asyncJobs).values(job);
  });

  try {
    await enqueue('stt-transcribe', { submission_id: submissionId, async_job_id: jobId });
  } catch (err) {
    logger.warn({ err: safeErr(err), submissionId }, 'job_enqueue_stt_failed');
  }

  if (process.env.STT_DRIVER === 'mock' || process.env.NODE_ENV === 'test') {
    void processSttTranscription(submissionId, jobId).catch((e) =>
      logger.error({ err: safeErr(e), submissionId }, 'inline_stt_worker_error'),
    );
  }

  const jobDto: JobDTO = {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: null,
    progress_percent: 0,
    queue_position: queuePosition,
    error_code: null,
    attempt: 0,
  };

  const recordingDto: RecordingDTO = {
    id: recordingId,
    mime_type: mimeType,
    size_bytes: audioBuffer.length,
    duration_ms: null,
    transcript: null,
    stt_confidence: null,
    available: true,
    retention_expires_at: rec.retentionExpiresAt.toISOString(),
    purged_at: null,
  };

  const quotaDto: SubmissionQuotaDTO = {
    limit: dailyLimit,
    used: dailyCount + 1,
    remaining: Math.max(0, dailyLimit - dailyCount - 1),
    resets_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };

  return {
    submission: buildSubmissionDTO(insertedSpeakingSub!, jobDto, null, recordingDto),
    quota: quotaDto,
  };
}

export async function recordConsent(db: Db, userId: string) {
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) throw notFound();

  const now = new Date();
  if (!userRow.consentRecordingAt) {
    await db
      .update(users)
      .set({ consentRecordingAt: now, updatedAt: now })
      .where(eq(users.id, userId));

    await writeAudit(db, {
      actorUserId: userId,
      action: 'RECORDING_CONSENT_GIVEN',
      entityType: 'user',
      entityId: userId,
    });
  }

  const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return updated!;
}

export async function updateRecordingPreferences(db: Db, userId: string, keepRecordings: boolean) {
  const now = new Date();
  await db
    .update(users)
    .set({ keepRecordings, updatedAt: now })
    .where(eq(users.id, userId));

  const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!updated) throw notFound();
  return updated;
}

export async function getRecordingStream(
  db: Db,
  userId: string,
  submissionId: string,
  rangeHeader: string | null,
) {
  const [sub] = await db
    .select({ id: submissions.id, userId: submissions.userId })
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!sub) throw notFound();
  if (sub.userId !== userId) throw notFound();

  const [rec] = await db
    .select()
    .from(speakingRecordings)
    .where(eq(speakingRecordings.submissionId, submissionId))
    .orderBy(desc(speakingRecordings.createdAt))
    .limit(1);

  if (!rec || !rec.storageKey || rec.purgedAt) throw notFound();

  const storage = getStorage();
  const fileStat = await storage.stat(rec.storageKey);
  if (!fileStat) throw notFound();

  const range = parseByteRange(rangeHeader, fileStat.size);
  if (range.type === 'invalid') {
    throw new ApiError('RANGE_NOT_SATISFIABLE', {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileStat.size}` },
    });
  }

  const baseHeaders: Record<string, string> = {
    'Content-Type': rec.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };

  if (range.type === 'partial') {
    const chunkLength = range.end - range.start + 1;
    const stream = await storage.readStream(rec.storageKey, { start: range.start, end: range.end });
    return {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${range.start}-${range.end}/${fileStat.size}`,
        'Content-Length': String(chunkLength),
      },
      stream,
    };
  }

  const stream = await storage.readStream(rec.storageKey);
  return {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(fileStat.size),
    },
    stream,
  };
}

export async function deleteRecording(db: Db, userId: string, submissionId: string): Promise<void> {
  const [sub] = await db
    .select({ id: submissions.id, userId: submissions.userId, status: submissions.status })
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!sub || sub.userId !== userId) throw notFound();
  if (sub.status === 'RECEIVED' || sub.status === 'TRANSCRIBING') {
    throw new ApiError('RECORDING_IN_USE', { status: 409 });
  }

  const [rec] = await db
    .select()
    .from(speakingRecordings)
    .where(eq(speakingRecordings.submissionId, submissionId))
    .limit(1);

  if (!rec || !rec.storageKey || rec.purgedAt) throw notFound();

  const storage = getStorage();
  await storage.remove(rec.storageKey).catch(() => {});

  const now = new Date();
  await db
    .update(speakingRecordings)
    .set({ storageKey: null, purgedAt: now })
    .where(eq(speakingRecordings.id, rec.id));

  await writeAudit(db, {
    actorUserId: userId,
    action: 'RECORDING_DELETED_BY_USER',
    entityType: 'recording',
    entityId: rec.id,
    metadata: { submission_id: submissionId },
  });
}

export async function getSubmission(
  db: Db,
  userId: string,
  submissionId: string,
): Promise<SubmissionDTO> {
  const [sub] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!sub) throw notFound();
  if (sub.userId !== userId) throw notFound();

  const [jobRow] = await db
    .select()
    .from(asyncJobs)
    .where(eq(asyncJobs.submissionId, submissionId))
    .orderBy(desc(asyncJobs.createdAt))
    .limit(1);

  let jobDto: JobDTO | null = null;
  if (jobRow) {
    let queuePos: number | null = null;
    if (jobRow.status === 'QUEUED') {
      const [{ count: beforeCount }] = await db
        .select({ count: count() })
        .from(asyncJobs)
        .where(and(eq(asyncJobs.status, 'QUEUED'), sql`${asyncJobs.createdAt} < ${jobRow.createdAt}`));
      queuePos = beforeCount + 1;
    }
    jobDto = {
      id: jobRow.id,
      kind: jobRow.kind as JobDTO['kind'],
      status: jobRow.status as JobDTO['status'],
      stage: jobRow.stage as JobDTO['stage'],
      progress_percent: jobRow.progressPercent,
      queue_position: queuePos,
      error_code: jobRow.errorCode,
      attempt: jobRow.attempt,
    };
  }

  const [evalRow] = await db
    .select()
    .from(aiEvaluations)
    .where(eq(aiEvaluations.submissionId, submissionId))
    .orderBy(desc(aiEvaluations.runNumber))
    .limit(1);

  let evalDto: EvaluationDTO | null = null;
  if (evalRow) {
    const feedback = evalRow.feedbackJson as Record<string, unknown> | null;
    const scores = evalRow.criteriaScores as Record<string, number> | null;
    const comments = (feedback?.criteria_comments as Record<string, string> | undefined) ?? {};

    const isSpeaking = sub.kind.startsWith('SPEAKING');
    const criteriaList = isSpeaking
      ? [
          { key: 'fluency', name: 'Fluency & Coherence', band: scores?.fluency ?? 0, comment_id: comments?.fluency ?? null },
          { key: 'lexical', name: 'Lexical Resource', band: scores?.lexical ?? 0, comment_id: comments?.lexical ?? null },
          { key: 'grammar', name: 'Grammatical Range & Accuracy', band: scores?.grammar ?? 0, comment_id: comments?.grammar ?? null },
          { key: 'pronunciation', name: 'Pronunciation', band: scores?.pronunciation ?? 0, comment_id: comments?.pronunciation ?? null },
        ]
      : [
          { key: 'task_response', name: 'Task Response', band: scores?.task_response ?? 0, comment_id: comments?.task_response ?? null },
          { key: 'coherence', name: 'Coherence & Cohesion', band: scores?.coherence ?? 0, comment_id: comments?.coherence ?? null },
          { key: 'lexical', name: 'Lexical Resource', band: scores?.lexical ?? 0, comment_id: comments?.lexical ?? null },
          { key: 'grammar', name: 'Grammatical Range & Accuracy', band: scores?.grammar ?? 0, comment_id: comments?.grammar ?? null },
        ];

    evalDto = {
      id: evalRow.id,
      run_number: evalRow.runNumber,
      method: evalRow.method as EvaluationDTO['method'],
      overall_band: Number(evalRow.overallBand),
      criteria: criteriaList,
      strengths_id: (feedback?.strengths_id as string[]) ?? [],
      improvements_id: (feedback?.improvements_id as string[]) ?? [],
      corrections: (feedback?.corrections as EvaluationDTO['corrections']) ?? [],
      band7_rewrite: (feedback?.band7_rewrite as string) ?? null,
      task_requirement_met: (feedback?.task_requirement_met as boolean) ?? true,
      flags: (feedback?.flags as EvaluationDTO['flags']) ?? {
        injection_suspected: false,
        score_capped: false,
        cap_reason: null,
        high_band_capped: false,
        non_english_suspected: false,
        overall_recomputed: false,
        pronunciation_estimated: false,
        low_audio_quality: false,
      },
      model_name: evalRow.modelName,
      ...(evalRow.method === 'EXTERNAL_AI'
        ? {
            external_tool: (feedback?.external_tool as string | undefined) ?? null,
            external_feedback: (feedback?.external_feedback_text as string | undefined) ?? null,
          }
        : {}),
      disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
      created_at: evalRow.createdAt.toISOString(),
    };
  }

  const [recRow] = await db
    .select()
    .from(speakingRecordings)
    .where(eq(speakingRecordings.submissionId, submissionId))
    .orderBy(desc(speakingRecordings.createdAt))
    .limit(1);

  let recordingDto: RecordingDTO | null = null;
  if (recRow) {
    recordingDto = {
      id: recRow.id,
      mime_type: recRow.mimeType as RecordingDTO['mime_type'],
      size_bytes: recRow.sizeBytes,
      duration_ms: recRow.durationMs,
      transcript: recRow.transcript,
      stt_confidence: recRow.sttConfidence ? parseFloat(recRow.sttConfidence) : null,
      available: recRow.storageKey !== null && recRow.purgedAt === null,
      retention_expires_at: recRow.retentionExpiresAt ? recRow.retentionExpiresAt.toISOString() : null,
      purged_at: recRow.purgedAt ? recRow.purgedAt.toISOString() : null,
    };
  }

  return buildSubmissionDTO(sub, jobDto, evalDto, recordingDto);
}

export async function retrySubmission(
  db: Db,
  userId: string,
  submissionId: string,
): Promise<{ submission: SubmissionDTO; quota: SubmissionQuotaDTO }> {
  const [sub] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!sub || sub.userId !== userId) throw notFound();
  if (sub.status !== 'FAILED') throw new ApiError('SUBMISSION_NOT_RETRYABLE');
  if (process.env.AI_ENABLED === 'false') throw new ApiError('AI_DISABLED');

  // Periksa kode error terakhir untuk Speaking yang tidak bisa di-retry
  const [lastJob] = await db
    .select({ errorCode: asyncJobs.errorCode })
    .from(asyncJobs)
    .where(eq(asyncJobs.submissionId, submissionId))
    .orderBy(desc(asyncJobs.createdAt))
    .limit(1);

  const lastErr = lastJob?.errorCode;
  if (
    lastErr === 'AUDIO_UNREADABLE' ||
    lastErr === 'AUDIO_TOO_LONG' ||
    lastErr === 'AUDIO_TOO_SHORT' ||
    lastErr === 'STT_EMPTY'
  ) {
    throw new ApiError('SUBMISSION_NOT_RETRYABLE');
  }

  const [{ count: runCount }] = await db
    .select({ count: count() })
    .from(asyncJobs)
    .where(eq(asyncJobs.submissionId, submissionId));

  if (runCount >= 3) throw new ApiError('RETRY_LIMIT_REACHED');

  const [activeSub] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        inArray(submissions.status, ['RECEIVED', 'TRANSCRIBING', 'GRADING']),
      ),
    )
    .limit(1);

  if (activeSub) throw new ApiError('AI_SUBMISSION_IN_PROGRESS');

  const [{ count: queueCount }] = await db
    .select({ count: count() })
    .from(asyncJobs)
    .where(eq(asyncJobs.status, 'QUEUED'));

  if (queueCount >= 20) {
    throw new ApiError('AI_QUEUE_FULL', { status: 503, headers: { 'Retry-After': '60' } });
  }

  const isSpeaking = sub.kind.startsWith('SPEAKING');
  const [rec] = isSpeaking
    ? await db
        .select()
        .from(speakingRecordings)
        .where(eq(speakingRecordings.submissionId, submissionId))
        .limit(1)
    : [null];

  let jobKind: 'GRADE_WRITING' | 'GRADE_SPEAKING' | 'STT_TRANSCRIBE' = 'GRADE_WRITING';
  let queueTarget: 'ai-grade-writing' | 'ai-grade-speaking' | 'stt-transcribe' = 'ai-grade-writing';

  if (isSpeaking) {
    if (rec?.transcript) {
      jobKind = 'GRADE_SPEAKING';
      queueTarget = 'ai-grade-speaking';
    } else {
      if (!rec?.storageKey || rec.purgedAt) {
        throw new ApiError('RECORDING_UNAVAILABLE', { status: 409 });
      }
      jobKind = 'STT_TRANSCRIBE';
      queueTarget = 'stt-transcribe';
    }
  }

  const now = new Date();
  const jobId = randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .update(submissions)
      .set({ status: 'RECEIVED', updatedAt: now })
      .where(eq(submissions.id, submissionId));

    await tx.insert(asyncJobs).values({
      id: jobId,
      kind: jobKind,
      userId,
      submissionId,
      status: 'QUEUED',
      stage: null,
      progressPercent: 0,
      attempt: runCount,
      createdAt: now,
    });
  });

  try {
    await enqueue(queueTarget, { submission_id: submissionId, async_job_id: jobId });
  } catch (err) {
    logger.warn({ err: safeErr(err), submissionId }, 'job_enqueue_retry_failed');
  }

  if (process.env.LLM_DRIVER === 'mock' || process.env.NODE_ENV === 'test') {
    if (jobKind === 'GRADE_WRITING') {
      void processWritingEvaluation(submissionId, jobId).catch(() => {});
    } else if (jobKind === 'STT_TRANSCRIBE') {
      void processSttTranscription(submissionId, jobId).catch(() => {});
    } else if (jobKind === 'GRADE_SPEAKING') {
      void processSpeakingEvaluation(submissionId, jobId).catch(() => {});
    }
  }

  return {
    submission: await getSubmission(db, userId, submissionId),
    quota: { limit: 10, used: 1, remaining: 9, resets_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString() },
  };
}

export async function selfAssessSubmission(
  db: Db,
  userId: string,
  submissionId: string,
  criteriaScores: Record<string, number>,
): Promise<{ submission: SubmissionDTO; evaluation: EvaluationDTO }> {
  const [sub] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!sub || sub.userId !== userId) throw notFound();
  if (sub.status !== 'FAILED' && sub.status !== 'FALLBACK_SELF_ASSESSMENT') {
    throw new ApiError('SELF_ASSESSMENT_NOT_ALLOWED');
  }

  const isSpeaking = sub.kind.startsWith('SPEAKING');
  const expectedKeys = isSpeaking ? SPEAKING_KEYS : WRITING_KEYS;

  const keys = Object.keys(criteriaScores);
  if (keys.length !== 4 || !expectedKeys.every((k) => k in criteriaScores)) {
    throw new ApiError('VALIDATION_ERROR', {
      details: [{ path: 'criteria_scores', code: 'invalid_keys', message: `Kriteria harus mencakup ${expectedKeys.join(', ')}.` }],
    });
  }

  for (const k of expectedKeys) {
    const val = criteriaScores[k];
    if (typeof val !== 'number' || val < 0 || val > 9 || !Number.isInteger(val * 2)) {
      throw new ApiError('VALIDATION_ERROR', {
        details: [{ path: `criteria_scores.${k}`, code: 'invalid_band', message: 'Nilai band harus antara 0 dan 9 dengan kelipatan 0.5.' }],
      });
    }
  }

  const mean = isSpeaking
    ? (criteriaScores.fluency! + criteriaScores.lexical! + criteriaScores.grammar! + criteriaScores.pronunciation!) / 4
    : (criteriaScores.task_response! + criteriaScores.coherence! + criteriaScores.lexical! + criteriaScores.grammar!) / 4;

  const overallBand = roundToHalfBand(mean);
  const now = new Date();
  const evalId = randomUUID();

  await db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ runNumber: aiEvaluations.runNumber })
      .from(aiEvaluations)
      .where(eq(aiEvaluations.submissionId, submissionId))
      .orderBy(desc(aiEvaluations.runNumber))
      .limit(1);
    const nextRun = (latest?.runNumber ?? 0) + 1;

    await tx.insert(aiEvaluations).values({
      id: evalId,
      submissionId,
      runNumber: nextRun,
      method: 'SELF_ASSESSMENT',
      rubricId: null,
      modelName: null,
      promptVersion: 'self.v1',
      outputSchemaVersion: '1',
      overallBand: String(overallBand),
      criteriaScores,
      feedbackJson: {
        strengths_id: [],
        improvements_id: [],
        corrections: [],
        band7_rewrite: null,
        task_requirement_met: true,
        flags: {
          injection_suspected: false,
          score_capped: false,
          cap_reason: null,
          high_band_capped: false,
          non_english_suspected: false,
          overall_recomputed: false,
          pronunciation_estimated: isSpeaking,
          low_audio_quality: false,
        },
      },
      rawOutput: null,
      latencyMs: 0,
      disclaimerAcknowledged: true,
      createdAt: now,
    });

    await tx
      .update(submissions)
      .set({ status: 'GRADED', updatedAt: now })
      .where(eq(submissions.id, submissionId));

    if (sub.subModuleId && (sub.kind === 'MINI_TASK_WRITING' || sub.kind === 'MINI_TASK_SPEAKING')) {
      await completeAiMiniTask(tx, userId, sub.subModuleId);
    }
  });

  const updatedSub = await getSubmission(db, userId, submissionId);
  return {
    submission: updatedSub,
    evaluation: updatedSub.evaluation!,
  };
}

/**
 * ADR-004 / SPEC-013 addendum: mencatat skor Speaking yang dinilai AI pihak ketiga (Claude/GPT/Gemini) dan
 * dimasukkan manual oleh pengguna. Overall SELALU dihitung server dari 4 kriteria. Tanpa berkas audio dan tanpa
 * kuota AI. Mengirim ulang untuk konteks yang sama menambah `run_number` (nilai terbaru dipakai).
 */
export async function recordExternalSpeakingEvaluation(
  db: Db,
  userId: string,
  input: ExternalSpeakingEvaluationRequest,
): Promise<{ submission: SubmissionDTO; evaluation: EvaluationDTO }> {
  const isMini = input.kind === 'MINI_TASK_SPEAKING';
  let promptSnapshot = '';
  let existingId: string | null = null;

  if (isMini) {
    if (!input.sub_module_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'sub_module_id', code: 'sub_module_required', message: 'Sub-modul wajib untuk Mini-Task.' }] });
    }
    if (input.attempt_id || input.question_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'attempt_id', code: 'unexpected_field', message: 'Attempt tidak boleh diisi untuk Mini-Task.' }] });
    }
    const [subMod] = await db.select({ id: subModules.id }).from(subModules).where(eq(subModules.id, input.sub_module_id)).limit(1);
    if (!subMod) throw notFound();

    const [mat] = await db
      .select({ miniTaskJson: learningMaterials.miniTaskJson })
      .from(learningMaterials)
      .where(eq(learningMaterials.subModuleId, input.sub_module_id))
      .limit(1);
    const miniTask = mat?.miniTaskJson as { task_type?: string; prompt?: string } | null;
    if (!miniTask || miniTask.task_type !== 'AI_SHORT_SPEAKING') throw new ApiError('MINI_TASK_TYPE_MISMATCH');
    promptSnapshot = miniTask.prompt ?? 'Mini-Task Speaking';

    const access = await assertSubModuleAccessible(db, userId, input.sub_module_id);
    if (!access.progress.learnCompleted) throw new ApiError('LEARN_NOT_COMPLETED');

    const [prev] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.userId, userId), eq(submissions.subModuleId, input.sub_module_id), eq(submissions.kind, 'MINI_TASK_SPEAKING'), sql`${submissions.status} <> 'FAILED'`))
      .orderBy(desc(submissions.createdAt))
      .limit(1);
    existingId = prev?.id ?? null;
  } else {
    if (!input.attempt_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'attempt_id', code: 'attempt_required', message: 'Attempt wajib untuk tugas speaking.' }] });
    }
    if (!input.question_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'question_id', code: 'question_required', message: 'Soal wajib untuk tugas speaking.' }] });
    }
    if (input.sub_module_id) {
      throw new ApiError('VALIDATION_ERROR', { details: [{ path: 'sub_module_id', code: 'unexpected_field', message: 'Sub-modul tidak boleh diisi untuk tugas speaking.' }] });
    }

    const [attempt] = await db
      .select({
        userId: attempts.userId,
        status: attempts.status,
        assessmentSetId: attempts.assessmentSetId,
        assessmentType: attempts.assessmentType,
        state: attempts.state,
      })
      .from(attempts)
      .where(eq(attempts.id, input.attempt_id))
      .limit(1);
    if (!attempt || attempt.userId !== userId) throw notFound();

    if (attempt.assessmentType === 'MOCK_TEST') {
      if (attempt.status === 'ABANDONED') throw new ApiError('ATTEMPT_NOT_ACTIVE');
      const [sec] = await db
        .select()
        .from(attemptSections)
        .where(and(eq(attemptSections.attemptId, input.attempt_id), eq(attemptSections.skill, 'SPEAKING')))
        .limit(1);
      if (!sec || sec.status === 'GRADED') {
        throw new ApiError('ATTEMPT_NOT_ACTIVE');
      }
    } else {
      // SPEC-022: pada attempt campuran, pengiriman hanya diterima selama attempt IN_PROGRESS.
      if (attempt.assessmentSetId === null && attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    }

    // SPEC-022: attempt tanpa set (MIX_PRACTICE) membaca soal dari attempts.state.
    const setRow = { questionsJson: await attemptQuestionList(db, attempt) };
    const questions = (setRow?.questionsJson ?? []) as Array<{ question_id?: string; id?: string; question_type: string; part?: number; prompt?: string }>;
    const found = questions.find((q) => (q.question_id ?? q.id) === input.question_id) ?? null;
    if (!found) throw notFound();
    if (found.question_type !== 'SPEAKING_TASK') throw new ApiError('QUESTION_TYPE_MISMATCH');
    const expectedPart = parseInt(input.kind.replace('SPEAKING_PART', ''), 10);
    if (found.part && found.part !== expectedPart) throw new ApiError('QUESTION_TYPE_MISMATCH');
    promptSnapshot = found.prompt ?? 'Speaking Task Prompt';

    const [prev] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.userId, userId), eq(submissions.attemptId, input.attempt_id), eq(submissions.questionId, input.question_id), sql`${submissions.status} <> 'FAILED'`))
      .orderBy(desc(submissions.createdAt))
      .limit(1);
    existingId = prev?.id ?? null;
  }

  const scores = input.criteria_scores;
  const overallBand = roundToHalfBand((scores.fluency + scores.lexical + scores.grammar + scores.pronunciation) / 4);
  const now = new Date();
  const submissionId = existingId ?? randomUUID();
  const evalId = randomUUID();

  await db.transaction(async (tx) => {
    if (!existingId) {
      await tx.insert(submissions).values({
        id: submissionId,
        userId,
        kind: input.kind,
        status: 'GRADED',
        attemptId: input.attempt_id ?? null,
        subModuleId: input.sub_module_id ?? null,
        questionId: input.question_id ?? null,
        promptSnapshot,
        responseText: null,
        wordCount: null,
        durationSec: null,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await tx.update(submissions).set({ status: 'GRADED', updatedAt: now }).where(eq(submissions.id, submissionId));
    }

    const [latest] = await tx
      .select({ runNumber: aiEvaluations.runNumber })
      .from(aiEvaluations)
      .where(eq(aiEvaluations.submissionId, submissionId))
      .orderBy(desc(aiEvaluations.runNumber))
      .limit(1);

    await tx.insert(aiEvaluations).values({
      id: evalId,
      submissionId,
      runNumber: (latest?.runNumber ?? 0) + 1,
      method: 'EXTERNAL_AI',
      rubricId: null,
      modelName: `external:${input.tool.toLowerCase()}`,
      promptVersion: 'ext-speaking.v1',
      outputSchemaVersion: '1',
      overallBand: String(overallBand),
      criteriaScores: scores,
      feedbackJson: {
        strengths_id: [],
        improvements_id: [],
        corrections: [],
        band7_rewrite: null,
        task_requirement_met: true,
        external_tool: input.tool,
        external_feedback_text: input.feedback_text ?? null,
        flags: {
          injection_suspected: false,
          score_capped: false,
          cap_reason: null,
          high_band_capped: false,
          non_english_suspected: false,
          overall_recomputed: true,
          pronunciation_estimated: false,
          low_audio_quality: false,
        },
      },
      rawOutput: null,
      latencyMs: 0,
      disclaimerAcknowledged: true,
      createdAt: now,
    });

    if (isMini && input.sub_module_id) {
      await completeAiMiniTask(tx, userId, input.sub_module_id);
    }

    for (const hook of evaluationGradedHooks) {
      await hook({ tx, userId, submissionId, evaluationId: evalId, kind: 'SPEAKING' });
    }
  });

  const updated = await getSubmission(db, userId, submissionId);
  return { submission: updated, evaluation: updated.evaluation! };
}

export async function getAiStatus(db: Db, userId: string) {
  const enabled = process.env.AI_ENABLED !== 'false';
  let available = false;
  if (enabled) {
    try {
      available = await getLlmClient().ping();
    } catch {
      available = false;
    }
  }

  const [{ count: waiting }] = await db
    .select({ count: count() })
    .from(asyncJobs)
    .where(eq(asyncJobs.status, 'QUEUED'));

  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const [{ count: used }] = await db
    .select({ count: count() })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), gte(submissions.createdAt, since24h), sql`${submissions.status} <> 'FAILED'`));

  const dailyLimit = enabled ? 10 : 0;
  const remaining = Math.max(0, dailyLimit - used);

  return {
    enabled,
    available,
    queue: {
      waiting,
      estimated_wait_sec: waiting > 0 ? waiting * 45 : null,
    },
    quota: {
      limit: dailyLimit,
      used,
      remaining,
      resets_at: enabled ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null,
    },
    recording_retention_days: 90,
  };
}

export async function listSubmissions(
  db: Db,
  userId: string,
  query: {
    kind?: SubmissionKindName;
    page?: number;
    page_size?: number;
  },
) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, query.page_size ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(submissions.userId, userId)];
  if (query.kind) {
    conditions.push(eq(submissions.kind, query.kind));
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(submissions)
    .where(and(...conditions));

  const rows = await db
    .select({
      id: submissions.id,
      kind: submissions.kind,
      status: submissions.status,
      wordCount: submissions.wordCount,
      promptSnapshot: submissions.promptSnapshot,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .where(and(...conditions))
    .orderBy(desc(submissions.createdAt))
    .limit(pageSize)
    .offset(offset);

  const subIds = rows.map((r) => r.id);
  const evals = subIds.length > 0
    ? await db
        .select({
          submissionId: aiEvaluations.submissionId,
          overallBand: aiEvaluations.overallBand,
          method: aiEvaluations.method,
          runNumber: aiEvaluations.runNumber,
        })
        .from(aiEvaluations)
        .where(inArray(aiEvaluations.submissionId, subIds))
        .orderBy(desc(aiEvaluations.runNumber))
    : [];

  const evalMap = new Map<string, { overallBand: number; method: string }>();
  for (const ev of evals) {
    if (!evalMap.has(ev.submissionId)) {
      evalMap.set(ev.submissionId, {
        overallBand: Number(ev.overallBand),
        method: ev.method,
      });
    }
  }

  const data = rows.map((r) => {
    const ev = evalMap.get(r.id);
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      overall_band: ev ? ev.overallBand : null,
      method: ev ? ev.method : null,
      word_count: r.wordCount,
      prompt_excerpt: r.promptSnapshot.length > 120 ? `${r.promptSnapshot.slice(0, 117)}...` : r.promptSnapshot,
      created_at: r.createdAt.toISOString(),
    };
  });

  return {
    data,
    meta: {
      page,
      page_size: pageSize,
      total,
    },
  };
}

function buildSubmissionDTO(
  sub: typeof submissions.$inferSelect,
  job: JobDTO | null,
  evaluation: EvaluationDTO | null,
  recording: RecordingDTO | null,
): SubmissionDTO {
  return {
    id: sub.id,
    kind: sub.kind as SubmissionDTO['kind'],
    status: sub.status as SubmissionDTO['status'],
    attempt_id: sub.attemptId,
    sub_module_id: sub.subModuleId,
    question_id: sub.questionId,
    prompt_snapshot: sub.promptSnapshot,
    response_text: sub.responseText,
    word_count: sub.wordCount,
    duration_sec: sub.durationSec,
    created_at: sub.createdAt.toISOString(),
    updated_at: sub.updatedAt.toISOString(),
    job,
    evaluation,
    recording,
  };
}
