import type { QuestionPublic } from '@/contracts/attempts';
import { MIX_COUNT_MAX, MIX_COUNT_MIN, MIX_SKILLS, type MixRequest } from '@/contracts/mix';
import type { BankListItem } from '@/contracts/question-bank';

const AI_TYPES = new Set(['WRITING_TASK', 'SPEAKING_TASK']);

/** Bank yang boleh dipilih di Mix Builder (Listening ditandai server dengan `selectable_in_mix=false`). */
export function selectableBanks(banks: BankListItem[]): BankListItem[] {
  return banks.filter((b) => b.selectable_in_mix && (MIX_SKILLS as readonly string[]).includes(b.skill));
}

export function skillQuestionCount(banks: BankListItem[], skill: string): number {
  return banks.filter((b) => b.skill === skill).reduce((n, b) => n + b.question_count, 0);
}

/** Tipe soal yang ada pada bank-bank cakupan, urut menurun jumlah lalu nama. */
export function availableTypes(banks: BankListItem[]): Array<{ question_type: string; count: number }> {
  const m = new Map<string, number>();
  for (const b of banks) for (const t of b.question_types) m.set(t.question_type, (m.get(t.question_type) ?? 0) + t.count);
  return [...m.entries()]
    .map(([question_type, count]) => ({ question_type, count }))
    .sort((a, b) => b.count - a.count || a.question_type.localeCompare(b.question_type));
}

/**
 * Batas atas jumlah soal untuk cakupan bank + filter tipe (D5.2): soal objektif + maksimal 1 Writing + maksimal
 * 1 Speaking. Kesulitan tidak diketahui klien, jadi ini batas atas; server tetap pemutus (`422`).
 */
export function estimateCapacity(banks: BankListItem[], types: ReadonlySet<string>): number {
  let objective = 0;
  let writing = 0;
  let speaking = 0;
  for (const b of banks) {
    for (const t of b.question_types) {
      if (types.size > 0 && !types.has(t.question_type)) continue;
      if (t.question_type === 'WRITING_TASK') writing += t.count;
      else if (t.question_type === 'SPEAKING_TASK') speaking += t.count;
      else if (!AI_TYPES.has(t.question_type)) objective += t.count;
    }
  }
  return objective + Math.min(1, writing) + Math.min(1, speaking);
}

export type MixForm = {
  skills: string[];
  bankKinds: string[];
  types: string[];
  difficultyMin: number;
  difficultyMax: number;
  count: number;
};

/** Body `POST /mix-sessions` mode MANUAL; hanya mengirim filter yang membatasi. */
export function buildManualRequest(f: MixForm): MixRequest {
  const body: MixRequest = { count: f.count, mode: 'MANUAL' } as MixRequest;
  if (f.skills.length > 0) body.skills = f.skills as NonNullable<MixRequest['skills']>;
  if (f.bankKinds.length > 0) body.bank_kinds = f.bankKinds as NonNullable<MixRequest['bank_kinds']>;
  if (f.types.length > 0) body.question_types = f.types as NonNullable<MixRequest['question_types']>;
  if (f.difficultyMin > 1) body.difficulty_min = f.difficultyMin;
  if (f.difficultyMax < 5) body.difficulty_max = f.difficultyMax;
  return body;
}

/** Mode otomatis: semua skill, jumlah terpilih; bobot kelemahan ditentukan server. */
export function buildAutoRequest(count: number): MixRequest {
  return { count, mode: 'AUTO_WEAKNESS' };
}

export function clampCount(n: number, max: number): number {
  return Math.max(MIX_COUNT_MIN, Math.min(Math.min(MIX_COUNT_MAX, Math.max(MIX_COUNT_MIN, max)), Math.round(n)));
}

/* ---------- paket teks Reading ---------- */

export type MixPassageRef = { passage_no: number; markdown: string };

/** Teks bacaan soal Reading campuran: `passages[passage_index]` (null bila bukan Reading). */
export function passageForQuestion(
  question: Pick<QuestionPublic, 'passage_index'>,
  passages: MixPassageRef[] | null | undefined,
): MixPassageRef | null {
  const i = question.passage_index;
  if (i === null || i === undefined || !passages) return null;
  return passages[i] ?? null;
}
