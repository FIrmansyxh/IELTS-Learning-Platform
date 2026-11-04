import { z } from 'zod';
import type { assessmentSets, attemptAnswers, attempts } from '@/db/schema';
import { QuestionSchema, type Question } from '@/contracts/content';
import type { Attempt, AttemptResult, Feedback } from '@/contracts/attempts';
import { logger } from '../logger';
import { ApiError } from '../http/errors';
import {
  feedbackFor,
  hundredths,
  isAiTask,
  isObjective,
  correctDisplay,
  displayPercentHundredths,
  toPublicQuestion,
  type AttemptState,
} from './engine';

export type AttemptRow = typeof attempts.$inferSelect;
export type SetRow = typeof assessmentSets.$inferSelect;
export type AnswerRow = typeof attemptAnswers.$inferSelect;

export const GRACE_MS = 5000;

/** D3: attempt PRACTICE tanpa aktivitas lebih lama dari ini dianggap basi (ABANDONED); dipakai juga pagar K3 (`hasActiveAttempts`). */
export const PRACTICE_STALE_MS = 24 * 3600_000;

/** D3: attempt EXAM IN_PROGRESS yang melewati deadline + 5 detik. */
export function isExpired(a: Pick<AttemptRow, 'status' | 'mode' | 'deadlineAt'>, now: Date): boolean {
  return a.status === 'IN_PROGRESS' && a.mode === 'EXAM' && a.deadlineAt !== null && now.getTime() > a.deadlineAt.getTime() + GRACE_MS;
}

/** Hasil `PUT answers`. `next_question` hanya terisi pada Placement (SPEC-015); selain itu selalu null. */
export interface AnswerOutcome {
  question_id: string;
  saved: true;
  answered_count: number;
  feedback: ReturnType<typeof feedbackFor> | null;
  next_question: Attempt['questions'][number] | null;
}

/** Soal set (JSONB) yang sudah divalidasi ulang oleh skema kontrak v1.1. Galat = data korup (500, bukan bocor). */
export function parseQuestions(set: SetRow): Map<string, Question> {
  const parsed = z.array(QuestionSchema).safeParse(set.questionsJson);
  if (!parsed.success) {
    logger.error({ setId: set.id, issues: parsed.error.issues.length }, 'questions_json_invalid');
    throw new ApiError('INTERNAL_ERROR');
  }
  return new Map(parsed.data.map((q) => [q.question_id, q]));
}

export const stateOf = (a: AttemptRow): AttemptState => a.state as AttemptState;
const toH = (numeric: string | number | null): number => Math.round(Number(numeric ?? 0) * 100);

export interface AudioInfo {
  mimeType: string | null;
  durationSec: number | null;
}

export function buildAttemptDTO(p: {
  attempt: AttemptRow;
  set: SetRow;
  questions: Map<string, Question>;
  answers: AnswerRow[];
  resumed: boolean;
  now: Date;
  audio: AudioInfo | null;
}): Attempt {
  const { attempt, set, questions, answers, now } = p;
  const state = stateOf(attempt);
  const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
  const inProgress = attempt.status === 'IN_PROGRESS';
  const practice = attempt.mode === 'PRACTICE';

  // current_index: soal objektif tak terjawab pertama; soal AI (Writing/Speaking) tidak memblokir.
  let current = state.order.length;
  for (let i = 0; i < state.order.length; i++) {
    const q = questions.get(state.order[i]!);
    if (q && !isAiTask(q) && !answerByQ.has(q.question_id)) {
      current = i;
      break;
    }
  }

  const answerList: Attempt['answers'] = [];
  for (const qid of state.order) {
    const a = answerByQ.get(qid);
    const q = questions.get(qid);
    if (!a || !q) continue;
    const feedback: Feedback | null = practice ? feedbackFor(q, { isCorrect: a.isCorrect === true, scoreH: toH(a.score) }) : null;
    answerList.push({ question_id: qid, response: (a.response ?? {}) as Record<string, unknown>, feedback });
  }

  const remaining = attempt.deadlineAt ? Math.max(0, Math.ceil((attempt.deadlineAt.getTime() - now.getTime()) / 1000)) : null;
  return {
    id: attempt.id,
    assessment_set_id: attempt.assessmentSetId,
    assessment_type: set.assessmentType,
    mode: attempt.mode,
    status: attempt.status === 'AWAITING_GRADING' ? 'SUBMITTED' : attempt.status,
    title: set.title,
    started_at: attempt.startedAt.toISOString(),
    server_now: now.toISOString(),
    deadline_at: attempt.deadlineAt ? attempt.deadlineAt.toISOString() : null,
    remaining_seconds: remaining,
    time_limit_seconds: set.timeLimitSeconds,
    pass_percent: state.pass_percent,
    question_count: state.placement ? state.placement.n : state.order.length,
    answered_count: answers.length,
    current_index: current,
    passage_markdown: set.readingPassageMarkdown,
    listening:
      set.listeningAssetId && p.audio?.mimeType
        ? { audio_url: `/api/v1/attempts/${attempt.id}/audio`, mime_type: p.audio.mimeType, duration_sec: p.audio.durationSec ?? 0 }
        : null,
    questions: inProgress
      ? state.order.flatMap((qid) => {
          const q = questions.get(qid);
          return q ? [toPublicQuestion(q, state.served[qid] ?? {})] : [];
        })
      : [],
    answers: answerList,
    resumed: p.resumed,
    sections: null,
  };
}

/**
 * Tipe set yang hasilnya TIDAK boleh membuka benar/salah per soal pada mode EXAM (QA F-08-01; ADR-003 #27): hanya
 * per_skill + agregat + persen/band + lulus/gagal. Pola yang sama untuk Boss dan Placement. PRACTICE tetap memuat review.
 */
export const HIDE_REVIEW_TYPES: ReadonlySet<string> = new Set(['SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'BOSS_SECTION', 'PLACEMENT_TEST']);

/** Persen tampilan: ujian (EXAM) yang belum lulus tidak boleh tampak mencapai ambang karena pembulatan (F-08-04). */
export function scoreForDisplay(attempt: AttemptRow, passPercent: number | null, practice: boolean): number {
  const stored = Number(attempt.scorePercent ?? 0);
  if (practice || attempt.rawScore === null || attempt.maxScore === null) return stored;
  const maxH = Math.round(Number(attempt.maxScore) * 100);
  const rawH = Math.round(Number(attempt.rawScore) * 100);
  return maxH <= 0 ? stored : displayPercentHundredths(rawH, maxH, passPercent, attempt.passed) / 100;
}

/** Hasil attempt selesai (D10). Dibangun ulang dari kolom + `result_json` sehingga submit ulang identik. */
export function buildResultDTO(p: { attempt: AttemptRow; set: SetRow; questions: Map<string, Question>; answers: AnswerRow[] }): AttemptResult {
  const { attempt, set, questions } = p;
  const state = stateOf(attempt);
  const practice = attempt.mode === 'PRACTICE';
  const hideReview = !practice && HIDE_REVIEW_TYPES.has(set.assessmentType);
  const answerByQ = new Map(p.answers.map((a) => [a.questionId, a]));

  const review: NonNullable<AttemptResult['review']> = [];
  const skillAgg = new Map<string, { rawH: number; maxH: number }>();
  // F-15-05: Placement adaptif hanya menghitung soal yang DIJAWAB (history); soal `pending` tak terjawab tidak ikut.
  const scored = set.assessmentType === 'PLACEMENT_TEST' && state.placement ? state.placement.history.map((h) => h.question_id) : state.order;
  for (const qid of scored) {
    const q = questions.get(qid);
    if (!q || !isObjective(q)) continue;
    const a = answerByQ.get(qid);
    const scoreH = a ? toH(a.score) : 0;
    const agg = skillAgg.get(q.skill) ?? { rawH: 0, maxH: 0 };
    agg.rawH += scoreH;
    agg.maxH += q.points * 100;
    skillAgg.set(q.skill, agg);
    review.push({
      question_id: qid,
      is_correct: a ? a.isCorrect === true : false,
      score: hundredths(scoreH),
      max_score: q.points,
      response: a ? ((a.response ?? null) as Record<string, unknown> | null) : null,
      ...(practice ? { correct_answer: { display: correctDisplay(q) }, explanation_id: q.explanation_id } : {}),
    });
  }

  const stored = (attempt.resultJson ?? {}) as { progress?: AttemptResult['progress']; skip?: unknown; boss?: unknown; placement?: unknown; gamification?: AttemptResult['gamification'] };
  const perSkill = [...skillAgg.entries()].map(([skill, v]) => ({
    skill: skill as AttemptResult['per_skill'][number]['skill'],
    raw_score: hundredths(v.rawH),
    max_score: hundredths(v.maxH),
    score_percent: v.maxH === 0 ? 0 : Number((Math.floor((2 * v.rawH * 10000 + v.maxH) / (2 * v.maxH)) / 100).toFixed(2)),
  }));
  return {
    attempt: {
      id: attempt.id,
      assessment_set_id: attempt.assessmentSetId,
      assessment_type: set.assessmentType,
      mode: attempt.mode,
      status: attempt.status === 'AWAITING_GRADING' ? 'SUBMITTED' : attempt.status,
      started_at: attempt.startedAt.toISOString(),
      submitted_at: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
      raw_score: Number(attempt.rawScore ?? 0),
      max_score: Number(attempt.maxScore ?? 0),
      score_percent: scoreForDisplay(attempt, state.pass_percent, practice),
      pass_percent: state.pass_percent,
      passed: attempt.passed,
      points_awarded: attempt.pointsAwarded,
      band_score: attempt.bandScore === null ? null : Number(attempt.bandScore),
    },
    per_skill: perSkill,
    review: hideReview ? null : review,
    progress: stored.progress ?? null,
    skip: stored.skip ?? null,
    boss: stored.boss ?? null,
    placement: stored.placement ?? null,
    gamification: stored.gamification ?? null,
  };
}
