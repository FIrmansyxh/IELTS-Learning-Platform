/**
 * Pembangun bank soal SINTETIS untuk tes SPEC-023 (BUKAN bank asli, tidak pernah dimuat ke DB produksi).
 * Murni (tanpa DB): dipakai tes unit perakit dan tes integrasi `simulation-ac.itest.ts`.
 */
import { randomUUID } from 'node:crypto';
import type { BankRow } from '@/server/simulation/assemble';

type AnyQ = Record<string, unknown>;

export interface BankSpec {
  kind: string;
  code: string;
  questions: AnyQ[];
  /** Teks bacaan (Reading). */
  passage?: string | null;
  /** Durasi audio detik (Listening); null/undefined = tanpa audio. */
  audioSec?: number | null;
}

export const objectiveQs = (prefix: string, n: number, skill: 'READING' | 'LISTENING', opts: string[], passageNo = 1): AnyQ[] =>
  Array.from({ length: n }, (_, i) => ({
    question_id: `Q-${prefix}-${String(i + 1).padStart(2, '0')}`,
    question_type: 'MCQ_SINGLE',
    skill,
    prompt: `${prefix} soal ${i + 1}`,
    options: opts,
    correct_answers: [opts[0]],
    explanation_id: `Pembahasan ${prefix}-${i + 1}`,
    passage_no: passageNo,
    points: 1,
  }));

export const readingQs = (prefix: string, n: number, passageNo = 1): AnyQ[] =>
  objectiveQs(prefix, n, 'READING', ['True', 'False', 'Not Given'], passageNo);

export const listeningQs = (prefix: string, n: number): AnyQ[] => objectiveQs(prefix, n, 'LISTENING', ['A', 'B', 'C', 'D']);

export const writingQ = (id: string, taskKind: 'TASK1' | 'TASK2'): AnyQ => ({
  question_id: id,
  question_type: 'WRITING_TASK',
  skill: 'WRITING',
  task_kind: taskKind,
  prompt: `Prompt ${id}`,
  min_words: taskKind === 'TASK1' ? 150 : 250,
  points: 1,
});

export const speakingQs = (prefix: string, part: 1 | 2 | 3, n: number): AnyQ[] =>
  Array.from({ length: n }, (_, i) => ({
    question_id: `Q-${prefix}-${i + 1}`,
    question_type: 'SPEAKING_TASK',
    skill: 'SPEAKING',
    part,
    prompt: `Speaking part ${part} ${prefix} ${i + 1}`,
    points: 1,
  }));

const SKILL_OF: Record<string, string> = { READING: 'READING', LISTENING: 'LISTENING', WRITING: 'WRITING', SPEAKING: 'SPEAKING' };

/** Bentuk BankRow (masukan perakit) dari spesifikasi bank sintetis. */
export function makeBank(spec: BankSpec): BankRow {
  const hasAudio = spec.audioSec != null;
  return {
    id: randomUUID(),
    bankCode: spec.code,
    bankKind: spec.kind,
    skillCategory: SKILL_OF[spec.kind.split('_')[0]!] ?? null,
    readingPassageMarkdown: spec.passage ?? null,
    listeningAssetId: hasAudio ? randomUUID() : null,
    questionsJson: spec.questions,
    questionCount: spec.questions.length,
    audioDurationSec: hasAudio ? spec.audioSec : null,
    audioMimeType: hasAudio ? 'audio/mpeg' : null,
    audioAttribution: hasAudio ? `Audio ${spec.code}` : null,
  };
}

export const readingBank = (kind: 'READING_GT_S1' | 'READING_GT_S2' | 'READING_GT_S3', code: string, n: number, passage?: string): BankRow =>
  makeBank({ kind, code, questions: readingQs(code, n), passage: passage ?? `Teks ${code}\n\nParagraf satu.\n\nParagraf dua.` });

export const listeningBank = (part: 1 | 2 | 3 | 4, code: string, n = 10, audioSec = 5): BankRow =>
  makeBank({ kind: `LISTENING_GT_S${part}`, code, questions: listeningQs(code, n), audioSec });

export const writingBank = (kind: 'WRITING_GT_T1_FORMAL' | 'WRITING_GT_T1_SEMI' | 'WRITING_GT_T1_INFORMAL' | 'WRITING_GT_T2', code: string, n: number): BankRow =>
  makeBank({
    kind,
    code,
    questions: Array.from({ length: n }, (_, i) => writingQ(`Q-${code}-${i + 1}`, kind === 'WRITING_GT_T2' ? 'TASK2' : 'TASK1')),
  });

export const speakingBank = (part: 1 | 2 | 3, code: string, n: number): BankRow =>
  makeBank({ kind: `SPEAKING_P${part}`, code, questions: speakingQs(code, part, n) });

/** Stok minimum tepat satu kombinasi tiap section (Reading 14/13/13 = 40; Writing 1+1; Speaking 4/1/4). */
export function minimalPool(): BankRow[] {
  return [
    readingBank('READING_GT_S1', 'MIN-RD1', 14),
    readingBank('READING_GT_S2', 'MIN-RD2', 13),
    readingBank('READING_GT_S3', 'MIN-RD3', 13),
    writingBank('WRITING_GT_T1_FORMAL', 'MIN-W1', 1),
    writingBank('WRITING_GT_T2', 'MIN-W2', 1),
    speakingBank(1, 'MIN-SP1', 4),
    speakingBank(2, 'MIN-SP2', 1),
    speakingBank(3, 'MIN-SP3', 4),
  ];
}

/** Stok melimpah: 2 paket per jenis Reading (8 kombinasi 40 soal), 3 register Task 1 x 3 soal, Task 2 x 9, Speaking 9/6/8 (cukup untuk dua simulasi tanpa irisan: 4+4 pada Part 3). */
export function abundantPool(): BankRow[] {
  return [
    readingBank('READING_GT_S1', 'AB-RD1A', 14),
    readingBank('READING_GT_S1', 'AB-RD1B', 14),
    readingBank('READING_GT_S2', 'AB-RD2A', 13),
    readingBank('READING_GT_S2', 'AB-RD2B', 13),
    readingBank('READING_GT_S3', 'AB-RD3A', 13),
    readingBank('READING_GT_S3', 'AB-RD3B', 13),
    writingBank('WRITING_GT_T1_FORMAL', 'AB-W1F', 3),
    writingBank('WRITING_GT_T1_SEMI', 'AB-W1S', 3),
    writingBank('WRITING_GT_T1_INFORMAL', 'AB-W1I', 3),
    writingBank('WRITING_GT_T2', 'AB-W2', 9),
    speakingBank(1, 'AB-SP1', 9),
    speakingBank(2, 'AB-SP2', 6),
    speakingBank(3, 'AB-SP3', 8),
  ];
}

export const idsOf = (rows: BankRow[]): string[] =>
  rows.flatMap((b) => ((b.questionsJson as AnyQ[]) ?? []).map((q) => q.question_id as string));
