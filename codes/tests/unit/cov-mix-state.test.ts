import { describe, expect, it } from 'vitest';
import { MIX_STATE_SCHEMA } from '@/contracts/mix';
import {
  hasNoSet,
  isMixAttempt,
  mixEntries,
  mixStateOf,
  mixTitle,
  STATE_ONLY_TYPES,
  virtualSetFor,
} from '@/server/mix/state';
import { ApiError } from '@/server/http/errors';

const entry = (id: string, skill: string) => ({ question_id: id, skill, bank_set_id: `set-${id}`, bank_code: 'B', question: { question_id: id } });

const stateOf = (mode: string, skills: string[]) =>
  ({ schema: MIX_STATE_SCHEMA, mode, questions: skills.map((s, i) => entry(`q${i}`, s)) }) as never;

const attempt = (over: Record<string, unknown>) =>
  ({ id: 'att-1', assessmentType: 'MIX_PRACTICE', assessmentSetId: null, state: null, createdAt: new Date(0), updatedAt: new Date(0), ...over }) as never;

describe('mix/state (penjaga status attempt campur)', () => {
  it('tipe state-only dan penanda attempt campur', () => {
    expect([...STATE_ONLY_TYPES].sort()).toEqual(['MIX_PRACTICE', 'MOCK_TEST', 'TRACK_CHECKPOINT']);
    expect(isMixAttempt({ assessmentType: 'MIX_PRACTICE' } as never)).toBe(true);
    expect(isMixAttempt({ assessmentType: 'MOCK_TEST' } as never)).toBe(false);
    expect(hasNoSet({ assessmentSetId: null })).toBe(true);
    expect(hasNoSet({ assessmentSetId: 'x' })).toBe(false);
  });

  it('mixStateOf menolak state kosong, skema asing, atau tanpa daftar soal (INTERNAL_ERROR, bukan bocor)', () => {
    for (const state of [null, { schema: 'lain', questions: [] }, { schema: MIX_STATE_SCHEMA, questions: 'x' }]) {
      expect(() => mixStateOf(attempt({ state }))).toThrow(ApiError);
    }
    const ok = stateOf('MANUAL', ['GRAMMAR']);
    expect(mixStateOf(attempt({ state: ok }))).toBe(ok);
  });

  it('mixTitle: mode otomatis vs manual, keterampilan unik berlabel', () => {
    expect(mixTitle(stateOf('AUTO_WEAKNESS', ['GRAMMAR', 'VOCAB']))).toBe('Latihan campur otomatis: 2 soal');
    expect(mixTitle(stateOf('MANUAL', ['GRAMMAR', 'GRAMMAR', 'READING']))).toBe('Latihan campur: 3 soal (Grammar, Reading)');
    expect(mixTitle(stateOf('MANUAL', ['ODD']))).toBe('Latihan campur: 1 soal (ODD)');
  });

  it('virtualSetFor membangun set maya (id = id attempt, tanpa batas waktu & passPercent)', () => {
    const set = virtualSetFor(attempt({ state: stateOf('MANUAL', ['GRAMMAR', 'VOCAB']) }));
    expect(set.id).toBe('att-1');
    expect(set.questionCount).toBe(2);
    expect(set.passPercent).toBeNull();
    expect(set.timeLimitSeconds).toBe(0);
    expect(set.status).toBe('PUBLISHED');
  });

  it('mixEntries memetakan question_id ke entri (sumber bank_set_id untuk jawaban)', () => {
    const map = mixEntries(stateOf('MANUAL', ['GRAMMAR', 'VOCAB']));
    expect(map.get('q1')?.bank_set_id).toBe('set-q1');
    expect(map.size).toBe(2);
  });
});
