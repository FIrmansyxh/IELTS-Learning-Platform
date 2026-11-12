/**
 * Pengulangan berjarak (SPEC-026): pencatatan jadwal dari jawaban attempt, ringkasan, dan pool soal jatuh tempo.
 */
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assessmentSets, attemptAnswers, questionReviews } from '@/db/schema';
import { QuestionSchema, type Question } from '@/contracts/content';
import type { ReviewSummary } from '@/contracts/review';
import type { DbOrTx, Tx } from '../db';
import { nowDate } from '../clock';
import { logger } from '../logger';
import type { AttemptCompletedContext } from '../attempts/hooks';
import type { PoolQuestion } from '../mix/select';
import { isReviewable, nextReviewState, REVIEW_SOURCE_TYPES, type ReviewState } from './schedule';

type SetRow = typeof assessmentSets.$inferSelect;
type ReviewRow = typeof questionReviews.$inferSelect;

const Questions = z.array(QuestionSchema);

function questionsOf(set: SetRow): Map<string, Question> {
  const parsed = Questions.safeParse(set.questionsJson);
  if (!parsed.success) {
    logger.error({ set: set.id, issues: parsed.error.issues.length }, 'review_set_questions_invalid');
    return new Map();
  }
  return new Map(parsed.data.map((q) => [q.question_id, q]));
}

const keyOf = (setId: string, questionId: string): string => `${setId}\u0000${questionId}`;

const toState = (r: ReviewRow): ReviewState => ({
  box: r.box,
  dueAtMs: r.dueAt ? r.dueAt.getTime() : null,
  lapses: r.lapses,
  masteredAtMs: r.masteredAt ? r.masteredAt.getTime() : null,
});

/**
 * Hook `attemptCompleted` (SPEC-026 D1-D3): perbarui jadwal dari jawaban objektif attempt Active Drill / Latihan campur.
 * Berjalan dalam transaksi submit.
 */
export async function reviewScheduleHook(ctx: AttemptCompletedContext): Promise<void> {
  const { tx, userId, attempt } = ctx;
  if (!REVIEW_SOURCE_TYPES.has(attempt.assessmentType)) return;

  const answers = await tx
    .select({
      setId: attemptAnswers.assessmentSetId,
      questionId: attemptAnswers.questionId,
      isCorrect: attemptAnswers.isCorrect,
    })
    .from(attemptAnswers)
    .where(and(eq(attemptAnswers.attemptId, attempt.id), isNotNull(attemptAnswers.isCorrect)));
  if (answers.length === 0) return;

  const setIds = [...new Set(answers.map((a) => a.setId))];
  const sets = await tx.select().from(assessmentSets).where(inArray(assessmentSets.id, setIds));
  const setById = new Map(sets.map((s) => [s.id, s]));
  const questionsBySet = new Map(sets.map((s) => [s.id, questionsOf(s)]));

  const existing = await tx
    .select()
    .from(questionReviews)
    .where(and(eq(questionReviews.userId, userId), inArray(questionReviews.assessmentSetId, setIds)));
  const rowByKey = new Map(existing.map((r) => [keyOf(r.assessmentSetId, r.questionId), r]));

  const now = nowDate();
  const nowMs = now.getTime();
  for (const a of answers) {
    const set = setById.get(a.setId);
    const q = questionsBySet.get(a.setId)?.get(a.questionId);
    if (!set || !q || !isReviewable(set, q)) continue;
    const row = rowByKey.get(keyOf(a.setId, a.questionId)) ?? null;
    const prev = row ? toState(row) : null;
    const next = nextReviewState(prev, a.isCorrect === true, nowMs);
    if (next === null || next === prev) continue;
    const values = {
      box: next.box,
      dueAt: next.dueAtMs === null ? null : new Date(next.dueAtMs),
      lapses: next.lapses,
      masteredAt: next.masteredAtMs === null ? null : new Date(next.masteredAtMs),
      lastAnsweredAt: now,
      updatedAt: now,
    };
    if (row) {
      await tx.update(questionReviews).set(values).where(eq(questionReviews.id, row.id));
    } else {
      await tx.insert(questionReviews).values({
        userId,
        assessmentSetId: a.setId,
        questionId: a.questionId,
        skill: q.skill,
        createdAt: now,
        ...values,
      });
    }
  }
}

/** `GET /api/v1/me/reviews` (SPEC-026 D5). */
export async function getReviewSummary(db: DbOrTx, userId: string): Promise<ReviewSummary> {
  const now = nowDate();
  const [row] = (await db
    .select({
      due: sql<number>`coalesce(sum(case when ${questionReviews.masteredAt} is null and ${questionReviews.dueAt} <= ${now.getTime()} then 1 else 0 end), 0)`,
      scheduled: sql<number>`coalesce(sum(case when ${questionReviews.masteredAt} is null then 1 else 0 end), 0)`,
      mastered: sql<number>`coalesce(sum(case when ${questionReviews.masteredAt} is not null then 1 else 0 end), 0)`,
      nextDue: sql<number | null>`min(case when ${questionReviews.masteredAt} is null and ${questionReviews.dueAt} > ${now.getTime()} then ${questionReviews.dueAt} end)`,
    })
    .from(questionReviews)
    .where(eq(questionReviews.userId, userId))) as [{ due: number; scheduled: number; mastered: number; nextDue: number | null }];
  return {
    due_count: Number(row.due),
    scheduled_count: Number(row.scheduled),
    mastered_count: Number(row.mastered),
    next_due_at: row.nextDue === null || row.nextDue === undefined ? null : new Date(Number(row.nextDue)).toISOString(),
  };
}

/**
 * Soal jatuh tempo sebagai `PoolQuestion` (SPEC-026 D4), urut `due_at` naik lalu `question_id`, paling banyak `limit`.
 * Jadwal yang soalnya sudah tidak ada, tidak lagi mandiri, atau setnya tidak PUBLISHED dihapus di sini.
 */
export async function loadDueReviewPool(
  tx: Tx,
  userId: string,
  limit: number,
): Promise<{ questions: PoolQuestion[]; sets: Map<string, SetRow> }> {
  const now = nowDate();
  const due = await tx
    .select()
    .from(questionReviews)
    .where(and(eq(questionReviews.userId, userId), isNull(questionReviews.masteredAt), lte(questionReviews.dueAt, now)))
    .orderBy(asc(questionReviews.dueAt), asc(questionReviews.questionId));
  if (due.length === 0) return { questions: [], sets: new Map() };

  const setIds = [...new Set(due.map((r) => r.assessmentSetId))];
  const setRows = await tx.select().from(assessmentSets).where(inArray(assessmentSets.id, setIds));
  const sets = new Map(setRows.map((s) => [s.id, s]));
  const questionsBySet = new Map(setRows.map((s) => [s.id, questionsOf(s)]));

  const questions: PoolQuestion[] = [];
  const stale: string[] = [];
  for (const r of due) {
    const set = sets.get(r.assessmentSetId);
    const qs = questionsBySet.get(r.assessmentSetId);
    const q = qs?.get(r.questionId);
    if (!set || set.status !== 'PUBLISHED' || !q || !isReviewable(set, q)) {
      stale.push(r.id);
      continue;
    }
    if (questions.length >= limit) continue;
    questions.push({
      question_id: q.question_id,
      bank_set_id: set.id,
      bank_code: set.bankCode ?? 'DRILL',
      bank_kind: set.bankKind ?? 'DRILL',
      bank_version: set.version,
      skill: q.skill,
      question_type: q.question_type,
      difficulty: q.difficulty ?? null,
      passage_no: null,
      position: [...qs!.keys()].indexOf(q.question_id),
      question: q,
    });
  }
  if (stale.length > 0) await tx.delete(questionReviews).where(inArray(questionReviews.id, stale));
  return { questions, sets };
}
