import { describe, expect, it } from 'vitest';
import type { Question } from '@/contracts/content';
import {
  correctTwiceInRow,
  effectiveCapacity,
  filterPool,
  questionWeight,
  rngFromSeed,
  selectMix,
  skillWeights,
  wrongRatioByType,
  type HistoryAnswer,
  type MixHistory,
  type PoolQuestion,
} from '@/server/mix/select';

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const DAY = 24 * 3600 * 1000;
const EMPTY: MixHistory = { answers: [], now_ms: NOW };

let seq = 0;
function pq(over: Partial<PoolQuestion> & { skill: string }): PoolQuestion {
  seq++;
  return {
    question_id: `Q-X-${String(seq).padStart(4, '0')}`,
    bank_set_id: 'set-a',
    bank_code: 'GT-A',
    bank_kind: 'GRAMMAR_GT_REGISTER',
    bank_version: 1,
    question_type: 'MCQ_SINGLE',
    difficulty: 3,
    passage_no: null,
    position: seq,
    question: {} as Question,
    ...over,
  };
}
const many = (n: number, over: Partial<PoolQuestion> & { skill: string }) => Array.from({ length: n }, () => pq(over));
const ids = (qs: PoolQuestion[]) => qs.map((q) => q.question_id);

describe('selectMix: filter pool (D5.1)', () => {
  const pool = [
    pq({ skill: 'GRAMMAR', bank_kind: 'GRAMMAR_GT_REGISTER', question_type: 'MCQ_SINGLE', difficulty: 1 }),
    pq({ skill: 'GRAMMAR', bank_kind: 'GRAMMAR_GT_REGISTER', question_type: 'TFNG', difficulty: null }),
    pq({ skill: 'VOCAB', bank_kind: 'VOCAB_GT_EVERYDAY', question_type: 'MCQ_SINGLE', difficulty: 5 }),
    pq({ skill: 'LISTENING', bank_kind: 'LISTENING_GT_S1', question_type: 'MCQ_SINGLE' }),
  ];
  it('Listening tidak pernah masuk, filter berlaku AND', () => {
    expect(filterPool(pool, { count: 5, mode: 'MANUAL' })).toHaveLength(3);
    expect(filterPool(pool, { skills: ['GRAMMAR'], question_types: ['TFNG'], count: 5, mode: 'MANUAL' })).toHaveLength(1);
    expect(filterPool(pool, { bank_kinds: ['VOCAB_GT_EVERYDAY'], count: 5, mode: 'MANUAL' })).toHaveLength(1);
    expect(filterPool(pool, { skills: ['LISTENING'], count: 5, mode: 'MANUAL' })).toHaveLength(0);
  });
  it('difficulty kosong dianggap 3', () => {
    expect(filterPool(pool, { difficulty_min: 3, difficulty_max: 3, count: 5, mode: 'MANUAL' }).map((q) => q.question_type)).toEqual(['TFNG']);
    expect(filterPool(pool, { difficulty_min: 4, count: 5, mode: 'MANUAL' })).toHaveLength(1);
  });
});

describe('selectMix: MANUAL', () => {
  const pool = [...many(30, { skill: 'GRAMMAR' }), ...many(30, { skill: 'VOCAB', bank_kind: 'VOCAB_GT_EVERYDAY', bank_code: 'GT-V', bank_set_id: 'set-v' })];

  it('tepat count soal unik, deterministik untuk seed sama, beda untuk seed berbeda', () => {
    const run = (seed: string) => selectMix(pool, { count: 10, mode: 'MANUAL' }, [], EMPTY, rngFromSeed(seed));
    const a = run('a1');
    const b = run('a1');
    const c = run('zz-9');
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(a.questions).toHaveLength(10);
    expect(new Set(ids(a.questions)).size).toBe(10);
    expect(ids(a.questions)).toEqual(ids(b.questions));
    expect(ids(a.questions)).not.toEqual(ids(c.questions));
  });
  it('hasil tidak bergantung pada urutan baris masukan', () => {
    const a = selectMix(pool, { count: 12, mode: 'MANUAL' }, [], EMPTY, rngFromSeed('s'));
    const b = selectMix([...pool].reverse(), { count: 12, mode: 'MANUAL' }, [], EMPTY, rngFromSeed('s'));
    expect(a.ok && b.ok && ids((a as { questions: PoolQuestion[] }).questions)).toEqual(ids((b as { questions: PoolQuestion[] }).questions));
  });
});

describe('AC-4: AUTO_WEAKNESS memberi bobot ke skill terlemah', () => {
  const pool = [
    ...many(50, { skill: 'GRAMMAR' }),
    ...many(50, { skill: 'VOCAB', bank_kind: 'VOCAB_GT_EVERYDAY', bank_code: 'GT-V', bank_set_id: 'set-v' }),
  ];
  const proportion = (radar: Array<{ skill: string; estimated_band: number | null }>) => {
    let grammar = 0;
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = selectMix(pool, { count: 10, mode: 'AUTO_WEAKNESS' }, radar, EMPTY, rngFromSeed(String(seed)));
      if (!r.ok) throw new Error('pool cukup');
      grammar += r.questions.filter((q) => q.skill === 'GRAMMAR').length;
      total += r.questions.length;
    }
    return grammar / total;
  };
  it('radar GRAMMAR 4.0 dan VOCAB 8.0 -> proporsi GRAMMAR di [0,75; 0,92]', () => {
    const p = proportion([{ skill: 'GRAMMAR', estimated_band: 4 }, { skill: 'VOCAB', estimated_band: 8 }]);
    expect(p).toBeGreaterThanOrEqual(0.75);
    expect(p).toBeLessThanOrEqual(0.92);
  });
  it('radar kosong -> proporsi GRAMMAR di [0,45; 0,55]', () => {
    const p = proportion([]);
    expect(p).toBeGreaterThanOrEqual(0.45);
    expect(p).toBeLessThanOrEqual(0.55);
  });
});

describe('bobot skill (D5.3)', () => {
  it('W_skill = max(9 - band, 0,5); skill tanpa nilai memakai rata-rata gap', () => {
    const w = skillWeights(['GRAMMAR', 'VOCAB', 'READING'], [
      { skill: 'GRAMMAR', estimated_band: 4 },
      { skill: 'VOCAB', estimated_band: 8.5 },
      { skill: 'READING', estimated_band: null },
    ]);
    expect(w.get('GRAMMAR')).toBe(5);
    expect(w.get('VOCAB')).toBe(0.5); // gap 0,5 sama dengan lantai
    expect(w.get('READING')).toBeCloseTo((5 + 0.5) / 2, 10); // rata-rata gap skill yang bernilai
  });
  it('lantai 0,5 dan seragam bila tak ada nilai', () => {
    expect(skillWeights(['GRAMMAR'], [{ skill: 'GRAMMAR', estimated_band: 9 }]).get('GRAMMAR')).toBe(0.5);
    const u = skillWeights(['GRAMMAR', 'VOCAB'], [{ skill: 'GRAMMAR', estimated_band: null }]);
    expect([u.get('GRAMMAR'), u.get('VOCAB')]).toEqual([1, 1]);
  });
});

describe('AC-5: bobot soal T_q dan jendela 30 hari', () => {
  const ans = (over: Partial<HistoryAnswer>): HistoryAnswer => ({
    question_id: 'Q-A',
    question_type: 'TFNG',
    is_correct: false,
    answered_at_ms: NOW - DAY,
    attempt_final: true,
    ...over,
  });

  it('salah_tipe_30h mengabaikan jawaban > 30 hari, attempt belum final, dan jawaban tanpa is_correct', () => {
    const h: MixHistory = {
      now_ms: NOW,
      answers: [
        ans({ is_correct: false }),
        ans({ is_correct: true, question_id: 'Q-B' }),
        ans({ is_correct: false, question_id: 'Q-OLD', answered_at_ms: NOW - 31 * DAY }),
        ans({ is_correct: false, question_id: 'Q-LIVE', attempt_final: false }),
        ans({ is_correct: null, question_id: 'Q-AI' }),
      ],
    };
    expect(wrongRatioByType(h).get('TFNG')).toBe(0.5);
    expect(wrongRatioByType({ ...h, now_ms: NOW + 30 * DAY }).get('TFNG')).toBeUndefined(); // semua > 30 hari -> 0 (tak ada)
  });

  it('batas tepat 30 hari masih dihitung', () => {
    const h: MixHistory = { now_ms: NOW, answers: [ans({ answered_at_ms: NOW - 30 * DAY })] };
    expect(wrongRatioByType(h).get('TFNG')).toBe(1);
  });

  it('benar 2x berturut-turut -> bobot 0,3 x normal; satu salah di antara dua terbaru membatalkan', () => {
    const base = { question_id: 'Q-A', question_type: 'TFNG', skill: 'READING' };
    const wrong = new Map([['TFNG', 0.5]]);
    const both = correctTwiceInRow({ now_ms: NOW, answers: [ans({ is_correct: true, answered_at_ms: NOW - 2 * DAY }), ans({ is_correct: true, answered_at_ms: NOW - DAY })] });
    expect(both.has('Q-A')).toBe(true);
    expect(questionWeight(base, wrong, both)).toBeCloseTo(1.5 * 0.3, 10);
    expect(questionWeight(base, wrong, new Set())).toBe(1.5);

    const mixed = correctTwiceInRow({
      now_ms: NOW,
      answers: [
        ans({ is_correct: true, answered_at_ms: NOW - 3 * DAY }),
        ans({ is_correct: true, answered_at_ms: NOW - 2 * DAY }),
        ans({ is_correct: false, answered_at_ms: NOW - DAY }), // terbaru salah -> belum 2x berturut-turut
      ],
    });
    expect(mixed.has('Q-A')).toBe(false);
    expect(correctTwiceInRow({ now_ms: NOW, answers: [ans({ is_correct: true })] }).size).toBe(0); // hanya satu jawaban
  });

  it('Writing dan Speaking selalu berbobot soal 1', () => {
    const wrong = new Map([['WRITING_TASK', 1]]);
    expect(questionWeight({ question_id: 'Q-W', question_type: 'WRITING_TASK', skill: 'WRITING' }, wrong, new Set(['Q-W']))).toBe(1);
  });

  it('bobot soal memengaruhi penarikan: soal yang sudah benar 2x jarang muncul lagi', () => {
    const pool = many(10, { skill: 'GRAMMAR' });
    const mastered = pool[0]!.question_id;
    const history: MixHistory = {
      now_ms: NOW,
      answers: [
        { question_id: mastered, question_type: 'MCQ_SINGLE', is_correct: true, answered_at_ms: NOW - 2 * DAY, attempt_final: true },
        { question_id: mastered, question_type: 'MCQ_SINGLE', is_correct: true, answered_at_ms: NOW - DAY, attempt_final: true },
      ],
    };
    let hits = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = selectMix(pool, { count: 5, mode: 'AUTO_WEAKNESS' }, [], history, rngFromSeed(`k${seed}`));
      if (r.ok && r.questions.some((q) => q.question_id === mastered)) hits++;
    }
    const baseline = (5 / 10) * 400; // MANUAL/seragam
    expect(hits).toBeLessThan(baseline * 0.7);
  });
});

describe('AC-6: batas Writing/Speaking', () => {
  it('maksimal 1 WRITING_TASK dan 1 SPEAKING_TASK walau pool banyak', () => {
    const pool = [
      ...many(60, { skill: 'GRAMMAR' }),
      ...many(5, { skill: 'WRITING', question_type: 'WRITING_TASK', bank_kind: 'WRITING_GT_T2', bank_code: 'GT-W', bank_set_id: 'set-w' }),
      ...many(5, { skill: 'SPEAKING', question_type: 'SPEAKING_TASK', bank_kind: 'SPEAKING_P1', bank_code: 'GT-S', bank_set_id: 'set-s' }),
    ];
    for (const mode of ['MANUAL', 'AUTO_WEAKNESS'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const r = selectMix(pool, { count: 40, mode }, [], EMPTY, rngFromSeed(`w${seed}`));
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(r.questions).toHaveLength(40);
        expect(r.questions.filter((q) => q.question_type === 'WRITING_TASK').length).toBeLessThanOrEqual(1);
        expect(r.questions.filter((q) => q.question_type === 'SPEAKING_TASK').length).toBeLessThanOrEqual(1);
      }
    }
  });
  it('pool 5 soal Writing saja dan count=5 -> max_available 1', () => {
    const pool = many(5, { skill: 'WRITING', question_type: 'WRITING_TASK' });
    expect(effectiveCapacity(pool)).toBe(1);
    expect(selectMix(pool, { count: 5, mode: 'MANUAL' }, [], EMPTY, rngFromSeed('x'))).toEqual({ ok: false, max_available: 1 });
  });
  it('kapasitas efektif = objektif + min(1, W) + min(1, S)', () => {
    const pool = [...many(3, { skill: 'GRAMMAR' }), ...many(2, { skill: 'WRITING' }), ...many(2, { skill: 'SPEAKING' })];
    expect(effectiveCapacity(pool)).toBe(5);
  });
});

describe('paket Reading (D4, D5.4)', () => {
  const reading = (bank: string, setId: string, passage: number, n: number, startPos: number) =>
    Array.from({ length: n }, (_, i) =>
      pq({ skill: 'READING', bank_kind: 'READING_GT_S1', bank_code: bank, bank_set_id: setId, passage_no: passage, position: startPos + i, question_type: 'TFNG' }),
    );

  it('count < ukuran paket: hanya count soal pertama paket (urutan bank)', () => {
    const pool = reading('GT-R', 'set-r', 1, 8, 0);
    const r = selectMix(pool, { skills: ['READING'], count: 5, mode: 'MANUAL' }, [], EMPTY, rngFromSeed('p'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it('paket masuk utuh dan berurutan, tanpa duplikat, dan campur dengan soal lain', () => {
    const pool = [...reading('GT-R', 'set-r', 1, 4, 0), ...reading('GT-R', 'set-r', 2, 4, 4), ...many(20, { skill: 'GRAMMAR' })];
    for (let seed = 1; seed <= 40; seed++) {
      const r = selectMix(pool, { count: 12, mode: 'MANUAL' }, [], EMPTY, rngFromSeed(`m${seed}`));
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(new Set(ids(r.questions)).size).toBe(12);
      for (const p of [1, 2]) {
        const idx = r.questions.map((q, i) => (q.passage_no === p ? i : -1)).filter((i) => i >= 0);
        if (idx.length === 0) continue;
        // berurutan (kontigu) dan menaik menurut urutan bank
        expect(idx[idx.length - 1]! - idx[0]! + 1).toBe(idx.length);
        const pos = idx.map((i) => r.questions[i]!.position);
        expect(pos).toEqual([...pos].sort((a, b) => a - b));
        // paket utuh kecuali terpotong di akhir oleh count
        if (idx[idx.length - 1] !== r.questions.length - 1) expect(idx).toHaveLength(4);
      }
    }
  });

  it('paket Reading tidak dimasukkan dua kali walau soal lain dari paket yang sama tertarik', () => {
    const pool = reading('GT-R', 'set-r', 1, 6, 0);
    const r = selectMix(pool, { skills: ['READING'], count: 6, mode: 'AUTO_WEAKNESS' }, [], EMPTY, rngFromSeed('q'));
    expect(r.ok && new Set(ids(r.questions)).size).toBe(6);
  });
});
