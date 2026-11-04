/**
 * Boss Stage (SPEC-014): handler tipe `TIER_BOSS_EXAM`, status section di `attempts.state`, DTO attempt bersegmen,
 * penilaian L+R, dan hasil `boss` (termasuk D8 yang dihitung ulang tiap pembacaan). Modul ini TIDAK mengimpor
 * `attempts/service.ts` (orkestrasi expire/finalize ada di sana dan di `attempts/sections.ts`).
 */
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { aiEvaluations, assessmentSets, attemptSections, attempts, submissions } from '@/db/schema';
import type { Attempt, AttemptResult } from '@/contracts/attempts';
import { writeAudit } from '../audit';
import { getActiveTable } from '../band/service';
import { nowDate } from '../clock';
import type { Tx } from '../db';
import { applyBossResult, recomputeStatuses } from '../gatekeeping/service';
import { bossState } from '../gatekeeping/rules';
import { ApiError, notFound } from '../http/errors';
import { logger } from '../logger';
import {
  buildInitialState,
  displayPercentHundredths,
  isAiTask,
  isObjective,
  percentHundredths,
  toPublicQuestion,
  type AttemptState,
  type BossSectionState,
} from '../attempts/engine';
import { GRACE_MS, parseQuestions, stateOf, type AnswerRow, type AttemptRow, type SetRow } from '../attempts/dto';
import type { AssessmentTypeHandler, ExamIntroPart } from '../attempts/handlers';
import type { ScoreSummary } from '../attempts/hooks';
import { loadAudio } from '../attempts/store';
import { newRngSeed } from '../attempts/prng';
import { countAttemptsInWindow, loadAttemptGate } from './gate';
import { assertGateOpen, tierLabel } from './skip';
import {
  BOSS_SKILL_ORDER,
  SECTION_GRACE_MS,
  bossDeadlineSeconds,
  bossSkillOrder,
  countsForEstimate,
  evaluateGate,
  isGateSkill,
  overallEstimate,
  scoreObjectiveSection,
  type BossSkill,
  type SectionScore,
} from './boss-rules';

const toH = (numeric: string | number | null): number => Math.round(Number(numeric ?? 0) * 100);
const DISCLAIMER = 'Perkiraan latihan, bukan skor resmi IELTS.';
const ADVISORY = 'Kelulusan ditentukan oleh Listening dan Reading. Writing dan Speaking dinilai sebagai masukan.';

export interface SectionDTO {
  assessment_set_id: string;
  skill: BossSkill;
  order: number;
  title: string;
  time_limit_seconds: number;
  question_count: number;
  counts_toward_gate: boolean;
  requires_audio: boolean;
  requires_microphone: boolean;
  phase: 'PENDING' | 'ACTIVE' | 'DONE';
  started_at: string | null;
  deadline_at: string | null;
  remaining_seconds: number | null;
}

const hasSpeaking = (questionsJson: unknown): boolean =>
  Array.isArray(questionsJson) && questionsJson.some((q) => (q as { question_type?: unknown } | null)?.question_type === 'SPEAKING_TASK');

export function sectionDTO(kid: SetRow, st: BossSectionState, now: Date): SectionDTO {
  const skill = kid.skillCategory as BossSkill;
  const active = st.phase === 'ACTIVE' && st.deadline_at !== null;
  return {
    assessment_set_id: kid.id,
    skill,
    order: bossSkillOrder(skill),
    title: kid.title,
    time_limit_seconds: kid.timeLimitSeconds,
    question_count: kid.questionCount,
    counts_toward_gate: isGateSkill(skill),
    requires_audio: kid.listeningAssetId !== null,
    requires_microphone: hasSpeaking(kid.questionsJson),
    phase: st.phase,
    started_at: st.started_at,
    deadline_at: st.deadline_at,
    remaining_seconds: active ? Math.max(0, Math.ceil((Date.parse(st.deadline_at!) - now.getTime()) / 1000)) : null,
  };
}

// ------------------------------------------------------------------ data set anak
/** Anak section terurut menurut urutan skill tetap (D1); hanya baris yang dikenal skill Boss. */
export async function loadChildren(tx: Tx, ids: string[]): Promise<SetRow[]> {
  if (ids.length === 0) return [];
  const rows = await tx.select().from(assessmentSets).where(inArray(assessmentSets.id, ids));
  return rows.filter((r) => r.skillCategory !== null).sort((a, b) => bossSkillOrder(a.skillCategory) - bossSkillOrder(b.skillCategory));
}

/** Anak PUBLISHED induk `parentId`, terurut. */
async function publishedChildren(tx: Tx, parentId: string): Promise<SetRow[]> {
  const rows = await tx
    .select()
    .from(assessmentSets)
    .where(and(eq(assessmentSets.parentSetId, parentId), eq(assessmentSets.status, 'PUBLISHED'), eq(assessmentSets.assessmentType, 'BOSS_SECTION')))
    .orderBy(asc(assessmentSets.createdAt));
  return rows
    .filter((r) => r.skillCategory !== null && BOSS_SKILL_ORDER.includes(r.skillCategory as BossSkill))
    .sort((a, b) => bossSkillOrder(a.skillCategory) - bossSkillOrder(b.skillCategory));
}
const hasGateSections = (kids: SetRow[]): boolean =>
  kids.some((k) => k.skillCategory === 'LISTENING') && kids.some((k) => k.skillCategory === 'READING');

/**
 * F-14-01: jaga integritas set Boss. Lebih dari satu anak PUBLISHED per skill, atau lebih dari satu induk PUBLISHED untuk Tier
 * yang sama, membuat gerbang/cooldown ambigu; unique index (migrasi 0009) mencegahnya, guard ini lapis kedua (data lama).
 */
async function assertBossIntegrity(tx: Tx, set: SetRow, kids: SetRow[]): Promise<boolean> {
  const skills = kids.map((k) => k.skillCategory);
  if (new Set(skills).size !== skills.length) {
    logger.error({ setId: set.id }, 'boss_duplicate_child_skill');
    return false;
  }
  const dup = await tx
    .select({ id: assessmentSets.id })
    .from(assessmentSets)
    .where(
      and(
        eq(assessmentSets.assessmentType, 'TIER_BOSS_EXAM'),
        eq(assessmentSets.status, 'PUBLISHED'),
        eq(assessmentSets.tierId, set.tierId!),
        ne(assessmentSets.id, set.id),
      ),
    )
    .limit(1);
  if (dup.length > 0) {
    logger.error({ setId: set.id, otherSetId: dup[0]!.id }, 'boss_duplicate_published_parent');
    return false;
  }
  return true;
}

export const sectionStatesOf = (state: AttemptState): Record<string, BossSectionState> => state.sections ?? {};
export const sectionOrderOf = (state: AttemptState): string[] => state.section_order ?? [];

// ------------------------------------------------------------------ penilaian satu section objektif
/** Jumlah skor jawaban dan poin maksimum soal objektif satu section (sentesimal). */
export function rawMaxOfSection(kid: SetRow, answers: readonly AnswerRow[]): { rawH: number; maxH: number } {
  let maxH = 0;
  for (const q of parseQuestions(kid).values()) if (isObjective(q)) maxH += q.points * 100;
  let rawH = 0;
  for (const a of answers) if (a.assessmentSetId === kid.id) rawH += toH(a.score);
  // F-14-03: set dapat berubah selama attempt berjalan (poin turun/soal dihapus); skor mentah tidak boleh melebihi maksimum.
  return { rawH: Math.min(rawH, maxH), maxH };
}

type EndStatus = 'SUBMITTED' | 'EXPIRED';

/**
 * Tutup satu section: tetapkan `phase = DONE`, tulis `attempt_sections` (skor/band L+R, informatif; skor final dihitung ulang
 * saat submit attempt). Mengembalikan state baru; pemanggil menyimpannya.
 */
export async function closeSection(
  tx: Tx,
  p: { attempt: AttemptRow; state: AttemptState; kid: SetRow; endStatus: EndStatus; answers: readonly AnswerRow[] },
): Promise<AttemptState> {
  const { attempt, kid, endStatus } = p;
  const prev = p.state.sections?.[kid.id] ?? { phase: 'ACTIVE', started_at: null, deadline_at: null };
  const next: AttemptState = { ...p.state, sections: { ...p.state.sections, [kid.id]: { ...prev, phase: 'DONE' } } };
  const skill = kid.skillCategory as BossSkill;
  let patch: { rawScore: string | null; maxScore: string | null; bandScore: string | null } = { rawScore: null, maxScore: null, bandScore: null };
  if (isGateSkill(skill)) {
    const { rawH, maxH } = rawMaxOfSection(kid, p.answers);
    const table = await getActiveTable(tx, skill === 'LISTENING' ? 'LISTENING' : 'READING_ACADEMIC');
    const sc = scoreObjectiveSection(rawH, maxH, table.rows);
    patch = { rawScore: (rawH / 100).toFixed(2), maxScore: (maxH / 100).toFixed(2), bandScore: sc.band.toFixed(1) };
  }
  await tx
    .update(attemptSections)
    .set({ status: endStatus, ...patch })
    .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, kid.id)));
  return next;
}

/** Section `ACTIVE` yang sudah melewati `deadline + 5 s` ditutup (EXPIRED). Mengembalikan state baru bila ada perubahan. */
export async function settleExpiredSections(
  tx: Tx,
  attempt: AttemptRow,
  answers: readonly AnswerRow[],
  now: Date,
): Promise<AttemptState | null> {
  let state = stateOf(attempt);
  let changed = false;
  const expiredIds = sectionOrderOf(state).filter((sid) => {
    const st = state.sections?.[sid];
    return st?.phase === 'ACTIVE' && st.deadline_at !== null && now.getTime() > Date.parse(st.deadline_at) + SECTION_GRACE_MS;
  });
  if (expiredIds.length === 0) return null;
  const kids = new Map((await loadChildren(tx, expiredIds)).map((k) => [k.id, k]));
  for (const sid of expiredIds) {
    const kid = kids.get(sid);
    if (!kid) continue;
    state = await closeSection(tx, { attempt, state, kid, endStatus: 'EXPIRED', answers });
    changed = true;
  }
  return changed ? state : null;
}

// ------------------------------------------------------------------ jawaban (PUT answers) pada Boss
export type BossAnswerGate = { kind: 'ok'; kid: SetRow; sectionStartedAt: number } | { kind: 'expired' };

/**
 * Gerbang `PUT answers` Boss: soal harus milik section `ACTIVE` dan belum lewat `deadline + 5 s`. Bila lewat, section ditutup
 * (EXPIRED, dinilai dari jawaban tersimpan) dan state disimpan; pemanggil mengembalikan hasilnya agar commit, lalu melempar
 * `SECTION_EXPIRED`.
 */
export async function bossAnswerGate(tx: Tx, attempt: AttemptRow, questionId: string, answers: readonly AnswerRow[], now: Date): Promise<BossAnswerGate> {
  const state = stateOf(attempt);
  const sid = state.question_section?.[questionId];
  if (!sid) throw notFound();
  const st = state.sections?.[sid];
  if (!st || st.phase !== 'ACTIVE' || st.deadline_at === null) throw new ApiError('SECTION_NOT_ACTIVE');
  const [kid] = await loadChildren(tx, [sid]);
  if (!kid) throw notFound();
  if (now.getTime() > Date.parse(st.deadline_at) + SECTION_GRACE_MS) {
    const next = await closeSection(tx, { attempt, state, kid, endStatus: 'EXPIRED', answers });
    await tx.update(attempts).set({ state: next }).where(eq(attempts.id, attempt.id));
    return { kind: 'expired' };
  }
  return { kind: 'ok', kid, sectionStartedAt: Date.parse(st.started_at ?? attempt.startedAt.toISOString()) };
}

// ------------------------------------------------------------------ DTO attempt Boss
export async function buildBossAttemptDTO(
  tx: Tx,
  p: { attempt: AttemptRow; set: SetRow; answers: AnswerRow[]; resumed: boolean; now: Date },
): Promise<Attempt> {
  const { attempt, set, answers, now } = p;
  const state = stateOf(attempt);
  const kids = await loadChildren(tx, sectionOrderOf(state));
  const states = sectionStatesOf(state);
  const inProgress = attempt.status === 'IN_PROGRESS';
  const sections = kids.map((k) => sectionDTO(k, states[k.id] ?? { phase: 'PENDING', started_at: null, deadline_at: null }, now));
  const activeKid = kids.find((k) => states[k.id]?.phase === 'ACTIVE') ?? null;

  let questions: Attempt['questions'] = [];
  let sectionAnswers: Attempt['answers'] = [];
  let current = 0;
  let passage: string | null = null;
  let listening: Attempt['listening'] = null;
  if (activeKid && inProgress) {
    const qmap = parseQuestions(activeKid);
    const ids = state.order.filter((qid) => state.question_section?.[qid] === activeKid.id);
    questions = ids.flatMap((qid) => {
      const q = qmap.get(qid);
      return q ? [toPublicQuestion(q, state.served[qid] ?? {})] : [];
    });
    const byQ = new Map(answers.filter((a) => a.assessmentSetId === activeKid.id).map((a) => [a.questionId, a]));
    sectionAnswers = ids.flatMap((qid) => {
      const a = byQ.get(qid);
      return a ? [{ question_id: qid, response: (a.response ?? {}) as Record<string, unknown>, feedback: null }] : [];
    });
    current = ids.length;
    for (let i = 0; i < ids.length; i++) {
      const q = qmap.get(ids[i]!);
      if (q && !isAiTask(q) && !byQ.has(q.question_id)) {
        current = i;
        break;
      }
    }
    passage = activeKid.readingPassageMarkdown;
    const audio = await loadAudio(tx, activeKid);
    if (activeKid.listeningAssetId && audio?.mimeType) {
      listening = { audio_url: `/api/v1/attempts/${attempt.id}/audio?section=${activeKid.id}`, mime_type: audio.mimeType, duration_sec: audio.durationSec ?? 0 };
    }
  }
  const remaining = attempt.deadlineAt ? Math.max(0, Math.ceil((attempt.deadlineAt.getTime() - now.getTime()) / 1000)) : null;
  return {
    id: attempt.id,
    assessment_set_id: attempt.assessmentSetId,
    assessment_type: set.assessmentType,
    mode: attempt.mode,
    status: attempt.status === 'AWAITING_GRADING' ? 'SUBMITTED' : attempt.status,
    title: set.title,
    started_at: attempt.startedAt.toISOString(),
    server_now: now.toISOString(),
    deadline_at: attempt.deadlineAt ? attempt.deadlineAt.toISOString() : null,
    remaining_seconds: remaining,
    time_limit_seconds: kids.reduce((a, k) => a + k.timeLimitSeconds, 0),
    pass_percent: state.pass_percent,
    question_count: kids.reduce((a, k) => a + k.questionCount, 0),
    answered_count: answers.length,
    current_index: current,
    passage_markdown: passage,
    listening,
    questions,
    answers: sectionAnswers,
    resumed: p.resumed,
    sections,
  };
}

/** Payload `sections/{id}/start` untuk section yang `ACTIVE` pada `state`. */
export async function buildSectionStartPayload(tx: Tx, p: { attempt: AttemptRow; state: AttemptState; kid: SetRow; answers: AnswerRow[]; now: Date }) {
  const { attempt, state, kid, now } = p;
  const st = state.sections![kid.id]!;
  const qmap = parseQuestions(kid);
  const ids = state.order.filter((qid) => state.question_section?.[qid] === kid.id);
  const byQ = new Map(p.answers.filter((a) => a.assessmentSetId === kid.id).map((a) => [a.questionId, a]));
  const audio = await loadAudio(tx, kid);
  return {
    section: sectionDTO(kid, st, now),
    passage_markdown: kid.readingPassageMarkdown,
    listening:
      kid.listeningAssetId && audio?.mimeType
        ? { audio_url: `/api/v1/attempts/${attempt.id}/audio?section=${kid.id}`, mime_type: audio.mimeType, duration_sec: audio.durationSec ?? 0 }
        : null,
    questions: ids.flatMap((qid) => {
      const q = qmap.get(qid);
      return q ? [toPublicQuestion(q, state.served[qid] ?? {})] : [];
    }),
    answers: ids.flatMap((qid) => {
      const a = byQ.get(qid);
      return a ? [{ question_id: qid, response: (a.response ?? {}) as Record<string, unknown>, feedback: null }] : [];
    }),
    server_now: now.toISOString(),
  };
}

/** F-14-02: `deadline_at` section = min(mulai + batas waktu section, `deadline_at` attempt). */
export const sectionDeadline = (now: Date, limitSeconds: number, attemptDeadline: Date | null): Date => {
  const own = now.getTime() + limitSeconds * 1000;
  return new Date(attemptDeadline ? Math.min(own, attemptDeadline.getTime()) : own);
};

/** Aktifkan section `PENDING`: soal tersaji (acak + pemetaan opsi) digabung ke `state`. */
export function activateSection(state: AttemptState, attemptId: string, kid: SetRow, now: Date, attemptDeadline: Date | null = null): AttemptState {
  const qs = [...parseQuestions(kid).values()];
  const skill = kid.skillCategory as BossSkill;
  const served = buildInitialState(
    attemptId,
    qs,
    { limit: null, keepOrder: !isGateSkill(skill) || Boolean(kid.readingPassageMarkdown) || Boolean(kid.listeningAssetId), seed: `${state.rng_seed ?? ''}:${kid.id}` },
    null,
    now,
  );
  return {
    ...state,
    order: [...state.order, ...served.order],
    served: { ...state.served, ...served.served },
    sections: {
      ...state.sections,
      [kid.id]: { phase: 'ACTIVE', started_at: now.toISOString(), deadline_at: sectionDeadline(now, kid.timeLimitSeconds, attemptDeadline).toISOString() },
    },
  };
}

// ------------------------------------------------------------------ penilaian akhir (handler.score)
export interface BossSectionResult {
  skill: BossSkill;
  set_id: string;
  raw_score: number | null;
  max_score: number | null;
  raw_40: number | null;
  band: number | null;
  status: 'SUBMITTED' | 'EXPIRED';
  counts_toward_gate: boolean;
}
export interface BossScoring {
  sections: BossSectionResult[];
  bossBand: number;
  percentH: number;
  percentDisplayH: number;
  passed: boolean;
  gate: { type: 'PERCENT' | 'BAND'; value: number };
  tierId: string;
  tierNumber: number;
  bandTableIds: { listening: string; reading_academic: string };
}

async function scoreBoss(
  tx: Tx,
  p: { attempt: AttemptRow; answers: AnswerRow[]; status: 'GRADED' | 'EXPIRED'; submittedAt: Date },
): Promise<ScoreSummary> {
  const { attempt, answers } = p;
  let state = stateOf(attempt);
  const frozen = state.boss;
  if (!frozen) throw new Error('state Boss tidak memuat gerbang');
  const kids = await loadChildren(tx, sectionOrderOf(state));
  const [lt, rt] = [await getActiveTable(tx, 'LISTENING'), await getActiveTable(tx, 'READING_ACADEMIC')];
  const rows = await tx.select().from(attemptSections).where(eq(attemptSections.attemptId, attempt.id));
  const rowBySet = new Map(rows.map((r) => [r.assessmentSetId, r]));

  const results: BossSectionResult[] = [];
  const scores: Partial<Record<'LISTENING' | 'READING', SectionScore>> = {};
  for (const kid of kids) {
    const skill = kid.skillCategory as BossSkill;
    const st = state.sections?.[kid.id] ?? { phase: 'PENDING', started_at: null, deadline_at: null };
    let endStatus: EndStatus;
    if (st.phase === 'DONE') endStatus = rowBySet.get(kid.id)?.status === 'EXPIRED' ? 'EXPIRED' : 'SUBMITTED';
    else if (st.phase === 'PENDING') endStatus = 'EXPIRED'; // tidak pernah dimulai
    else endStatus = p.status === 'EXPIRED' || (st.deadline_at !== null && p.submittedAt.getTime() > Date.parse(st.deadline_at) + GRACE_MS) ? 'EXPIRED' : 'SUBMITTED';

    if (isGateSkill(skill)) {
      const { rawH, maxH } = rawMaxOfSection(kid, answers);
      const sc = scoreObjectiveSection(rawH, maxH, skill === 'LISTENING' ? lt.rows : rt.rows);
      scores[skill as 'LISTENING' | 'READING'] = sc;
      results.push({ skill, set_id: kid.id, raw_score: rawH / 100, max_score: maxH / 100, raw_40: sc.raw40, band: sc.band, status: endStatus, counts_toward_gate: true });
      await tx
        .update(attemptSections)
        .set({ rawScore: (rawH / 100).toFixed(2), maxScore: (maxH / 100).toFixed(2), bandScore: sc.band.toFixed(1), status: endStatus === 'SUBMITTED' ? 'GRADED' : 'EXPIRED' })
        .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, kid.id)));
    } else {
      results.push({ skill, set_id: kid.id, raw_score: null, max_score: null, raw_40: null, band: null, status: endStatus, counts_toward_gate: false });
      await tx
        .update(attemptSections)
        .set({ status: endStatus })
        .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.assessmentSetId, kid.id)));
    }
    if (st.phase !== 'DONE') state = { ...state, sections: { ...state.sections, [kid.id]: { ...st, phase: 'DONE' } } };
  }
  const l = scores.LISTENING;
  const r = scores.READING;
  if (!l || !r) throw new Error('set Boss tanpa section Listening/Reading');
  await tx.update(attempts).set({ state }).where(eq(attempts.id, attempt.id));

  const gate = evaluateGate({ type: frozen.gate_type, value: frozen.gate_value }, l, r);
  const rawH = l.rawH + r.rawH;
  const maxH = l.maxH + r.maxH;
  const passPercent = frozen.gate_type === 'PERCENT' ? frozen.gate_value : null;
  const detail: BossScoring = {
    sections: results,
    bossBand: gate.bossBand,
    percentH: gate.percentH,
    percentDisplayH: displayPercentHundredths(rawH, maxH, passPercent, gate.passed),
    passed: gate.passed,
    gate: { type: frozen.gate_type, value: frozen.gate_value },
    tierId: frozen.tier_id,
    tierNumber: frozen.tier_number,
    bandTableIds: { listening: lt.tableId, reading_academic: rt.tableId },
  };
  const perSkill = (['LISTENING', 'READING'] as const).map((skill) => {
    const sc = skill === 'LISTENING' ? l : r;
    return { skill: skill as string, rawH: sc.rawH, maxH: sc.maxH, percentH: percentHundredths(sc.rawH, sc.maxH) };
  });
  return {
    rawH,
    maxH,
    percentH: gate.percentH,
    percentDisplayH: detail.percentDisplayH,
    passPercent,
    passed: gate.passed,
    perSkill,
    bandScore: gate.bossBand,
    detail,
  };
}

// ------------------------------------------------------------------ handler tipe
const gateText = (type: 'PERCENT' | 'BAND', value: number): string =>
  type === 'BAND'
    ? `Lulus bila band rata-rata Listening dan Reading minimal ${value.toFixed(1)}.`
    : `Lulus bila akurasi gabungan Listening dan Reading minimal ${value}%.`;

export const bossHandler: AssessmentTypeHandler = {
  async start({ tx, userId, set, now }) {
    if (!set.tierId) throw notFound();
    const snap = await recomputeStatuses(tx, userId);
    const tier = snap.tiers.find((t) => t.id === set.tierId);
    if (!tier) throw notFound();
    const kids = await publishedChildren(tx, set.id);
    if (!hasGateSections(kids)) throw notFound(); // set tanpa Listening+Reading tidak dapat dimulai
    if (!(await assertBossIntegrity(tx, set, kids))) throw new ApiError('INTERNAL_ERROR'); // F-14-01

    const st = bossState(tier, true);
    if (st.blocked === 'TIER_LOCKED' || st.blocked === 'MODULES_INCOMPLETE') {
      throw new ApiError('BOSS_NOT_AVAILABLE', { details: [{ path: 'assessment_set_id', code: st.blocked, message: 'Boss Stage belum tersedia.' }] });
    }
    if (st.blocked === 'ALREADY_PASSED') throw new ApiError('BOSS_ALREADY_PASSED');
    assertGateOpen(await loadAttemptGate(tx, userId, set.id, now), now);

    const frozen = { tier_id: tier.id, tier_number: tier.number, gate_type: tier.gateType, gate_value: tier.gateValue };
    const questionSection: Record<string, string> = {};
    for (const kid of kids) {
      for (const qid of parseQuestions(kid).keys()) {
        if (questionSection[qid]) {
          logger.error({ setId: set.id, question_id: qid }, 'boss_duplicate_question_id'); // validator SPEC-004 seharusnya menolak
          throw new ApiError('INTERNAL_ERROR');
        }
        questionSection[qid] = kid.id;
      }
    }
    return {
      mode: 'EXAM',
      passPercent: tier.gateType === 'PERCENT' ? tier.gateValue : null,
      questionLimit: null,
      keepOrder: true,
      deadlineSeconds: bossDeadlineSeconds(kids.map((k) => k.timeLimitSeconds)),
      buildState: () => ({
        v: 1,
        rng_seed: newRngSeed(),
        order: [],
        last_resume_at: now.toISOString(),
        pass_percent: tier.gateType === 'PERCENT' ? tier.gateValue : null,
        served: {},
        boss: frozen,
        sections: Object.fromEntries(kids.map((k) => [k.id, { phase: 'PENDING' as const, started_at: null, deadline_at: null }])),
        section_order: kids.map((k) => k.id),
        question_section: questionSection,
      }),
      afterCreate: async (txx, attempt) => {
        await txx.insert(attemptSections).values(
          kids.map((k) => ({ attemptId: attempt.id, assessmentSetId: k.id, skill: k.skillCategory!, status: 'IN_PROGRESS' as const })),
        );
      },
    };
  },

  async intro({ tx, userId, set, now }): Promise<ExamIntroPart> {
    if (!set.tierId) throw notFound();
    const snap = await recomputeStatuses(tx, userId);
    const tier = snap.tiers.find((t) => t.id === set.tierId);
    if (!tier) throw notFound();
    const kids = await publishedChildren(tx, set.id);
    if (!hasGateSections(kids)) throw notFound();
    if (!(await assertBossIntegrity(tx, set, kids))) throw notFound(); // F-14-01: set ambigu tidak ditampilkan
    const st = bossState(tier, true);
    const gate = await loadAttemptGate(tx, userId, set.id, now);
    const blocked =
      st.blocked === 'TIER_LOCKED' || st.blocked === 'MODULES_INCOMPLETE'
        ? st.blocked
        : st.blocked === 'ALREADY_PASSED'
          ? ('BOSS_ALREADY_PASSED' as const)
          : gate.cooldownUntil
            ? ('COOLDOWN_ACTIVE' as const)
            : gate.dailyBlocked
              ? ('DAILY_ATTEMPT_LIMIT' as const)
              : null;

    // Bila ada attempt berjalan, tampilkan fase section sebenarnya (resume); selain itu semua PENDING.
    const [active] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.assessmentSetId, set.id), eq(attempts.status, 'IN_PROGRESS')))
      .limit(1);
    const states = active ? sectionStatesOf(stateOf(active)) : {};
    const sections = kids.map((k) => sectionDTO(k, states[k.id] ?? { phase: 'PENDING', started_at: null, deadline_at: null }, now));

    const [last] = await tx
      .select({ passed: attempts.passed, scorePercent: attempts.scorePercent, bandScore: attempts.bandScore, submittedAt: attempts.submittedAt })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.assessmentSetId, set.id), inArray(attempts.status, ['GRADED', 'EXPIRED', 'SUBMITTED'])))
      .orderBy(desc(attempts.submittedAt))
      .limit(1);

    const total = kids.reduce((a, k) => a + k.timeLimitSeconds, 0);
    return {
      scope: { kind: 'TIER', id: tier.id, label: tierLabel(tier) },
      threshold: { kind: tier.gateType, value: tier.gateValue },
      rules: [
        'Ujian terdiri dari section berurutan: Listening, Reading, Writing, Speaking (sesuai yang tersedia).',
        gateText(tier.gateType, tier.gateValue),
        'Setiap section punya waktu sendiri yang berjalan terus walau Anda keluar halaman; section yang selesai tidak dapat diulang.',
        'Writing dan Speaking dinilai sebagai masukan dan tidak menentukan kelulusan.',
        gate.cooldownMinutes > 0
          ? `Jika belum lulus, tidak ada penalti; Anda dapat mencoba lagi setelah ${gate.cooldownMinutes} menit (maksimal ${gate.maxPerDay} kali per 24 jam).`
          : `Jika belum lulus, tidak ada penalti; Anda dapat mencoba lagi (maksimal ${gate.maxPerDay} kali per 24 jam).`,
      ],
      blocked_reason: blocked,
      cooldown: {
        next_allowed_at: gate.cooldownUntil ? gate.cooldownUntil.toISOString() : null,
        attempts_in_window: gate.attemptsInWindow,
        max_attempts: gate.maxPerDay,
      },
      boss: {
        tier_number: tier.number,
        gate: { type: tier.gateType, value: tier.gateValue },
        sections,
        total_time_limit_seconds: total,
        last_result: last?.submittedAt
          ? { passed: last.passed === true, score_percent: Number(last.scorePercent ?? 0), boss_band: Number(last.bandScore ?? 0), at: last.submittedAt.toISOString() }
          : null,
        advisory_note: ADVISORY,
      },
      placement: null,
      overrides: {
        time_limit_seconds: total,
        question_count: kids.reduce((a, k) => a + k.questionCount, 0),
        requires_audio: kids.some((k) => k.listeningAssetId !== null),
        requires_microphone: kids.some((k) => hasSpeaking(k.questionsJson)),
      },
    };
  },

  score: (ctx) => scoreBoss(ctx.tx, ctx),

  async onFinish({ tx, userId, attempt, set, result }) {
    const d = result.detail as BossScoring;
    const passed = d.passed;
    const applied = await applyBossResult(tx, userId, { tierId: d.tierId, percent: d.percentDisplayH / 100, band: d.bossBand, passed });
    await writeAudit(tx, {
      actorUserId: userId,
      action: passed ? 'BOSS_PASSED' : 'BOSS_FAILED',
      entityType: 'attempt',
      entityId: attempt.id,
      metadata: { tier_number: d.tierNumber, boss_band: d.bossBand, percent: d.percentDisplayH / 100 },
    });
    const submittedAt = attempt.submittedAt ?? nowDate();
    const gate = await loadAttemptGate(tx, userId, set.id, submittedAt);
    const inWindow = await countAttemptsInWindow(tx, userId, set.id, submittedAt);
    const nextAllowed = !passed && gate.cooldownMinutes > 0 ? new Date(submittedAt.getTime() + gate.cooldownMinutes * 60_000) : null;
    const unlocked = passed ? applied.unlocked : [];
    return {
      progress: null,
      boss: {
        passed,
        gate: d.gate,
        percent: d.percentDisplayH / 100,
        boss_band: d.bossBand,
        // Turunan D8 (band W/S, submission, estimasi, pending_ai) dihitung saat pembacaan (decorateBossResult).
        sections: d.sections.map((s) => ({
          skill: s.skill,
          set_id: s.set_id,
          raw_score: s.raw_score,
          max_score: s.max_score,
          raw_40: s.raw_40,
          band: s.band,
          status: s.status,
          counts_toward_gate: s.counts_toward_gate,
        })),
        band_table_ids: d.bandTableIds,
        tier: { id: d.tierId, tier_number: d.tierNumber },
        next_tier_unlocked: unlocked.some((u) => u.kind === 'TIER'),
        unlocked,
        retry: { next_allowed_at: nextAllowed ? nextAllowed.toISOString() : null, attempts_remaining_today: Math.max(0, gate.maxPerDay - inWindow) },
        disclaimer: DISCLAIMER,
      },
    };
  },
};

// ------------------------------------------------------------------ hasil: D8 dan submission W/S
interface StoredBossSection {
  skill: BossSkill;
  set_id: string;
  raw_score: number | null;
  max_score: number | null;
  raw_40: number | null;
  band: number | null;
  status: AttemptResult['attempt']['status'];
  counts_toward_gate: boolean;
}
const PENDING_STATUSES = new Set(['RECEIVED', 'TRANSCRIBING', 'GRADING']);

/**
 * Lengkapi `AttemptResult` Boss: submission W/S per section, band AI (D8), `pending_ai`, `overall_band_estimate` (dihitung ulang
 * tiap panggilan; tidak pernah mengubah `passed`) dan `per_skill` L+R. `review` selalu null (SPEC-006 D10).
 */
export async function decorateBossResult(tx: Tx, dto: AttemptResult, attempt: AttemptRow): Promise<AttemptResult> {
  const stored = (attempt.resultJson as { boss?: Record<string, unknown> | null } | null)?.boss;
  if (!stored) return dto;
  const state = stateOf(attempt);
  const base = (stored.sections as StoredBossSection[]) ?? [];
  const sectionOfQuestion = state.question_section ?? {};

  const subs = await tx.select().from(submissions).where(eq(submissions.attemptId, attempt.id)).orderBy(asc(submissions.createdAt), asc(submissions.id));
  const evals = subs.length
    ? await tx.select().from(aiEvaluations).where(inArray(aiEvaluations.submissionId, subs.map((s) => s.id))).orderBy(desc(aiEvaluations.runNumber))
    : [];
  const evalsBySub = new Map<string, typeof evals>();
  for (const e of evals) evalsBySub.set(e.submissionId, [...(evalsBySub.get(e.submissionId) ?? []), e]);

  const idsBySet = new Map<string, string[]>();
  const bestBySet = new Map<string, { band: number; at: number; submissionId: string }>();
  const latestPendingBySet = new Map<string, boolean>(); // status submission terbaru per section (F-14-09)
  let pendingAi = 0;
  for (const s of subs) {
    const sid = s.questionId ? sectionOfQuestion[s.questionId] : undefined;
    if (!sid) continue;
    idsBySet.set(sid, [...(idsBySet.get(sid) ?? []), s.id]);
    latestPendingBySet.set(sid, PENDING_STATUSES.has(s.status)); // subs urut created_at naik: yang terakhir menang
    if (PENDING_STATUSES.has(s.status)) pendingAi++;
    const good = (evalsBySub.get(s.id) ?? []).find((e) =>
      countsForEstimate({
        method: e.method,
        overallBand: e.overallBand === null ? null : Number(e.overallBand),
        injectionSuspected: (e.flags as { injection_suspected?: unknown } | null)?.injection_suspected === true,
      }),
    );
    if (good) {
      const cur = bestBySet.get(sid);
      const at = good.createdAt.getTime();
      if (!cur || at > cur.at) bestBySet.set(sid, { band: Number(good.overallBand), at, submissionId: s.id });
    }
  }

  const sections = base.map((b) => {
    const gateSkill = isGateSkill(b.skill);
    // F-14-08: `submission_ids` tetap urut naik (kompatibel); `latest_submission_id` = yang terakhir. F-14-09: ai_status dari submission terbaru.
    const ids = idsBySet.get(b.set_id) ?? [];
    const best = bestBySet.get(b.set_id);
    const aiStatus: 'NOT_SUBMITTED' | 'PENDING' | 'GRADED' | 'NO_BAND' | null = gateSkill
      ? null
      : ids.length === 0
        ? 'NOT_SUBMITTED'
        : latestPendingBySet.get(b.set_id)
          ? 'PENDING'
          : best
            ? 'GRADED'
            : 'NO_BAND';
    return {
      skill: b.skill,
      raw_score: b.raw_score,
      max_score: b.max_score,
      raw_40: b.raw_40,
      band: gateSkill ? b.band : (best?.band ?? null),
      status: b.status,
      submission_ids: ids,
      latest_submission_id: gateSkill ? null : (ids[ids.length - 1] ?? null),
      graded_submission_id: gateSkill ? null : (best?.submissionId ?? null),
      ai_status: aiStatus,
      counts_toward_gate: b.counts_toward_gate,
    };
  });
  const bandOf = (skill: BossSkill): number | null => sections.find((s) => s.skill === skill)?.band ?? null;
  const rest = Object.fromEntries(Object.entries(stored).filter(([k]) => k !== 'sections'));
  const perSkill = base
    .filter((b) => isGateSkill(b.skill))
    .map((b) => {
      const rawH = Math.round((b.raw_score ?? 0) * 100);
      const maxH = Math.round((b.max_score ?? 0) * 100);
      return { skill: b.skill, raw_score: b.raw_score ?? 0, max_score: b.max_score ?? 0, score_percent: percentHundredths(rawH, maxH) / 100 };
    });
  return {
    ...dto,
    per_skill: perSkill,
    review: null,
    boss: {
      ...rest,
      sections,
      overall_band_estimate: overallEstimate(bandOf('LISTENING'), bandOf('READING'), bandOf('WRITING'), bandOf('SPEAKING')),
      pending_ai: pendingAi,
    },
  };
}
