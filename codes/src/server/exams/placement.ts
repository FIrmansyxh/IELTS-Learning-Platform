/**
 * Placement Test adaptif (SPEC-015): kelayakan (D1), handler tipe `PLACEMENT_TEST`, pemilihan soal berikutnya setelah
 * tiap jawaban, dan rekomendasi Tier. Modul ini TIDAK mengimpor `attempts/service.ts`; penerapan hasil ada di
 * `placement-service.ts`.
 */
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { assessmentSets, attemptAnswers, attempts, tiers, users } from '@/db/schema';
import type { Question } from '@/contracts/content';
import type { Tx } from '../db';
import { ApiError, notFound } from '../http/errors';
import { getSetting } from '../settings/service';
import {
  buildInitialState,
  MIN_HUMAN_MS,
  gradeAnswer,
  isAiTask,
  isObjective,
  parseResponse,
  percentHundredths,
  toNumeric,
  toPublicQuestion,
  type AttemptState,
  type PlacementState,
} from '../attempts/engine';
import { parseQuestions, stateOf, type AnswerOutcome, type AnswerRow, type AttemptRow, type SetRow } from '../attempts/dto';
import type { AssessmentTypeHandler, ExamIntroPart } from '../attempts/handlers';
import type { ScoreSummary } from '../attempts/hooks';
import { newRngSeed } from '../attempts/prng';
import { START_DIFFICULTY, nextDifficulty, pickNext, recommend, type BankItem } from './placement-rules';

const toH = (numeric: string | number | null): number => Math.round(Number(numeric ?? 0) * 100);
const DISCLAIMER = 'Ini rekomendasi latihan, bukan penilaian resmi.';
export { DISCLAIMER as PLACEMENT_DISCLAIMER };

export type PlacementBlocked = 'ALREADY_COMPLETED' | 'PROGRESS_EXISTS' | 'NO_PLACEMENT_PUBLISHED' | 'RESULT_PENDING_APPLY';

export interface PlacementEligibility {
  blocked: PlacementBlocked | null;
  /** Set Placement `PUBLISHED` terpilih (version tertinggi, lalu id terkecil). */
  set: SetRow | null;
  completedAt: Date | null;
  pending: { attemptId: string; recommendedTier: number } | null;
}

/** D1. Urutan prioritas: ALREADY_COMPLETED, PROGRESS_EXISTS, NO_PLACEMENT_PUBLISHED, RESULT_PENDING_APPLY. */
export async function placementEligibility(tx: Tx, userId: string): Promise<PlacementEligibility> {
  const [u] = await tx.select({ completedAt: users.placementCompletedAt }).from(users).where(eq(users.id, userId)).limit(1);
  const completedAt = u?.completedAt ?? null;
  const [set] = await tx
    .select()
    .from(assessmentSets)
    .where(and(eq(assessmentSets.assessmentType, 'PLACEMENT_TEST'), eq(assessmentSets.status, 'PUBLISHED')))
    .orderBy(desc(assessmentSets.version), asc(assessmentSets.id))
    .limit(1);
  const progress = await tx.execute(
    sql`SELECT 1 FROM user_sub_module_progress WHERE user_id = ${userId}::uuid AND status IN ('COMPLETED','SKIPPED') LIMIT 1`,
  );
  const [done] = await tx
    .select({ id: attempts.id, resultJson: attempts.resultJson })
    .from(attempts)
    .innerJoin(assessmentSets, eq(assessmentSets.id, attempts.assessmentSetId))
    .where(
      and(eq(attempts.userId, userId), eq(assessmentSets.assessmentType, 'PLACEMENT_TEST'), inArray(attempts.status, ['GRADED', 'EXPIRED', 'SUBMITTED'])),
    )
    .orderBy(desc(attempts.submittedAt))
    .limit(1);
  const rj = (done?.resultJson ?? null) as { recommended_tier?: number; applied?: unknown } | null;
  const pending = done && rj && rj.applied == null ? { attemptId: done.id, recommendedTier: Number(rj.recommended_tier ?? 1) } : null;

  let blocked: PlacementBlocked | null = null;
  if (completedAt !== null) blocked = 'ALREADY_COMPLETED';
  else if (progress.rows.length > 0) blocked = 'PROGRESS_EXISTS';
  else if (!set) blocked = 'NO_PLACEMENT_PUBLISHED';
  else if (pending) blocked = 'RESULT_PENDING_APPLY';
  return { blocked, set: set ?? null, completedAt, pending: blocked === 'RESULT_PENDING_APPLY' ? pending : null };
}

/** Bank adaptif: soal objektif bertingkat 1-5 (soal tanpa difficulty tidak dipakai). */
function bankOf(set: SetRow): { items: BankItem[]; questions: Map<string, Question> } {
  const questions = parseQuestions(set);
  const items: BankItem[] = [];
  for (const q of questions.values()) {
    if (!isObjective(q) || q.difficulty === undefined) continue;
    items.push({ question_id: q.question_id, difficulty: q.difficulty });
  }
  return { items, questions };
}

const servedOf = (attemptId: string, q: Question, seed: string, now: Date) =>
  buildInitialState(attemptId, [q], { limit: null, keepOrder: true, seed: `${seed}:${q.question_id}` }, null, now).served[q.question_id] ?? {};

// ------------------------------------------------------------------ PUT answers (adaptif)
export async function placementAnswer(
  tx: Tx,
  p: { attempt: AttemptRow; set: SetRow; questionId: string; rawResponse: Record<string, unknown>; answers: AnswerRow[]; now: Date },
): Promise<AnswerOutcome> {
  const { attempt, set, questionId, now } = p;
  const state = stateOf(attempt);
  const ps = state.placement;
  if (!ps) throw new ApiError('INTERNAL_ERROR');
  if (!ps.served.includes(questionId)) throw notFound(); // bank tidak dapat ditanya sembarang
  if (p.answers.some((a) => a.questionId === questionId)) throw new ApiError('QUESTION_ALREADY_ANSWERED');
  if (ps.pending !== questionId) throw new ApiError('QUESTION_NOT_CURRENT');

  const { items, questions } = bankOf(set);
  const q = questions.get(questionId);
  if (!q || isAiTask(q)) throw notFound();
  const shape = parseResponse(q, state.served[questionId] ?? {}, p.rawResponse);
  if (!shape.ok) throw new ApiError('VALIDATION_ERROR', { details: shape.issues });
  const grade = gradeAnswer(q, state.served[questionId] ?? {}, shape.response);

  const prev = p.answers.length ? p.answers[p.answers.length - 1]! : null;
  const base = Math.max(prev ? prev.answeredAt.getTime() : -Infinity, Date.parse(state.last_resume_at), attempt.startedAt.getTime());
  const spent = Math.max(0, now.getTime() - base);
  const target = q.target_time_ms ?? (await getSetting<number>(tx, 'speed.default_target_ms'));
  const within = spent <= target && spent >= MIN_HUMAN_MS; // F-16-01: batas manusia
  await tx.insert(attemptAnswers).values({
    attemptId: attempt.id,
    assessmentSetId: set.id,
    questionId,
    questionType: q.question_type,
    skill: q.skill,
    response: shape.response,
    isCorrect: grade.isCorrect,
    score: toNumeric(grade.scoreH),
    timeSpentMs: spent,
    withinTargetTime: within,
    speedStreakLen: grade.isCorrect && within ? (prev?.speedStreakLen ?? 0) + 1 : 0,
    answeredAt: now,
  });

  const difficulty = q.difficulty ?? START_DIFFICULTY;
  const history = [...ps.history, { question_id: questionId, difficulty, correct: grade.isCorrect }];
  const d = nextDifficulty(ps.d, grade.isCorrect);
  const nextId = history.length >= ps.n ? null : pickNext(items, ps.served, d, attempt.id);
  const nextQ = nextId ? questions.get(nextId)! : null;
  const placement: PlacementState = { ...ps, d, history, served: nextId ? [...ps.served, nextId] : ps.served, pending: nextId };
  const nextServed = nextQ ? servedOf(attempt.id, nextQ, state.rng_seed ?? '', now) : null;
  const next: AttemptState = {
    ...state,
    order: nextId ? [...state.order, nextId] : state.order,
    served: nextId && nextServed ? { ...state.served, [nextId]: nextServed } : state.served,
    placement,
  };
  await tx.update(attempts).set({ state: next, updatedAt: now }).where(eq(attempts.id, attempt.id));
  return {
    question_id: questionId,
    saved: true,
    answered_count: history.length,
    feedback: null,
    next_question: nextQ && nextServed ? toPublicQuestion(nextQ, nextServed) : null,
  };
}

// ------------------------------------------------------------------ handler tipe
function score(ctx: { attempt: AttemptRow; set: SetRow; answers: AnswerRow[] }): Promise<ScoreSummary> {
  const state = stateOf(ctx.attempt);
  const history = state.placement?.history ?? [];
  const questions = parseQuestions(ctx.set);
  const byQ = new Map(ctx.answers.map((a) => [a.questionId, a]));
  let rawH = 0;
  let maxH = 0;
  const skills = new Map<string, { rawH: number; maxH: number }>();
  for (const h of history) {
    const q = questions.get(h.question_id);
    if (!q || !isObjective(q)) continue;
    const a = byQ.get(h.question_id);
    const sH = a ? toH(a.score) : 0;
    rawH += sH;
    maxH += q.points * 100;
    const agg = skills.get(q.skill) ?? { rawH: 0, maxH: 0 };
    agg.rawH += sH;
    agg.maxH += q.points * 100;
    skills.set(q.skill, agg);
  }
  const percentH = percentHundredths(rawH, maxH);
  return Promise.resolve({
    rawH,
    maxH,
    percentH,
    percentDisplayH: percentH,
    passPercent: null,
    passed: null,
    perSkill: [...skills.entries()].map(([skill, v]) => ({ skill, rawH: v.rawH, maxH: v.maxH, percentH: percentHundredths(v.rawH, v.maxH) })),
  });
}

const blockedError = (code: PlacementBlocked): ApiError =>
  new ApiError('PLACEMENT_NOT_AVAILABLE', { details: [{ path: 'assessment_set_id', code, message: 'Placement Test tidak tersedia untuk akun ini.' }] });

export const placementHandler: AssessmentTypeHandler = {
  async start({ tx, userId, set, now }) {
    // F-15-03: serialkan start Placement per pengguna (lintas set), lalu paksa set terpilih D1 dan satu attempt aktif.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`placement:${userId}`}, 0))`);
    const elig = await placementEligibility(tx, userId);
    if (elig.blocked && elig.blocked !== 'NO_PLACEMENT_PUBLISHED') throw blockedError(elig.blocked);
    if (!elig.set || elig.set.id !== set.id) throw notFound(); // hanya set Placement terpilih D1 yang dapat dimulai
    const [other] = await tx
      .select({ id: attempts.id })
      .from(attempts)
      .innerJoin(assessmentSets, eq(assessmentSets.id, attempts.assessmentSetId))
      .where(and(eq(attempts.userId, userId), eq(assessmentSets.assessmentType, 'PLACEMENT_TEST'), eq(attempts.status, 'IN_PROGRESS')))
      .limit(1);
    if (other) {
      throw new ApiError('PLACEMENT_NOT_AVAILABLE', {
        details: [{ path: 'assessment_set_id', code: 'ATTEMPT_IN_PROGRESS', message: 'Placement Test lain masih berjalan.' }],
      });
    }
    const n = await getSetting<number>(tx, 'placement.question_count');
    const { items } = bankOf(set);
    if (items.length === 0) throw notFound();
    const buildState = (attemptId: string): AttemptState => {
      const seed = newRngSeed();
      const { questions } = bankOf(set);
      const first = pickNext(items, [], START_DIFFICULTY, attemptId);
      if (!first) throw new ApiError('INTERNAL_ERROR');
      return {
        v: 1,
        rng_seed: seed,
        order: [first],
        last_resume_at: now.toISOString(),
        pass_percent: null,
        served: { [first]: servedOf(attemptId, questions.get(first)!, seed, now) },
        placement: { n, d: START_DIFFICULTY, served: [first], pending: first, history: [] },
      };
    };
    return { mode: 'EXAM', passPercent: null, questionLimit: null, keepOrder: true, buildState };
  },

  async intro({ tx, userId, set }): Promise<ExamIntroPart> {
    const elig = await placementEligibility(tx, userId);
    const n = await getSetting<number>(tx, 'placement.question_count');
    const blocked = elig.blocked === 'NO_PLACEMENT_PUBLISHED' ? null : elig.blocked;
    return {
      scope: { kind: 'TIER_PLACEMENT', id: null, label: 'Penentuan Tier awal' },
      threshold: null,
      rules: [
        'Soal menyesuaikan jawaban Anda.',
        `Waktu ${Math.round(set.timeLimitSeconds / 60)} menit, berjalan terus walau Anda keluar halaman.`,
        'Tidak ada pembahasan dan Anda tidak dapat kembali ke soal sebelumnya.',
        'Hasilnya adalah rekomendasi; Anda memilih Tier awal.',
      ],
      blocked_reason: blocked,
      cooldown: { next_allowed_at: null, attempts_in_window: 0, max_attempts: 1 },
      boss: null,
      placement: { adaptive: true, question_count: n },
      overrides: { question_count: n },
    };
  },

  score: (ctx) => score(ctx),

  async onFinish({ tx, attempt }) {
    const state = stateOf(attempt);
    const rec = recommend(state.placement?.history ?? [], state.placement?.n);
    const rows = await tx
      .select()
      .from(tiers)
      .where(lte(tiers.tierNumber, rec.recommended_tier))
      .orderBy(asc(tiers.tierNumber));
    const placement = {
      ...rec,
      applied: false,
      tier_options: rows.map((t) => ({
        tier_number: t.tierNumber,
        title: t.title,
        cefr_level: t.cefrLevel,
        target_band_min: Number(t.targetBandMin),
        target_band_max: Number(t.targetBandMax),
      })),
    };
    return { progress: null, placement, resultExtra: { ...rec, applied: null } };
  },
};
