import { eq, sql } from 'drizzle-orm';
import { assessmentSets } from '@/db/schema';
import type { Question } from '@/contracts/content';
import type { Tx } from '../db';
import { ensureRevision, type ApplyOptions, type Touched } from '../content/apply';
import { loadDbState, setHash, type DbState, type NormalizedSet } from '../content/plan';
import type { CsvSetPlan } from './evaluate';

/** Bentuk NormalizedSet dari baris DB (agar content_hash tetap sebanding dengan impor JSON berikutnya). */
export function normalizedFromRow(row: typeof assessmentSets.$inferSelect, key: string, st: DbState, questions: Question[]): NormalizedSet {
  const subCode = [...st.subs.values()].find((s) => s.id === row.subModuleId)?.subModuleCode;
  const moduleCode = [...st.modules.values()].find((m) => m.id === row.moduleId)?.moduleCode;
  const tierOf = (tierId: string | null) => [...st.tierId].find(([, id]) => id === tierId)?.[0];
  let tierNumber = tierOf(row.tierId);
  if (row.assessmentType === 'BOSS_SECTION') {
    const parent = [...st.sets.values()].find((s) => s.id === row.parentSetId);
    tierNumber = tierOf(parent?.tierId ?? null);
  }
  return {
    key,
    type: row.assessmentType,
    title: row.title,
    subCode,
    moduleCode,
    tierNumber,
    skill: row.skillCategory ?? undefined,
    timeLimit: row.timeLimitSeconds,
    passPercent: row.passPercent ?? undefined,
    passage: row.readingPassageMarkdown ?? undefined,
    listeningCode: row.listeningAssetId ? (st.assetCodeById.get(row.listeningAssetId) ?? undefined) : undefined,
    origin: row.origin,
    sourceCode: row.sourceId ? st.sourceCodeById.get(row.sourceId) : undefined,
    attribution: row.attributionText ?? undefined,
    questions,
  };
}

/** Terapkan perubahan soal CSV: satu pembaruan per set (versi +1 sekali), revisi lama + baru dicatat. */
export async function applyCsvPlans(tx: Tx, plans: CsvSetPlan[], opts: ApplyOptions): Promise<Touched[]> {
  const st = await loadDbState(tx);
  const touched: Touched[] = [];
  for (const p of plans) {
    const changes = p.changes.filter((c) => c.action !== 'NOOP');
    const [row] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, p.setId)).for('update');
    if (!row) continue;
    if (changes.length === 0) {
      touched.push({ kind: 'ASSESSMENT_SET', id: row.id, code: p.key, setType: row.assessmentType, action: 'NOOP' });
      continue;
    }
    const questions = [...((row.questionsJson as Question[]) ?? [])];
    for (const c of changes) {
      const i = questions.findIndex((q) => q.question_id === c.question.question_id);
      if (i >= 0) questions[i] = c.question;
      else questions.push(c.question);
    }
    await ensureRevision(tx, 'ASSESSMENT_SET', row.id, row.version, row, opts);
    const [next] = await tx
      .update(assessmentSets)
      .set({
        questionsJson: questions as unknown as object[],
        questionCount: questions.length,
        contentHash: setHash(normalizedFromRow(row, p.key, st, questions)),
        version: sql`${assessmentSets.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(assessmentSets.id, row.id))
      .returning();
    await ensureRevision(tx, 'ASSESSMENT_SET', row.id, next!.version, next, opts);
    touched.push({ kind: 'ASSESSMENT_SET', id: row.id, code: p.key, setType: row.assessmentType, action: 'UPDATE' });
  }
  return touched;
}
