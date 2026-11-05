import type { BossIntroDTO, ExamBlockedReasonType } from '@/contracts/exams';
import type { PlacementBlockedReasonType } from '@/contracts/placement';
import type { Tx } from '../db';
import { assertSubModuleAccessible, applyDrillResult, recomputeStatuses } from '../gatekeeping/service';
import { chainOf } from '../gatekeeping/rules';
import { ApiError, notFound } from '../http/errors';
import { getSetting } from '../settings/service';
import type { AttemptRow, SetRow } from './dto';
import type { ScoreSummary } from './hooks';
import { skipModuleHandler, skipTierHandler } from '../exams/skip';
import { tierBossHandler } from '../exams/boss';
import { placementHandler } from '../exams/placement';

export type AssessmentTypeName = SetRow['assessmentType'];

export interface StartPlan {
  mode: 'PRACTICE' | 'EXAM';
  /** Ambang lulus yang dibekukan pada attempt; null bila tipe tidak punya ambang persen. */
  passPercent: number | null;
  /** Subset soal (drill.question_count); null = semua. */
  questionLimit: number | null;
  /** Pertahankan urutan asli soal (set bacaan/audio). */
  keepOrder: boolean;
  deadlineAt?: Date;
  state?: Record<string, unknown>;
  onCreated?: (ctx: { tx: Tx; attemptId: string; now: Date }) => Promise<void>;
}
export interface FinishOutcome {
  progress: {
    sub_module_id: string;
    status: string;
    mastery_crown: 'NONE' | 'SILVER' | 'GOLD';
    best_score_percent: number;
    next_sub_module_code: string | null;
    unlocked: Array<{ kind: string; id: string; label: string }>;
  } | null;
  skip?: unknown;
  boss?: unknown;
  placement?: unknown;
}
/** Bagian intro ujian yang spesifik tipe (SPEC-008 `GET /exams/{id}/intro`); sisanya diisi ExamService. */
export interface ExamIntroPart {
  scope: { kind: 'MODULE' | 'TIER'; id: string; label: string } | null;
  threshold: { kind: string; value: number } | null;
  rules: string[];
  blocked_reason: ExamBlockedReasonType | PlacementBlockedReasonType | null;
  cooldown: { next_allowed_at: string | null; attempts_in_window: number; max_attempts: number };
  boss?: BossIntroDTO | null;
  placement?: unknown;
}
export interface AssessmentTypeHandler {
  /** Gerbang + rencana. Melempar ApiError (403/404/409) bila tidak boleh mulai. */
  start(ctx: { tx: Tx; userId: string; set: SetRow; now: Date }): Promise<StartPlan>;
  /** Dipanggil di dalam transaksi submit/expire setelah skor dihitung; satu-satunya jalur ke GatekeepingService. */
  onFinish(ctx: { tx: Tx; userId: string; attempt: AttemptRow; set: SetRow; result: ScoreSummary }): Promise<FinishOutcome>;
  /** Hanya tipe yang punya layar pra-ujian (Skip, Boss, Placement). Melempar NOT_FOUND bila set tidak dapat ditampilkan. */
  intro?(ctx: { tx: Tx; userId: string; set: SetRow; now: Date }): Promise<ExamIntroPart>;
}

/** Registri handler tipe (SPEC-006 mendaftarkan ACTIVE_DRILL; 008, 014, 015 menambah miliknya). */
export const assessmentTypeHandlers: Partial<Record<AssessmentTypeName, AssessmentTypeHandler>> = {};

export const activeDrillHandler: AssessmentTypeHandler = {
  async start({ tx, userId, set }) {
    if (!set.subModuleId) throw notFound();
    const access = await assertSubModuleAccessible(tx, userId, set.subModuleId); // 404 / 403 LOCKED_CONTENT
    if (!access.progress.learnCompleted) throw new ApiError('LEARN_NOT_COMPLETED');
    return {
      mode: 'PRACTICE',
      passPercent: set.passPercent ?? access.subModule.passingScorePercent,
      questionLimit: await getSetting<number>(tx, 'drill.question_count'),
      keepOrder: Boolean(set.readingPassageMarkdown) || Boolean(set.listeningAssetId),
    };
  },

  async onFinish({ tx, userId, set, result }) {
    const subModuleId = set.subModuleId!;
    // Gerbang memakai persen yang sudah dibulatkan; jaga agar keputusannya sama dengan perbandingan bilangan bulat tepat
    // (mis. 74,996 dibulatkan ke 75,00 tetap tidak lulus).
    let gateH = result.percentH;
    if (result.passed === false && result.passPercent !== null && gateH >= result.passPercent * 100) gateH = result.passPercent * 100 - 1;
    const applied = await applyDrillResult(tx, userId, { subModuleId, scorePercent: gateH / 100 });

    const snap = await recomputeStatuses(tx, userId);
    for (const tier of snap.tiers) {
      for (const mod of tier.modules) {
        const sub = mod.subs.find((s) => s.id === subModuleId);
        if (!sub) continue;
        const chain = chainOf(tier);
        const idx = chain.findIndex((c) => c.sub.id === sub.id);
        return {
          progress: {
            sub_module_id: sub.id,
            status: sub.status,
            mastery_crown: sub.crown,
            best_score_percent: sub.best,
            next_sub_module_code: idx >= 0 && idx < chain.length - 1 ? chain[idx + 1]!.sub.code : null,
            unlocked: applied.unlocked,
          },
        };
      }
    }
    return { progress: null };
  },
};

assessmentTypeHandlers.ACTIVE_DRILL = activeDrillHandler;
assessmentTypeHandlers.SKIP_MODULE_TEST = skipModuleHandler; // SPEC-008
assessmentTypeHandlers.SKIP_TIER_TEST = skipTierHandler;
assessmentTypeHandlers.TIER_BOSS_EXAM = tierBossHandler; // SPEC-014
assessmentTypeHandlers.PLACEMENT_TEST = placementHandler; // SPEC-015
