/**
 * AttemptService (SPEC-006, SPEC-014): siklus attempt generik (mulai/lanjut, jawab, submit, hasil) untuk semua tipe set.
 * Aturan per tipe ada di `assessmentTypeHandlers`. Semua tulis terjadi dalam satu transaksi per permintaan dengan
 * `SELECT ... FOR UPDATE` pada baris attempt; kegagalan hook membatalkan seluruh submit.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { assessmentSets, attemptAnswers, attempts, attemptSections, contentAssets } from '@/db/schema';
import type { Attempt, AttemptResult } from '@/contracts/attempts';
import type { BossResultDTO } from '@/contracts/exams';
import type { Db, Tx } from '../db';
import { nowDate } from '../clock';
import { runActivityHooks } from '../activity/hooks';
import { ApiError, notFound } from '../http/errors';
import { getSetting } from '../settings/service';
import { convertRawToBand, scaleToForty } from '../band/convert';
import { getActiveTable } from '../band/service';
import { bandSkillFor } from '../band/skills';
import {
  formatSectionDTO,
  loadChildSections,
  refreshBossResult,
  type BossAttemptState,
} from '../exams/boss';
import {
  pickNextPlacementQuestion,
  type PlacementAttemptState,
} from '../exams/placement';
import {
  buildAttemptDTO,
  buildResultDTO,
  GRACE_MS,
  parseQuestions,
  stateOf,
  type AnswerRow,
  type AttemptRow,
  type SetRow,
} from './dto';
import {
  buildInitialState,
  canonicalResponse,
  computeTimings,
  feedbackFor,
  gradeAnswer,
  isAiTask,
  isObjective,
  isPassed,
  parseResponse,
  percentHundredths,
  displayPercentHundredths,
  toNumeric,
  toPublicQuestion,
  type AttemptState,
} from './engine';
import { assessmentTypeHandlers } from './handlers';
import { attemptCompletedHooks, type ScoreSummary } from './hooks';

const toH = (numeric: string | number | null): number => Math.round(Number(numeric ?? 0) * 100);

async function loadLocked(tx: Tx, attemptId: string, userId: string): Promise<{ attempt: AttemptRow; set: SetRow }> {
  const [attempt] = await tx
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1)
    .for('update');
  if (!attempt) throw notFound(); // bukan milik pengguna = tidak ada (tidak pernah 403)
  const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, attempt.assessmentSetId)).limit(1);
  if (!set) throw notFound();
  return { attempt, set };
}

const loadAnswers = (tx: Tx, attemptId: string): Promise<AnswerRow[]> =>
  tx.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId)).orderBy(asc(attemptAnswers.answeredAt), asc(attemptAnswers.id));

async function loadAudio(tx: Tx, set: SetRow) {
  if (!set.listeningAssetId) return null;
  const [a] = await tx
    .select({ mimeType: contentAssets.mimeType, durationSec: contentAssets.durationSec })
    .from(contentAssets)
    .where(eq(contentAssets.id, set.listeningAssetId))
    .limit(1);
  return a ?? null;
}

/** Jeda minimal sejak aktivitas terakhir agar resume dianggap "pergi lalu kembali" dan basis waktu digeser. */
export const RESUME_GAP_MS = 60_000;

/** State baru dengan `last_resume_at = now` bila jeda dari aktivitas terakhir > RESUME_GAP_MS; selain itu null. */
export function rebaseResume(state: AttemptState, attempt: Pick<AttemptRow, 'startedAt'>, answers: Pick<AnswerRow, 'answeredAt'>[], now: Date): AttemptState | null {
  const lastAnswer = answers.reduce((m, a) => Math.max(m, a.answeredAt.getTime()), -Infinity);
  const last = Math.max(Date.parse(state.last_resume_at), lastAnswer, attempt.startedAt.getTime());
  return now.getTime() - last > RESUME_GAP_MS ? { ...state, last_resume_at: now.toISOString() } : null;
}

/** D3: attempt EXAM IN_PROGRESS yang melewati deadline + 5 detik. */
export function isExpired(a: Pick<AttemptRow, 'status' | 'mode' | 'deadlineAt'>, now: Date): boolean {
  return a.status === 'IN_PROGRESS' && a.mode === 'EXAM' && a.deadlineAt !== null && now.getTime() > a.deadlineAt.getTime() + GRACE_MS;
}

// ------------------------------------------------------------------ finalisasi (submit / expire)
async function finalize(
  tx: Tx,
  p: { attempt: AttemptRow; set: SetRow; userId: string; status: 'GRADED' | 'EXPIRED'; submittedAt: Date },
): Promise<AttemptResult> {
  const { attempt, set, userId } = p;
  const questions = parseQuestions(set);
  const state = stateOf(attempt);
  let answers = await loadAnswers(tx, attempt.id);

  // D8: pada EXAM (jawab-ulang diizinkan) hitung ulang waktu/streak urut answered_at.
  if (attempt.mode === 'EXAM' && answers.length > 0) {
    const defaultTarget = await getSetting<number>(tx, 'speed.default_target_ms');
    const timings = computeTimings(
      answers.map((a) => ({
        answeredAtMs: a.answeredAt.getTime(),
        isCorrect: a.isCorrect,
        targetMs: questions.get(a.questionId)?.target_time_ms ?? defaultTarget,
      })),
      attempt.startedAt.getTime(),
      Date.parse(state.last_resume_at),
    );
    for (let i = 0; i < answers.length; i++) {
      const a = answers[i]!;
      const t = timings[i]!;
      if (a.timeSpentMs !== t.timeSpentMs || a.withinTargetTime !== t.withinTargetTime || a.speedStreakLen !== t.speedStreakLen) {
        await tx
          .update(attemptAnswers)
          .set({ timeSpentMs: t.timeSpentMs, withinTargetTime: t.withinTargetTime, speedStreakLen: t.speedStreakLen })
          .where(eq(attemptAnswers.id, a.id));
      }
    }
    answers = await loadAnswers(tx, attempt.id);
  }

  // Skor: hanya soal objektif yang DISAJIKAN; soal tak terjawab = salah; soal AI dikecualikan.
  const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
  let rawH = 0;
  let maxH = 0;
  const skills = new Map<string, { rawH: number; maxH: number }>();
  for (const qid of state.order) {
    const q = questions.get(qid);
    if (!q || !isObjective(q)) continue;
    const a = answerByQ.get(qid);
    const sH = a ? toH(a.score) : 0;
    rawH += sH;
    maxH += q.points * 100;
    const agg = skills.get(q.skill) ?? { rawH: 0, maxH: 0 };
    agg.rawH += sH;
    agg.maxH += q.points * 100;
    skills.set(q.skill, agg);
  }
  const percentH = percentHundredths(rawH, maxH);
  const passPercent = state.pass_percent;
  const passed = isPassed(rawH, maxH, passPercent);
  const result: ScoreSummary = {
    rawH,
    maxH,
    percentH,
    percentDisplayH: displayPercentHundredths(rawH, maxH, passPercent, passed),
    passPercent,
    passed,
    perSkill: [...skills.entries()].map(([skill, v]) => ({ skill, rawH: v.rawH, maxH: v.maxH, percentH: percentHundredths(v.rawH, v.maxH) })),
  };

  const now = p.submittedAt;
  const [updated] = await tx
    .update(attempts)
    .set({
      status: p.status,
      submittedAt: now,
      rawScore: toNumeric(rawH),
      maxScore: toNumeric(maxH),
      scorePercent: toNumeric(percentH),
      passed,
      updatedAt: now,
    })
    .where(eq(attempts.id, attempt.id))
    .returning();

  const handler = assessmentTypeHandlers[set.assessmentType];
  if (!handler) throw new ApiError('ASSESSMENT_TYPE_NOT_ENABLED');
  const outcome = await handler.onFinish({ tx, userId, attempt: updated!, set, result });
  const [withResult] = await tx
    .update(attempts)
    .set({ resultJson: { v: 1, progress: outcome.progress, skip: outcome.skip ?? null, boss: outcome.boss ?? null, placement: outcome.placement ?? null } })
    .where(eq(attempts.id, attempt.id))
    .returning();

  await runActivityHooks(tx, { userId, kind: 'DRILL_SUBMIT', subModuleId: set.subModuleId });
  for (const hook of attemptCompletedHooks) await hook({ tx, userId, attempt: withResult!, set, result });

  return buildResultDTO({ attempt: withResult!, set, questions, answers });
}

/** D3: nilai jawaban tersimpan, tetapkan EXPIRED dengan submitted_at = deadline_at. */
const expire = (tx: Tx, attempt: AttemptRow, set: SetRow, userId: string) =>
  finalize(tx, { attempt, set, userId, status: 'EXPIRED', submittedAt: attempt.deadlineAt! });

/**
 * Selesaikan (nilai + terapkan efek) attempt EXAM `IN_PROGRESS` yang sudah melewati deadline + 5 detik pada (user, set)
 * dalam transaksi tersendiri, sehingga hasilnya ter-commit walau permintaan berikutnya ditolak (cooldown, dsb).
 */
export async function settleExpiredForSet(db: Db, userId: string, assessmentSetId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const now = nowDate();
    const [a] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.assessmentSetId, assessmentSetId), eq(attempts.status, 'IN_PROGRESS')))
      .limit(1)
      .for('update');
    if (!a || !isExpired(a, now)) return;
    const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, assessmentSetId)).limit(1);
    if (set) await expire(tx, a, set, userId);
  });
}

// ------------------------------------------------------------------ POST /attempts
export async function startAttempt(db: Db, userId: string, assessmentSetId: string): Promise<{ created: boolean; attempt: Attempt }> {
  await settleExpiredForSet(db, userId, assessmentSetId);
  return db.transaction(async (tx) => {
    const now = nowDate();
    const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, assessmentSetId)).limit(1);
    if (!set || set.status !== 'PUBLISHED') throw notFound();
    if (set.assessmentType === 'BOSS_SECTION') throw new ApiError('SECTION_NOT_STARTABLE');
    const handler = assessmentTypeHandlers[set.assessmentType];
    if (!handler) throw new ApiError('ASSESSMENT_TYPE_NOT_ENABLED');

    // Serialkan permintaan mulai serentak untuk (user, set) agar tidak ada dua attempt aktif.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`attempt:${userId}:${set.id}`}, 0))`);

    // D3: attempt PRACTICE > 24 jam tanpa aktivitas menjadi ABANDONED.
    await tx.execute(sql`
      UPDATE attempts SET status = 'ABANDONED', updated_at = ${now}
      WHERE user_id = ${userId}::uuid AND assessment_set_id = ${set.id}::uuid AND status = 'IN_PROGRESS' AND mode = 'PRACTICE'
        AND updated_at < ${new Date(now.getTime() - 24 * 3600 * 1000)}`);

    const [existing] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.assessmentSetId, set.id), eq(attempts.status, 'IN_PROGRESS')))
      .limit(1)
      .for('update');
    if (existing && isExpired(existing, now)) {
      await expire(tx, existing, set, userId); // lalu buat attempt baru di bawah
    } else if (existing) {
      // F-06-02: basis waktu hanya digeser bila pengguna benar-benar pergi (jeda > RESUME_GAP_MS); resume cepat
      // (mis. refresh berulang) tidak mereset basis sehingga time_spent/bonus kecepatan tidak dapat dimanipulasi.
      const existingAnswers = await loadAnswers(tx, existing.id);
      const rebased = rebaseResume(stateOf(existing), existing, existingAnswers, now);
      const resumed = rebased
        ? (await tx.update(attempts).set({ state: rebased, updatedAt: now }).where(eq(attempts.id, existing.id)).returning())[0]!
        : existing;

      if (set.assessmentType === 'TIER_BOSS_EXAM') {
        const childSections = await loadChildSections(tx, set.id);
        const bState = resumed.state as unknown as BossAttemptState;
        const sectionDTOs = childSections.map((c) => formatSectionDTO(c, bState.sections?.[c.id], now));
        const activeSec = childSections.find((c) => bState.sections?.[c.id]?.phase === 'ACTIVE');
        const qs = activeSec ? parseQuestions(activeSec) : new Map();
        const audio = activeSec ? await loadAudio(tx, activeSec) : null;
        const dto = buildAttemptDTO({
          attempt: resumed,
          set,
          questions: qs,
          answers: existingAnswers,
          resumed: true,
          now,
          audio,
          sections: sectionDTOs,
        });
        return { created: false, attempt: dto };
      }

      const dto = buildAttemptDTO({
        attempt: resumed,
        set,
        questions: parseQuestions(set),
        answers: existingAnswers,
        resumed: true,
        now,
        audio: await loadAudio(tx, set),
      });
      return { created: false, attempt: dto };
    }

    const plan = await handler.start({ tx, userId, set, now }); // gerbang: 403/404/409
    const questions = parseQuestions(set);
    const id = randomUUID();
    const baseState = buildInitialState(id, [...questions.values()], { limit: plan.questionLimit, keepOrder: plan.keepOrder }, plan.passPercent, now);
    if (set.assessmentType === 'PLACEMENT_TEST') {
      const pData = (plan.state as Record<string, unknown> | undefined)?.placement as { served?: string[] } | undefined;
      if (pData?.served?.length) {
        baseState.order = [...pData.served];
      }
    }
    const state = plan.state ? { ...baseState, ...plan.state } : baseState;
    const deadlineAt = plan.deadlineAt !== undefined ? plan.deadlineAt : (plan.mode === 'EXAM' ? new Date(now.getTime() + set.timeLimitSeconds * 1000) : null);

    const [row] = await tx
      .insert(attempts)
      .values({
        id,
        userId,
        assessmentSetId: set.id,
        assessmentVersion: set.version,
        mode: plan.mode,
        status: 'IN_PROGRESS',
        startedAt: now,
        deadlineAt,
        state,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (plan.onCreated) {
      await plan.onCreated({ tx, attemptId: id, now });
    }

    if (set.assessmentType === 'TIER_BOSS_EXAM') {
      const childSections = await loadChildSections(tx, set.id);
      const bState = state as unknown as BossAttemptState;
      const sectionDTOs = childSections.map((c) => formatSectionDTO(c, bState.sections?.[c.id], now));
      const dto = buildAttemptDTO({
        attempt: row!,
        set,
        questions: new Map(),
        answers: [],
        resumed: false,
        now,
        audio: null,
        sections: sectionDTOs,
      });
      return { created: true, attempt: dto };
    }

    const dto = buildAttemptDTO({ attempt: row!, set, questions, answers: [], resumed: false, now, audio: await loadAudio(tx, set) });
    return { created: true, attempt: dto };
  });
}

// ------------------------------------------------------------------ GET /attempts/{id}
export async function getAttempt(db: Db, userId: string, attemptId: string): Promise<Attempt> {
  return db.transaction(async (tx) => {
    const now = nowDate();
    let { attempt, set } = await loadLocked(tx, attemptId, userId);
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      ({ attempt, set } = await loadLocked(tx, attemptId, userId));
    } // F-06-02: GET bebas efek samping (tidak menggeser last_resume_at maupun updated_at)

    if (set.assessmentType === 'TIER_BOSS_EXAM') {
      const childSections = await loadChildSections(tx, set.id);
      const bState = attempt.state as unknown as BossAttemptState;
      const sectionDTOs = childSections.map((c) => formatSectionDTO(c, bState.sections?.[c.id], now));
      const activeSec = childSections.find((c) => bState.sections?.[c.id]?.phase === 'ACTIVE');
      const qs = activeSec ? parseQuestions(activeSec) : new Map();
      const audio = activeSec ? await loadAudio(tx, activeSec) : null;
      return buildAttemptDTO({
        attempt,
        set,
        questions: qs,
        answers: await loadAnswers(tx, attempt.id),
        resumed: true,
        now,
        audio,
        sections: sectionDTOs,
      });
    }

    return buildAttemptDTO({
      attempt,
      set,
      questions: parseQuestions(set),
      answers: await loadAnswers(tx, attempt.id),
      resumed: true,
      now,
      audio: await loadAudio(tx, set),
    });
  });
}

// ------------------------------------------------------------------ PUT /attempts/{id}/answers/{qid}
export interface AnswerOutcome {
  question_id: string;
  saved: true;
  answered_count: number;
  feedback: ReturnType<typeof feedbackFor> | null;
  next_question: unknown | null;
}

export async function submitAnswer(
  db: Db,
  userId: string,
  attemptId: string,
  questionId: string,
  rawResponse: Record<string, unknown>,
): Promise<AnswerOutcome> {
  const out = await db.transaction(async (tx): Promise<AnswerOutcome | 'expired'> => {
    const now = nowDate();
    const { attempt, set } = await loadLocked(tx, attemptId, userId);
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      return 'expired'; // dilempar setelah commit agar penilaian tersimpan
    }
    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    const state = stateOf(attempt);
    if (!state.order.includes(questionId)) throw notFound();

    let targetSet = set;
    if (set.assessmentType === 'TIER_BOSS_EXAM') {
      const bState = state as unknown as BossAttemptState;
      const sectionSetId = bState.question_section?.[questionId];
      if (!sectionSetId) throw notFound();

      const sec = bState.sections?.[sectionSetId];
      if (!sec || sec.phase !== 'ACTIVE') {
        throw new ApiError('SECTION_NOT_ACTIVE');
      }

      if (sec.deadline_at && now.getTime() > new Date(sec.deadline_at).getTime() + GRACE_MS) {
        // Section expired! Auto-close section:
        bState.sections[sectionSetId] = { ...sec, phase: 'DONE' };
        await tx.update(attempts).set({ state: bState, updatedAt: now }).where(eq(attempts.id, attempt.id));

        const [cSet] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, sectionSetId)).limit(1);
        if (cSet && (cSet.skillCategory === 'LISTENING' || cSet.skillCategory === 'READING')) {
          const qs = parseQuestions(cSet);
          const ans = await tx
            .select()
            .from(attemptAnswers)
            .where(and(eq(attemptAnswers.attemptId, attempt.id), eq(attemptAnswers.assessmentSetId, sectionSetId)));
          const ansMap = new Map(ans.map((a) => [a.questionId, a]));
          let raw = 0;
          let max = 0;
          for (const q of qs.values()) {
            if (!isObjective(q)) continue;
            max += q.points;
            const a = ansMap.get(q.question_id);
            if (a) raw += Number(a.score ?? 0);
          }
          const raw40 = max > 0 ? scaleToForty(raw, max) : 0;
          const table = await getActiveTable(tx, bandSkillFor(cSet.skillCategory));
          const band = convertRawToBand(table.rows, raw40);
          await tx
            .update(attemptSections)
            .set({ rawScore: String(raw), maxScore: String(max), bandScore: String(band), status: 'EXPIRED' })
            .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, sectionSetId)));
        } else {
          await tx
            .update(attemptSections)
            .set({ status: 'EXPIRED' })
            .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, sectionSetId)));
        }

        throw new ApiError('SECTION_EXPIRED');
      }

      const [childSet] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, sectionSetId)).limit(1);
      if (!childSet) throw notFound();
      targetSet = childSet;
    }

    const q = parseQuestions(targetSet).get(questionId);
    if (!q) throw notFound();
    if (isAiTask(q)) throw new ApiError('QUESTION_REQUIRES_SUBMISSION');

    if (set.assessmentType === 'PLACEMENT_TEST') {
      const pState = (state as unknown as Record<string, unknown>).placement as PlacementAttemptState | undefined;
      if (!pState) throw notFound();
      if (!pState.served.includes(questionId)) throw notFound();
      if (pState.history.some((h) => h.question_id === questionId)) {
        throw new ApiError('QUESTION_ALREADY_ANSWERED');
      }
      if (questionId !== pState.pending) {
        throw new ApiError('QUESTION_NOT_CURRENT');
      }
    }

    const shape = parseResponse(q, state.served[questionId] ?? {}, rawResponse);
    if (!shape.ok) throw new ApiError('VALIDATION_ERROR', { details: shape.issues });

    const all = await loadAnswers(tx, attempt.id);
    const existing = all.find((a) => a.questionId === questionId);
    const practice = attempt.mode === 'PRACTICE';
    if (practice && existing) {
      if (canonicalResponse(existing.response) !== canonicalResponse(shape.response)) throw new ApiError('QUESTION_ALREADY_ANSWERED');
      return {
        question_id: questionId,
        saved: true,
        answered_count: all.length,
        feedback: feedbackFor(q, { isCorrect: existing.isCorrect === true, scoreH: toH(existing.score) }),
        next_question: null,
      };
    }

    const grade = gradeAnswer(q, state.served[questionId] ?? {}, shape.response);
    // D8: selisih jam server terhadap jawaban sebelumnya / resume / mulai.
    const others = all.filter((a) => a.questionId !== questionId);
    const prev = others.length ? others[others.length - 1]! : null; // urut answered_at
    const base = Math.max(prev ? prev.answeredAt.getTime() : -Infinity, Date.parse(state.last_resume_at), attempt.startedAt.getTime());
    const spent = Math.max(0, now.getTime() - base);
    const target = q.target_time_ms ?? (await getSetting<number>(tx, 'speed.default_target_ms'));
    const within = spent <= target;
    const streak = grade.isCorrect && within ? (prev?.speedStreakLen ?? 0) + 1 : 0;

    await tx
      .insert(attemptAnswers)
      .values({
        attemptId: attempt.id,
        assessmentSetId: targetSet.id,
        questionId,
        questionType: q.question_type,
        skill: q.skill,
        response: shape.response,
        isCorrect: grade.isCorrect,
        score: toNumeric(grade.scoreH),
        timeSpentMs: spent,
        withinTargetTime: within,
        speedStreakLen: streak,
        answeredAt: now,
      })
      .onConflictDoUpdate({
        target: [attemptAnswers.attemptId, attemptAnswers.questionId],
        set: {
          response: shape.response,
          isCorrect: grade.isCorrect,
          score: toNumeric(grade.scoreH),
          timeSpentMs: spent,
          withinTargetTime: within,
          speedStreakLen: streak,
          answeredAt: now,
        },
      });
    await tx.update(attempts).set({ updatedAt: now }).where(eq(attempts.id, attempt.id));

    let nextQuestionDTO: unknown | null = null;
    if (set.assessmentType === 'PLACEMENT_TEST') {
      const pState = (state as unknown as Record<string, unknown>).placement as PlacementAttemptState;
      const isCorrect = grade.isCorrect;
      const qDiff = 'difficulty' in q && typeof (q as { difficulty?: unknown }).difficulty === 'number'
        ? (q as { difficulty: number }).difficulty
        : 3;
      pState.history.push({
        question_id: questionId,
        difficulty: qDiff,
        correct: isCorrect,
      });

      pState.d = isCorrect ? Math.min(5, pState.d + 1) : Math.max(1, pState.d - 1);

      const qs = [...parseQuestions(set).values()];
      const N = 25;

      if (pState.served.length >= N) {
        pState.pending = null;
      } else {
        const nextQ = pickNextPlacementQuestion(qs, pState.served, pState.d, attempt.id);
        if (nextQ) {
          pState.served.push(nextQ.question_id);
          pState.pending = nextQ.question_id;
          if (!state.order.includes(nextQ.question_id)) {
            state.order.push(nextQ.question_id);
          }
          nextQuestionDTO = toPublicQuestion(nextQ, state.served[nextQ.question_id] ?? {});
        } else {
          pState.pending = null;
        }
      }

      await tx.update(attempts).set({ state, updatedAt: now }).where(eq(attempts.id, attempt.id));
    }

    return {
      question_id: questionId,
      saved: true,
      answered_count: others.length + 1,
      feedback: practice ? feedbackFor(q, grade) : null,
      next_question: nextQuestionDTO,
    };
  });
  if (out === 'expired') throw new ApiError('ATTEMPT_EXPIRED');
  return out;
}

// ------------------------------------------------------------------ POST /attempts/{id}/submit
export async function submitAttempt(db: Db, userId: string, attemptId: string): Promise<AttemptResult> {
  const out = await db.transaction(async (tx): Promise<AttemptResult | 'expired'> => {
    const now = nowDate();
    const { attempt, set } = await loadLocked(tx, attemptId, userId);
    if (attempt.status === 'GRADED' || attempt.status === 'SUBMITTED' || attempt.status === 'EXPIRED') {
      // Idempoten: hasil yang sama, tanpa efek ganda (hook tidak dijalankan lagi).
      const resDto = buildResultDTO({ attempt, set, questions: parseQuestions(set), answers: await loadAnswers(tx, attempt.id) });
      if (set.assessmentType === 'TIER_BOSS_EXAM' && resDto.boss) {
        resDto.boss = await refreshBossResult(tx, attempt, resDto.boss as BossResultDTO);
      }
      return resDto;
    }
    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      return 'expired';
    }
    const resDto = await finalize(tx, { attempt, set, userId, status: 'GRADED', submittedAt: now });
    return resDto;
  });
  if (out === 'expired') throw new ApiError('ATTEMPT_EXPIRED');
  return out;
}

// ------------------------------------------------------------------ GET /attempts/{id}/result
export async function getAttemptResult(db: Db, userId: string, attemptId: string): Promise<AttemptResult> {
  return db.transaction(async (tx) => {
    const now = nowDate();
    let { attempt, set } = await loadLocked(tx, attemptId, userId);
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      ({ attempt, set } = await loadLocked(tx, attemptId, userId));
    }
    if (attempt.status === 'IN_PROGRESS' || attempt.status === 'ABANDONED') throw new ApiError('ATTEMPT_NOT_FINISHED');
    const resDto = buildResultDTO({ attempt, set, questions: parseQuestions(set), answers: await loadAnswers(tx, attempt.id) });
    if (set.assessmentType === 'TIER_BOSS_EXAM' && resDto.boss) {
      resDto.boss = await refreshBossResult(tx, attempt, resDto.boss as BossResultDTO);
    }
    return resDto;
  });
}
