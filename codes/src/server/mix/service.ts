/**
 * Layanan Bank Soal + Mix Builder (SPEC-022): daftar bank, pembuatan sesi campuran, dan ringkasan hasil `MIX_PRACTICE`.
 * Pemilihan soal ada di `select.ts` (murni); berkas ini membaca DB, memanggil pemilih, dan membekukan snapshot ke
 * `attempts.state` (skema `mix.v1`).
 */
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  assessmentSets,
  attemptAnswers,
  attempts,
  submissions,
  userSkillScores,
} from '@/db/schema';
import { QuestionSchema, type Question } from '@/contracts/content';
import { isListeningBankKind, type BankListItem } from '@/contracts/question-bank';
import { MIX_STATE_SCHEMA, type ActiveMixSession, type MixRequest, type MixResult, type MixSession, type MixState, type MixStateQuestion } from '@/contracts/mix';
import type { Db, DbOrTx, Tx } from '../db';
import { execute } from '../db';
import { nowDate } from '../clock';
import { ApiError } from '../http/errors';
import { logger } from '../logger';
import { newRngSeed, seededCsprng } from '../attempts/prng';
import { serveQuestion, type Served } from '../attempts/engine';
import type { AnswerRow } from '../attempts/dto';
import { splitPassages } from '../content/passages';
import { loadDueReviewPool } from '../review/service';
import {
  passageKeyOf,
  rngFromSeed,
  selectMix,
  type HistoryAnswer,
  type MixHistory,
  type PoolQuestion,
  type RadarEntry,
} from './select';

type BankRow = typeof assessmentSets.$inferSelect;

const SKILL_ORDER = ['GRAMMAR', 'VOCAB', 'READING', 'WRITING', 'SPEAKING', 'LISTENING'] as const;
const Questions = z.array(QuestionSchema);

function parseBankQuestions(bank: BankRow): Question[] | null {
  const parsed = Questions.safeParse(bank.questionsJson);
  if (!parsed.success) {
    logger.error({ bank: bank.bankCode, issues: parsed.error.issues.length }, 'bank_questions_invalid');
    return null; // bank rusak dilewati, bukan menggagalkan seluruh permintaan
  }
  return parsed.data;
}

const publishedBanks = (db: DbOrTx) =>
  db
    .select()
    .from(assessmentSets)
    .where(and(eq(assessmentSets.assessmentType, 'QUESTION_BANK'), eq(assessmentSets.status, 'PUBLISHED'), eq(assessmentSets.examModule, 'GENERAL_TRAINING')))
    .orderBy(asc(assessmentSets.bankCode));

// ---------------------------------------------------------------- GET /banks
export async function listBanks(db: DbOrTx): Promise<BankListItem[]> {
  const rows = await publishedBanks(db);
  const out: BankListItem[] = [];
  for (const b of rows) {
    const qs = parseBankQuestions(b);
    if (!qs) continue;
    const counts = new Map<string, number>();
    for (const q of qs) counts.set(q.question_type, (counts.get(q.question_type) ?? 0) + 1);
    const skill = (b.skillCategory ?? qs[0]!.skill) as BankListItem['skill'];
    out.push({
      bank_code: b.bankCode!,
      bank_kind: b.bankKind as BankListItem['bank_kind'],
      title: b.title,
      skill,
      question_count: qs.length,
      question_types: [...counts]
        .map(([question_type, count]) => ({ question_type, count }))
        .sort((a, b2) => b2.count - a.count || a.question_type.localeCompare(b2.question_type)),
      has_passage: skill === 'READING' && Boolean(b.readingPassageMarkdown),
      selectable_in_mix: skill !== 'LISTENING' && !isListeningBankKind(b.bankKind ?? ''),
    });
  }
  return out.sort((a, b) => SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill) || a.bank_code.localeCompare(b.bank_code));
}

// ---------------------------------------------------------------- pool
async function loadPool(tx: Tx): Promise<{ pool: PoolQuestion[]; banks: Map<string, BankRow> }> {
  const banks = new Map<string, BankRow>();
  const pool: PoolQuestion[] = [];
  for (const b of await publishedBanks(tx)) {
    if (b.skillCategory === 'LISTENING' || isListeningBankKind(b.bankKind ?? '')) continue;
    const qs = parseBankQuestions(b);
    if (!qs) continue;
    banks.set(b.id, b);
    qs.forEach((q, position) => {
      pool.push({
        question_id: q.question_id,
        bank_set_id: b.id,
        bank_code: b.bankCode!,
        bank_kind: b.bankKind!,
        bank_version: b.version,
        skill: q.skill,
        question_type: q.question_type,
        difficulty: q.difficulty ?? null,
        passage_no: q.passage_no ?? null,
        position,
        question: q,
      });
    });
  }
  return { pool, banks };
}

async function loadRadar(tx: Tx, userId: string): Promise<RadarEntry[]> {
  const rows = await tx
    .select({ skill: userSkillScores.skill, band: userSkillScores.estimatedBand })
    .from(userSkillScores)
    .where(eq(userSkillScores.userId, userId));
  return rows.map((r) => ({ skill: r.skill, estimated_band: r.band === null ? null : Number(r.band) }));
}

async function loadHistory(tx: Tx, userId: string, nowMs: number): Promise<MixHistory> {
  const rows = await tx
    .select({
      questionId: attemptAnswers.questionId,
      questionType: attemptAnswers.questionType,
      isCorrect: attemptAnswers.isCorrect,
      answeredAt: attemptAnswers.answeredAt,
      status: attempts.status,
    })
    .from(attemptAnswers)
    .innerJoin(attempts, eq(attemptAnswers.attemptId, attempts.id))
    .where(and(eq(attempts.userId, userId), isNotNull(attemptAnswers.isCorrect)));
  const answers: HistoryAnswer[] = rows.map((r) => ({
    question_id: r.questionId,
    question_type: r.questionType,
    is_correct: r.isCorrect,
    answered_at_ms: r.answeredAt.getTime(),
    attempt_final: r.status === 'GRADED' || r.status === 'EXPIRED',
  }));
  return { answers, now_ms: nowMs };
}

// ---------------------------------------------------------------- POST /mix-sessions
export async function createMixSession(db: Db, userId: string, req: MixRequest): Promise<MixSession> {
  return db.transaction(async (tx) => {
    const now = nowDate();

    // Keputusan Analyst #2: sesi baru meng-ABANDON sesi campuran IN_PROGRESS lama (transaksi yang sama).
    await execute(
      tx,
      sql`UPDATE attempts SET status = 'ABANDONED', updated_at = ${now}
          WHERE user_id = ${userId} AND assessment_type = 'MIX_PRACTICE' AND status = 'IN_PROGRESS'`,
    );

    let sel: { questions: PoolQuestion[] };
    let banks: Map<string, BankRow>;
    if (req.mode === 'REVIEW_DUE') {
      // SPEC-026 D4: soal jatuh tempo pengulangan berjarak; `count` hanya batas atas.
      const due = await loadDueReviewPool(tx, userId, req.count);
      if (due.questions.length === 0) {
        throw new ApiError('MIX_NOT_ENOUGH_QUESTIONS', {
          details: [{ path: 'count', code: 'max_available:0', message: 'Belum ada soal yang jatuh tempo untuk diulang.' }],
        });
      }
      sel = { questions: due.questions };
      banks = due.sets;
    } else {
      const loaded = await loadPool(tx);
      banks = loaded.banks;
      const auto = req.mode === 'AUTO_WEAKNESS';
      const radar = auto ? await loadRadar(tx, userId) : [];
      const history: MixHistory = auto ? await loadHistory(tx, userId, now.getTime()) : { answers: [], now_ms: now.getTime() };
      // Tanpa seed: angka acak CSPRNG; seed hanya memengaruhi penarikan soal (D5.6).
      const rng = rngFromSeed(req.seed ?? randomBytes(16).toString('hex'));
      const picked = selectMix(loaded.pool, { ...req, mode: req.mode }, radar, history, rng);
      if (!picked.ok) {
        throw new ApiError('MIX_NOT_ENOUGH_QUESTIONS', {
          details: [{ path: 'count', code: `max_available:${picked.max_available}`, message: `Hanya ${picked.max_available} soal tersedia untuk filter ini.` }],
        });
      }
      sel = picked;
    }

    // Urutan opsi: seed CSPRNG rahasia terpisah dari `seed` permintaan (disimpan di state, tidak dikirim ke klien).
    const rngSeed = newRngSeed();
    const shuffle = seededCsprng(rngSeed);
    const served: Record<string, Served> = {};
    const entries: MixStateQuestion[] = sel.questions.map((q, i) => {
      const s = serveQuestion(q.question, shuffle);
      served[q.question_id] = s;
      return {
        position: i + 1,
        question_id: q.question_id,
        bank_set_id: q.bank_set_id,
        bank_code: q.bank_code,
        bank_version: q.bank_version,
        skill: q.skill,
        question_type: q.question_type,
        passage_no: q.passage_no,
        option_order: s.option_ids ?? s.right_choice_ids ?? s.segment_ids ?? null,
        question: q.question,
      };
    });

    const passages: MixState['passages'] = [];
    const seen = new Set<string>();
    for (const q of sel.questions) {
      if (q.skill !== 'READING' || q.passage_no === null) continue;
      const key = passageKeyOf(q);
      if (seen.has(key)) continue;
      seen.add(key);
      const md = splitPassages(banks.get(q.bank_set_id)?.readingPassageMarkdown ?? '')[q.passage_no - 1];
      if (md === undefined) {
        logger.error({ bank: q.bank_code, passage: q.passage_no }, 'mix_passage_missing');
        throw new ApiError('INTERNAL_ERROR');
      }
      passages.push({ bank_set_id: q.bank_set_id, passage_no: q.passage_no, markdown: md });
    }

    const mixState: MixState = {
      schema: MIX_STATE_SCHEMA,
      mode: req.mode,
      rng_seed: rngSeed,
      filters: {
        skills: [...(req.skills ?? ['GRAMMAR', 'VOCAB', 'READING', 'WRITING', 'SPEAKING'])],
        bank_kinds: [...(req.bank_kinds ?? [])],
        question_types: [...(req.question_types ?? [])],
        difficulty_min: req.difficulty_min ?? 1,
        difficulty_max: req.difficulty_max ?? 5,
      },
      passages,
      questions: entries,
    };
    // Bidang mesin soal (AttemptState) berdampingan dengan bidang mix.v1.
    const state = {
      ...mixState,
      v: 1 as const,
      order: entries.map((e) => e.question_id),
      last_resume_at: now.toISOString(),
      pass_percent: null,
      served,
    };

    const [row] = await tx
      .insert(attempts)
      .values({
        userId,
        assessmentSetId: null,
        assessmentType: 'MIX_PRACTICE',
        assessmentVersion: 0,
        mode: 'PRACTICE',
        status: 'IN_PROGRESS',
        startedAt: now,
        deadlineAt: null,
        state,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: attempts.id });

    return {
      attempt_id: row!.id,
      question_count: entries.length,
      mode: req.mode,
      passage_count: passages.length,
      ai_item_count: entries.filter((e) => e.skill === 'WRITING' || e.skill === 'SPEAKING').length,
    };
  });
}

// ---------------------------------------------------------------- GET /mix-sessions/active
export async function getActiveMixSession(db: DbOrTx, userId: string): Promise<ActiveMixSession | null> {
  const [a] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.assessmentType, 'MIX_PRACTICE'), eq(attempts.status, 'IN_PROGRESS')))
    .limit(1);
  if (!a) return null;
  const st = a.state as unknown as MixState;
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)` })
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, a.id))) as [{ n: number }];
  return { attempt_id: a.id, mode: st.mode, question_count: st.questions.length, answered_count: Number(n), started_at: a.startedAt.toISOString() };
}

// ---------------------------------------------------------------- hasil (`data.mix`)
const pct = (correct: number, answered: number): number => (answered === 0 ? 0 : Math.round((correct * 10000) / answered) / 100);

export async function buildMixResult(tx: DbOrTx, attempt: { id: string; userId: string }, state: MixState, answers: readonly AnswerRow[]): Promise<MixResult> {
  const bySkill = new Map<string, { answered: number; correct: number }>();
  const byType = new Map<string, { answered: number; correct: number }>();
  const bump = (m: Map<string, { answered: number; correct: number }>, k: string, ok: boolean) => {
    const e = m.get(k) ?? { answered: 0, correct: 0 };
    e.answered++;
    if (ok) e.correct++;
    m.set(k, e);
  };
  const entry = new Map(state.questions.map((q) => [q.question_id, q]));
  for (const a of answers) {
    if (a.isCorrect === null) continue; // hanya soal objektif yang dijawab
    const q = entry.get(a.questionId);
    if (!q) continue;
    bump(bySkill, q.skill, a.isCorrect === true);
    bump(byType, q.question_type, a.isCorrect === true);
  }
  const rank = (s: string) => SKILL_ORDER.indexOf(s as (typeof SKILL_ORDER)[number]);
  const per_skill = [...bySkill]
    .map(([skill, v]) => ({ skill: skill as MixResult['per_skill'][number]['skill'], answered: v.answered, correct: v.correct, percent: pct(v.correct, v.answered) }))
    .sort((a, b) => rank(a.skill) - rank(b.skill));
  const per_question_type = [...byType]
    .map(([question_type, v]) => ({ question_type, answered: v.answered, correct: v.correct, percent: pct(v.correct, v.answered) }))
    .sort((a, b) => a.question_type.localeCompare(b.question_type));

  // Item AI: submission terbaru per soal (utamakan yang bukan FAILED).
  const aiQs = state.questions.filter((q) => q.skill === 'WRITING' || q.skill === 'SPEAKING');
  const subs = aiQs.length
    ? await tx
        .select({ id: submissions.id, questionId: submissions.questionId, status: submissions.status })
        .from(submissions)
        .where(and(eq(submissions.attemptId, attempt.id), eq(submissions.userId, attempt.userId)))
        .orderBy(desc(submissions.createdAt))
    : [];
  const ai_items: MixResult['ai_items'] = aiQs.map((q) => {
    const mine = subs.filter((s) => s.questionId === q.question_id);
    const s = mine.find((x) => x.status !== 'FAILED') ?? mine[0];
    return { question_id: q.question_id, skill: q.skill as 'WRITING' | 'SPEAKING', submission_id: s?.id ?? null, status: s?.status ?? null };
  });

  // Saran bank: skill dengan persen terendah (min. 2 soal dijawab; seri = GRAMMAR, VOCAB, READING).
  const weak = per_skill.filter((s) => s.answered >= 2).sort((a, b) => a.percent - b.percent || rank(a.skill) - rank(b.skill));
  const suggested_banks: MixResult['suggested_banks'] = [];
  if (weak.length > 0) {
    const used = new Set(state.questions.map((q) => q.bank_set_id));
    const banks = await publishedBanks(tx);
    for (const w of weak) {
      const cand = banks
        .filter((b) => b.skillCategory === w.skill && !isListeningBankKind(b.bankKind ?? ''))
        .sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)) || (a.bankCode ?? '').localeCompare(b.bankCode ?? ''));
      for (const b of cand) {
        if (suggested_banks.length >= 2) break;
        suggested_banks.push({ bank_code: b.bankCode!, title: b.title, bank_kind: b.bankKind!, reason: 'SKILL_TERLEMAH' });
      }
      if (suggested_banks.length >= 2) break;
    }
  }
  return { per_skill, per_question_type, ai_items, suggested_banks };
}
