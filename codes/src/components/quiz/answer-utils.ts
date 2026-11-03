import type { AnswerResponse, Feedback, QuestionPublic } from '@/contracts/attempts';

export const AI_TYPES = ['WRITING_TASK', 'SPEAKING_TASK'] as const;

export function isAiQuestion(q: QuestionPublic): boolean {
  return q.question_type === 'WRITING_TASK' || q.question_type === 'SPEAKING_TASK';
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Nilai awal tampilan: urutan ulang kalimat dimulai dari urutan yang disajikan server. */
export function initialResponse(q: QuestionPublic): AnswerResponse | null {
  if (q.question_type === 'SENTENCE_REORDER' && q.segments) {
    return { segment_ids: q.segments.map((s) => s.segment_id) };
  }
  return null;
}

/** Apakah jawaban sudah cukup untuk tombol "Periksa" (validasi bentuk final tetap oleh server). */
export function isAnswerReady(q: QuestionPublic, r: AnswerResponse | null): boolean {
  if (!r) return false;
  if ('option_ids' in r) {
    return q.question_type === 'MCQ_MULTI' ? r.option_ids.length >= 1 : r.option_ids.length === 1;
  }
  if ('choice' in r) return r.choice.length > 0;
  if ('text' in r) return r.text.trim().length > 0;
  if ('pairs' in r) return r.pairs.length > 0;
  if ('segment_ids' in r) return r.segment_ids.length > 0;
  if ('token_indexes' in r) return r.token_indexes.length >= 1 && r.token_indexes.length <= 3;
  return false;
}

/** Jawaban tersimpan dari server dibaca longgar; hanya bentuk yang dikenal dipakai kembali. */
export function coerceStored(raw: Record<string, unknown>): AnswerResponse | null {
  if (Array.isArray(raw.option_ids)) return { option_ids: raw.option_ids.filter((x): x is string => typeof x === 'string') };
  if (typeof raw.choice === 'string') return { choice: raw.choice };
  if (typeof raw.text === 'string') return { text: raw.text };
  if (Array.isArray(raw.pairs)) {
    const pairs = raw.pairs.flatMap((p) => {
      const o = p as { item_id?: unknown; choice_id?: unknown };
      return typeof o.item_id === 'string' && typeof o.choice_id === 'string'
        ? [{ item_id: o.item_id, choice_id: o.choice_id }]
        : [];
    });
    return { pairs };
  }
  if (Array.isArray(raw.segment_ids)) return { segment_ids: raw.segment_ids.filter((x): x is string => typeof x === 'string') };
  if (Array.isArray(raw.token_indexes))
    return { token_indexes: raw.token_indexes.filter((x): x is number => typeof x === 'number') };
  return null;
}

export type RendererProps = {
  question: QuestionPublic;
  value: AnswerResponse | null;
  onChange: (next: AnswerResponse | null) => void;
  /** Dikunci setelah diperiksa (mode Latihan) atau saat menyimpan. */
  disabled: boolean;
  /** Umpan balik soal ini (hanya mode Latihan, setelah diperiksa). */
  feedback: Feedback | null;
};

export const letter = (i: number) => String.fromCharCode(65 + i);
