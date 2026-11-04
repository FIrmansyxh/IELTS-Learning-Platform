import type { QuestionPublic } from '@/contracts/attempts';
import type { AdminQuestion } from '@/lib/api/curation-contract';

export const TFNG_CHOICES = ['True', 'False', 'Not Given'] as const;
export const YNNG_CHOICES = ['Yes', 'No', 'Not Given'] as const;
export const MCQ_TYPES = ['MCQ_SINGLE', 'MCQ_MULTI'] as const;
export const TEXT_TYPES = ['FILL_IN_BLANK', 'SHORT_ANSWER'] as const;
export const MATCH_TYPES = ['MATCHING_DROPDOWN', 'MATCHING_DRAG'] as const;
export const AI_QUESTION_TYPES = ['WRITING_TASK', 'SPEAKING_TASK'] as const;

export const isType = (q: { question_type: string }, list: readonly string[]) => list.includes(q.question_type);

export const toLines = (v: string): string[] => v.split(/\r?\n/).map((l) => l.trim());
export const fromLines = (a: readonly string[] | null | undefined): string => (a ?? []).join('\n');

/** "0, 2,1" -> [0,2,1]; null bila ada bagian yang bukan bilangan bulat >= 0. */
export function parseIndexes(v: string): number[] | null {
  const parts = v
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    out.push(Number(p));
  }
  return out;
}

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Bentuk yang sedang diedit; dipakai untuk membangun pratinjau baca-saja dengan `QuestionRenderer`. */
export type PreviewDraft = {
  prompt: string;
  options: string[];
  correctCount: number;
  maxWords: number | null;
  left: string[];
  right: string[];
  allowReuse: boolean;
  segments: string[];
  tokens: string[];
};

/** Admin question -> QuestionPublic tanpa pengacakan dan tanpa kunci (urutan asli, id sintetis). */
export function toPreviewQuestion(q: AdminQuestion, d: PreviewDraft): QuestionPublic {
  const base: QuestionPublic = {
    question_id: q.question_id,
    question_type: q.question_type as QuestionPublic['question_type'],
    skill: q.skill as QuestionPublic['skill'],
    prompt: d.prompt,
    points: q.points ?? 1,
    target_time_ms: null,
    passage_no: q.passage_no ?? null,
    section_no: q.section_no ?? null,
    options: null,
    choose_count: null,
    fixed_choices: null,
    max_words: null,
    matching: null,
    segments: null,
    tokens: null,
    ai_task: null,
  };
  switch (q.question_type) {
    case 'MCQ_SINGLE':
    case 'MCQ_MULTI':
      base.options = d.options.map((text, i) => ({ option_id: `o${i}`, text }));
      if (q.question_type === 'MCQ_MULTI') base.choose_count = d.correctCount;
      break;
    case 'TFNG':
      base.fixed_choices = [...TFNG_CHOICES];
      break;
    case 'YNNG':
      base.fixed_choices = [...YNNG_CHOICES];
      break;
    case 'FILL_IN_BLANK':
    case 'SHORT_ANSWER':
      base.max_words = d.maxWords;
      break;
    case 'MATCHING_DROPDOWN':
    case 'MATCHING_DRAG':
      base.matching = {
        left: d.left.map((text, i) => ({ item_id: `i${i}`, text })),
        right: d.right.map((text, i) => ({ choice_id: `c${i}`, text })),
        allow_reuse: d.allowReuse,
      };
      break;
    case 'SENTENCE_REORDER':
      base.segments = d.segments.map((text, i) => ({ segment_id: `s${i}`, text }));
      break;
    case 'ERROR_RECOGNITION':
      base.tokens = d.tokens.map((text, index) => ({ index, text }));
      break;
    case 'WRITING_TASK':
      base.ai_task = { kind: 'WRITING', task_kind: 'TASK2' };
      break;
    case 'SPEAKING_TASK':
      base.ai_task = { kind: 'SPEAKING', part: 2, cue_points: [] };
      break;
  }
  return base;
}
