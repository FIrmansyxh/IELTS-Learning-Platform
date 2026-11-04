/**
 * Satu definisi "set sedang dikerjakan" (SPEC-020 K3, F-20-04) untuk kurasi DAN impor SPEC-019 (evaluasi + publikasi).
 * Ada attempt "hidup" pada set itu, induknya (section Boss -> set induk), atau anak-anaknya (set induk Boss -> section).
 * Attempt `IN_PROGRESS` yang sudah mati menurut SPEC-006 D3 tidak menghalangi: EXAM lewat deadline + 5 dtk (akan dinilai
 * otomatis) dan PRACTICE tanpa aktivitas > 24 jam (menjadi ABANDONED). Tanpa ini, satu Drill yang ditinggalkan mengunci set selamanya.
 */
import { inArray, sql } from 'drizzle-orm';
import { assessmentSets } from '@/db/schema';
import type { DbOrTx } from '../db';
import { nowDate } from '../clock';
import { GRACE_MS, PRACTICE_STALE_MS } from '../attempts/dto';

/** Apakah `setId` (atau induk/anak Boss-nya) memiliki attempt hidup. */
export async function hasActiveAttempts(tx: DbOrTx, setId: string, now: Date = nowDate()): Promise<boolean> {
  return (await activeAttemptSetIds(tx, [setId], now)).has(setId);
}

/** Himpunan `setId` (dari `setIds`) yang memiliki attempt hidup (set itu sendiri, induknya, atau anak-anaknya). */
export async function activeAttemptSetIds(tx: DbOrTx, setIds: string[], now: Date = nowDate()): Promise<Set<string>> {
  if (setIds.length === 0) return new Set();
  const ids = sql.join(setIds.map((i) => sql`${i}::uuid`), sql`, `);
  const r = await tx.execute(sql`
    WITH target AS (
      SELECT id AS root, id AS member FROM assessment_sets WHERE id IN (${ids})
      UNION SELECT id, parent_set_id FROM assessment_sets WHERE id IN (${ids}) AND parent_set_id IS NOT NULL
      UNION SELECT parent_set_id, id FROM assessment_sets WHERE parent_set_id IN (${ids})
    )
    SELECT DISTINCT t.root::text AS root FROM target t
    JOIN attempts a ON a.assessment_set_id = t.member
    WHERE a.status = 'IN_PROGRESS'
      AND ((a.mode = 'EXAM' AND (a.deadline_at IS NULL OR a.deadline_at + (${GRACE_MS} * interval '1 millisecond') > ${now.toISOString()}::timestamptz))
        OR (a.mode = 'PRACTICE' AND a.updated_at >= ${new Date(now.getTime() - PRACTICE_STALE_MS).toISOString()}::timestamptz))`);
  return new Set((r.rows as Array<{ root: string }>).map((x) => x.root));
}

/** Kunci baris set (`FOR UPDATE`) agar `startAttempt` yang menunggu `FOR KEY SHARE` FK tidak lolos di antara cek dan commit. */
export async function lockSets(tx: DbOrTx, setIds: string[]): Promise<void> {
  if (setIds.length === 0) return;
  await tx.select({ id: assessmentSets.id }).from(assessmentSets).where(inArray(assessmentSets.id, setIds)).orderBy(assessmentSets.id).for('update');
}
