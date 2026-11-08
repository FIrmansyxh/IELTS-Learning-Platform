import { describe, expect, it } from 'vitest';
import type { BankListItem } from '@/contracts/question-bank';
import { parseMaxAvailable } from '@/lib/api/mix';
import {
  availableTypes,
  buildAutoRequest,
  buildManualRequest,
  clampCount,
  estimateCapacity,
  passageForQuestion,
  selectableBanks,
} from './mix-utils';

const bank = (over: Partial<BankListItem> & Pick<BankListItem, 'bank_code' | 'skill'>): BankListItem => ({
  bank_kind: 'GRAMMAR_GT_REGISTER',
  title: over.bank_code,
  question_count: 0,
  question_types: [],
  has_passage: false,
  selectable_in_mix: true,
  ...over,
});

const grammar = bank({
  bank_code: 'GT-GR',
  skill: 'GRAMMAR',
  question_count: 16,
  question_types: [
    { question_type: 'MCQ_SINGLE', count: 12 },
    { question_type: 'ERROR_RECOGNITION', count: 4 },
  ],
});
const writing = bank({
  bank_code: 'GT-W1',
  skill: 'WRITING',
  bank_kind: 'WRITING_GT_T2',
  question_count: 9,
  question_types: [{ question_type: 'WRITING_TASK', count: 9 }],
});
const speaking = bank({
  bank_code: 'GT-S1',
  skill: 'SPEAKING',
  bank_kind: 'SPEAKING_P1',
  question_count: 9,
  question_types: [{ question_type: 'SPEAKING_TASK', count: 9 }],
});
const listening = bank({ bank_code: 'GT-L1', skill: 'LISTENING', bank_kind: 'LISTENING_GT_S1', question_count: 10, selectable_in_mix: false });

describe('mix-utils', () => {
  it('selectableBanks membuang bank Listening', () => {
    expect(selectableBanks([grammar, listening]).map((b) => b.bank_code)).toEqual(['GT-GR']);
  });

  it('estimateCapacity: objektif + maks 1 Writing + maks 1 Speaking (D5.2)', () => {
    expect(estimateCapacity([grammar, writing, speaking], new Set())).toBe(16 + 1 + 1);
    expect(estimateCapacity([writing], new Set())).toBe(1);
    expect(estimateCapacity([grammar], new Set(['ERROR_RECOGNITION']))).toBe(4);
    expect(estimateCapacity([grammar, writing], new Set(['WRITING_TASK']))).toBe(1);
  });

  it('availableTypes mengurutkan menurun jumlah lalu nama', () => {
    expect(availableTypes([grammar, writing]).map((t) => t.question_type)).toEqual([
      'MCQ_SINGLE',
      'WRITING_TASK',
      'ERROR_RECOGNITION',
    ]);
  });

  it('buildManualRequest hanya mengirim filter yang membatasi', () => {
    expect(
      buildManualRequest({ skills: ['GRAMMAR'], bankKinds: [], types: [], difficultyMin: 1, difficultyMax: 5, count: 10 }),
    ).toEqual({ count: 10, mode: 'MANUAL', skills: ['GRAMMAR'] });
    expect(
      buildManualRequest({
        skills: ['READING'],
        bankKinds: ['READING_GT_S1'],
        types: ['TFNG'],
        difficultyMin: 2,
        difficultyMax: 4,
        count: 12,
      }),
    ).toEqual({
      count: 12,
      mode: 'MANUAL',
      skills: ['READING'],
      bank_kinds: ['READING_GT_S1'],
      question_types: ['TFNG'],
      difficulty_min: 2,
      difficulty_max: 4,
    });
  });

  it('buildAutoRequest tidak membawa filter, user_id, atau skor', () => {
    expect(buildAutoRequest(15)).toEqual({ count: 15, mode: 'AUTO_WEAKNESS' });
  });

  it('clampCount menjaga 5..min(40, max)', () => {
    expect(clampCount(2, 40)).toBe(5);
    expect(clampCount(99, 40)).toBe(40);
    expect(clampCount(30, 12)).toBe(12);
    expect(clampCount(30, 3)).toBe(5);
  });

  it('parseMaxAvailable membaca details[].code', () => {
    expect(parseMaxAvailable([{ code: 'max_available:7' }])).toBe(7);
    expect(parseMaxAvailable([{ code: 'max_available:0' }])).toBe(0);
    expect(parseMaxAvailable([{ code: 'too_small' }])).toBeNull();
    expect(parseMaxAvailable(undefined)).toBeNull();
  });
});

describe('passageForQuestion', () => {
  const p0 = { passage_no: 1, markdown: 'Teks satu' };
  const p1 = { passage_no: 1, markdown: 'Teks dua (bank lain)' };

  it('memakai passages[passage_index]; paket Reading campur Grammar tetap benar', () => {
    const passages = [p0, p1];
    // urutan campuran: Reading(bank A), Grammar, Reading(bank B)
    expect(passageForQuestion({ passage_index: 0 }, passages)).toBe(p0);
    expect(passageForQuestion({ passage_index: null }, passages)).toBeNull();
    expect(passageForQuestion({ passage_index: 1 }, passages)).toBe(p1);
  });

  it('indeks di luar rentang, tanpa indeks, atau tanpa passages -> null', () => {
    expect(passageForQuestion({ passage_index: 5 }, [p0])).toBeNull();
    expect(passageForQuestion({}, [p0])).toBeNull();
    expect(passageForQuestion({ passage_index: 0 }, null)).toBeNull();
  });
});
