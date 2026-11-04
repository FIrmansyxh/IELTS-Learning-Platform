import { describe, expect, it } from 'vitest';
import { OFFSETS, evidenceTierCap, nextDifficulty, pickNext, recommend, seedOf, type BankItem } from '@/server/exams/placement-rules';

const ID = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
/** Bank sintetis: 30 soal per tingkat = 150 soal. */
const bank150: BankItem[] = [1, 2, 3, 4, 5].flatMap((d) => Array.from({ length: 30 }, (_, i) => ({ question_id: `Q-PL-${d}-${String(i + 1).padStart(2, '0')}`, difficulty: d })));

interface Run {
  difficulties: number[];
  history: Array<{ difficulty: number; correct: boolean }>;
}
function simulate(bank: BankItem[], n: number, correctAt: (i: number, difficulty: number) => boolean, attemptId = ID): Run {
  const served: string[] = [];
  const history: Run['history'] = [];
  let d = 3;
  let next = pickNext(bank, served, d, attemptId);
  while (next && history.length < n) {
    served.push(next);
    const difficulty = bank.find((b) => b.question_id === next)!.difficulty;
    const ok = correctAt(history.length, difficulty);
    history.push({ difficulty, correct: ok });
    d = nextDifficulty(d, ok);
    next = history.length >= n ? null : pickNext(bank, served, d, attemptId);
  }
  return { difficulties: history.map((h) => h.difficulty), history };
}

describe('SPEC-015 D3: staircase', () => {
  it('semua benar -> 3,4,5,5,... (23 kali 5)', () => {
    const r = simulate(bank150, 25, () => true);
    expect(r.difficulties.slice(0, 3)).toEqual([3, 4, 5]);
    expect(r.difficulties.slice(2).every((x) => x === 5)).toBe(true);
    expect(r.difficulties.filter((x) => x === 5)).toHaveLength(23);
    const rec = recommend(r.history);
    expect(rec.ability).toBe(5.0);
    expect(rec.recommended_tier).toBe(4); // clamp(5, 1, 4)
  });
  it('semua salah -> 3,2,1,1,... -> Tier 1', () => {
    const r = simulate(bank150, 25, () => false);
    expect(r.difficulties.slice(0, 3)).toEqual([3, 2, 1]);
    expect(r.difficulties.filter((x) => x === 1)).toHaveLength(23);
    const rec = recommend(r.history);
    expect(rec.ability).toBe(1.0);
    expect(rec.correct_count).toBe(0);
    expect(rec.recommended_tier).toBe(1);
  });
  it('mulai benar lalu bergantian salah-benar -> ability 3.50, benar 13/25, Tier 3', () => {
    const r = simulate(bank150, 25, (i) => i % 2 === 0);
    expect(r.difficulties.slice(0, 4)).toEqual([3, 4, 3, 4]);
    const rec = recommend(r.history);
    expect(rec).toMatchObject({ ability: 3.5, correct_count: 13, served_count: 25, recommended_tier: 3 });
  });
  it('mulai salah lalu bergantian -> ability 2.50, benar 12/25, Tier 2', () => {
    const r = simulate(bank150, 25, (i) => i % 2 === 1);
    expect(r.difficulties.slice(0, 4)).toEqual([3, 2, 3, 2]);
    const rec = recommend(r.history);
    expect(rec).toMatchObject({ ability: 2.5, correct_count: 12, served_count: 25, recommended_tier: 2 });
  });
  it('tidak pernah menyajikan soal yang sama dua kali', () => {
    const served: string[] = [];
    let d = 3;
    for (let i = 0; i < 40; i++) {
      const n = pickNext(bank150, served, d, ID);
      expect(n).not.toBeNull();
      expect(served).not.toContain(n);
      served.push(n!);
      d = nextDifficulty(d, i % 3 !== 0);
    }
  });
  it('deterministik untuk attempt id yang sama dan berbeda antar id', () => {
    const a = simulate(bank150, 25, (i) => i % 2 === 0);
    const b = simulate(bank150, 25, (i) => i % 2 === 0);
    expect(a.history).toEqual(b.history);
    expect(seedOf(ID)).toBe(parseInt('9d8c7b6a', 16));
  });
  it('soal pertama berkesulitan 3', () => {
    const first = pickNext(bank150, [], 3, ID)!;
    expect(bank150.find((b) => b.question_id === first)!.difficulty).toBe(3);
  });
  it('tingkat 5 habis: ofset -1 (kesulitan 4) dipakai; urutan ofset +1,-1,+2,-2', () => {
    expect(OFFSETS.slice(0, 4)).toEqual([1, -1, 2, -2]);
    const bank: BankItem[] = [
      { question_id: 'A', difficulty: 4 },
      { question_id: 'B', difficulty: 3 },
    ];
    expect(pickNext(bank, [], 5, ID)).toBe('A');
    // d=3 tanpa soal 3 dan 4 dan 2 -> ofset +1 (4) dulu, bukan -1
    expect(pickNext([{ question_id: 'X', difficulty: 4 }, { question_id: 'Y', difficulty: 2 }], [], 3, ID)).toBe('X');
    expect(pickNext([{ question_id: 'Y', difficulty: 2 }, { question_id: 'Z', difficulty: 1 }], [], 3, ID)).toBe('Y');
  });
  it('tingkat 5 sudah tersaji semua: kesulitan 4 menggantikan', () => {
    const bank: BankItem[] = [
      { question_id: 'F1', difficulty: 5 },
      { question_id: 'F2', difficulty: 4 },
    ];
    expect(pickNext(bank, ['F1'], 5, ID)).toBe('F2');
  });
  it('bank habis -> null', () => {
    expect(pickNext([{ question_id: 'A', difficulty: 3 }], ['A'], 3, ID)).toBeNull();
  });
  it('kesulitan dibatasi 1..5', () => {
    expect(nextDifficulty(5, true)).toBe(5);
    expect(nextDifficulty(1, false)).toBe(1);
    expect(nextDifficulty(3, true)).toBe(4);
    expect(nextDifficulty(3, false)).toBe(2);
  });
});

describe('SPEC-015 D4: rekomendasi', () => {
  const h = (ds: number[], correct: (i: number) => boolean) => ds.map((difficulty, i) => ({ difficulty, correct: correct(i) }));
  it('safeguard: 7 benar dari 25 (28%) -> Tier 1 walau ability 3.2', () => {
    const ds = [...Array(15).fill(3), ...Array(8).fill(3), 4, 4]; // 10 terakhir: 3x8 + 4x2 = 3.2
    const r = recommend(h(ds, (i) => i < 7));
    expect(r.ability).toBe(3.2);
    expect(r.correct_count).toBe(7);
    expect(r.served_count).toBe(25);
    expect(r.recommended_tier).toBe(1);
  });
  it('tepat 32% tidak terkena safeguard (8/25)', () => {
    const r = recommend(h(Array(25).fill(3), (i) => i < 8));
    expect(r.recommended_tier).toBe(3);
  });
  it('tanpa jawaban -> Tier 1, ability 0', () => {
    expect(recommend([])).toEqual({ recommended_tier: 1, ability: 0, correct_count: 0, served_count: 0 });
  });
  it('ability memakai maksimal 10 soal terakhir dan pembulatan setengah ke atas 2 desimal', () => {
    const r = recommend(h([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4], () => true));
    expect(r.ability).toBe(4.9);
    expect(recommend(h([2, 2, 3], () => true)).ability).toBe(2.33);
    expect(recommend(h([2, 3, 3], () => true)).ability).toBe(2.67);
  });
  it('Tier 4 dibatasi clamp walau ability 5 (25 jawaban)', () => {
    expect(recommend(h(Array(25).fill(5), () => true)).recommended_tier).toBe(4);
  });
});

describe('SPEC-015 D4 (amandemen F-15-01): batas rekomendasi menurut bukti', () => {
  const h = (ds: number[], correct: (i: number) => boolean) => ds.map((difficulty, i) => ({ difficulty, correct: correct(i) }));
  it('evidenceTierCap: N=25 -> <=8 jawaban Tier 1, 9-16 maks 2, 17-24 maks 3, 25 -> 4', () => {
    const cap = (a: number) => evidenceTierCap(a, 25);
    for (const a of [0, 1, 2, 3, 8]) expect(cap(a)).toBe(1);
    for (const a of [9, 12, 16]) expect(cap(a)).toBe(2);
    for (const a of [17, 20, 24]) expect(cap(a)).toBe(3);
    expect(cap(25)).toBe(4);
  });
  it('1-3 jawaban benar (kesulitan 3,4,5) tetap Tier 1 walau ability 4.0', () => {
    const r1 = recommend(h([3], () => true));
    expect(r1).toMatchObject({ ability: 3, correct_count: 1, served_count: 1, recommended_tier: 1 });
    expect(recommend(h([3, 4], () => true)).recommended_tier).toBe(1);
    const r3 = recommend(h([3, 4, 5], () => true));
    expect(r3).toMatchObject({ ability: 4, correct_count: 3, served_count: 3, recommended_tier: 1 });
  });
  it('batas tepat: 8 jawaban -> 1; 9 -> 2; 16 -> 2; 17 -> 3; 24 -> 3; 25 -> 4 (semua benar kesulitan 5)', () => {
    const t = (n: number) => recommend(h(Array(n).fill(5), () => true)).recommended_tier;
    expect([t(8), t(9), t(16), t(17), t(24), t(25)]).toEqual([1, 2, 2, 3, 3, 4]);
  });
  it('hasil D4 yang lebih rendah dari batas bukti tidak dinaikkan (safeguard 32% tetap berlaku)', () => {
    expect(recommend(h(Array(25).fill(3), () => false)).recommended_tier).toBe(1);
    expect(recommend(h(Array(20).fill(2), () => true)).recommended_tier).toBe(2); // ability 2 < cap 3
  });
  it('N kustom: N=10, 10 jawaban -> bebas; 6 jawaban -> maks 2', () => {
    expect(recommend(h(Array(10).fill(5), () => true), 10).recommended_tier).toBe(4);
    expect(recommend(h(Array(6).fill(5), () => true), 10).recommended_tier).toBe(2);
  });
});
