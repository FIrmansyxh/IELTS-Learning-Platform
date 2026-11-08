import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildWritingSystemPrompt } from './writing-prompts';
import { desc, eq } from 'drizzle-orm';
import {
  aiEvaluations,
  asyncJobs,
  gradingRubrics,
  submissions,
} from '@/db/schema';
import { getDb } from '../db';
import { logger } from '../logger';
import { writeAudit } from '../audit';
import { safeErr } from '../safe-error';
import { getLlmClient, type LlmClient } from './llm';
import {
  countWords,
  isInjectionSuspected,
  isNonEnglishSuspected,
  neutralizeUserInput,
  postProcessScores,
} from './scoring';
import {
  WritingEvaluationOutputSchema,
  type WritingEvaluationOutput,
} from '@/contracts/ai';
import { completeAiMiniTask } from '../player/service';
import { evaluationGradedHooks } from './hooks';

/** JSON Schema keluaran evaluasi; dipakai driver llama.cpp/Ollama untuk keluaran terstruktur (grammar). */
export function buildWritingOutputJsonSchema(): Record<string, unknown> {
  type JsProp = { description?: string; properties?: Record<string, JsProp>; items?: JsProp };
  const schema = z.toJSONSchema(WritingEvaluationOutputSchema) as { properties?: Record<string, JsProp> };
  const prose = 'Natural Indonesian sentence(s) with normal spaces and punctuation. Never snake_case, never keywords joined by underscores.';
  const props = schema.properties ?? {};
  for (const c of Object.values(props.criteria?.properties ?? {})) {
    if (c?.properties?.comment_id) c.properties.comment_id.description = `Specific feedback for this criterion. ${prose}`;
  }
  if (props.strengths_id?.items) props.strengths_id.items.description = `One strength. ${prose}`;
  if (props.improvements_id?.items) props.improvements_id.items.description = `One concrete improvement action. ${prose}`;
  const corr = props.corrections?.items?.properties;
  if (corr?.reason_id) corr.reason_id.description = `Why the correction is needed. ${prose}`;
  if (corr?.original) corr.original.description = 'Exact quote copied from the student response (English).';
  if (corr?.improved) corr.improved.description = 'Corrected version of the quote (English).';
  if (props.band7_rewrite) props.band7_rewrite.description = 'Improved version at about band 7 level (English).';
  return schema;
}
const WRITING_OUTPUT_JSON_SCHEMA = buildWritingOutputJsonSchema();

/**
 * Model kecil kadang mengeluarkan band non-kelipatan 0.5 (mis. 6.8). Dibulatkan ke 0.5 terdekat
 * sebelum validasi Zod agar evaluasi tidak gagal hanya karena pembulatan.
 */
export function snapBandsToHalf(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const out = raw as { overall_band?: unknown; criteria?: Record<string, { band?: unknown } | undefined> };
  const snap = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(9, Math.max(0, Math.round(v * 2) / 2)) : v);
  if ('overall_band' in out) out.overall_band = snap(out.overall_band);
  if (out.criteria && typeof out.criteria === 'object') {
    for (const c of Object.values(out.criteria)) {
      if (c && typeof c === 'object' && 'band' in c) c.band = snap(c.band);
    }
  }
  return out;
}

export async function processWritingEvaluation(
  submissionId: string,
  jobId?: string,
  client?: LlmClient,
): Promise<void> {
  const db = getDb();
  const startedAt = new Date();

  // 1. Set async_jobs.status='RUNNING', stage='GRADING', progress_percent=10
  const jobRunning = {
    status: 'RUNNING' as const,
    stage: 'GRADING' as const,
    progressPercent: 10,
    startedAt,
    updatedAt: startedAt,
  };

  if (jobId) {
    await db.update(asyncJobs).set(jobRunning).where(eq(asyncJobs.id, jobId));
  } else {
    await db.update(asyncJobs).set(jobRunning).where(eq(asyncJobs.submissionId, submissionId));
  }

  await db
    .update(submissions)
    .set({ status: 'GRADING', updatedAt: startedAt })
    .where(eq(submissions.id, submissionId));

  try {
    // Muat data submission
    const [sub] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!sub || !sub.responseText) {
      throw new Error(`Submission ${submissionId} not found or missing response text`);
    }

    // 2. Muat rubrik grading_rubrics aktif
    const [rubric] = await db
      .select()
      .from(gradingRubrics)
      .where(eq(gradingRubrics.skill, 'WRITING'))
      .orderBy(desc(gradingRubrics.isActive))
      .limit(1);

    // 3. Hitung pra-pemeriksaan deterministik
    const wordCount = countWords(sub.responseText);
    const isInjection = isInjectionSuspected(sub.responseText);
    const isNonEnglish = isNonEnglishSuspected(sub.responseText);

    // 4. Netralisasi teks dan susun pesan
    const neutralizedText = neutralizeUserInput(sub.responseText);
    const boundaryId = randomBytes(4).toString('hex');
    const userPrompt = `Task Prompt:\n${sub.promptSnapshot}\n\nStudent Response:\n<student_response id="${boundaryId}">\n${neutralizedText}\n</student_response>\n\nREMINDER: every comment_id, strengths_id, improvements_id and reason_id value MUST be written in Indonesian (Bahasa Indonesia). Only "original", "improved" and "band7_rewrite" stay in English. All band values must be multiples of 0.5.`;

    // 5. Panggil LLM
    const llm = client ?? getLlmClient();

    if (jobId) {
      await db.update(asyncJobs).set({ progressPercent: 60 }).where(eq(asyncJobs.id, jobId));
    }

    let parsedOutput: WritingEvaluationOutput | null = null;
    let rawOutput = '';
    let latencyMs = 0;

    const systemPrompt = buildWritingSystemPrompt(sub.kind);
    const firstGen = await llm.generate({
      systemPrompt,
      userPrompt,
      schema: WRITING_OUTPUT_JSON_SCHEMA,
    });
    rawOutput = firstGen.content;
    latencyMs = firstGen.latencyMs;

    try {
      const parsedJson = snapBandsToHalf(JSON.parse(rawOutput));
      parsedOutput = WritingEvaluationOutputSchema.parse(parsedJson);
    } catch (parseErr) {
      // 6. Satu percobaan perbaikan jika gagal
      logger.warn({ err: safeErr(parseErr), submissionId }, 'llm_output_schema_failed_trying_repair');
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      const repairPrompt = `${userPrompt}\n\nKeluaran sebelumnya tidak sesuai skema JSON: ${errMsg}. Mohon kirim ulang HANYA JSON yang valid sesuai skema.`;
      const repairGen = await llm.generate({
        systemPrompt,
        userPrompt: repairPrompt,
        schema: WRITING_OUTPUT_JSON_SCHEMA,
      });
      rawOutput = repairGen.content;
      latencyMs += repairGen.latencyMs;

      try {
        const repairJson = snapBandsToHalf(JSON.parse(rawOutput));
        parsedOutput = WritingEvaluationOutputSchema.parse(repairJson);
      } catch (finalParseErr) {
        logger.error({ err: safeErr(finalParseErr), submissionId }, 'llm_repair_failed_terminating');
        const jobFail = {
          status: 'FAILED' as const,
          errorCode: 'LLM_INVALID_OUTPUT',
          finishedAt: new Date(),
          updatedAt: new Date(),
        };
        if (jobId) await db.update(asyncJobs).set(jobFail).where(eq(asyncJobs.id, jobId));
        else await db.update(asyncJobs).set(jobFail).where(eq(asyncJobs.submissionId, submissionId));

        await db
          .update(submissions)
          .set({ status: 'FAILED', updatedAt: new Date() })
          .where(eq(submissions.id, submissionId));
        return;
      }
    }

    // 7. Pasca-proses skor
    const minWords = sub.kind === 'MINI_TASK_WRITING' ? 5 : sub.kind === 'WRITING_TASK1' ? 150 : 250;
    const post = postProcessScores({
      criteria: {
        task_response: parsedOutput.criteria.task_response.band,
        coherence: parsedOutput.criteria.coherence.band,
        lexical: parsedOutput.criteria.lexical.band,
        grammar: parsedOutput.criteria.grammar.band,
      },
      modelOverallBand: parsedOutput.overall_band,
      wordCount,
      minWords,
      isInjection,
      isNonEnglish,
    });

    // Simpan dalam transaksi
    await db.transaction(async (tx) => {
      // Dapatkan run_number terbaru
      const [latestEval] = await tx
        .select({ runNumber: aiEvaluations.runNumber })
        .from(aiEvaluations)
        .where(eq(aiEvaluations.submissionId, submissionId))
        .orderBy(desc(aiEvaluations.runNumber))
        .limit(1);

      const nextRun = (latestEval?.runNumber ?? 0) + 1;
      const evaluationId = randomUUID();

      await tx.insert(aiEvaluations).values({
        id: evaluationId,
        submissionId,
        runNumber: nextRun,
        method: 'AI_LOCAL',
        rubricId: rubric?.id ?? null,
        modelName: llm.name,
        promptVersion: 'writing.v1',
        outputSchemaVersion: '1',
        overallBand: String(post.overall_band),
        criteriaScores: {
          task_response: parsedOutput.criteria.task_response.band,
          coherence: parsedOutput.criteria.coherence.band,
          lexical: parsedOutput.criteria.lexical.band,
          grammar: parsedOutput.criteria.grammar.band,
        },
        feedbackJson: {
          strengths_id: parsedOutput.strengths_id,
          improvements_id: parsedOutput.improvements_id,
          corrections: parsedOutput.corrections,
          band7_rewrite: parsedOutput.band7_rewrite,
          task_requirement_met: parsedOutput.task_requirement_met,
          flags: post.flags,
          criteria_comments: {
            task_response: parsedOutput.criteria.task_response.comment_id,
            coherence: parsedOutput.criteria.coherence.comment_id,
            lexical: parsedOutput.criteria.lexical.comment_id,
            grammar: parsedOutput.criteria.grammar.comment_id,
          },
        },
        rawOutput,
        latencyMs,
        disclaimerAcknowledged: true,
        createdAt: new Date(),
      });

      // Update submission status
      await tx
        .update(submissions)
        .set({
          status: 'GRADED',
          wordCount,
          updatedAt: new Date(),
        })
        .where(eq(submissions.id, submissionId));

      // Update async_jobs
      const jobSuccess = {
        status: 'SUCCEEDED' as const,
        stage: 'SAVING' as const,
        progressPercent: 100,
        finishedAt: new Date(),
      };
      if (jobId) await tx.update(asyncJobs).set(jobSuccess).where(eq(asyncJobs.id, jobId));
      else await tx.update(asyncJobs).set(jobSuccess).where(eq(asyncJobs.submissionId, submissionId));

      // Jika Mini-Task, tandai selesai pada userSubModuleProgress lewat service
      if (sub.subModuleId && sub.kind === 'MINI_TASK_WRITING') {
        await completeAiMiniTask(tx, sub.userId, sub.subModuleId);
      }

      // Catat audit jika ada kecurigaan injeksi prompt
      if (isInjection) {
        await writeAudit(tx, {
          actorUserId: sub.userId,
          action: 'AI_INJECTION_SUSPECTED',
          entityType: 'submission',
          entityId: submissionId,
          metadata: { word_count: wordCount },
        });
      }

      // Jalankan hook penilaian selesai (mis. hitung radar & prediksi SPEC-017)
      for (const hook of evaluationGradedHooks) {
        await hook({
          tx,
          userId: sub.userId,
          submissionId,
          evaluationId,
          kind: 'WRITING',
        });
      }
    });

    logger.info(
      { submissionId, overallBand: post.overall_band, latencyMs },
      'ai_writing_graded_successfully',
    );
  } catch (err) {
    logger.error({ err: safeErr(err), submissionId }, 'process_writing_evaluation_error');

    let errCode = 'LLM_ERROR';
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (msg.includes('timeout') || msg.includes('abort')) {
      errCode = 'LLM_TIMEOUT';
    } else if (msg.includes('econnrefused') || msg.includes('unreachable') || msg.includes('fetch failed')) {
      errCode = 'LLM_UNREACHABLE';
    }

    const jobFail = {
      status: 'FAILED' as const,
      errorCode: errCode,
      finishedAt: new Date(),
    };
    if (jobId) await db.update(asyncJobs).set(jobFail).where(eq(asyncJobs.id, jobId));
    else await db.update(asyncJobs).set(jobFail).where(eq(asyncJobs.submissionId, submissionId));

    await db
      .update(submissions)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));
  }
}
