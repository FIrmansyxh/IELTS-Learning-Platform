import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../db';
import {
  aiEvaluations,
  assessmentSets,
  attemptAnswers,
  attempts,
  submissions,
  userBandPredictions,
  users,
  userSkillScores,
} from '@/db/schema';
import {
  averageBand,
  convertRawToBand,
  overallBand,
  scaleToForty,
} from '../band/convert';
import { getActiveTable } from '../band/service';
import { bandSkillFor } from '../band/skills';
import { logger } from '../logger';
import { safeErr } from '../safe-error';
import type { AttemptCompletedContext } from '../attempts/hooks';
import type { EvaluationGradedContext } from '../ai/hooks';
import type {
  BandPredictionDTO,
  BandPredictionsQuery,
  BandPredictionsResponse,
  ExamHistoryItemDTO,
  ExamHistoryQuery,
  ExamHistoryResponse,
  PredictionComponentsDTO,
  RadarDataDTO,
  SkillCategoryName,
  SkillRadarItemDTO,
} from '@/contracts/skills';

const SKILL_ORDER: readonly SkillCategoryName[] = [
  'LISTENING',
  'READING',
  'WRITING',
  'SPEAKING',
  'GRAMMAR',
  'VOCAB',
];

const WRITING_KINDS = ['WRITING_TASK1', 'WRITING_TASK2', 'MINI_TASK_WRITING'] as const;
const SPEAKING_KINDS = ['SPEAKING_PART1', 'SPEAKING_PART2', 'SPEAKING_PART3', 'MINI_TASK_SPEAKING'] as const;

function roundHalfUp(val: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/** Hitung ulang satu skill objektif (LISTENING, READING, GRAMMAR, VOCAB) berdasarkan R1. */
export async function recalculateObjectiveSkill(
  tx: Tx,
  userId: string,
  skill: 'LISTENING' | 'READING' | 'GRAMMAR' | 'VOCAB',
  now = new Date(),
): Promise<void> {
  const rows = await tx
    .select({
      isCorrect: attemptAnswers.isCorrect,
      answeredAt: attemptAnswers.answeredAt,
    })
    .from(attemptAnswers)
    .innerJoin(attempts, eq(attemptAnswers.attemptId, attempts.id))
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attemptAnswers.skill, skill),
        isNotNull(attemptAnswers.isCorrect),
        inArray(attempts.status, ['GRADED', 'EXPIRED']),
      ),
    )
    .orderBy(desc(attemptAnswers.answeredAt), desc(attemptAnswers.id))
    .limit(50);

  const sampleSize = rows.length;

  if (sampleSize === 0) {
    await tx
      .delete(userSkillScores)
      .where(and(eq(userSkillScores.userId, userId), eq(userSkillScores.skill, skill)));
    return;
  }

  const correctCount = rows.filter((r) => r.isCorrect === true).length;
  const scorePercent = roundHalfUp((correctCount * 100) / sampleSize, 2);

  let estimatedBand: number | null = null;
  if (sampleSize >= 5) {
    try {
      const raw40 = scaleToForty(correctCount, sampleSize);
      const bandSkill = bandSkillFor(skill);
      const table = await getActiveTable(tx, bandSkill);
      estimatedBand = convertRawToBand(table.rows, raw40);
    } catch (err) {
      logger.error({ err: safeErr(err), skill }, 'band_table_inactive');
      estimatedBand = null;
    }
  }

  await tx
    .insert(userSkillScores)
    .values({
      userId,
      skill,
      scorePercent: String(scorePercent),
      estimatedBand: estimatedBand !== null ? String(estimatedBand) : null,
      sampleSize,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userSkillScores.userId, userSkillScores.skill],
      set: {
        scorePercent: String(scorePercent),
        estimatedBand: estimatedBand !== null ? String(estimatedBand) : null,
        sampleSize,
        updatedAt: now,
      },
    });
}

/** Hitung ulang satu skill AI (WRITING atau SPEAKING) berdasarkan R2. */
export async function recalculateAISkill(
  tx: Tx,
  userId: string,
  skill: 'WRITING' | 'SPEAKING',
  now = new Date(),
): Promise<void> {
  const kinds = skill === 'WRITING' ? WRITING_KINDS : SPEAKING_KINDS;

  const candidateSubmissions = await tx
    .select({
      id: submissions.id,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), inArray(submissions.kind, kinds)))
    .orderBy(desc(submissions.createdAt))
    .limit(10);

  const eligibleBands: number[] = [];

  for (const sub of candidateSubmissions) {
    const [evalRow] = await tx
      .select({
        method: aiEvaluations.method,
        overallBand: aiEvaluations.overallBand,
        feedbackJson: aiEvaluations.feedbackJson,
      })
      .from(aiEvaluations)
      .where(eq(aiEvaluations.submissionId, sub.id))
      .orderBy(desc(aiEvaluations.runNumber))
      .limit(1);

    if (!evalRow) continue;
    // ADR-004: skor AI pihak ketiga (EXTERNAL_AI, diinput manual) dihitung; nilai sendiri tetap tidak.
    if (evalRow.method !== 'AI_LOCAL' && evalRow.method !== 'EXTERNAL_AI') continue;
    if (evalRow.overallBand === null || evalRow.overallBand === undefined) continue;

    const feedback = (evalRow.feedbackJson ?? {}) as Record<string, unknown>;
    const flags = (feedback.flags ?? {}) as Record<string, unknown>;
    if (flags.injection_suspected === true) continue;

    eligibleBands.push(Number(evalRow.overallBand));
    if (eligibleBands.length >= 3) break;
  }

  const sampleSize = eligibleBands.length;

  if (sampleSize === 0) {
    await tx
      .delete(userSkillScores)
      .where(and(eq(userSkillScores.userId, userId), eq(userSkillScores.skill, skill)));
    return;
  }

  const estimatedBand = averageBand(eligibleBands);
  const scorePercent =
    estimatedBand !== null ? roundHalfUp((estimatedBand / 9) * 100, 2) : 0;

  await tx
    .insert(userSkillScores)
    .values({
      userId,
      skill,
      scorePercent: String(scorePercent),
      estimatedBand: estimatedBand !== null ? String(estimatedBand) : null,
      sampleSize,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userSkillScores.userId, userSkillScores.skill],
      set: {
        scorePercent: String(scorePercent),
        estimatedBand: estimatedBand !== null ? String(estimatedBand) : null,
        sampleSize,
        updatedAt: now,
      },
    });
}

/** Hitung prediksi band dari komponen L, R, W, S (R4). */
export function computePredictionFromComponents(
  components: PredictionComponentsDTO,
): BandPredictionDTO {
  const { LISTENING: L, READING: R, WRITING: W, SPEAKING: S } = components;
  const complete = L !== null && R !== null && W !== null && S !== null;

  let overall_band: number | null = null;
  if (complete) {
    overall_band = overallBand({ listening: L!, reading: R!, writing: W!, speaking: S! });
  }

  const nonNulls = [L, R, W, S].filter((v): v is number => v !== null);
  const indicative_band = nonNulls.length > 0 ? averageBand(nonNulls) : null;
  const x = overall_band ?? indicative_band;
  const range_low = x !== null ? Math.max(0, x - 0.5) : null;
  const range_high = x !== null ? Math.min(9, x + 0.5) : null;

  let basis_note = 'Belum ada data latihan untuk prediksi band.';
  if (complete) {
    basis_note = 'Berdasarkan Listening, Reading, Writing, dan Speaking.';
  } else if (nonNulls.length > 0) {
    const names: string[] = [];
    if (L !== null) names.push('Listening');
    if (R !== null) names.push('Reading');
    if (W !== null) names.push('Writing');
    if (S !== null) names.push('Speaking');

    let joined = names[0]!;
    if (names.length === 2) {
      joined = `${names[0]} dan ${names[1]}`;
    } else if (names.length === 3) {
      joined = `${names[0]}, ${names[1]}, dan ${names[2]}`;
    }
    basis_note = `Indikatif: berdasarkan ${joined}. Selesaikan Writing dan Speaking untuk prediksi lengkap.`;
  }

  return {
    overall_band,
    indicative_band,
    range_low,
    range_high,
    complete,
    components,
    basis_note,
  };
}

/** Ambil komponen band L, R, W, S saat ini dari database. */
async function getCurrentComponents(tx: DbOrTx, userId: string): Promise<PredictionComponentsDTO> {
  const scores = await tx
    .select({
      skill: userSkillScores.skill,
      estimatedBand: userSkillScores.estimatedBand,
    })
    .from(userSkillScores)
    .where(eq(userSkillScores.userId, userId));

  const map = new Map<string, number | null>();
  for (const s of scores) {
    map.set(s.skill, s.estimatedBand !== null ? Number(s.estimatedBand) : null);
  }

  return {
    LISTENING: map.get('LISTENING') ?? null,
    READING: map.get('READING') ?? null,
    WRITING: map.get('WRITING') ?? null,
    SPEAKING: map.get('SPEAKING') ?? null,
  };
}

/** Tulis riwayat prediksi bila memenuhi syarat (R5). */
export async function recordPredictionHistory(
  tx: Tx,
  userId: string,
  options: {
    trigger: 'BOSS' | 'RECALC';
    attemptId?: string | null;
    now?: Date;
  },
): Promise<void> {
  const now = options.now ?? new Date();
  const components = await getCurrentComponents(tx, userId);
  const pred = computePredictionFromComponents(components);
  const x = pred.overall_band ?? pred.indicative_band;

  if (x === null) return;

  if (options.trigger === 'BOSS') {
    await tx.insert(userBandPredictions).values({
      userId,
      overallBand: String(x),
      components,
      trigger: 'BOSS',
      attemptId: options.attemptId ?? null,
      createdAt: now,
    });
  } else {
    // RECALC: hanya tulis bila x berbeda dari baris terbaru user (atau belum ada)
    const [latest] = await tx
      .select({ overallBand: userBandPredictions.overallBand })
      .from(userBandPredictions)
      .where(eq(userBandPredictions.userId, userId))
      .orderBy(desc(userBandPredictions.createdAt))
      .limit(1);

    if (!latest || Number(latest.overallBand) !== x) {
      await tx.insert(userBandPredictions).values({
        userId,
        overallBand: String(x),
        components,
        trigger: 'RECALC',
        attemptId: null,
        createdAt: now,
      });
    }
  }
}

/** Ambil data radar dan prediksi lengkap (GET /api/v1/me/skills/radar). */
export async function getRadarData(db: DbOrTx, userId: string): Promise<RadarDataDTO> {
  const [userRow] = await db
    .select({ targetBand: users.targetBand })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const scores = await db
    .select()
    .from(userSkillScores)
    .where(eq(userSkillScores.userId, userId));

  const scoreMap = new Map<string, typeof scores[number]>();
  for (const s of scores) {
    scoreMap.set(s.skill, s);
  }

  const skills: SkillRadarItemDTO[] = SKILL_ORDER.map((sk) => {
    const is_proxy = sk === 'GRAMMAR' || sk === 'VOCAB';
    const row = scoreMap.get(sk);
    if (!row) {
      return {
        skill: sk,
        score_percent: null,
        estimated_band: null,
        sample_size: 0,
        is_proxy,
        updated_at: null,
      };
    }
    return {
      skill: sk,
      score_percent: Number(row.scorePercent),
      estimated_band: row.estimatedBand !== null ? Number(row.estimatedBand) : null,
      sample_size: row.sampleSize,
      is_proxy,
      updated_at: row.updatedAt.toISOString(),
    };
  });

  const components: PredictionComponentsDTO = {
    LISTENING: skills.find((s) => s.skill === 'LISTENING')?.estimated_band ?? null,
    READING: skills.find((s) => s.skill === 'READING')?.estimated_band ?? null,
    WRITING: skills.find((s) => s.skill === 'WRITING')?.estimated_band ?? null,
    SPEAKING: skills.find((s) => s.skill === 'SPEAKING')?.estimated_band ?? null,
  };

  const prediction = computePredictionFromComponents(components);

  return {
    skills,
    target_band: userRow?.targetBand ? Number(userRow.targetBand) : null,
    prediction,
    disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
  };
}

/** Ambil riwayat prediksi band pengguna (GET /api/v1/me/band-predictions). */
export async function getBandPredictionsHistory(
  db: DbOrTx,
  userId: string,
  query: BandPredictionsQuery,
): Promise<BandPredictionsResponse> {
  const { page, page_size } = query;
  const offset = (page - 1) * page_size;

  const rows = await db
    .select()
    .from(userBandPredictions)
    .where(eq(userBandPredictions.userId, userId))
    .orderBy(asc(userBandPredictions.createdAt), asc(userBandPredictions.id))
    .limit(page_size)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userBandPredictions)
    .where(eq(userBandPredictions.userId, userId));

  const data = rows.map((r) => ({
    id: r.id,
    overall_band: Number(r.overallBand),
    components: r.components as PredictionComponentsDTO,
    trigger: r.trigger as 'BOSS' | 'RECALC',
    attempt_id: r.attemptId,
    created_at: r.createdAt.toISOString(),
  }));

  return {
    data,
    meta: {
      page,
      page_size,
      total: countRow?.count ?? 0,
    },
  };
}

/** Ambil riwayat ujian pengguna (GET /api/v1/me/exam-history). */
export async function getExamHistory(
  db: DbOrTx,
  userId: string,
  query: ExamHistoryQuery,
): Promise<ExamHistoryResponse> {
  const { assessment_type, page, page_size } = query;
  const offset = (page - 1) * page_size;

  const EXAM_TYPES = [
    'SKIP_MODULE_TEST',
    'SKIP_TIER_TEST',
    'TIER_BOSS_EXAM',
    'PLACEMENT_TEST',
  ] as const;

  const typeFilter = assessment_type
    ? eq(assessmentSets.assessmentType, assessment_type)
    : inArray(assessmentSets.assessmentType, EXAM_TYPES);

  const rows = await db
    .select({
      attemptId: attempts.id,
      assessmentType: assessmentSets.assessmentType,
      title: assessmentSets.title,
      status: attempts.status,
      scorePercent: attempts.scorePercent,
      bandScore: attempts.bandScore,
      passed: attempts.passed,
      submittedAt: attempts.submittedAt,
      createdAt: attempts.createdAt,
    })
    .from(attempts)
    .innerJoin(assessmentSets, eq(attempts.assessmentSetId, assessmentSets.id))
    .where(
      and(
        eq(attempts.userId, userId),
        inArray(attempts.status, ['GRADED', 'EXPIRED']),
        typeFilter,
      ),
    )
    .orderBy(desc(attempts.submittedAt), desc(attempts.createdAt))
    .limit(page_size)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attempts)
    .innerJoin(assessmentSets, eq(attempts.assessmentSetId, assessmentSets.id))
    .where(
      and(
        eq(attempts.userId, userId),
        inArray(attempts.status, ['GRADED', 'EXPIRED']),
        typeFilter,
      ),
    );

  const data: ExamHistoryItemDTO[] = rows.map((r) => {
    const isPlacement = r.assessmentType === 'PLACEMENT_TEST';
    return {
      attempt_id: r.attemptId,
      assessment_type: r.assessmentType,
      title: r.title,
      status: r.status,
      score_percent: r.scorePercent !== null ? Number(r.scorePercent) : null,
      band_score: isPlacement ? null : r.bandScore !== null ? Number(r.bandScore) : null,
      passed: isPlacement ? null : r.passed,
      submitted_at: (r.submittedAt ?? r.createdAt).toISOString(),
      result_path: `/ujian/${r.attemptId}/hasil`,
    };
  });

  return {
    data,
    meta: {
      page,
      page_size,
      total: countRow?.count ?? 0,
    },
  };
}

/** Hook Attempt Selesai: hitung ulang skill objektif yang terpengaruh dan perbarui prediksi (SPEC-017). */
export async function skillScoreHook(ctx: AttemptCompletedContext): Promise<void> {
  const { tx, userId, attempt, set } = ctx;
  const now = new Date();

  if (set.assessmentType === 'TIER_BOSS_EXAM') {
    // Boss Stage: hitung ulang semua skill objektif L, R, G, V yang ada
    await recalculateObjectiveSkill(tx, userId, 'LISTENING', now);
    await recalculateObjectiveSkill(tx, userId, 'READING', now);
    await recalculateObjectiveSkill(tx, userId, 'GRAMMAR', now);
    await recalculateObjectiveSkill(tx, userId, 'VOCAB', now);
    await recordPredictionHistory(tx, userId, {
      trigger: 'BOSS',
      attemptId: attempt.id,
      now,
    });
  } else {
    // Non-Boss (Drill, Placement, Skip Test): ambil skill unik dari attemptAnswers attempt ini
    const answerSkills = await tx
      .selectDistinct({ skill: attemptAnswers.skill })
      .from(attemptAnswers)
      .where(and(eq(attemptAnswers.attemptId, attempt.id), isNotNull(attemptAnswers.skill)));

    const objectiveSkills: Array<'LISTENING' | 'READING' | 'GRAMMAR' | 'VOCAB'> = [];
    for (const row of answerSkills) {
      if (
        row.skill === 'LISTENING' ||
        row.skill === 'READING' ||
        row.skill === 'GRAMMAR' ||
        row.skill === 'VOCAB'
      ) {
        objectiveSkills.push(row.skill);
      }
    }

    for (const sk of objectiveSkills) {
      await recalculateObjectiveSkill(tx, userId, sk, now);
    }

    if (objectiveSkills.length > 0) {
      await recordPredictionHistory(tx, userId, {
        trigger: 'RECALC',
        now,
      });
    }
  }
}

/** Hook Evaluasi AI Selesai: hitung ulang skill AI (WRITING/SPEAKING) dan perbarui prediksi (SPEC-017). */
export async function skillScoreEvaluationHook(ctx: EvaluationGradedContext): Promise<void> {
  const { tx, userId, kind } = ctx;
  const now = new Date();

  await recalculateAISkill(tx, userId, kind, now);
  await recordPredictionHistory(tx, userId, {
    trigger: 'RECALC',
    now,
  });
}

