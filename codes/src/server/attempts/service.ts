/**
 * AttemptService (SPEC-006): siklus attempt generik (mulai/lanjut, jawab, submit, hasil) untuk semua tipe set.
 * Aturan per tipe ada di `assessmentTypeHandlers`. Semua tulis terjadi dalam satu transaksi per permintaan dengan
 * `SELECT ... FOR UPDATE` pada baris attempt; kegagalan hook membatalkan seluruh submit.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { assessmentSets, attemptAnswers, attempts } from '@/db/schema';
import type { Attempt, AttemptResult } from '@/contracts/attempts';
import type { Question } from '@/contracts/content';
import type { Db, Tx } from '../db';
import { nowDate } from '../clock';
import { runActivityHooks } from '../activity/hooks';
import { ApiError, notFound } from '../http/errors';
import { getSetting } from '../settings/service';
import {
  buildAttemptDTO,
  buildResultDTO,
  isExpired,
  PRACTICE_STALE_MS,
  parseQuestions,
  stateOf,
  type AnswerRow,
  type AnswerOutcome,
  type AttemptRow,
  type SetRow,
} from './dto';
import {
  buildInitialState,
  answerTiming,
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
  type AttemptState,
} from './engine';
import { loadAnswers, loadAudio, loadLocked } from './store';
import { buildBossAttemptDTO, bossAnswerGate, decorateBossResult, settleExpiredSections } from '../exams/boss';
import { placementAnswer } from '../exams/placement';
import { assessmentTypeHandlers } from './handlers';
import { attemptCompletedHooks, type ScoreSummary } from './hooks';
import '../hooks-register';

const toH = (numeric: string | number | null): number => Math.round(Number(numeric ?? 0) * 100);

/** Jeda minimal sejak aktivitas terakhir agar resume dianggap "pergi lalu kembali" dan basis waktu digeser. */
export const RESUME_GAP_MS = 60_000;

/** State baru dengan `last_resume_at = now` bila jeda dari aktivitas terakhir > RESUME_GAP_MS; selain itu null. */
export function rebaseResume(state: AttemptState, attempt: Pick<AttemptRow, 'startedAt'>, answers: Pick<AnswerRow, 'answeredAt'>[], now: Date): AttemptState | null {
  const lastAnswer = answers.reduce((m, a) => Math.max(m, a.answeredAt.getTime()), -Infinity);
  const last = Math.max(Date.parse(state.last_resume_at), lastAnswer, attempt.startedAt.getTime());
  return now.getTime() - last > RESUME_GAP_MS ? { ...state, last_resume_at: now.toISOString() } : null;
}

export { isExpired };

/**
 * F-20-02: attempt PRACTICE `IN_PROGRESS` yang basi (> 24 jam tanpa aktivitas) atau dibuat pada versi set lama
 * (`attempts.assessment_version` != `set.version`) tidak boleh dilanjutkan: soal/kunci/opsi yang tersimpan di `state.served`
 * dapat tidak lagi cocok dengan konten saat ini. Diubah menjadi ABANDONED (konsisten dengan D3); pemanggil membalas
 * `ATTEMPT_NOT_ACTIVE` SETELAH commit agar perubahan status tersimpan.
 */
async function abandonIfStale(tx: Tx, attempt: AttemptRow, set: SetRow, now: Date): Promise<boolean> {
  if (attempt.status !== 'IN_PROGRESS' || attempt.mode !== 'PRACTICE') return false;
  const stale = now.getTime() - attempt.updatedAt.getTime() > PRACTICE_STALE_MS;
  if (!stale && attempt.assessmentVersion === set.version) return false;
  await tx.update(attempts).set({ status: 'ABANDONED', updatedAt: now }).where(eq(attempts.id, attempt.id));
  return true;
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

  // D8: pada EXAM (jawab-ulang diizinkan) hitung ulang waktu/streak urut answered_at. Boss dikecualikan (F-14-06): soalnya
  // milik set anak dan basis waktunya awal section, bukan awal attempt; nilai dari PUT answers sudah benar.
  if (attempt.mode === 'EXAM' && answers.length > 0 && set.assessmentType !== 'TIER_BOSS_EXAM') {
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

  const handler = assessmentTypeHandlers[set.assessmentType];
  if (!handler) throw new ApiError('ASSESSMENT_TYPE_NOT_ENABLED');

  let result: ScoreSummary;
  if (handler.score) {
    // Penilaian khusus tipe (Boss: L+R + band; Placement: hanya soal yang dijawab).
    result = await handler.score({ tx, userId, attempt, set, answers, status: p.status, submittedAt: p.submittedAt });
  } else {
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
    result = {
      rawH,
      maxH,
      percentH,
      percentDisplayH: displayPercentHundredths(rawH, maxH, passPercent, passed),
      passPercent,
      passed,
      perSkill: [...skills.entries()].map(([skill, v]) => ({ skill, rawH: v.rawH, maxH: v.maxH, percentH: percentHundredths(v.rawH, v.maxH) })),
    };
  }

  const now = p.submittedAt;
  const [updated] = await tx
    .update(attempts)
    .set({
      status: p.status,
      submittedAt: now,
      rawScore: toNumeric(result.rawH),
      maxScore: toNumeric(result.maxH),
      scorePercent: toNumeric(result.percentH),
      passed: result.passed,
      ...(result.bandScore === undefined ? {} : { bandScore: result.bandScore === null ? null : result.bandScore.toFixed(1) }),
      updatedAt: now,
    })
    .where(eq(attempts.id, attempt.id))
    .returning();

  const outcome = await handler.onFinish({ tx, userId, attempt: updated!, set, result });
  const [withResult] = await tx
    .update(attempts)
    .set({
      resultJson: {
        v: 1,
        progress: outcome.progress,
        skip: outcome.skip ?? null,
        boss: outcome.boss ?? null,
        placement: outcome.placement ?? null,
        ...(outcome.resultExtra ?? {}),
      },
    })
    .where(eq(attempts.id, attempt.id))
    .returning();

  await runActivityHooks(tx, { userId, kind: 'DRILL_SUBMIT', subModuleId: set.subModuleId });
  for (const hook of attemptCompletedHooks) await hook({ tx, userId, attempt: withResult!, set, result });

  // Hook (SPEC-016) menulis `points_awarded` dan `result_json.gamification`; muat ulang agar hasil memuatnya.
  const [final] = await tx.select().from(attempts).where(eq(attempts.id, attempt.id)).limit(1);
  return resultOf(tx, { attempt: final ?? withResult!, set, questions, answers });
}

/** `AttemptResult` untuk attempt selesai; Boss dilengkapi submission W/S dan estimasi (dihitung ulang tiap pembacaan). */
async function resultOf(tx: Tx, p: { attempt: AttemptRow; set: SetRow; questions: Map<string, Question>; answers: AnswerRow[] }): Promise<AttemptResult> {
  const dto = buildResultDTO(p);
  return p.set.assessmentType === 'TIER_BOSS_EXAM' ? decorateBossResult(tx, dto, p.attempt) : dto;
}

/** D3: nilai jawaban tersimpan, tetapkan EXPIRED dengan submitted_at = deadline_at. */
export const expire = (tx: Tx, attempt: AttemptRow, set: SetRow, userId: string) =>
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

/** DTO attempt: Boss bersegmen (SPEC-014), selain itu mesin generik (Placement memakai `state.placement`). */
async function attemptDto(tx: Tx, p: { attempt: AttemptRow; set: SetRow; answers: AnswerRow[]; resumed: boolean; now: Date }): Promise<Attempt> {
  if (p.set.assessmentType === 'TIER_BOSS_EXAM') return buildBossAttemptDTO(tx, p);
  return buildAttemptDTO({ ...p, questions: parseQuestions(p.set), audio: await loadAudio(tx, p.set) });
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
    } else if (existing && (await abandonIfStale(tx, existing, set, now))) {
      // F-20-02: PRACTICE dari versi set lama -> ABANDONED; attempt baru dibuat dari konten saat ini.
    } else if (existing) {
      // F-06-02: basis waktu hanya digeser bila pengguna benar-benar pergi (jeda > RESUME_GAP_MS); resume cepat
      // (mis. refresh berulang) tidak mereset basis sehingga time_spent/bonus kecepatan tidak dapat dimanipulasi.
      const existingAnswers = await loadAnswers(tx, existing.id);
      const rebased = rebaseResume(stateOf(existing), existing, existingAnswers, now);
      const resumed = rebased
        ? (await tx.update(attempts).set({ state: rebased, updatedAt: now }).where(eq(attempts.id, existing.id)).returning())[0]!
        : existing;
      const dto = await attemptDto(tx, { attempt: resumed, set, answers: existingAnswers, resumed: true, now });
      return { created: false, attempt: dto };
    }

    const plan = await handler.start({ tx, userId, set, now }); // gerbang: 403/404/409
    const questions = parseQuestions(set);
    const id = randomUUID();
    const state = plan.buildState
      ? plan.buildState(id)
      : buildInitialState(id, [...questions.values()], { limit: plan.questionLimit, keepOrder: plan.keepOrder }, plan.passPercent, now);
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
        deadlineAt: plan.mode === 'EXAM' ? new Date(now.getTime() + (plan.deadlineSeconds ?? set.timeLimitSeconds) * 1000) : null,
        state,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (plan.afterCreate) await plan.afterCreate(tx, row!);
    const dto = await attemptDto(tx, { attempt: row!, set, answers: [], resumed: false, now });
    return { created: true, attempt: dto };
  });
}

// ------------------------------------------------------------------ GET /attempts/{id}
export async function getAttempt(db: Db, userId: string, attemptId: string): Promise<Attempt> {
  const out = await db.transaction(async (tx): Promise<Attempt | 'abandoned'> => {
    const now = nowDate();
    let { attempt, set } = await loadLocked(tx, attemptId, userId);
    if (await abandonIfStale(tx, attempt, set, now)) return 'abandoned';
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      ({ attempt, set } = await loadLocked(tx, attemptId, userId));
    } // F-06-02: GET bebas efek samping (tidak menggeser last_resume_at maupun updated_at)
    let answers = await loadAnswers(tx, attempt.id);
    if (set.assessmentType === 'TIER_BOSS_EXAM' && attempt.status === 'IN_PROGRESS') {
      // Section aktif yang sudah lewat batas waktu ditutup agar `phase` mencerminkan kenyataan (SPEC-014).
      const settled = await settleExpiredSections(tx, attempt, answers, now);
      if (settled) {
        await tx.update(attempts).set({ state: settled }).where(eq(attempts.id, attempt.id));
        ({ attempt, set } = await loadLocked(tx, attemptId, userId));
        answers = await loadAnswers(tx, attempt.id);
      }
    }
    return attemptDto(tx, { attempt, set, answers, resumed: true, now });
  });
  if (out === 'abandoned') throw new ApiError('ATTEMPT_NOT_ACTIVE');
  return out;
}

// ------------------------------------------------------------------ PUT /attempts/{id}/answers/{qid}
export type { AnswerOutcome };

export async function submitAnswer(
  db: Db,
  userId: string,
  attemptId: string,
  questionId: string,
  rawResponse: Record<string, unknown>,
): Promise<AnswerOutcome> {
  const out = await db.transaction(async (tx): Promise<AnswerOutcome | 'expired' | 'section_expired' | 'abandoned'> => {
    const now = nowDate();
    const { attempt, set } = await loadLocked(tx, attemptId, userId);
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      return 'expired'; // dilempar setelah commit agar penilaian tersimpan
    }
    if (await abandonIfStale(tx, attempt, set, now)) return 'abandoned'; // F-20-02
    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    const state = stateOf(attempt);
    const all = await loadAnswers(tx, attempt.id);

    if (set.assessmentType === 'PLACEMENT_TEST') {
      return placementAnswer(tx, { attempt, set, questionId, rawResponse, answers: all, now });
    }

    // Boss: soal harus milik section ACTIVE (SECTION_NOT_ACTIVE / SECTION_EXPIRED); soal diambil dari set anak.
    let questionSet: SetRow = set;
    let sectionStartMs = -Infinity;
    if (set.assessmentType === 'TIER_BOSS_EXAM') {
      const gate = await bossAnswerGate(tx, attempt, questionId, all, now);
      if (gate.kind === 'expired') return 'section_expired';
      questionSet = gate.kid;
      sectionStartMs = gate.sectionStartedAt;
    } else if (!state.order.includes(questionId)) {
      throw notFound();
    }
    const q = parseQuestions(questionSet).get(questionId);
    if (!q) throw notFound();
    if (isAiTask(q)) throw new ApiError('QUESTION_REQUIRES_SUBMISSION');

    const shape = parseResponse(q, state.served[questionId] ?? {}, rawResponse);
    if (!shape.ok) throw new ApiError('VALIDATION_ERROR', { details: shape.issues });

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
    // D8: selisih jam server terhadap jawaban sebelumnya / resume / mulai (Boss: juga awal section).
    const others = all.filter((a) => a.questionId !== questionId);
    const prev = others.length ? others[others.length - 1]! : null; // urut answered_at
    const target = q.target_time_ms ?? (await getSetting<number>(tx, 'speed.default_target_ms'));
    // F-08-06: resume yang menggeser basis waktu tidak dikreditkan sebagai "dalam target" (lihat answerTiming).
    const timing = answerTiming({
      nowMs: now.getTime(),
      prevAnsweredAtMs: prev ? prev.answeredAt.getTime() : null,
      prevStreak: prev?.speedStreakLen ?? 0,
      startedAtMs: attempt.startedAt.getTime(),
      lastResumeAtMs: Date.parse(state.last_resume_at),
      sectionStartMs,
      targetMs: target,
      isCorrect: grade.isCorrect,
    });
    const spent = timing.timeSpentMs;
    const within = timing.withinTargetTime;
    const streak = timing.speedStreakLen;

    await tx
      .insert(attemptAnswers)
      .values({
        attemptId: attempt.id,
        assessmentSetId: questionSet.id,
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

    return {
      question_id: questionId,
      saved: true,
      answered_count: others.length + 1,
      feedback: practice ? feedbackFor(q, grade) : null,
      next_question: null,
    };
  });
  if (out === 'expired') throw new ApiError('ATTEMPT_EXPIRED');
  if (out === 'section_expired') throw new ApiError('SECTION_EXPIRED');
  if (out === 'abandoned') throw new ApiError('ATTEMPT_NOT_ACTIVE');
  return out;
}

// ------------------------------------------------------------------ POST /attempts/{id}/submit
export async function submitAttempt(db: Db, userId: string, attemptId: string): Promise<AttemptResult> {
  const out = await db.transaction(async (tx): Promise<AttemptResult | 'expired' | 'abandoned'> => {
    const now = nowDate();
    const { attempt, set } = await loadLocked(tx, attemptId, userId);
    if (attempt.status === 'GRADED' || attempt.status === 'SUBMITTED' || attempt.status === 'EXPIRED') {
      // Idempoten: hasil yang sama, tanpa efek ganda (hook tidak dijalankan lagi).
      return resultOf(tx, { attempt, set, questions: parseQuestions(set), answers: await loadAnswers(tx, attempt.id) });
    }
    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      return 'expired';
    }
    if (await abandonIfStale(tx, attempt, set, now)) return 'abandoned'; // F-20-02
    return finalize(tx, { attempt, set, userId, status: 'GRADED', submittedAt: now });
  });
  if (out === 'expired') throw new ApiError('ATTEMPT_EXPIRED');
  if (out === 'abandoned') throw new ApiError('ATTEMPT_NOT_ACTIVE');
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
    return resultOf(tx, { attempt, set, questions: parseQuestions(set), answers: await loadAnswers(tx, attempt.id) });
  });
}
