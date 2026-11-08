/**
 * Akses `attempts.state` untuk attempt tanpa set (SPEC-022 D6 / Technical Flow 4). Attempt `MIX_PRACTICE` membekukan
 * snapshot soal di `state` (skema `mix.v1`) sehingga pembaruan bank tidak memengaruhi attempt berjalan.
 *
 * `state` memuat bidang mesin soal (`order`, `served`, `last_resume_at`, ...; lihat `AttemptState`) DITAMBAH bidang
 * `mix.v1` spec. Isi `state` TIDAK PERNAH dikirim ke klien apa adanya.
 */
import { z } from 'zod';
import { QuestionSchema, type Question } from '@/contracts/content';
import { MIX_STATE_SCHEMA, type MixState } from '@/contracts/mix';
import type { AttemptRow, SetRow } from '../attempts/dto';
import type { AttemptState } from '../attempts/engine';
import { ApiError } from '../http/errors';
import { logger } from '../logger';

export type MixAttemptState = AttemptState & MixState;

/** Tipe attempt yang soalnya hidup di `attempts.state`, bukan di `assessment_sets`. */
export const STATE_ONLY_TYPES: ReadonlySet<string> = new Set(['MIX_PRACTICE', 'MOCK_TEST', 'TRACK_CHECKPOINT']);

export const hasNoSet = (a: Pick<AttemptRow, 'assessmentSetId'>): boolean => a.assessmentSetId === null;

export function isMixAttempt(a: Pick<AttemptRow, 'assessmentType'>): boolean {
  return a.assessmentType === 'MIX_PRACTICE';
}

export function mixStateOf(a: AttemptRow): MixAttemptState {
  const s = a.state as unknown as MixAttemptState | null;
  if (!s || s.schema !== MIX_STATE_SCHEMA || !Array.isArray(s.questions)) {
    logger.error({ attemptId: a.id }, 'mix_state_invalid');
    throw new ApiError('INTERNAL_ERROR');
  }
  return s;
}

const StoredQuestions = z.array(QuestionSchema);

/** Soal (dengan kunci) dari snapshot `state.questions[].question`, tervalidasi ulang kontrak 1.1. */
export function mixQuestions(state: MixState, attemptId: string): Map<string, Question> {
  const parsed = StoredQuestions.safeParse(state.questions.map((q) => q.question));
  if (!parsed.success) {
    logger.error({ attemptId, issues: parsed.error.issues.length }, 'mix_questions_invalid');
    throw new ApiError('INTERNAL_ERROR');
  }
  return new Map(parsed.data.map((q) => [q.question_id, q]));
}

const SKILL_LABEL: Record<string, string> = { GRAMMAR: 'Grammar', VOCAB: 'Vocab', READING: 'Reading', WRITING: 'Writing', SPEAKING: 'Speaking' };

/** Judul bermakna: "Latihan campur: 10 soal (Grammar, Reading)" / "Latihan campur otomatis: 10 soal". */
export function mixTitle(state: MixState): string {
  const n = state.questions.length;
  if (state.mode === 'AUTO_WEAKNESS') return `Latihan campur otomatis: ${n} soal`;
  const skills = [...new Set(state.questions.map((q) => SKILL_LABEL[q.skill] ?? q.skill))];
  return `Latihan campur: ${n} soal (${skills.join(', ')})`;
}

/**
 * "Set" maya untuk kode yang mengharapkan `SetRow` (judul, tipe, daftar soal). BUKAN baris DB: `id` hanyalah id attempt
 * dan tidak boleh dipakai sebagai kunci asing (`attempt_answers.assessment_set_id` memakai `bank_set_id` tiap soal).
 */
export function virtualSetFor(a: AttemptRow): SetRow {
  const state = mixStateOf(a);
  return {
    id: a.id,
    assessmentType: a.assessmentType,
    title: mixTitle(state),
    subModuleId: null,
    moduleId: null,
    tierId: null,
    parentSetId: null,
    skillCategory: null,
    timeLimitSeconds: 0,
    readingPassageMarkdown: null,
    listeningAssetId: null,
    questionsJson: state.questions.map((q) => q.question),
    questionCount: state.questions.length,
    passPercent: null,
    origin: 'ORIGINAL_AUTHORED',
    sourceId: null,
    attributionText: null,
    status: 'PUBLISHED',
    reviewedBy: null,
    reviewedAt: null,
    version: 0,
    contentHash: null,
    bankCode: null,
    bankKind: null,
    examModule: 'GENERAL_TRAINING',
    tags: [],
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/** Peta `question_id` -> entri state (untuk `bank_set_id`, `bank_code`). */
export function mixEntries(state: MixState): Map<string, MixState['questions'][number]> {
  return new Map(state.questions.map((q) => [q.question_id, q]));
}
