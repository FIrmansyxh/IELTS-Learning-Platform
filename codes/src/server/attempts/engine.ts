/**
 * Mesin soal murni SPEC-006 (tanpa DB): pemilihan/pengacakan (D4/D5), DTO publik tanpa kunci (D9), validasi bentuk
 * jawaban, penilaian (D6/D7), dan aritmetika skor dalam bilangan bulat sentesimal.
 */
import { AI_TASK_TYPES, OBJECTIVE_TYPES, type Question } from '@/contracts/content';
import type { Feedback, QuestionPublic } from '@/contracts/attempts';
import { buildSpeakingExternalPrompt } from '@/lib/speaking-external-prompt';
import { newRngSeed, randomOpaqueId, seededCsprng, shuffled } from './prng';

// ------------------------------------------------------------------ state
export interface Served {
  option_ids?: string[];
  option_orig_index?: number[];
  right_choice_ids?: string[];
  right_orig_index?: number[];
  segment_ids?: string[];
  segment_orig_index?: number[];
}
export interface AttemptState {
  v: 1;
  /** Seed CSPRNG rahasia pengacakan (jangan pernah dikirim ke klien; tidak diturunkan dari id attempt). */
  rng_seed?: string;
  order: string[];
  last_resume_at: string;
  /** Ambang lulus yang dibekukan saat mulai (null bila tipe tidak punya ambang persen). */
  pass_percent: number | null;
  served: Record<string, Served>;
}

export type ObjectiveQuestion = Exclude<Question, { question_type: 'WRITING_TASK' | 'SPEAKING_TASK' }>;
export const isObjective = (q: Question): q is ObjectiveQuestion => OBJECTIVE_TYPES.includes(q.question_type);
export const isAiTask = (q: Question): boolean => AI_TASK_TYPES.includes(q.question_type);

// ------------------------------------------------------------------ pemilihan & pengacakan (D4, D5)
export interface SelectionOptions {
  /** Batas jumlah soal (drill.question_count); null = semua. */
  limit: number | null;
  /** Pertahankan urutan asli (set punya bacaan/audio). */
  keepOrder: boolean;
  /** Hanya untuk pengujian: seed tetap. Produksi selalu memakai seed CSPRNG baru. */
  seed?: string;
}

/**
 * Deteksi slot soal jika menggunakan konvensi multi-paket variasi (misal Q-213-P1-01, Q-213-P2-01, Q-213-P3-01).
 * Mengembalikan identifier slot unik untuk mengelompokkan variasi dari jenis soal yang sama.
 */
export function extractQuestionSlot(id: string): string | null {
  const m1 = /^Q-(.+?)-(?:P|PKG|[A-C])(\d+)-(\d+)$/i.exec(id);
  if (m1) return `${m1[1]}:slot-${m1[3]}`;
  const m2 = /^Q-(.+?)-([A-C])-(\d+)$/i.exec(id);
  if (m2) return `${m2[1]}:slot-${m2[3]}`;
  const m3 = /^Q-(.+?)-(\d+)-(?:P|PKG|[A-C])(\d+)$/i.exec(id);
  if (m3) return `${m3[1]}:slot-${m3[2]}`;
  return null;
}

/**
 * Memilih secara acak 1 variasi soal per slot dari pool 3 paket soal (atau N paket).
 * Mempertahankan jenis dan jumlah soal yang sama, namun variasi soalnya teracak dari sumber paket.
 */
export function selectVariantQuestions(questions: readonly Question[], rng: () => number): Question[] {
  if (questions.length <= 1) return [...questions];

  // Kelompokkan soal berdasarkan slot
  const slotMap = new Map<string, Question[]>();
  const slotOrder: string[] = [];
  let hasMultipleVariants = false;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    const slot = extractQuestionSlot(q.question_id) ?? `single-slot-${i}`;
    const list = slotMap.get(slot);
    if (!list) {
      slotMap.set(slot, [q]);
      slotOrder.push(slot);
    } else {
      list.push(q);
      hasMultipleVariants = true;
    }
  }

  // Jika tidak ada varian ganda, kembalikan pertanyaan asli
  if (!hasMultipleVariants) {
    return [...questions];
  }

  // Pilih secara acak 1 variasi dari masing-masing slot
  const selected: Question[] = [];
  for (const slot of slotOrder) {
    const variants = slotMap.get(slot)!;
    const chosenIdx = Math.floor(rng() * variants.length);
    selected.push(variants[chosenIdx]!);
  }

  return selected;
}

export function buildInitialState(
  attemptId: string,
  questions: readonly Question[],
  opts: SelectionOptions,
  passPercent: number | null,
  now: Date,
): AttemptState {
  void attemptId; // seed tidak lagi diturunkan dari id publik (F-06-01)
  const seed = opts.seed ?? newRngSeed();
  const rng = seededCsprng(seed);

  // 1. Pilih variasi soal dari paket jika tersedia (misal pool 3 paket)
  const pool = selectVariantQuestions(questions, rng);

  // 2. Tentukan indeks dan terapkan batas limit bila ada
  let idx = pool.map((_, i) => i);
  if (opts.limit !== null && idx.length > opts.limit) idx = shuffled(idx, rng).slice(0, opts.limit);

  // 3. Acak urutan susunan secara total bila keepOrder = false
  idx = opts.keepOrder ? [...idx].sort((a, b) => a - b) : shuffled(idx, rng);

  const served: Record<string, Served> = {};
  const order: string[] = [];
  for (const i of idx) {
    const q = pool[i]!;
    order.push(q.question_id);
    served[q.question_id] = serveQuestion(q, rng);
  }
  return { v: 1, rng_seed: seed, order, last_resume_at: now.toISOString(), pass_percent: passPercent, served };
}

export function serveQuestion(q: Question, rng: () => number): Served {
  const taken = new Set<string>();
  switch (q.question_type) {
    case 'MCQ_SINGLE':
    case 'MCQ_MULTI': {
      const orig = shuffled(
        q.options.map((_, i) => i),
        rng,
      );
      return { option_orig_index: orig, option_ids: orig.map(() => randomOpaqueId('o', taken)) };
    }
    case 'MATCHING_DROPDOWN':
    case 'MATCHING_DRAG': {
      const orig = shuffled(
        q.matching.right.map((_, i) => i),
        rng,
      );
      return { right_orig_index: orig, right_choice_ids: orig.map(() => randomOpaqueId('c', taken)) };
    }
    case 'SENTENCE_REORDER': {
      const base = q.segments.map((_, i) => i);
      let orig = shuffled(base, rng);
      for (let tries = 0; tries < 5 && orig.every((v, i) => v === i); tries++) orig = shuffled(base, rng);
      return { segment_orig_index: orig, segment_ids: orig.map(() => randomOpaqueId('s', taken)) };
    }
    default:
      return {};
  }
}

// ------------------------------------------------------------------ DTO publik (allow-list, D9)
export function toPublicQuestion(q: Question, s: Served): QuestionPublic {
  const out: QuestionPublic = {
    question_id: q.question_id,
    question_type: q.question_type,
    skill: q.skill,
    prompt: q.prompt,
    points: q.points,
    target_time_ms: q.target_time_ms ?? null,
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
      out.options = s.option_ids!.map((id, i) => ({ option_id: id, text: q.options[s.option_orig_index![i]!]! }));
      if (q.question_type === 'MCQ_MULTI') out.choose_count = q.correct_answers.length;
      break;
    case 'TFNG':
      out.fixed_choices = ['True', 'False', 'Not Given'];
      break;
    case 'YNNG':
      out.fixed_choices = ['Yes', 'No', 'Not Given'];
      break;
    case 'FILL_IN_BLANK':
    case 'SHORT_ANSWER':
      out.max_words = q.max_words ?? null;
      break;
    case 'MATCHING_DROPDOWN':
    case 'MATCHING_DRAG':
      out.matching = {
        left: q.matching.left.map((text, i) => ({ item_id: `i${i}`, text })),
        right: s.right_choice_ids!.map((id, i) => ({ choice_id: id, text: q.matching.right[s.right_orig_index![i]!]! })),
        allow_reuse: q.matching.allow_reuse,
      };
      break;
    case 'SENTENCE_REORDER':
      out.segments = s.segment_ids!.map((id, i) => ({ segment_id: id, text: q.segments[s.segment_orig_index![i]!]! }));
      break;
    case 'ERROR_RECOGNITION':
      out.tokens = q.tokens.map((text, index) => ({ index, text }));
      break;
    case 'WRITING_TASK':
      out.ai_task = {
        kind: 'WRITING',
        task_kind: q.task_kind,
        ...(q.min_words !== undefined ? { min_words: q.min_words } : {}),
        ...(q.time_limit_minutes !== undefined ? { time_limit_minutes: q.time_limit_minutes } : {}),
      };
      break;
    case 'SPEAKING_TASK':
      out.ai_task = {
        kind: 'SPEAKING',
        part: q.part,
        ...(q.prep_seconds !== undefined ? { prep_seconds: q.prep_seconds } : {}),
        ...(q.record_seconds !== undefined ? { record_seconds: q.record_seconds } : {}),
        cue_points: q.cue_points,
        external_prompt:
          q.external_eval_prompt ??
          buildSpeakingExternalPrompt({
            part: q.part,
            prompt: q.prompt,
            cuePoints: q.cue_points,
            prepSeconds: q.prep_seconds,
            recordSeconds: q.record_seconds,
          }),
      };
      break;
  }
  return out;
}

// ------------------------------------------------------------------ validasi bentuk response (sisi server)
export interface ShapeIssue {
  path: string;
  code: string;
  message: string;
}
export type StoredResponse =
  | { option_ids: string[] }
  | { choice: string }
  | { text: string }
  | { pairs: Array<{ item_id: string; choice_id: string }> }
  | { segment_ids: string[] }
  | { token_indexes: number[] };

const MSG: Record<string, string> = {
  response_shape_invalid: 'Bentuk jawaban tidak sesuai dengan tipe soal.',
  unknown_option_id: 'Pilihan tidak dikenal pada soal ini.',
  unknown_item_id: 'Butir tidak dikenal pada soal ini.',
  unknown_choice_id: 'Pilihan pasangan tidak dikenal pada soal ini.',
  duplicate_ids: 'Pilihan tidak boleh berulang.',
  incomplete_permutation: 'Urutan harus memuat semua bagian tepat satu kali.',
  index_out_of_range: 'Indeks di luar rentang soal.',
  empty_answer: 'Jawaban tidak boleh kosong.',
  too_long: 'Jawaban terlalu panjang (maksimal 200 karakter).',
  unrecognized_key: 'Field tidak dikenal.',
};
const issue = (code: string, path = 'response'): ShapeIssue => ({ path, code, message: MSG[code] ?? 'Nilai tidak valid.' });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const dup = (xs: readonly (string | number)[]) => new Set(xs).size !== xs.length;

/** Periksa bentuk `response` terhadap soal yang DISAJIKAN. Mengembalikan jawaban kanonis atau daftar masalah. */
export function parseResponse(q: Question, s: Served, raw: Record<string, unknown>): { ok: true; response: StoredResponse } | { ok: false; issues: ShapeIssue[] } {
  const allowed: Record<string, string> = {
    MCQ_SINGLE: 'option_ids',
    MCQ_MULTI: 'option_ids',
    TFNG: 'choice',
    YNNG: 'choice',
    FILL_IN_BLANK: 'text',
    SHORT_ANSWER: 'text',
    MATCHING_DROPDOWN: 'pairs',
    MATCHING_DRAG: 'pairs',
    SENTENCE_REORDER: 'segment_ids',
    ERROR_RECOGNITION: 'token_indexes',
  };
  const key = allowed[q.question_type];
  if (!key) return { ok: false, issues: [issue('response_shape_invalid')] };
  const extra = Object.keys(raw)
    .filter((k) => k !== key)
    .map((k) => issue('unrecognized_key', `response.${k}`));
  if (extra.length) return { ok: false, issues: extra };
  const v = raw[key];
  const bad = (code: string, path = `response.${key}`) => ({ ok: false as const, issues: [issue(code, path)] });

  switch (q.question_type) {
    case 'MCQ_SINGLE':
    case 'MCQ_MULTI': {
      if (!isStrArray(v)) return bad('response_shape_invalid');
      if (q.question_type === 'MCQ_SINGLE' && v.length !== 1) return bad('response_shape_invalid');
      if (v.length < 1 || v.length > s.option_ids!.length) return bad('response_shape_invalid');
      if (dup(v)) return bad('duplicate_ids');
      if (v.some((id) => !s.option_ids!.includes(id))) return bad('unknown_option_id');
      return { ok: true, response: { option_ids: v } };
    }
    case 'TFNG':
    case 'YNNG': {
      const choices = q.question_type === 'TFNG' ? ['True', 'False', 'Not Given'] : ['Yes', 'No', 'Not Given'];
      if (typeof v !== 'string' || !choices.includes(v)) return bad('response_shape_invalid');
      return { ok: true, response: { choice: v } };
    }
    case 'FILL_IN_BLANK':
    case 'SHORT_ANSWER': {
      if (typeof v !== 'string') return bad('response_shape_invalid');
      const t = v.trim();
      if (t.length === 0) return bad('empty_answer');
      if (t.length > 200) return bad('too_long');
      return { ok: true, response: { text: t } };
    }
    case 'MATCHING_DROPDOWN':
    case 'MATCHING_DRAG': {
      if (!Array.isArray(v) || v.length < 1 || v.length > q.matching.left.length) return bad('response_shape_invalid');
      const pairs: Array<{ item_id: string; choice_id: string }> = [];
      for (const p of v) {
        if (!isRecord(p) || typeof p.item_id !== 'string' || typeof p.choice_id !== 'string') return bad('response_shape_invalid');
        const extraKey = Object.keys(p).find((k) => k !== 'item_id' && k !== 'choice_id');
        if (extraKey) return bad('unrecognized_key', `response.pairs.${extraKey}`);
        pairs.push({ item_id: p.item_id, choice_id: p.choice_id });
      }
      const validItems = new Set(q.matching.left.map((_, i) => `i${i}`));
      if (pairs.some((p) => !validItems.has(p.item_id))) return bad('unknown_item_id');
      if (pairs.some((p) => !s.right_choice_ids!.includes(p.choice_id))) return bad('unknown_choice_id');
      if (dup(pairs.map((p) => p.item_id))) return bad('duplicate_ids');
      if (!q.matching.allow_reuse && dup(pairs.map((p) => p.choice_id))) return bad('duplicate_ids');
      return { ok: true, response: { pairs } };
    }
    case 'SENTENCE_REORDER': {
      if (!isStrArray(v)) return bad('response_shape_invalid');
      if (dup(v)) return bad('duplicate_ids');
      const ids = s.segment_ids!;
      if (v.length !== ids.length || v.some((id) => !ids.includes(id))) return bad('incomplete_permutation');
      return { ok: true, response: { segment_ids: v } };
    }
    case 'ERROR_RECOGNITION': {
      if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x)) || v.length < 1 || v.length > 3) return bad('response_shape_invalid');
      const nums = v as number[];
      if (dup(nums)) return bad('duplicate_ids');
      if (nums.some((n) => n < 0 || n >= q.tokens.length)) return bad('index_out_of_range');
      return { ok: true, response: { token_indexes: nums } };
    }
    default:
      return { ok: false, issues: [issue('response_shape_invalid')] };
  }
}

/** Bentuk kanonis untuk perbandingan idempotensi (urutan himpunan tidak berpengaruh). */
export function canonicalResponse(r: unknown): string {
  if (!isRecord(r)) return JSON.stringify(r);
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(r).sort()) {
    const v = r[k];
    if (k === 'option_ids' && Array.isArray(v)) o[k] = [...v].sort();
    else if (k === 'token_indexes' && Array.isArray(v)) o[k] = [...v].sort((a, b) => (a as number) - (b as number));
    else if (k === 'pairs' && Array.isArray(v)) o[k] = [...v].sort((a, b) => String((a as { item_id: string }).item_id).localeCompare(String((b as { item_id: string }).item_id)));
    else o[k] = v;
  }
  return JSON.stringify(o);
}

// ------------------------------------------------------------------ penilaian (D6, D7)
/** D6: NFKC, trim, rapatkan spasi, huruf kecil, buang `. , ; ! ?` di akhir. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .trim()
    .replace(/[ \t\r\n\f\v]+/g, ' ')
    .toLowerCase()
    .replace(/[.,;!?]+$/, '');
}
export const wordCount = (normalized: string): number => normalized.split(' ').filter((w) => w.length > 0).length;

export interface Grade {
  isCorrect: boolean;
  /** Skor dalam sentesimal poin (bilangan bulat). */
  scoreH: number;
}

export function gradeAnswer(q: Question, s: Served, r: StoredResponse): Grade {
  const full = q.points * 100;
  const right = (ok: boolean): Grade => ({ isCorrect: ok, scoreH: ok ? full : 0 });
  switch (q.question_type) {
    case 'MCQ_SINGLE': {
      const ids = (r as { option_ids: string[] }).option_ids;
      const text = q.options[s.option_orig_index![s.option_ids!.indexOf(ids[0]!)]!];
      return right(text === q.correct_answers[0]);
    }
    case 'MCQ_MULTI': {
      const ids = (r as { option_ids: string[] }).option_ids;
      const chosen = new Set(ids.map((id) => q.options[s.option_orig_index![s.option_ids!.indexOf(id)]!]));
      const correct = new Set(q.correct_answers);
      return right(chosen.size === correct.size && [...chosen].every((t) => correct.has(t as string)));
    }
    case 'TFNG':
    case 'YNNG':
      return right((r as { choice: string }).choice === q.correct_answers[0]);
    case 'FILL_IN_BLANK':
    case 'SHORT_ANSWER': {
      const norm = normalizeText((r as { text: string }).text);
      if (q.max_words !== undefined && wordCount(norm) > q.max_words) return right(false);
      return right(q.correct_answers.some((v) => normalizeText(v) === norm));
    }
    case 'MATCHING_DROPDOWN':
    case 'MATCHING_DRAG': {
      const total = q.matching.left.length;
      let hit = 0;
      for (const p of (r as { pairs: Array<{ item_id: string; choice_id: string }> }).pairs) {
        const leftIdx = Number(p.item_id.slice(1));
        const rightOrig = s.right_orig_index![s.right_choice_ids!.indexOf(p.choice_id)];
        if (rightOrig === q.correct_answers[leftIdx]) hit++;
      }
      // round_half_up(points * benar / total, 2) dalam sentesimal, aritmetika bilangan bulat.
      const scoreH = Math.floor((2 * full * hit + total) / (2 * total));
      return { isCorrect: hit === total, scoreH };
    }
    case 'SENTENCE_REORDER': {
      const ids = (r as { segment_ids: string[] }).segment_ids;
      const orig = ids.map((id) => s.segment_orig_index![s.segment_ids!.indexOf(id)]);
      return right(orig.every((v, i) => v === i));
    }
    case 'ERROR_RECOGNITION': {
      const chosen = new Set((r as { token_indexes: number[] }).token_indexes);
      const correct = new Set(q.correct_answers);
      return right(chosen.size === correct.size && [...chosen].every((n) => correct.has(n)));
    }
    default:
      return { isCorrect: false, scoreH: 0 };
  }
}

/** `correct_answer.display` (D9 hanya dikirim setelah dijawab/selesai pada PRACTICE). */
export function correctDisplay(q: Question): string[] {
  switch (q.question_type) {
    case 'MCQ_SINGLE':
    case 'MCQ_MULTI':
    case 'TFNG':
    case 'YNNG':
    case 'FILL_IN_BLANK':
    case 'SHORT_ANSWER':
      return [...q.correct_answers];
    case 'MATCHING_DROPDOWN':
    case 'MATCHING_DRAG':
      return q.matching.left.map((l, i) => `${l} -> ${q.matching.right[q.correct_answers[i]!]}`);
    case 'SENTENCE_REORDER':
      return [q.segments.join(' ')];
    case 'ERROR_RECOGNITION':
      return q.correct_answers.map((i) => q.tokens[i]!);
    default:
      return [];
  }
}

export const hundredths = (h: number): number => h / 100;
export const toNumeric = (h: number): string => (h / 100).toFixed(2);

export function feedbackFor(q: Question, g: Grade): Feedback {
  return {
    is_correct: g.isCorrect,
    score: hundredths(g.scoreH),
    max_score: q.points,
    correct_answer: { display: correctDisplay(q) },
    explanation_id: 'explanation_id' in q && q.explanation_id ? q.explanation_id : '',
  };
}

// ------------------------------------------------------------------ skor total (D7), bilangan bulat
/** score_percent = round_half_up(raw * 100 / max, 2) dalam sentesimal persen. */
export function percentHundredths(rawH: number, maxH: number): number {
  if (maxH <= 0) return 0;
  return Math.floor((2 * rawH * 10000 + maxH) / (2 * maxH));
}
/**
 * Persen untuk TAMPILAN (tidak memengaruhi keputusan lulus). Sama dengan `percentHundredths` kecuali bila belum lulus tetapi
 * pembulatan mencapai ambang (84,996 -> "85,00"): dipotong (floor) 2 desimal menjadi 84,99 (QA F-08-04).
 */
export function displayPercentHundredths(rawH: number, maxH: number, passPercent: number | null, passed: boolean | null): number {
  const rounded = percentHundredths(rawH, maxH);
  if (passed === false && passPercent !== null && rounded >= passPercent * 100) return Math.floor((rawH * 10000) / maxH);
  return rounded;
}
/** Lulus bila `raw * 100 >= pass * max` (inklusif, tanpa float). `null` bila tipe tanpa ambang. */
export function isPassed(rawH: number, maxH: number, passPercent: number | null): boolean | null {
  if (passPercent === null) return null;
  if (maxH <= 0) return false;
  return rawH * 100 >= passPercent * maxH;
}

// ------------------------------------------------------------------ waktu jawaban (D8)
export interface TimedAnswer {
  answeredAtMs: number;
  isCorrect: boolean | null;
}
export interface TimingResult {
  timeSpentMs: number;
  withinTargetTime: boolean;
  speedStreakLen: number;
}
/** Hitung D8 untuk jawaban berurutan menurut `answered_at`. */
export function computeTimings(
  answers: ReadonlyArray<TimedAnswer & { targetMs: number }>,
  startedAtMs: number,
  lastResumeAtMs: number,
): TimingResult[] {
  const out: TimingResult[] = [];
  let prevAt = -Infinity;
  let streak = 0;
  for (const a of answers) {
    const base = Math.max(prevAt, lastResumeAtMs, startedAtMs);
    const spent = Math.max(0, Math.round(a.answeredAtMs - base));
    const within = spent <= a.targetMs;
    streak = a.isCorrect === true && within ? streak + 1 : 0;
    out.push({ timeSpentMs: spent, withinTargetTime: within, speedStreakLen: streak });
    prevAt = a.answeredAtMs;
  }
  return out;
}
