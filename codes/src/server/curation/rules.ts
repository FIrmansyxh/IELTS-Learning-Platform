/** Aturan murni Kurasi Konten (SPEC-020): transisi status (K1), penyuntingan soal (merge + izin field), statistik (K5). */
import { QuestionSchema, type Question } from '@/contracts/content';
import type { ContentIssue } from '@/contracts/content';
import { checkQuestion, zodIssues } from '../content/validate';
import { splitPassages } from '../content/passages';

export type Status = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

/**
 * K1. `DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED`; pintasan `DRAFT|IN_REVIEW|APPROVED -> PUBLISHED`; `PUBLISHED -> ARCHIVED`;
 * `APPROVED|IN_REVIEW|PUBLISHED -> DRAFT`; `ARCHIVED -> DRAFT`. Selain itu ditolak (termasuk status yang sama).
 */
const TRANSITIONS: Record<Status, readonly Status[]> = {
  DRAFT: ['IN_REVIEW', 'PUBLISHED'],
  IN_REVIEW: ['APPROVED', 'PUBLISHED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['ARCHIVED', 'DRAFT'],
  ARCHIVED: ['DRAFT'],
};
export const canTransition = (from: Status, to: Status): boolean => TRANSITIONS[from].includes(to);

// ------------------------------------------------------------------ K5 statistik kualitas soal
export const MIN_ATTEMPTS_FOR_FLAG = 20;
/** `correct_rate` 2 desimal (setengah naik, bilangan bulat); 0 bila belum ada jawaban. */
export const correctRate = (correct: number, n: number): number => (n <= 0 ? 0 : Math.floor((correct * 200 + n) / (2 * n)) / 100);
/** Flag memakai pecahan tepat (bukan nilai yang dibulatkan): TOO_HARD < 0,20; TOO_EASY > 0,98; minimal 20 jawaban. */
export function qualityFlag(correct: number, n: number): 'TOO_HARD' | 'TOO_EASY' | null {
  if (n < MIN_ATTEMPTS_FOR_FLAG) return null;
  if (correct * 5 < n) return 'TOO_HARD';
  if (correct * 100 > 98 * n) return 'TOO_EASY';
  return null;
}

/** Escape `\`, `%`, `_` agar pencarian judul bersifat literal (ILIKE ... ESCAPE '\'). */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// ------------------------------------------------------------------ penyuntingan soal
const COMMON = ['prompt', 'explanation_id', 'points', 'target_time_ms', 'difficulty', 'passage_no', 'section_no'] as const;
const BY_TYPE: Record<string, readonly string[]> = {
  MCQ_SINGLE: ['options', 'correct_answers'],
  MCQ_MULTI: ['options', 'correct_answers'],
  TFNG: ['correct_answers'],
  YNNG: ['correct_answers'],
  FILL_IN_BLANK: ['correct_answers', 'max_words'],
  SHORT_ANSWER: ['correct_answers', 'max_words'],
  MATCHING_DROPDOWN: ['matching', 'correct_answers'],
  MATCHING_DRAG: ['matching', 'correct_answers'],
  SENTENCE_REORDER: ['segments'],
  ERROR_RECOGNITION: ['tokens', 'correct_answers'],
  // Writing/Speaking: hanya prompt dan explanation_id yang boleh disunting.
  WRITING_TASK: [],
  SPEAKING_TASK: [],
};
const AI_ONLY = ['prompt', 'explanation_id'] as const;

/** Field yang boleh disunting untuk tipe soal tertentu. */
export function allowedFields(questionType: string): ReadonlySet<string> {
  if (questionType === 'WRITING_TASK' || questionType === 'SPEAKING_TASK') return new Set(AI_ONLY);
  return new Set([...COMMON, ...(BY_TYPE[questionType] ?? [])]);
}

export interface QuestionEditResult {
  question?: Question;
  issues: ContentIssue[];
}

const issue = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'error' });

/**
 * Gabungkan perubahan ke soal tersimpan lalu validasi soal UTUH (skema SPEC-004 + aturan silang). `null` pada field opsional
 * (`target_time_ms`, `difficulty`, `passage_no`, `section_no`) menghapusnya. `question_id`, `question_type`, `skill` tidak dapat
 * diubah (ditolak skema permintaan). Murni: tidak mengubah `stored`.
 */
export function mergeQuestionEdit(
  stored: Record<string, unknown>,
  patch: Record<string, unknown>,
  ctx: { placement: boolean; passageMarkdown: string | null },
): QuestionEditResult {
  const type = String(stored.question_type);
  const allowed = allowedFields(type);
  const issues: ContentIssue[] = [];
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) continue;
    if (!allowed.has(k)) issues.push(issue(k, 'field_not_allowed_for_type', `Field '${k}' tidak dapat disunting pada soal bertipe ${type}.`));
  }
  if (issues.length > 0) return { issues };

  const merged: Record<string, unknown> = { ...stored };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  const parsed = QuestionSchema.safeParse(merged);
  if (!parsed.success) return { issues: zodIssues(parsed.error).filter((i) => i.severity !== 'warning') };

  const q = parsed.data;
  const found: ContentIssue[] = [];
  checkQuestion(q, 'question', found, { placement: ctx.placement });
  if (q.passage_no !== undefined) {
    const parts = ctx.passageMarkdown ? splitPassages(ctx.passageMarkdown).length : 0;
    if (q.passage_no > parts) found.push(issue('question.passage_no', 'passage_out_of_range', 'passage_no melebihi jumlah bagian teks pada set ini.'));
  }
  const errors = found.filter((i) => i.severity === 'error');
  return errors.length > 0 ? { issues: errors } : { question: q, issues: [] };
}

/** Soal yang merujuk `passage_no` yang tidak lagi ada setelah teks bacaan diubah. */
export function passageOutOfRange(questions: ReadonlyArray<{ question_id?: unknown; passage_no?: unknown }>, passageMarkdown: string | null): string[] {
  const parts = passageMarkdown ? splitPassages(passageMarkdown).length : 0;
  return questions.filter((q) => typeof q.passage_no === 'number' && q.passage_no > parts).map((q) => String(q.question_id));
}
