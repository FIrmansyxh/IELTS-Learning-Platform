import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { assessmentSets, attempts, users, tiers } from '@/db/schema';
import type { Question } from '@/contracts/content';
import { ApiError, notFound } from '../http/errors';
import { mulberry32 } from '../attempts/prng';
import { parseQuestions, type SetRow } from '../attempts/dto';
import type { AssessmentTypeHandler, ExamIntroPart, FinishOutcome } from '../attempts/handlers';
import { applyPlacementResult, loadSnapshot } from '../gatekeeping/service';
import { writeAudit } from '../audit';
import type { PlacementBlockedReasonType, PlacementResultDTO, PlacementTierOptionDTO } from '@/contracts/placement';

export interface PlacementHistoryItem {
  question_id: string;
  difficulty: number;
  correct: boolean;
}

export interface PlacementAttemptState {
  d: number;
  served: string[];
  pending: string | null;
  history: PlacementHistoryItem[];
}

export interface PlacementAvailability {
  available: boolean;
  blocked_reason: PlacementBlockedReasonType | null;
  set: SetRow | null;
  active_attempt_id: string | null;
  completed_at: string | null;
  pending_result: { attempt_id: string; recommended_tier: number } | null;
  question_count: number;
  time_limit_seconds: number;
}

/** Pilihan soal berikutnya menggunakan algoritma staircase adaptif (D3). */
export function pickNextPlacementQuestion(
  allQuestions: Question[],
  servedIds: string[],
  currentDifficulty: number,
  attemptId: string,
): Question | null {
  const unserved = allQuestions.filter((q) => !servedIds.includes(q.question_id));
  if (unserved.length === 0) return null;

  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  let candidates: Question[] = [];

  for (const off of offsets) {
    const diff = currentDifficulty + off;
    if (diff < 1 || diff > 5) continue;
    const matched = unserved.filter((q) => q.difficulty === diff);
    if (matched.length > 0) {
      candidates = matched;
      break;
    }
  }

  if (candidates.length === 0) return null;

  // Urutkan question_id naik untuk determinisme
  candidates.sort((a, b) => a.question_id.localeCompare(b.question_id));

  // PRNG mulberry32 diseed dari 8 hex pertama attempt.id dan digeser sebanyak servedIds.length
  const seedHex = attemptId.replace(/-/g, '').slice(0, 8);
  const seed = parseInt(seedHex, 16) || 12345678;
  const rng = mulberry32(seed);

  for (let i = 0; i < servedIds.length; i++) {
    rng();
  }
  const rand = rng();
  const index = Math.floor(rand * candidates.length);
  return candidates[index] ?? candidates[0]!;
}

/** Hitung rekomendasi Tier dari riwayat tes adaptif (D4). */
export function computePlacementRecommendation(
  history: PlacementHistoryItem[],
): { recommended_tier: number; ability: number; correct_count: number; served_count: number } {
  const served_count = history.length;
  const correct_count = history.filter((h) => h.correct).length;

  const last10 = history.slice(-10).map((h) => h.difficulty);
  const ability =
    last10.length > 0
      ? Number((last10.reduce((a, b) => a + b, 0) / last10.length).toFixed(2))
      : 0;

  // Safeguard: < 32% benar dari soal tersaji atau 0 tersaji -> Tier 1
  let recommended_tier = 1;
  if (served_count > 0 && correct_count * 100 >= 32 * served_count) {
    recommended_tier = Math.max(1, Math.min(4, Math.floor(ability)));
  }

  return {
    recommended_tier,
    ability,
    correct_count,
    served_count,
  };
}

async function hasCompletedOrSkippedProgress(tx: DbOrTx, userId: string): Promise<boolean> {
  const snap = await loadSnapshot(tx, userId);
  for (const tier of snap.tiers) {
    for (const mod of tier.modules) {
      for (const sub of mod.subs) {
        if (sub.status === 'COMPLETED' || sub.status === 'SKIPPED') {
          return true;
        }
      }
    }
  }
  return false;
}

/** Muat ketersediaan Placement Test (D1). */
export async function loadPlacementAvailability(tx: DbOrTx, userId: string): Promise<PlacementAvailability> {
  // 1. Periksa users.placement_completed_at
  const [userRow] = await tx
    .select({ placementCompletedAt: users.placementCompletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const completedAt = userRow?.placementCompletedAt ? userRow.placementCompletedAt.toISOString() : null;

  // 2. Periksa apakah sudah ada sub-modul yang COMPLETED atau SKIPPED
  const progressExists = await hasCompletedOrSkippedProgress(tx, userId);

  // 3. Periksa set PLACEMENT_TEST PUBLISHED
  const [placementSet] = await tx
    .select()
    .from(assessmentSets)
    .where(
      and(
        eq(assessmentSets.assessmentType, 'PLACEMENT_TEST'),
        eq(assessmentSets.status, 'PUBLISHED'),
      ),
    )
    .orderBy(desc(assessmentSets.version), assessmentSets.id)
    .limit(1);

  if (completedAt) {
    return {
      available: false,
      blocked_reason: 'ALREADY_COMPLETED',
      set: placementSet ?? null,
      active_attempt_id: null,
      completed_at: completedAt,
      pending_result: null,
      question_count: 25,
      time_limit_seconds: placementSet?.timeLimitSeconds ?? 1500,
    };
  }

  if (progressExists) {
    return {
      available: false,
      blocked_reason: 'PROGRESS_EXISTS',
      set: placementSet ?? null,
      active_attempt_id: null,
      completed_at: null,
      pending_result: null,
      question_count: 25,
      time_limit_seconds: placementSet?.timeLimitSeconds ?? 1500,
    };
  }

  if (!placementSet) {
    return {
      available: false,
      blocked_reason: 'NO_PLACEMENT_PUBLISHED',
      set: null,
      active_attempt_id: null,
      completed_at: null,
      pending_result: null,
      question_count: 25,
      time_limit_seconds: 1500,
    };
  }

  // 4. Periksa attempt yang aktif atau attempt selesai yang belum di-apply
  const [active] = await tx
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.assessmentSetId, placementSet.id),
        eq(attempts.status, 'IN_PROGRESS'),
      ),
    )
    .limit(1);

  if (active) {
    return {
      available: true,
      blocked_reason: null,
      set: placementSet,
      active_attempt_id: active.id,
      completed_at: null,
      pending_result: null,
      question_count: 25,
      time_limit_seconds: placementSet.timeLimitSeconds,
    };
  }

  const [finished] = await tx
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.assessmentSetId, placementSet.id),
        inArray(attempts.status, ['GRADED', 'SUBMITTED', 'EXPIRED']),
      ),
    )
    .orderBy(desc(attempts.createdAt))
    .limit(1);

  if (finished) {
    const resJson = (finished.resultJson ?? {}) as { applied?: boolean; recommended_tier?: number };
    if (!resJson.applied) {
      return {
        available: false,
        blocked_reason: 'RESULT_PENDING_APPLY',
        set: placementSet,
        active_attempt_id: null,
        completed_at: null,
        pending_result: {
          attempt_id: finished.id,
          recommended_tier: resJson.recommended_tier ?? 1,
        },
        question_count: 25,
        time_limit_seconds: placementSet.timeLimitSeconds,
      };
    }
    // Jika sudah di-apply
    return {
      available: false,
      blocked_reason: 'ALREADY_COMPLETED',
      set: placementSet,
      active_attempt_id: null,
      completed_at: finished.submittedAt ? finished.submittedAt.toISOString() : null,
      pending_result: null,
      question_count: 25,
      time_limit_seconds: placementSet.timeLimitSeconds,
    };
  }

  return {
    available: true,
    blocked_reason: null,
    set: placementSet,
    active_attempt_id: null,
    completed_at: null,
    pending_result: null,
    question_count: 25,
    time_limit_seconds: placementSet.timeLimitSeconds,
  };
}

/** Bangun opsi tier untuk pemilihan hasil Placement (Tier 1..recommended_tier). */
export async function buildTierOptions(tx: DbOrTx, maxTier: number): Promise<PlacementTierOptionDTO[]> {
  const tierRows = await tx
    .select()
    .from(tiers)
    .where(sql`${tiers.tierNumber} <= ${maxTier}`)
    .orderBy(tiers.tierNumber);

  return tierRows.map((t) => ({
    tier_number: t.tierNumber,
    title: t.title,
    cefr_level: t.cefrLevel,
    target_band_min: Number(t.targetBandMin),
    target_band_max: Number(t.targetBandMax),
  }));
}

export const placementRules = [
  'Soal menyesuaikan jawaban Anda.',
  'Waktu 25 menit, berjalan terus walau Anda keluar halaman.',
  'Tidak ada pembahasan dan Anda tidak dapat kembali ke soal sebelumnya.',
  'Hasilnya adalah rekomendasi; Anda memilih Tier awal.',
];

export const placementHandler: AssessmentTypeHandler = {
  async start({ tx, userId, set, now }) {
    const avail = await loadPlacementAvailability(tx, userId);
    if (!avail.available && !avail.active_attempt_id) {
      const reason = avail.blocked_reason ?? 'PROGRESS_EXISTS';
      throw new ApiError('PLACEMENT_NOT_AVAILABLE', {
        details: [
          {
            path: 'placement',
            code: reason,
            message: 'Placement Test tidak tersedia untuk akun ini.',
          },
        ],
      });
    }

    const qs = [...parseQuestions(set).values()];
    if (qs.length === 0) throw notFound();

    const dummyAttemptId = now.getTime().toString(16).padStart(8, '0');
    // Pilih soal pertama berkesulitan 3
    const firstQ = pickNextPlacementQuestion(qs, [], 3, dummyAttemptId);
    if (!firstQ) throw notFound();

    const placementState: PlacementAttemptState = {
      d: 3,
      served: [firstQ.question_id],
      pending: firstQ.question_id,
      history: [],
    };

    return {
      mode: 'EXAM',
      passPercent: null,
      questionLimit: 25,
      keepOrder: true,
      deadlineAt: new Date(now.getTime() + set.timeLimitSeconds * 1000),
      state: {
        placement: placementState,
      },
    };
  },

  async intro({ tx, userId, set }): Promise<ExamIntroPart> {
    const avail = await loadPlacementAvailability(tx, userId);

    return {
      scope: { kind: 'TIER', id: set.id, label: 'Penentuan Tier awal' },
      threshold: null,
      rules: placementRules,
      blocked_reason: avail.blocked_reason,
      cooldown: { next_allowed_at: null, attempts_in_window: 0, max_attempts: 1 },
      placement: {
        adaptive: true,
        question_count: 25,
      },
    };
  },

  async onFinish({ tx, attempt }): Promise<FinishOutcome> {
    const pState = ((attempt.state as Record<string, unknown>)?.placement ?? {}) as PlacementAttemptState;
    const history = pState.history ?? [];

    const rec = computePlacementRecommendation(history);
    const tierOptions = await buildTierOptions(tx, rec.recommended_tier);

    const placementResult: PlacementResultDTO = {
      recommended_tier: rec.recommended_tier,
      ability: rec.ability,
      correct_count: rec.correct_count,
      served_count: rec.served_count,
      applied: false,
      tier_options: tierOptions,
    };

    // Simpan di result_json
    await tx
      .update(attempts)
      .set({
        resultJson: {
          recommended_tier: rec.recommended_tier,
          ability: rec.ability,
          correct_count: rec.correct_count,
          served_count: rec.served_count,
          applied: false,
        },
      })
      .where(eq(attempts.id, attempt.id));

    return {
      progress: null,
      placement: placementResult,
    };
  },
};

/** Terapkan rekomendasi hasil Placement (POST /api/v1/placement/apply). */
export async function applyPlacement(
  db: DbOrTx,
  userId: string,
  attemptId: string,
  tierNumber: number,
  clientIp?: string,
) {
  return db.transaction(async (tx) => {
    // 1. Verifikasi attempt
    const [attempt] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
      .limit(1);

    if (!attempt?.assessmentSetId) throw notFound();

    const [set] = await tx
      .select()
      .from(assessmentSets)
      .where(eq(assessmentSets.id, attempt.assessmentSetId))
      .limit(1);

    if (!set || set.assessmentType !== 'PLACEMENT_TEST') throw notFound();

    if (attempt.status === 'IN_PROGRESS') {
      throw new ApiError('ATTEMPT_NOT_FINISHED');
    }

    // 2. Verifikasi belum pernah di-apply
    const [userRow] = await tx
      .select({ placementCompletedAt: users.placementCompletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const resJson = (attempt.resultJson ?? {}) as {
      applied?: boolean;
      recommended_tier?: number;
      ability?: number;
    };

    if (userRow?.placementCompletedAt !== null || resJson.applied === true) {
      throw new ApiError('PLACEMENT_ALREADY_APPLIED');
    }

    // 3. Verifikasi progres belum ada
    const progressExists = await hasCompletedOrSkippedProgress(tx, userId);
    if (progressExists) {
      throw new ApiError('PLACEMENT_NOT_AVAILABLE', {
        message: 'Pengguna sudah memiliki progres belajar.',
      });
    }

    // 4. Verifikasi tier_number <= recommended_tier
    const recommendedTier = resJson.recommended_tier ?? 1;
    if (tierNumber > recommendedTier) {
      throw new ApiError('TIER_ABOVE_RECOMMENDATION', {
        message: 'Tier awal tidak boleh lebih tinggi dari rekomendasi.',
      });
    }

    // 5. Terapkan hasil lewat GatekeepingService
    const applyOutcome = await applyPlacementResult(tx, userId, { tierNumber });

    // 6. Tandai result_json.applied = true
    await tx
      .update(attempts)
      .set({
        resultJson: {
          ...resJson,
          applied: true,
          chosen_tier: tierNumber,
        },
      })
      .where(eq(attempts.id, attempt.id));

    // 7. Audit log
    await writeAudit(tx, {
      actorUserId: userId,
      action: 'PLACEMENT_APPLIED',
      entityType: 'TIER',
      entityId: attempt.id,
      metadata: {
        attempt_id: attempt.id,
        tier_number: tierNumber,
        recommended_tier: recommendedTier,
        ability: resJson.ability,
      },
      ipHash: clientIp,
    });

    const skippedTiers = Array.from({ length: tierNumber - 1 }, (_, i) => i + 1);

    return {
      applied: true as const,
      tier_number: tierNumber,
      skipped_tiers: skippedTiers,
      unlocked: applyOutcome.unlocked,
    };
  });
}

