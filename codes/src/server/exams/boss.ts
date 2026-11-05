/**
 * Boss Stage Handler & Service (SPEC-014).
 * Menangani alur Boss Stage multi-section (Listening -> Reading -> Writing -> Speaking),
 * timer per section, evaluasi gerbang (Tier 1 PERCENT, Tier 2-4 BAND), dan pembukaan Tier berikutnya.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  aiEvaluations,
  assessmentSets,
  attemptAnswers,
  attempts,
  attemptSections,
  contentAssets,
  submissions,
  tiers,
} from '@/db/schema';
import type {
  BossIntroDTO,
  BossResultDTO,
  BossSectionResultDTO,
  BossSectionStartDTO,
  BossSectionSubmitDTO,
  ExamBlockedReasonType,
  SectionDTO,
} from '@/contracts/exams';
import { writeAudit } from '../audit';
import { nowDate } from '../clock';
import type { Db, DbOrTx } from '../db';
import { ApiError, notFound } from '../http/errors';
import { logger } from '../logger';
import { bossBand, convertRawToBand, overallBand, scaleToForty } from '../band/convert';
import { getActiveTable } from '../band/service';
import { applyBossResult, recomputeStatuses } from '../gatekeeping/service';
import { isDone, isTerminal, moduleAvailable } from '../gatekeeping/rules';
import { countAttemptsInWindow, loadAttemptGate, secondsUntil, type AttemptGate } from './gate';
import { formatClock } from './skip';
import {
  buildInitialState,
  isObjective,
  toPublicQuestion,
  type AttemptState,
} from '../attempts/engine';
import { parseQuestions, type AttemptRow, type SetRow } from '../attempts/dto';
export type { SetRow };
export type AssessmentSetRow = SetRow;
import type { AssessmentTypeHandler, ExamIntroPart, FinishOutcome, StartPlan } from '../attempts/handlers';

export function matchesSkill(submissionKind: string, skill: string): boolean {
  if (skill === 'WRITING') {
    return submissionKind === 'WRITING_TASK1' || submissionKind === 'WRITING_TASK2' || submissionKind === 'MINI_TASK_WRITING';
  }
  if (skill === 'SPEAKING') {
    return submissionKind === 'SPEAKING_PART1' || submissionKind === 'SPEAKING_PART2' || submissionKind === 'SPEAKING_PART3' || submissionKind === 'MINI_TASK_SPEAKING';
  }
  return false;
}

export const SKILL_ORDER: Record<string, number> = {
  LISTENING: 1,
  READING: 2,
  WRITING: 3,
  SPEAKING: 4,
};

export const GRACE_MS = 5000;

export interface BossStateSection {
  phase: 'PENDING' | 'ACTIVE' | 'DONE';
  started_at: string | null;
  deadline_at: string | null;
}

export interface BossAttemptState extends AttemptState {
  sections: Record<string, BossStateSection>;
  question_section: Record<string, string>;
}

export const hasSpeaking = (questionsJson: unknown): boolean =>
  Array.isArray(questionsJson) &&
  questionsJson.some((q) => (q as { question_type?: unknown } | null)?.question_type === 'SPEAKING_TASK');

/** Muat set-set anak untuk TIER_BOSS_EXAM terurut baku: LISTENING -> READING -> WRITING -> SPEAKING */
export async function loadChildSections(tx: DbOrTx, parentSetId: string): Promise<SetRow[]> {
  const children = await tx
    .select()
    .from(assessmentSets)
    .where(and(eq(assessmentSets.parentSetId, parentSetId), eq(assessmentSets.status, 'PUBLISHED')));

  return children.sort((a, b) => {
    const oa = SKILL_ORDER[a.skillCategory ?? ''] ?? 99;
    const ob = SKILL_ORDER[b.skillCategory ?? ''] ?? 99;
    return oa - ob;
  });
}

export function countsTowardGate(skill: string): boolean {
  return skill === 'LISTENING' || skill === 'READING';
}

/** Format SectionDTO dari data set anak dan status section */
export function formatSectionDTO(
  child: SetRow,
  secState: BossStateSection | undefined,
  now: Date,
): SectionDTO {
  const skill = (child.skillCategory ?? 'LISTENING') as SectionDTO['skill'];
  const phase = secState?.phase ?? 'PENDING';
  const startedAt = secState?.started_at ?? null;
  const deadlineAt = secState?.deadline_at ?? null;
  let remainingSeconds: number | null = null;
  if (phase === 'ACTIVE' && deadlineAt) {
    remainingSeconds = Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now.getTime()) / 1000));
  }
  return {
    assessment_set_id: child.id,
    skill,
    order: SKILL_ORDER[skill] ?? 1,
    title: child.title,
    time_limit_seconds: child.timeLimitSeconds,
    question_count: child.questionCount,
    counts_toward_gate: countsTowardGate(skill),
    requires_audio: child.listeningAssetId !== null,
    requires_microphone: hasSpeaking(child.questionsJson),
    phase,
    started_at: startedAt,
    deadline_at: deadlineAt,
    remaining_seconds: remainingSeconds,
  };
}

export function buildBossRules(
  gateType: 'PERCENT' | 'BAND',
  gateValue: number,
  totalSeconds: number,
  gate: AttemptGate,
): string[] {
  const m = Math.floor(totalSeconds / 60);
  const gateText =
    gateType === 'PERCENT'
      ? `Kelulusan ditentukan oleh akurasi Listening + Reading minimal ${gateValue}%.`
      : `Kelulusan ditentukan oleh band Listening + Reading minimal ${gateValue.toFixed(1)}.`;
  return [
    gateText,
    'Writing dan Speaking wajib dikerjakan dan dinilai oleh AI sebagai masukan.',
    `Total estimasi waktu ${m} menit bersegmen; waktu tiap section berjalan saat dimulai.`,
    'Tidak ada pembahasan atau kunci jawaban selama dan setelah ujian.',
    gate.cooldownMinutes > 0
      ? `Jika belum lulus, Anda dapat mencoba lagi setelah ${gate.cooldownMinutes} menit (maksimal ${gate.maxPerDay} kali per 24 jam).`
      : `Jika belum lulus, Anda dapat mencoba lagi (maksimal ${gate.maxPerDay} kali per 24 jam).`,
  ];
}

// ------------------------------------------------------------------ TIER_BOSS_EXAM HANDLER
export const tierBossHandler: AssessmentTypeHandler = {
  async start({ tx, userId, set, now }): Promise<StartPlan> {
    if (!set.tierId) throw notFound();
    const snap = await recomputeStatuses(tx, userId);
    const tier = snap.tiers.find((t) => t.id === set.tierId);
    if (!tier) throw notFound();

    // D2: Ketersediaan
    if (tier.status === 'LOCKED') {
      throw new ApiError('BOSS_NOT_AVAILABLE', {
        details: [
          {
            path: 'boss',
            code: 'TIER_LOCKED',
            message: 'Boss Stage belum tersedia. Selesaikan semua modul Tier ini terlebih dahulu.',
          },
        ],
      });
    }

    const availMods = tier.modules.filter((m) => m.review === 'PUBLISHED' && moduleAvailable(m));
    const modulesDone = availMods.length > 0 && availMods.every((m) => isDone(m.status));
    if (!modulesDone) {
      throw new ApiError('BOSS_NOT_AVAILABLE', {
        details: [
          {
            path: 'boss',
            code: 'MODULES_INCOMPLETE',
            message: 'Boss Stage belum tersedia. Selesaikan semua modul Tier ini terlebih dahulu.',
          },
        ],
      });
    }

    if (tier.bossPassedAt !== null || isTerminal(tier.status)) {
      throw new ApiError('BOSS_ALREADY_PASSED', {
        message: 'Boss Stage Tier ini sudah Anda lulusi.',
      });
    }

    // D3 & D4: Cooldown dan batas harian
    const gate = await loadAttemptGate(tx, userId, set.id, now);
    if (gate.cooldownUntil) {
      throw new ApiError('COOLDOWN_ACTIVE', {
        message: `Anda dapat mencoba lagi pukul ${formatClock(gate.cooldownUntil)}.`,
        details: [{ path: 'next_allowed_at', code: 'cooldown_active', message: gate.cooldownUntil.toISOString() }],
        headers: { 'Retry-After': String(secondsUntil(gate.cooldownUntil, now)) },
      });
    }
    if (gate.dailyBlocked) {
      throw new ApiError('DAILY_ATTEMPT_LIMIT', {
        headers: { 'Retry-After': String(gate.dailyRetryAt ? secondsUntil(gate.dailyRetryAt, now) : 86400) },
      });
    }

    const childSections = await loadChildSections(tx, set.id);
    const hasListening = childSections.some((c) => c.skillCategory === 'LISTENING');
    const hasReading = childSections.some((c) => c.skillCategory === 'READING');
    if (!hasListening || !hasReading) {
      logger.error({ parentSetId: set.id }, 'boss_set_incomplete_sections');
      throw new ApiError('INTERNAL_ERROR');
    }

    const totalSeconds = childSections.reduce((acc, c) => acc + c.timeLimitSeconds, 0);
    const sectionPhases: Record<string, BossStateSection> = {};
    for (const c of childSections) {
      sectionPhases[c.id] = { phase: 'PENDING', started_at: null, deadline_at: null };
    }

    return {
      mode: 'EXAM',
      passPercent: null,
      questionLimit: null,
      keepOrder: true,
      deadlineAt: new Date(now.getTime() + (totalSeconds + 1800) * 1000),
      state: {
        sections: sectionPhases,
        question_section: {},
      },
      async onCreated({ tx: innerTx, attemptId }) {
        for (const c of childSections) {
          await innerTx.insert(attemptSections).values({
            attemptId,
            assessmentSetId: c.id,
            skill: c.skillCategory!,
            status: 'IN_PROGRESS',
            rawScore: null,
            maxScore: null,
            bandScore: null,
          });
        }
      },
    };
  },

  async intro({ tx, userId, set, now }): Promise<ExamIntroPart> {
    if (!set.tierId) throw notFound();
    const snap = await recomputeStatuses(tx, userId);
    const tier = snap.tiers.find((t) => t.id === set.tierId);
    if (!tier) throw notFound();

    const gate = await loadAttemptGate(tx, userId, set.id, now);
    const availMods = tier.modules.filter((m) => m.review === 'PUBLISHED' && moduleAvailable(m));
    const modulesDone = availMods.length > 0 && availMods.every((m) => isDone(m.status));

    let blockedReason: ExamBlockedReasonType | null = null;
    if (tier.status === 'LOCKED') blockedReason = 'TIER_LOCKED';
    else if (!modulesDone) blockedReason = 'MODULES_INCOMPLETE';
    else if (tier.bossPassedAt !== null || isTerminal(tier.status)) blockedReason = 'BOSS_ALREADY_PASSED';
    else if (gate.cooldownUntil) blockedReason = 'COOLDOWN_ACTIVE';
    else if (gate.dailyBlocked) blockedReason = 'DAILY_ATTEMPT_LIMIT';

    const childSections = await loadChildSections(tx, set.id);
    const totalSeconds = childSections.reduce((acc, c) => acc + c.timeLimitSeconds, 0);
    const sectionDTOs = childSections.map((c) => formatSectionDTO(c, undefined, now));

    // Ambil hasil attempt terakhir untuk Boss ini (bila ada)
    const [last] = await tx
      .select({
        passed: attempts.passed,
        scorePercent: attempts.scorePercent,
        bandScore: attempts.bandScore,
        submittedAt: attempts.submittedAt,
        updatedAt: attempts.updatedAt,
      })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, userId),
          eq(attempts.assessmentSetId, set.id),
          inArray(attempts.status, ['GRADED', 'SUBMITTED', 'EXPIRED']),
        ),
      )
      .orderBy(desc(attempts.submittedAt), desc(attempts.createdAt))
      .limit(1);

    const lastResult: BossIntroDTO['last_result'] = last?.submittedAt
      ? {
          passed: last.passed ?? false,
          score_percent: Number(last.scorePercent ?? 0),
          boss_band: Number(last.bandScore ?? 0),
          at: last.submittedAt.toISOString(),
        }
      : null;

    const gateType = tier.gateType;
    const gateValue = tier.gateValue;

    return {
      scope: { kind: 'TIER', id: tier.id, label: `Tier ${tier.number}: ${tier.title}` },
      threshold: { kind: gateType, value: gateValue },
      rules: buildBossRules(gateType, gateValue, totalSeconds, gate),
      blocked_reason: blockedReason,
      cooldown: {
        next_allowed_at: gate.cooldownUntil ? gate.cooldownUntil.toISOString() : null,
        attempts_in_window: gate.attemptsInWindow,
        max_attempts: gate.maxPerDay,
      },
      boss: {
        tier_number: tier.number,
        gate: { type: gateType, value: gateValue },
        sections: sectionDTOs,
        total_time_limit_seconds: totalSeconds,
        last_result: lastResult,
        advisory_note: 'Kelulusan ditentukan oleh Listening dan Reading. Writing dan Speaking dinilai sebagai masukan.',
      },
      placement: null,
    };
  },

  async onFinish({ tx, userId, attempt, set }): Promise<FinishOutcome> {
    const childSections = await loadChildSections(tx, set.id);
    const listeningTable = await getActiveTable(tx, 'LISTENING');
    const readingTable = await getActiveTable(tx, 'READING_ACADEMIC');

    const [tier] = await tx.select().from(tiers).where(eq(tiers.id, set.tierId!)).limit(1);
    if (!tier) throw new Error('Tier tidak ditemukan untuk set boss');

    const state = attempt.state as BossAttemptState;
    const sectionStates = state.sections ?? {};

    // 1. Finalisasi setiap section yang masih ACTIVE atau PENDING
    for (const child of childSections) {
      const secPhase = sectionStates[child.id]?.phase ?? 'PENDING';
      const skill = child.skillCategory;

      if (secPhase === 'PENDING') {
        // Section tidak pernah dimulai: skor 0
        if (skill === 'LISTENING' || skill === 'READING') {
          const table = skill === 'LISTENING' ? listeningTable : readingTable;
          const minBand = convertRawToBand(table.rows, 0);
          await tx
            .update(attemptSections)
            .set({ rawScore: '0', maxScore: String(child.questionCount), bandScore: String(minBand), status: 'EXPIRED' })
            .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, child.id)));
        } else {
          await tx
            .update(attemptSections)
            .set({ rawScore: null, maxScore: null, bandScore: null, status: 'EXPIRED' })
            .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, child.id)));
        }
        sectionStates[child.id] = { phase: 'DONE', started_at: null, deadline_at: null };
      } else if (secPhase === 'ACTIVE') {
        // Section sedang aktif saat submit: nilai dengan jawaban tersimpan
        if (skill === 'LISTENING' || skill === 'READING') {
          const qs = parseQuestions(child);
          const ans = await tx
            .select()
            .from(attemptAnswers)
            .where(and(eq(attemptAnswers.attemptId, attempt.id), eq(attemptAnswers.assessmentSetId, child.id)));
          const ansMap = new Map(ans.map((a) => [a.questionId, a]));

          let raw = 0;
          let max = 0;
          for (const q of qs.values()) {
            if (!isObjective(q)) continue;
            max += q.points;
            const a = ansMap.get(q.question_id);
            if (a) raw += Number(a.score ?? 0);
          }

          const raw40 = max > 0 ? scaleToForty(raw, max) : 0;
          const table = skill === 'LISTENING' ? listeningTable : readingTable;
          const band = convertRawToBand(table.rows, raw40);

          await tx
            .update(attemptSections)
            .set({
              rawScore: String(raw),
              maxScore: String(max),
              bandScore: String(band),
              status: 'SUBMITTED',
            })
            .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, child.id)));
        } else {
          await tx
            .update(attemptSections)
            .set({ status: 'SUBMITTED' })
            .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, child.id)));
        }
        sectionStates[child.id] = {
          ...sectionStates[child.id]!,
          phase: 'DONE',
        };
      }
    }

    // 2. Ambil nilai Listening dan Reading final dari attempt_sections
    const currentSections = await tx
      .select()
      .from(attemptSections)
      .where(eq(attemptSections.attemptId, attempt.id));
    const secMap = new Map(currentSections.map((s) => [s.assessmentSetId, s]));

    const listeningSec = childSections.find((c) => c.skillCategory === 'LISTENING');
    const readingSec = childSections.find((c) => c.skillCategory === 'READING');

    const lRow = listeningSec ? secMap.get(listeningSec.id) : null;
    const rRow = readingSec ? secMap.get(readingSec.id) : null;

    const lRaw = Number(lRow?.rawScore ?? 0);
    const lMax = Number(lRow?.maxScore ?? 0);
    const lBand = Number(lRow?.bandScore ?? 0);
    const lRaw40 = lMax > 0 ? scaleToForty(lRaw, lMax) : 0;

    const rRaw = Number(rRow?.rawScore ?? 0);
    const rMax = Number(rRow?.maxScore ?? 0);
    const rBand = Number(rRow?.bandScore ?? 0);
    const rRaw40 = rMax > 0 ? scaleToForty(rRaw, rMax) : 0;

    // 3. Evaluasi gerbang (D6)
    const combinedRaw = lRaw + rRaw;
    const combinedMax = lMax + rMax;
    const bBand = bossBand(lBand, rBand);
    const percent = combinedMax > 0 ? Number(((combinedRaw * 100) / combinedMax).toFixed(2)) : 0;

    let passed = false;
    const gateType = tier.bossGateType;
    const gateVal = Number(tier.bossGateValue);

    if (gateType === 'PERCENT') {
      // D6: aritmetika bilangan bulat per-sentesimal (poin mentah)
      passed = combinedRaw * 100 >= gateVal * combinedMax;
    } else {
      passed = bBand >= gateVal;
    }

    // 4. Update attempt induk
    await tx
      .update(attempts)
      .set({
        rawScore: String(combinedRaw),
        maxScore: String(combinedMax),
        scorePercent: String(percent),
        bandScore: String(bBand),
        passed,
        bandTableId: null,
      })
      .where(eq(attempts.id, attempt.id));

    // 5. Terapkan hasil ke gerbang (GatekeepingService)
    const applied = await applyBossResult(tx, userId, {
      tierId: tier.id,
      percent,
      band: bBand,
      passed,
    });

    // 6. Audit log
    await writeAudit(tx, {
      actorUserId: userId,
      action: passed ? 'BOSS_PASSED' : 'BOSS_FAILED',
      entityType: 'attempt',
      entityId: attempt.id,
      metadata: {
        tier_number: tier.tierNumber,
        boss_band: bBand,
        percent,
      },
    });

    // 7. Ambil status unlocked Tier berikutnya bila lulus
    const after = await recomputeStatuses(tx, userId);
    const nextTier = after.tiers.find((t) => t.number === tier.tierNumber + 1);
    const nextTierUnlocked = nextTier ? nextTier.status === 'UNLOCKED' : false;
    const unlocked = passed
      ? applied.unlocked.filter((u) => {
          const t = after.tiers.find((x) => x.id === u.id);
          return t && t.status === 'UNLOCKED';
        })
      : [];

    // 8. Kumpulkan submission Writing dan Speaking (D8)
    const bossResult = await buildBossResultDTO({
      tx,
      attemptId: attempt.id,
      userId,
      parentSetId: set.id,
      tier,
      passed,
      percent,
      bossBandVal: bBand,
      lRaw,
      lMax,
      lRaw40,
      lBand,
      lStatus: lRow?.status ?? 'SUBMITTED',
      rRaw,
      rMax,
      rRaw40,
      rBand,
      rStatus: rRow?.status ?? 'SUBMITTED',
      childSections,
      nextTierUnlocked,
      unlocked,
      listeningTableId: listeningTable.tableId,
      readingTableId: readingTable.tableId,
      submittedAt: attempt.submittedAt ?? nowDate(),
    });

    return {
      progress: null,
      boss: bossResult,
    };
  },
};

interface BuildBossResultParams {
  tx: DbOrTx;
  attemptId: string;
  userId: string;
  parentSetId: string;
  tier: { id: string; tierNumber: number; bossGateType: 'PERCENT' | 'BAND'; bossGateValue: string | number };
  passed: boolean;
  percent: number;
  bossBandVal: number;
  lRaw: number;
  lMax: number;
  lRaw40: number;
  lBand: number;
  lStatus: string;
  rRaw: number;
  rMax: number;
  rRaw40: number;
  rBand: number;
  rStatus: string;
  childSections: SetRow[];
  nextTierUnlocked: boolean;
  unlocked: Array<{ kind: string; id: string; label: string }>;
  listeningTableId: string;
  readingTableId: string;
  submittedAt: Date;
}

export async function buildBossResultDTO(p: BuildBossResultParams): Promise<BossResultDTO> {
  const {
    tx,
    attemptId,
    userId,
    parentSetId,
    tier,
    passed,
    percent,
    bossBandVal,
    lRaw,
    lMax,
    lRaw40,
    lBand,
    lStatus,
    rRaw,
    rMax,
    rRaw40,
    rBand,
    rStatus,
    childSections,
    nextTierUnlocked,
    unlocked,
    listeningTableId,
    readingTableId,
    submittedAt,
  } = p;

  const currentSections = await tx
    .select()
    .from(attemptSections)
    .where(eq(attemptSections.attemptId, attemptId));
  const secMap = new Map(currentSections.map((s) => [s.assessmentSetId, s]));

  // Ambil semua submissions terkait attempt ini
  const attemptSubs = await tx
    .select()
    .from(submissions)
    .where(eq(submissions.attemptId, attemptId));

  const sectionsList: BossSectionResultDTO[] = [];
  let wBand: number | null = null;
  let sBand: number | null = null;
  let pendingAiCount = 0;

  for (const child of childSections) {
    const skill = child.skillCategory as 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';
    const row = secMap.get(child.id);
    const subList = attemptSubs.filter((s) => matchesSkill(s.kind, skill));
    const subIds = subList.map((s) => s.id);

    if (skill === 'LISTENING') {
      sectionsList.push({
        skill: 'LISTENING',
        raw_score: lRaw,
        max_score: lMax,
        raw_40: lRaw40,
        band: lBand,
        status: lStatus,
        submission_ids: [],
        counts_toward_gate: true,
      });
    } else if (skill === 'READING') {
      sectionsList.push({
        skill: 'READING',
        raw_score: rRaw,
        max_score: rMax,
        raw_40: rRaw40,
        band: rBand,
        status: rStatus,
        submission_ids: [],
        counts_toward_gate: true,
      });
    } else {
      // WRITING atau SPEAKING
      let evalBand: number | null = null;
      for (const sub of subList) {
        if (!['GRADED', 'FALLBACK_SELF_ASSESSMENT', 'FAILED'].includes(sub.status)) {
          pendingAiCount++;
        }
        // Cari evaluasi AI terbaru
        const [latestEval] = await tx
          .select()
          .from(aiEvaluations)
          .where(eq(aiEvaluations.submissionId, sub.id))
          .orderBy(desc(aiEvaluations.runNumber), desc(aiEvaluations.createdAt))
          .limit(1);

        if (latestEval && latestEval.method === 'AI_LOCAL') {
          const feedback = (latestEval.feedbackJson ?? {}) as { flags?: { injection_suspected?: boolean } };
          if (feedback.flags?.injection_suspected !== true && latestEval.overallBand !== null) {
            evalBand = Number(latestEval.overallBand);
          }
        }
      }

      if (skill === 'WRITING') wBand = evalBand;
      if (skill === 'SPEAKING') sBand = evalBand;

      sectionsList.push({
        skill,
        raw_score: null,
        max_score: null,
        raw_40: null,
        band: evalBand,
        status: row?.status ?? 'SUBMITTED',
        submission_ids: subIds,
        counts_toward_gate: false,
      });
    }
  }

  // D8: Overall Band Estimate bila 4 skill ada band valid
  let overallEst: number | null = null;
  if (lBand !== null && rBand !== null && wBand !== null && sBand !== null) {
    overallEst = overallBand({ listening: lBand, reading: rBand, writing: wBand, speaking: sBand });
  }

  const gate = await loadAttemptGate(tx, userId, parentSetId, submittedAt);
  const inWindow = await countAttemptsInWindow(tx, userId, parentSetId, submittedAt);
  const nextAllowed = !passed && gate.cooldownMinutes > 0 ? new Date(submittedAt.getTime() + gate.cooldownMinutes * 60_000) : null;

  return {
    passed,
    gate: {
      type: tier.bossGateType,
      value: Number(tier.bossGateValue),
    },
    percent,
    boss_band: bossBandVal,
    sections: sectionsList,
    overall_band_estimate: overallEst,
    pending_ai: pendingAiCount,
    band_table_ids: {
      listening: listeningTableId,
      reading_academic: readingTableId,
    },
    tier: {
      id: tier.id,
      tier_number: tier.tierNumber,
    },
    next_tier_unlocked: nextTierUnlocked,
    unlocked,
    retry: {
      next_allowed_at: nextAllowed ? nextAllowed.toISOString() : null,
      attempts_remaining_today: Math.max(0, gate.maxPerDay - inWindow),
    },
    disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
  };
}

// ------------------------------------------------------------------ REFRESH BOSS RESULT (GET /result)
export async function refreshBossResult(db: DbOrTx, attempt: AttemptRow, existingBoss: BossResultDTO): Promise<BossResultDTO> {
  const childSections = await loadChildSections(db, attempt.assessmentSetId);
  const attemptSubs = await db.select().from(submissions).where(eq(submissions.attemptId, attempt.id));

  let wBand: number | null = null;
  let sBand: number | null = null;
  let pendingAiCount = 0;

  const updatedSections = existingBoss.sections.map((sec) => {
    if (sec.skill === 'LISTENING' || sec.skill === 'READING') return sec;

    const child = childSections.find((c) => c.skillCategory === sec.skill);
    const subList = child ? attemptSubs.filter((s) => matchesSkill(s.kind, sec.skill)) : [];

    for (const sub of subList) {
      if (!['GRADED', 'FALLBACK_SELF_ASSESSMENT', 'FAILED'].includes(sub.status)) {
        pendingAiCount++;
      }
    }

    return { ...sec };
  });

  // Periksa evaluasi AI terbaru untuk Writing & Speaking
  for (const child of childSections) {
    const skill = child.skillCategory;
    if (skill !== 'WRITING' && skill !== 'SPEAKING') continue;

    const subList = attemptSubs.filter((s) => matchesSkill(s.kind, skill));
    let evalBand: number | null = null;

    for (const sub of subList) {
      const [latestEval] = await db
        .select()
        .from(aiEvaluations)
        .where(eq(aiEvaluations.submissionId, sub.id))
        .orderBy(desc(aiEvaluations.runNumber), desc(aiEvaluations.createdAt))
        .limit(1);

      if (latestEval && latestEval.method === 'AI_LOCAL') {
        const feedback = (latestEval.feedbackJson ?? {}) as { flags?: { injection_suspected?: boolean } };
        if (feedback.flags?.injection_suspected !== true && latestEval.overallBand !== null) {
          evalBand = Number(latestEval.overallBand);
        }
      }
    }

    const targetSec = updatedSections.find((s) => s.skill === skill);
    if (targetSec) targetSec.band = evalBand;
    if (skill === 'WRITING') wBand = evalBand;
    if (skill === 'SPEAKING') sBand = evalBand;
  }

  const lSec = updatedSections.find((s) => s.skill === 'LISTENING');
  const rSec = updatedSections.find((s) => s.skill === 'READING');
  const lBand = lSec?.band ?? null;
  const rBand = rSec?.band ?? null;

  let overallEst: number | null = null;
  if (lBand !== null && rBand !== null && wBand !== null && sBand !== null) {
    overallEst = overallBand({ listening: lBand, reading: rBand, writing: wBand, speaking: sBand });
  }

  return {
    ...existingBoss,
    sections: updatedSections,
    overall_band_estimate: overallEst,
    pending_ai: pendingAiCount,
  };
}

// ------------------------------------------------------------------ START BOSS SECTION
export async function startBossSection(
  db: Db,
  userId: string,
  attemptId: string,
  sectionSetId: string,
): Promise<BossSectionStartDTO> {
  return db.transaction(async (tx) => {
    const now = nowDate();
    const [attempt] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
      .limit(1)
      .for('update');
    if (!attempt) throw notFound();

    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    if (attempt.deadlineAt && now.getTime() > attempt.deadlineAt.getTime() + GRACE_MS) {
      throw new ApiError('ATTEMPT_EXPIRED');
    }

    const [child] = await tx
      .select()
      .from(assessmentSets)
      .where(and(eq(assessmentSets.id, sectionSetId), eq(assessmentSets.parentSetId, attempt.assessmentSetId)))
      .limit(1);
    if (!child) throw notFound();

    const childSections = await loadChildSections(tx, attempt.assessmentSetId);
    const state = attempt.state as BossAttemptState;
    const sectionsState = state.sections ?? {};

    const targetIndex = childSections.findIndex((c) => c.id === sectionSetId);
    if (targetIndex === -1) throw notFound();

    // Verifikasi urutan section: semua section sebelumnya harus berstatus DONE
    for (let i = 0; i < targetIndex; i++) {
      const prev = childSections[i]!;
      const prevPhase = sectionsState[prev.id]?.phase;
      if (prevPhase !== 'DONE') {
        throw new ApiError('SECTION_ORDER_VIOLATION', {
          message: 'Selesaikan section sebelumnya terlebih dahulu.',
        });
      }
    }

    const currentSec = sectionsState[sectionSetId];
    if (currentSec?.phase === 'DONE') {
      throw new ApiError('SECTION_ALREADY_DONE');
    }

    let audioInfo: { audio_url: string; mime_type: string; duration_sec: number } | null = null;
    if (child.listeningAssetId) {
      const [asset] = await tx
        .select()
        .from(contentAssets)
        .where(eq(contentAssets.id, child.listeningAssetId))
        .limit(1);
      if (asset) {
        audioInfo = {
          audio_url: `/api/v1/attempts/${attempt.id}/audio?section=${child.id}`,
          mime_type: asset.mimeType ?? 'audio/mpeg',
          duration_sec: asset.durationSec ?? 0,
        };
      }
    }

    const childQuestions = parseQuestions(child);
    const answers = await tx
      .select()
      .from(attemptAnswers)
      .where(and(eq(attemptAnswers.attemptId, attempt.id), eq(attemptAnswers.assessmentSetId, child.id)))
      .orderBy(asc(attemptAnswers.answeredAt));

    // Jika sudah ACTIVE (resume idempoten)
    if (currentSec?.phase === 'ACTIVE') {
      const secDTO = formatSectionDTO(child, currentSec, now);
      const publicQuestions = (state.order ?? [])
        .filter((qid) => state.question_section?.[qid] === sectionSetId)
        .map((qid) => {
          const q = childQuestions.get(qid)!;
          return toPublicQuestion(q, state.served?.[qid] ?? {});
        });

      return {
        section: secDTO,
        passage_markdown: child.readingPassageMarkdown ?? null,
        listening: audioInfo,
        questions: publicQuestions,
        answers: answers.map((a) => ({
          question_id: a.questionId,
          response: (a.response ?? {}) as Record<string, unknown>,
        })),
        server_now: now.toISOString(),
      };
    }

    // Status PENDING: Aktifkan section
    const startedAt = now;
    const deadlineAt = new Date(now.getTime() + child.timeLimitSeconds * 1000);
    const newSecState: BossStateSection = {
      phase: 'ACTIVE',
      started_at: startedAt.toISOString(),
      deadline_at: deadlineAt.toISOString(),
    };

    const initialQState = buildInitialState(
      attempt.id,
      [...childQuestions.values()],
      { limit: null, keepOrder: Boolean(child.readingPassageMarkdown) || Boolean(child.listeningAssetId) },
      null,
      now,
    );

    const newOrder = [...(state.order ?? []), ...initialQState.order];
    const newServed = { ...(state.served ?? {}), ...initialQState.served };
    const newQuestionSec = { ...(state.question_section ?? {}) };
    for (const qid of initialQState.order) {
      newQuestionSec[qid] = sectionSetId;
    }

    const nextState: BossAttemptState = {
      ...state,
      order: newOrder,
      served: newServed,
      sections: {
        ...sectionsState,
        [sectionSetId]: newSecState,
      },
      question_section: newQuestionSec,
      last_resume_at: now.toISOString(),
    };

    await tx
      .update(attempts)
      .set({ state: nextState, updatedAt: now })
      .where(eq(attempts.id, attempt.id));

    const secDTO = formatSectionDTO(child, newSecState, now);
    const publicQuestions = initialQState.order.map((qid) => {
      const q = childQuestions.get(qid)!;
      return toPublicQuestion(q, initialQState.served[qid] ?? {});
    });

    return {
      section: secDTO,
      passage_markdown: child.readingPassageMarkdown ?? null,
      listening: audioInfo,
      questions: publicQuestions,
      answers: [],
      server_now: now.toISOString(),
    };
  });
}

// ------------------------------------------------------------------ SUBMIT BOSS SECTION
export async function submitBossSection(
  db: Db,
  userId: string,
  attemptId: string,
  sectionSetId: string,
): Promise<BossSectionSubmitDTO> {
  return db.transaction(async (tx) => {
    const now = nowDate();
    const [attempt] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
      .limit(1)
      .for('update');
    if (!attempt) throw notFound();

    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');

    const [child] = await tx
      .select()
      .from(assessmentSets)
      .where(and(eq(assessmentSets.id, sectionSetId), eq(assessmentSets.parentSetId, attempt.assessmentSetId)))
      .limit(1);
    if (!child) throw notFound();

    const childSections = await loadChildSections(tx, attempt.assessmentSetId);
    const state = attempt.state as BossAttemptState;
    const sectionsState = state.sections ?? {};
    const curSecState = sectionsState[sectionSetId];

    const targetIdx = childSections.findIndex((c) => c.id === sectionSetId);
    const nextChild = targetIdx >= 0 && targetIdx < childSections.length - 1 ? childSections[targetIdx + 1] : null;

    if (!curSecState || curSecState.phase === 'PENDING') {
      throw new ApiError('SECTION_NOT_ACTIVE');
    }

    if (curSecState.phase === 'DONE') {
      // Idempoten
      const secDTO = formatSectionDTO(child, curSecState, now);
      const nextDTO = nextChild ? formatSectionDTO(nextChild, sectionsState[nextChild.id], now) : null;
      return {
        section: secDTO,
        next_section: nextDTO,
      };
    }

    // Nilai section bila LISTENING atau READING
    const skill = child.skillCategory;
    if (skill === 'LISTENING' || skill === 'READING') {
      const qs = parseQuestions(child);
      const ans = await tx
        .select()
        .from(attemptAnswers)
        .where(and(eq(attemptAnswers.attemptId, attempt.id), eq(attemptAnswers.assessmentSetId, child.id)));
      const ansMap = new Map(ans.map((a) => [a.questionId, a]));

      let raw = 0;
      let max = 0;
      for (const q of qs.values()) {
        if (!isObjective(q)) continue;
        max += q.points;
        const a = ansMap.get(q.question_id);
        if (a) raw += Number(a.score ?? 0);
      }

      const raw40 = max > 0 ? scaleToForty(raw, max) : 0;
      const table = await getActiveTable(tx, skill === 'LISTENING' ? 'LISTENING' : 'READING_ACADEMIC');
      const band = convertRawToBand(table.rows, raw40);

      await tx
        .update(attemptSections)
        .set({
          rawScore: String(raw),
          maxScore: String(max),
          bandScore: String(band),
          status: 'SUBMITTED',
        })
        .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, child.id)));
    } else {
      await tx
        .update(attemptSections)
        .set({ status: 'SUBMITTED' })
        .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, child.id)));
    }

    const updatedSecState: BossStateSection = {
      ...curSecState,
      phase: 'DONE',
    };

    const nextState: BossAttemptState = {
      ...state,
      sections: {
        ...sectionsState,
        [sectionSetId]: updatedSecState,
      },
      updated_at: now.toISOString(),
    } as unknown as BossAttemptState;

    await tx
      .update(attempts)
      .set({ state: nextState, updatedAt: now })
      .where(eq(attempts.id, attempt.id));

    const secDTO = formatSectionDTO(child, updatedSecState, now);
    const nextDTO = nextChild ? formatSectionDTO(nextChild, sectionsState[nextChild.id], now) : null;

    return {
      section: secDTO,
      next_section: nextDTO,
    };
  });
}
