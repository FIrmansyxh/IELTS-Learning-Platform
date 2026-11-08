/**
 * Daftar soal sebuah attempt untuk layanan AI (pembuatan submission Writing dan Speaking-eksternal).
 * Attempt dengan set membaca `assessment_sets.questions_json`; attempt tanpa set (`MIX_PRACTICE`, SPEC-022) membaca
 * snapshot `attempts.state.questions[].question`.
 */
import { eq } from 'drizzle-orm';
import { assessmentSets } from '@/db/schema';
import type { DbOrTx } from '../db';

export async function attemptQuestionList(
  db: DbOrTx,
  attempt: { assessmentSetId: string | null; state: unknown },
): Promise<unknown[]> {
  if (attempt.assessmentSetId === null) {
    const st = attempt.state as
      | { schema?: string; sections?: Array<{ questions?: Array<{ question?: unknown }> }>; questions?: Array<{ question?: unknown }> }
      | null;
    if (st?.schema === 'mock.v1' && Array.isArray(st.sections)) {
      return st.sections.flatMap((s) => (s.questions ?? []).flatMap((q) => (q.question ? [q.question] : [])));
    }
    return (st?.questions ?? []).flatMap((q) => (q.question ? [q.question] : []));
  }
  const [row] = await db
    .select({ questionsJson: assessmentSets.questionsJson })
    .from(assessmentSets)
    .where(eq(assessmentSets.id, attempt.assessmentSetId))
    .limit(1);
  return (row?.questionsJson ?? []) as unknown[];
}
