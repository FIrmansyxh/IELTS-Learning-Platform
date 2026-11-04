/** Resolusi konteks pengiriman (attempt+soal atau sub-modul Mini-Task) untuk Writing dan Speaking (SPEC-012/013). */
import { and, eq } from 'drizzle-orm';
import { assessmentSets, attempts } from '@/db/schema';
import type { Tx, DbOrTx } from '../db';
import { nowDate } from '../clock';
import { ApiError, notFound } from '../http/errors';
import { assertSubModuleAccessible } from '../gatekeeping/service';
import { loadMaterial } from '../player/material';
import { isExpired } from '../attempts/service';
import { parseQuestions, stateOf } from '../attempts/dto';
import { SECTION_GRACE_MS } from '../exams/boss-rules';

export interface AttemptQuestionContext {
  prompt: string;
  minWords: number | null;
  part: number | null;
}

export async function resolveAttemptQuestion(
  tx: DbOrTx,
  userId: string,
  attemptId: string,
  questionId: string,
  expect: { type: 'WRITING_TASK'; taskKind: 'TASK1' | 'TASK2' } | { type: 'SPEAKING_TASK'; part: 1 | 2 | 3 },
): Promise<AttemptQuestionContext> {
  const [attempt] = await tx.select().from(attempts).where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId))).limit(1);
  if (!attempt) throw notFound();
  if (attempt.status !== 'IN_PROGRESS' || isExpired(attempt, nowDate())) throw new ApiError('ATTEMPT_NOT_ACTIVE');
  const [parent] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, attempt.assessmentSetId)).limit(1);
  if (!parent) throw notFound();
  const state = stateOf(attempt);
  let set = parent;
  if (parent.assessmentType === 'TIER_BOSS_EXAM') {
    // SPEC-014: soal Writing/Speaking milik section anak yang harus ACTIVE (dan belum lewat batas waktu section).
    const sid = state.question_section?.[questionId];
    if (!sid) throw notFound();
    const st = state.sections?.[sid];
    if (!st || st.phase !== 'ACTIVE') throw new ApiError('SECTION_NOT_ACTIVE');
    if (st.deadline_at !== null && nowDate().getTime() > Date.parse(st.deadline_at) + SECTION_GRACE_MS) throw new ApiError('SECTION_EXPIRED');
    const [child] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, sid)).limit(1);
    if (!child) throw notFound();
    set = child;
  } else if (!state.order.includes(questionId)) {
    throw notFound();
  }
  const q = parseQuestions(set).get(questionId);
  if (!q) throw notFound();
  if (expect.type === 'WRITING_TASK') {
    if (q.question_type !== 'WRITING_TASK' || q.task_kind !== expect.taskKind) throw new ApiError('QUESTION_TYPE_MISMATCH');
    return { prompt: q.prompt, minWords: q.min_words ?? null, part: null };
  }
  if (q.question_type !== 'SPEAKING_TASK' || q.part !== expect.part) throw new ApiError('QUESTION_TYPE_MISMATCH');
  return { prompt: q.prompt, minWords: null, part: q.part };
}

/** Mini-Task AI: sub-modul terbuka (404/LOCKED_CONTENT), tipe cocok, materi selesai. Mengembalikan prompt tugas. */
export async function resolveMiniTask(tx: Tx, userId: string, subModuleId: string, taskType: 'AI_SHORT_WRITING' | 'AI_SHORT_SPEAKING'): Promise<{ prompt: string }> {
  const access = await assertSubModuleAccessible(tx, userId, subModuleId);
  const material = await loadMaterial(tx, subModuleId);
  if (!material?.miniTask || material.miniTask.task_type !== taskType) throw new ApiError('MINI_TASK_TYPE_MISMATCH');
  if (!access.progress.learnCompleted) throw new ApiError('LEARN_NOT_COMPLETED');
  return { prompt: material.miniTask.prompt };
}
