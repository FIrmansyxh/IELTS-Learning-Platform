/** PlacementService (SPEC-015): `GET /placement` dan `POST /placement/apply`. */
import { and, eq, sql } from 'drizzle-orm';
import { assessmentSets, attempts } from '@/db/schema';
import type { ApplyPlacementRequest, PlacementStatusType } from '@/contracts/placement';
import { writeAudit } from '../audit';
import { nowDate } from '../clock';
import type { Db } from '../db';
import { applyPlacementResult, lockProgress, recomputeStatuses } from '../gatekeeping/service';
import { ApiError, notFound } from '../http/errors';
import { getSetting } from '../settings/service';
import { isExpired } from '../attempts/dto';
import { expire, settleExpiredForSet } from '../attempts/service';
import { loadLocked } from '../attempts/store';
import { placementEligibility } from './placement';

export async function getPlacementStatus(db: Db, userId: string): Promise<PlacementStatusType> {
  // Attempt Placement yang sudah lewat batas waktu dinilai lebih dulu (commit sendiri) agar status akurat.
  const sets = await db.select({ id: assessmentSets.id }).from(assessmentSets).where(eq(assessmentSets.assessmentType, 'PLACEMENT_TEST'));
  for (const s of sets) await settleExpiredForSet(db, userId, s.id);

  return db.transaction(async (tx) => {
    const elig = await placementEligibility(tx, userId);
    const n = await getSetting<number>(tx, 'placement.question_count');
    const [active] = await tx
      .select({ id: attempts.id })
      .from(attempts)
      .innerJoin(assessmentSets, eq(assessmentSets.id, attempts.assessmentSetId))
      .where(and(eq(attempts.userId, userId), eq(assessmentSets.assessmentType, 'PLACEMENT_TEST'), eq(attempts.status, 'IN_PROGRESS')))
      .limit(1);
    const hasActive = Boolean(active);
    return {
      available: elig.blocked === null || hasActive,
      blocked_reason: hasActive ? null : elig.blocked,
      assessment_set_id: elig.set?.id ?? null,
      question_count: n,
      time_limit_seconds: elig.set?.timeLimitSeconds ?? null,
      completed_at: elig.completedAt ? elig.completedAt.toISOString() : null,
      active_attempt_id: active?.id ?? null,
      pending_result: elig.pending ? { attempt_id: elig.pending.attemptId, recommended_tier: elig.pending.recommendedTier } : null,
    };
  });
}

interface StoredPlacement {
  recommended_tier?: number;
  ability?: number;
  applied?: unknown;
  placement?: Record<string, unknown> | null;
}

/** D5: satu-satunya jalur penerapan hasil ke progres (lewat GatekeepingService). */
export async function applyPlacement(db: Db, userId: string, input: ApplyPlacementRequest) {
  return db.transaction(async (tx) => {
    const now = nowDate();
    let { attempt, set } = await loadLocked(tx, input.attempt_id, userId);
    if (set.assessmentType !== 'PLACEMENT_TEST') throw notFound();
    // Attempt berjalan yang sudah lewat batas waktu dinilai dulu (kadaluarsa -> hasil dari soal yang dijawab).
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      ({ attempt, set } = await loadLocked(tx, input.attempt_id, userId));
    }
    if (attempt.status === 'IN_PROGRESS' || attempt.status === 'ABANDONED') throw new ApiError('ATTEMPT_NOT_FINISHED');

    const rj = (attempt.resultJson ?? {}) as StoredPlacement;
    const [user] = await tx.execute(sql`SELECT placement_completed_at FROM users WHERE id = ${userId}::uuid FOR UPDATE`).then((r) => r.rows as Array<{ placement_completed_at: Date | null }>);
    if (rj.applied != null || user?.placement_completed_at) throw new ApiError('PLACEMENT_ALREADY_APPLIED');
    const recommended = Number(rj.recommended_tier ?? 1);
    if (input.tier_number > recommended) throw new ApiError('TIER_ABOVE_RECOMMENDATION');
    // F-15-04: kunci baris progres (urutan sama dengan GatekeepingService) SEBELUM memeriksa progres, agar drill/Skip dari tab lain
    // yang sedang commit tidak lolos pemeriksaan.
    await lockProgress(tx, userId);
    const progress = await tx.execute(
      sql`SELECT 1 FROM user_sub_module_progress WHERE user_id = ${userId}::uuid AND status IN ('COMPLETED','SKIPPED') LIMIT 1`,
    );
    if (progress.rows.length > 0) {
      throw new ApiError('PLACEMENT_NOT_AVAILABLE', { details: [{ path: 'attempt_id', code: 'PROGRESS_EXISTS', message: 'Placement Test tidak tersedia untuk akun ini.' }] });
    }

    const applied = await applyPlacementResult(tx, userId, { tierNumber: input.tier_number });
    const snap = await recomputeStatuses(tx, userId);
    const statusById = new Map<string, string>();
    for (const t of snap.tiers) {
      statusById.set(t.id, t.status);
      for (const m of t.modules) {
        statusById.set(m.id, m.status);
        for (const s of m.subs) statusById.set(s.id, s.status);
      }
    }
    // `unlocked` = entitas yang kini terbuka; entitas yang dilewati ditunjukkan lewat `skipped_tiers`.
    const unlocked = applied.unlocked.filter((u) => statusById.get(u.id) === 'UNLOCKED');
    const skippedTiers = snap.tiers.filter((t) => t.number < input.tier_number).map((t) => t.number);

    const next = {
      ...rj,
      applied: { tier_number: input.tier_number, at: now.toISOString() },
      placement: { ...(rj.placement ?? {}), applied: true },
    };
    await tx.update(attempts).set({ resultJson: next, updatedAt: now }).where(eq(attempts.id, attempt.id));
    await writeAudit(tx, {
      actorUserId: userId,
      action: 'PLACEMENT_APPLIED',
      entityType: 'attempt',
      entityId: attempt.id,
      metadata: { tier_number: input.tier_number, recommended_tier: recommended, ability: rj.ability ?? null },
    });
    return { applied: true, tier_number: input.tier_number, skipped_tiers: skippedTiers, unlocked };
  });
}
