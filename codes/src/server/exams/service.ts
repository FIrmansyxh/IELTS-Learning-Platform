/** ExamService (SPEC-008): layar pra-ujian generik `GET /exams/{assessment_set_id}/intro`. */
import { and, eq } from 'drizzle-orm';
import { assessmentSets, attempts } from '@/db/schema';
import type { ExamIntro } from '@/contracts/exams';
import { nowDate } from '../clock';
import type { Db } from '../db';
import { notFound } from '../http/errors';
import { assessmentTypeHandlers } from '../attempts/handlers';
import { settleExpiredForSet } from '../attempts/service';

const hasSpeaking = (questionsJson: unknown): boolean =>
  Array.isArray(questionsJson) && questionsJson.some((q) => (q as { question_type?: unknown } | null)?.question_type === 'SPEAKING_TASK');

export async function getExamIntro(db: Db, userId: string, assessmentSetId: string): Promise<ExamIntro> {
  // Attempt EXAM yang sudah lewat deadline dinilai lebih dulu (commit sendiri) agar cooldown akurat.
  await settleExpiredForSet(db, userId, assessmentSetId);
  return db.transaction(async (tx) => {
    const now = nowDate();
    const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, assessmentSetId)).limit(1);
    if (!set || set.status !== 'PUBLISHED') throw notFound();
    const handler = assessmentTypeHandlers[set.assessmentType];
    if (!handler?.intro) throw notFound(); // tipe tidak didukung endpoint intro

    const part = await handler.intro({ tx, userId, set, now });
    const [active] = await tx
      .select({ id: attempts.id })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.assessmentSetId, set.id), eq(attempts.status, 'IN_PROGRESS')))
      .limit(1);
    const activeId = active?.id ?? null;
    return {
      assessment_set_id: set.id,
      assessment_type: set.assessmentType,
      title: set.title,
      scope: part.scope,
      time_limit_seconds: set.timeLimitSeconds,
      question_count: set.questionCount,
      threshold: part.threshold,
      rules: part.rules,
      available: part.blocked_reason === null || activeId !== null,
      blocked_reason: activeId !== null ? null : part.blocked_reason,
      cooldown: part.cooldown,
      active_attempt_id: activeId,
      requires_audio: set.listeningAssetId !== null,
      requires_microphone: hasSpeaking(set.questionsJson),
      boss: part.boss ?? null,
      placement: part.placement ?? null,
    };
  });
}
