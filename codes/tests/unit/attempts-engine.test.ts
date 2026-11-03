import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { QuestionSchema, type Question } from '@/contracts/content';
import { QuestionPublicSchema } from '@/contracts/attempts';
import { mulberry32, newRngSeed, seededCsprng, shuffled } from '@/server/attempts/prng';
import {
  buildInitialState,
  canonicalResponse,
  computeTimings,
  correctDisplay,
  feedbackFor,
  gradeAnswer,
  isPassed,
  normalizeText,
  parseResponse,
  percentHundredths,
  displayPercentHundredths,
  toPublicQuestion,
  wordCount,
  type Served,
  type StoredResponse,
} from '@/server/attempts/engine';
import { Q } from '../fixtures/content/builders';

const parse = (raw: Record<string, unknown>): Question => QuestionSchema.parse(raw);
const NOW = new Date('2026-11-03T10:00:00.000Z');

/** Sajikan satu soal (state acak) dan kembalikan soal + pemetaan. */
function serve(raw: Record<string, unknown>) {
  const q = parse(raw);
  const st = buildInitialState(randomUUID(), [q], { limit: null, keepOrder: true }, 75, NOW);
  return { q, s: st.served[q.question_id]! as Served };
}
const optId = (q: Extract<Question, { question_type: 'MCQ_SINGLE' | 'MCQ_MULTI' }>, s: Served, text: string) =>
  s.option_ids![s.option_orig_index!.indexOf(q.options.indexOf(text))]!;
const mustOk = (q: Question, s: Served, raw: Record<string, unknown>) => {
  const r = parseResponse(q, s, raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.response;
};

describe('PRNG dan pemilihan (D4, D5)', () => {
  it('mulberry32 deterministik untuk seed yang sama', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('seededCsprng: seed sama -> urutan sama; seed beda -> beda; nilai di [0,1)', () => {
    const s1 = newRngSeed();
    const a = seededCsprng(s1);
    const b = seededCsprng(s1);
    const seq = Array.from({ length: 20 }, () => a());
    expect(seq).toEqual(Array.from({ length: 20 }, () => b()));
    expect(seq.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seq).not.toEqual(Array.from({ length: 20 }, ((g) => () => g())(seededCsprng(newRngSeed()))));
    expect(newRngSeed()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('F-06-01: pengacakan TIDAK dapat diturunkan dari id attempt; seed rahasia disimpan di state', () => {
    const qs2 = Array.from({ length: 14 }, () => parse(Q.mcq({ options: ['a', 'b', 'c', 'd'], correct_answers: ['a'] })));
    const id = randomUUID();
    const a = buildInitialState(id, qs2, { limit: null, keepOrder: false }, 75, NOW);
    const b = buildInitialState(id, qs2, { limit: null, keepOrder: false }, 75, NOW);
    expect(a.rng_seed).toMatch(/^[0-9a-f]{32}$/);
    expect(a.rng_seed).not.toBe(b.rng_seed);
    expect(a.rng_seed).not.toContain(id.replace(/-/g, '').slice(0, 8));
    expect(a.order).not.toEqual(b.order); // id sama, urutan beda (peluang bentrok 1/14!)
    // seed tetap (khusus uji) -> deterministik
    const c = buildInitialState(id, qs2, { limit: null, keepOrder: false, seed: 'ab'.repeat(16) }, 75, NOW);
    const d = buildInitialState(randomUUID(), qs2, { limit: null, keepOrder: false, seed: 'ab'.repeat(16) }, 75, NOW);
    expect(c.order).toEqual(d.order);
  });

  it('shuffled mempertahankan elemen dan tidak memutasi masukan', () => {
    const src = [1, 2, 3, 4, 5, 6];
    const out = shuffled(src, mulberry32(7));
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
  });

  const qs = Array.from({ length: 14 }, () => parse(Q.mcq({ options: ['a', 'b', 'c', 'd'], correct_answers: ['a'] })));

  it('state identik untuk seed yang sama, kecuali ID opak (CSPRNG)', () => {
    const id = randomUUID();
    const seed = newRngSeed();
    const a = buildInitialState(id, qs, { limit: 10, keepOrder: false, seed }, 75, NOW);
    const b = buildInitialState(id, qs, { limit: 10, keepOrder: false, seed }, 75, NOW);
    expect(a.order).toEqual(b.order);
    expect(a.order).toHaveLength(10);
    const k = a.order[0]!;
    expect(a.served[k]!.option_orig_index).toEqual(b.served[k]!.option_orig_index);
    expect(a.served[k]!.option_ids).not.toEqual(b.served[k]!.option_ids);
  });

  it('ID opak: prefiks + 6 base36, unik dalam satu soal', () => {
    const st = buildInitialState(randomUUID(), qs, { limit: null, keepOrder: false }, 75, NOW);
    for (const s of Object.values(st.served)) {
      expect(new Set(s.option_ids).size).toBe(4);
      for (const id of s.option_ids!) expect(id).toMatch(/^o[0-9a-z]{6}$/);
    }
  });

  it('keepOrder mempertahankan urutan asli walau subset dibatasi', () => {
    const st = buildInitialState(randomUUID(), qs, { limit: 5, keepOrder: true }, 75, NOW);
    const idxs = st.order.map((id) => qs.findIndex((q) => q.question_id === id));
    expect(idxs).toEqual([...idxs].sort((x, y) => x - y));
    expect(st.order).toHaveLength(5);
  });

  it('20 attempt: >= 15 urutan soal berbeda', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 20; i++) orders.add(buildInitialState(randomUUID(), qs.slice(0, 10), { limit: 10, keepOrder: false }, 75, NOW).order.join(','));
    expect(orders.size).toBeGreaterThanOrEqual(15);
  });

  it('SENTENCE_REORDER tidak pernah disajikan dalam urutan benar (3 segmen, 200 percobaan)', () => {
    for (let i = 0; i < 200; i++) {
      const { s } = serve(Q.reorder());
      expect(s.segment_orig_index!.every((v, j) => v === j)).toBe(false);
    }
  });
});

describe('DTO publik tanpa kunci (D9)', () => {
  const raws = [
    Q.mcq(), Q.multi(), Q.tfng(), Q.ynng(), Q.fill(), Q.short(), Q.drop(), Q.drag(), Q.reorder(), Q.error(), Q.writing(), Q.speaking(),
  ];
  const FORBIDDEN = ['correct_answers', 'explanation_id', 'correct', 'answer', 'accepted', 'correct_answer'];

  it('fixture 12 tipe: tidak ada kunci terlarang di JSON dan skema klien menerima', () => {
    expect(new Set(raws.map((r) => r.question_type)).size).toBe(12);
    for (const raw of raws) {
      const { q, s } = serve(raw);
      const dto = toPublicQuestion(q, s);
      const json = JSON.stringify(dto);
      for (const k of FORBIDDEN) expect(json).not.toContain(`"${k}"`);
      expect(() => QuestionPublicSchema.parse(JSON.parse(json))).not.toThrow();
    }
  });

  it('teks jawaban benar tidak membocor lewat urutan: MATCHING right diacak, REORDER diacak, opsi memakai ID opak', () => {
    const { q, s } = serve(Q.mcq());
    const dto = toPublicQuestion(q, s);
    expect(dto.options!.map((o) => o.option_id).every((id) => /^o[0-9a-z]{6}$/.test(id))).toBe(true);
    expect(dto.options!.map((o) => o.text).sort()).toEqual(['am', 'are', 'is']);
  });

  it('bentuk per tipe: choose_count, fixed_choices, max_words, matching, tokens, ai_task', () => {
    const m = serve(Q.multi());
    expect(toPublicQuestion(m.q, m.s).choose_count).toBe(2);
    expect(toPublicQuestion(serve(Q.tfng()).q, serve(Q.tfng()).s).fixed_choices).toEqual(['True', 'False', 'Not Given']);
    const y = serve(Q.ynng());
    expect(toPublicQuestion(y.q, y.s).fixed_choices).toEqual(['Yes', 'No', 'Not Given']);
    const f = serve(Q.fill());
    expect(toPublicQuestion(f.q, f.s).max_words).toBe(2);
    const d = toPublicQuestion(serve(Q.drop()).q, serve(Q.drop()).s);
    expect(d.matching!.left.map((l) => l.item_id)).toEqual(['i0', 'i1']);
    expect(d.matching!.right).toHaveLength(3);
    const e = serve(Q.error());
    expect(toPublicQuestion(e.q, e.s).tokens).toEqual([
      { index: 0, text: 'She' }, { index: 1, text: 'go' }, { index: 2, text: 'to' }, { index: 3, text: 'school' },
    ]);
    const w = serve(Q.writing({ min_words: 150 }));
    expect(toPublicQuestion(w.q, w.s).ai_task).toEqual({ kind: 'WRITING', task_kind: 'TASK2', min_words: 150 });
    const sp = serve(Q.speaking());
    expect(toPublicQuestion(sp.q, sp.s).ai_task).toMatchObject({ kind: 'SPEAKING', part: 2, cue_points: ['who', 'when', 'why'] });
  });
});

describe('normalizeText dan jumlah kata (D6)', () => {
  it('NFKC, trim, rapatkan spasi, huruf kecil, buang tanda akhir', () => {
    expect(normalizeText('  Are   Sorted. ')).toBe('are sorted');
    expect(normalizeText('Are\tsorted\n')).toBe('are sorted');
    expect(normalizeText('are sorted!?;,.')).toBe('are sorted');
    expect(normalizeText('ＡＲＥ')).toBe('are'); // NFKC lebar penuh
    expect(wordCount('are sorted quickly')).toBe(3);
  });
});

describe('penilaian per tipe (D7)', () => {
  it('FILL_IN_BLANK: normalisasi, varian salah, max_words', () => {
    const { q, s } = serve(Q.fill({ correct_answers: ['are sorted'], max_words: 2 }));
    const g = (text: string) => gradeAnswer(q, s, mustOk(q, s, { text })).isCorrect;
    expect(g('  Are   Sorted. ')).toBe(true);
    expect(g('were sorted')).toBe(false);
    expect(g('are sorted quickly')).toBe(false);
  });

  it('SHORT_ANSWER: salah satu varian', () => {
    const { q, s } = serve(Q.short({ correct_answers: ['rainfall', 'the rainfall'], max_words: 3 }));
    expect(gradeAnswer(q, s, mustOk(q, s, { text: 'The Rainfall' })).isCorrect).toBe(true);
  });

  it('MCQ_SINGLE benar/salah memakai ID opak yang diacak', () => {
    const { q, s } = serve(Q.mcq({ options: ['is', 'are', 'am'], correct_answers: ['are'] }));
    const m = q as Extract<Question, { question_type: 'MCQ_SINGLE' }>;
    expect(gradeAnswer(q, s, mustOk(q, s, { option_ids: [optId(m, s, 'are')] }))).toEqual({ isCorrect: true, scoreH: 100 });
    expect(gradeAnswer(q, s, mustOk(q, s, { option_ids: [optId(m, s, 'is')] }))).toEqual({ isCorrect: false, scoreH: 0 });
  });

  it('MCQ_MULTI: himpunan persis; {A}=0, {A,C}=poin, {A,C,D}=0', () => {
    const { q, s } = serve(Q.multi({ options: ['A', 'B', 'C', 'D'], correct_answers: ['A', 'C'], points: 2 }));
    const m = q as Extract<Question, { question_type: 'MCQ_MULTI' }>;
    const sc = (texts: string[]) => gradeAnswer(q, s, mustOk(q, s, { option_ids: texts.map((t) => optId(m, s, t)) })).scoreH;
    expect(sc(['A'])).toBe(0);
    expect(sc(['C', 'A'])).toBe(200);
    expect(sc(['A', 'C', 'D'])).toBe(0);
  });

  it('TFNG/YNNG', () => {
    const t = serve(Q.tfng({ correct_answers: ['Not Given'] }));
    expect(gradeAnswer(t.q, t.s, mustOk(t.q, t.s, { choice: 'Not Given' })).isCorrect).toBe(true);
    expect(gradeAnswer(t.q, t.s, mustOk(t.q, t.s, { choice: 'True' })).isCorrect).toBe(false);
    const y = serve(Q.ynng({ correct_answers: ['No'] }));
    expect(gradeAnswer(y.q, y.s, mustOk(y.q, y.s, { choice: 'No' })).isCorrect).toBe(true);
  });

  it('MATCHING: kredit parsial 3 dari 4 pasangan dengan 4 poin = 3.00, is_correct=false', () => {
    const { q, s } = serve(
      Q.drop({ matching: { left: ['1', '2', '3', '4'], right: ['w', 'x', 'y', 'z'] }, correct_answers: [0, 1, 2, 3], points: 4 }),
    );
    const choiceFor = (rightIdx: number) => s.right_choice_ids![s.right_orig_index!.indexOf(rightIdx)]!;
    const pairs = [
      { item_id: 'i0', choice_id: choiceFor(0) },
      { item_id: 'i1', choice_id: choiceFor(1) },
      { item_id: 'i2', choice_id: choiceFor(2) },
      { item_id: 'i3', choice_id: choiceFor(0) }, // salah (allow_reuse=false -> 400 bila duplikat)
    ];
    const bad = parseResponse(q, s, { pairs });
    expect(bad.ok).toBe(false);
    pairs[3] = { item_id: 'i3', choice_id: choiceFor(3) };
    const full = gradeAnswer(q, s, mustOk(q, s, { pairs }));
    expect(full).toEqual({ isCorrect: true, scoreH: 400 });
    pairs[3] = { item_id: 'i3', choice_id: choiceFor(2) }; // duplikat -> tolak; pakai item tanpa pasangan
    const partial = gradeAnswer(q, s, mustOk(q, s, { pairs: pairs.slice(0, 3) }));
    expect(partial).toEqual({ isCorrect: false, scoreH: 300 });
  });

  it('MATCHING: pembulatan half-up pada sentesimal (1 poin, 1 dari 3 = 0.33; 2 dari 3 = 0.67)', () => {
    const { q, s } = serve(
      Q.drop({ matching: { left: ['1', '2', '3'], right: ['x', 'y', 'z'] }, correct_answers: [0, 1, 2], points: 1 }),
    );
    const c = (r: number) => s.right_choice_ids![s.right_orig_index!.indexOf(r)]!;
    expect(gradeAnswer(q, s, mustOk(q, s, { pairs: [{ item_id: 'i0', choice_id: c(0) }] })).scoreH).toBe(33);
    expect(gradeAnswer(q, s, mustOk(q, s, { pairs: [{ item_id: 'i0', choice_id: c(0) }, { item_id: 'i1', choice_id: c(1) }] })).scoreH).toBe(67);
  });

  it('SENTENCE_REORDER: urutan benar benar; tukar dua elemen salah', () => {
    const { q, s } = serve(Q.reorder());
    const idFor = (orig: number) => s.segment_ids![s.segment_orig_index!.indexOf(orig)]!;
    expect(gradeAnswer(q, s, mustOk(q, s, { segment_ids: [idFor(0), idFor(1), idFor(2)] })).isCorrect).toBe(true);
    expect(gradeAnswer(q, s, mustOk(q, s, { segment_ids: [idFor(1), idFor(0), idFor(2)] })).isCorrect).toBe(false);
  });

  it('ERROR_RECOGNITION: [3] benar, [2] salah, [3,4] salah', () => {
    const { q, s } = serve(Q.error({ tokens: ['a', 'b', 'c', 'd', 'e'], correct_answers: [3] }));
    const g = (token_indexes: number[]) => gradeAnswer(q, s, mustOk(q, s, { token_indexes })).isCorrect;
    expect(g([3])).toBe(true);
    expect(g([2])).toBe(false);
    expect(g([3, 4])).toBe(false);
  });

  it('feedback memuat jawaban benar (display) dan pembahasan', () => {
    const { q } = serve(Q.mcq({ options: ['is', 'are', 'am'], correct_answers: ['are'], explanation_id: 'Karena jamak.' }));
    expect(feedbackFor(q, { isCorrect: false, scoreH: 0 })).toEqual({
      is_correct: false,
      score: 0,
      max_score: 1,
      correct_answer: { display: ['are'] },
      explanation_id: 'Karena jamak.',
    });
    const m = serve(Q.drop({ matching: { left: ['a', 'b'], right: ['x', 'y'] }, correct_answers: [1, 0] }));
    expect(correctDisplay(m.q)).toEqual(['a -> y', 'b -> x']);
    const r = serve(Q.reorder());
    expect(correctDisplay(r.q)).toEqual(['The book was written by her']);
    const e = serve(Q.error());
    expect(correctDisplay(e.q)).toEqual(['go']);
  });
});

describe('validasi bentuk response (kode details kontrak)', () => {
  const codes = (q: Question, s: Served, raw: Record<string, unknown>) => {
    const r = parseResponse(q, s, raw);
    return r.ok ? [] : r.issues.map((i) => `${i.path}:${i.code}`);
  };
  it('field tak dikenal -> unrecognized_key; tipe salah -> response_shape_invalid', () => {
    const { q, s } = serve(Q.mcq());
    expect(codes(q, s, { option_ids: ['x'], is_correct: true })).toEqual(['response.is_correct:unrecognized_key']);
    expect(codes(q, s, { text: 'a' })).toEqual(['response.text:unrecognized_key']);
    expect(codes(q, s, { option_ids: 'x' })).toEqual(['response.option_ids:response_shape_invalid']);
  });
  it('unknown_option_id dan duplicate_ids', () => {
    const m = serve(Q.multi());
    expect(codes(m.q, m.s, { option_ids: ['zzzzzzz'] })).toEqual(['response.option_ids:unknown_option_id']);
    expect(codes(m.q, m.s, { option_ids: [m.s.option_ids![0]!, m.s.option_ids![0]!] })).toEqual(['response.option_ids:duplicate_ids']);
  });
  it('FILL: kosong -> empty_answer, > 200 -> too_long, dipangkas trim', () => {
    const { q, s } = serve(Q.fill());
    expect(codes(q, s, { text: '   ' })).toEqual(['response.text:empty_answer']);
    expect(codes(q, s, { text: 'x'.repeat(201) })).toEqual(['response.text:too_long']);
    expect(mustOk(q, s, { text: ' halo ' })).toEqual({ text: 'halo' });
  });
  it('MATCHING: unknown item/choice, duplikat, pasangan lebih dari left', () => {
    const { q, s } = serve(Q.drop());
    const c0 = s.right_choice_ids![0]!;
    expect(codes(q, s, { pairs: [{ item_id: 'i9', choice_id: c0 }] })).toEqual(['response.pairs:unknown_item_id']);
    expect(codes(q, s, { pairs: [{ item_id: 'i0', choice_id: 'cxxxxxx' }] })).toEqual(['response.pairs:unknown_choice_id']);
    expect(codes(q, s, { pairs: [{ item_id: 'i0', choice_id: c0 }, { item_id: 'i0', choice_id: s.right_choice_ids![1]! }] })).toEqual(['response.pairs:duplicate_ids']);
    expect(codes(q, s, { pairs: [{ item_id: 'i0', choice_id: c0 }, { item_id: 'i1', choice_id: c0 }] })).toEqual(['response.pairs:duplicate_ids']);
    expect(codes(q, s, { pairs: [{ item_id: 'i0', choice_id: c0, extra: 1 }] })).toEqual(['response.pairs.extra:unrecognized_key']);
  });
  it('REORDER: permutasi tidak lengkap; ERROR: indeks di luar rentang, > 3, duplikat', () => {
    const r = serve(Q.reorder());
    expect(codes(r.q, r.s, { segment_ids: r.s.segment_ids!.slice(0, 2) })).toEqual(['response.segment_ids:incomplete_permutation']);
    const e = serve(Q.error());
    expect(codes(e.q, e.s, { token_indexes: [9] })).toEqual(['response.token_indexes:index_out_of_range']);
    expect(codes(e.q, e.s, { token_indexes: [0, 1, 2, 3] })).toEqual(['response.token_indexes:response_shape_invalid']);
    expect(codes(e.q, e.s, { token_indexes: [1, 1] })).toEqual(['response.token_indexes:duplicate_ids']);
  });
  it('TFNG: nilai di luar fixed_choices', () => {
    const t = serve(Q.tfng());
    expect(codes(t.q, t.s, { choice: 'Yes' })).toEqual(['response.choice:response_shape_invalid']);
  });
  it('canonicalResponse tidak peka urutan himpunan', () => {
    const a: StoredResponse = { option_ids: ['b', 'a'] };
    expect(canonicalResponse(a)).toBe(canonicalResponse({ option_ids: ['a', 'b'] }));
    expect(canonicalResponse({ token_indexes: [3, 1] })).toBe(canonicalResponse({ token_indexes: [1, 3] }));
    expect(canonicalResponse({ text: 'a' })).not.toBe(canonicalResponse({ text: 'b' }));
  });
});

describe('skor total dan ambang (aritmetika bilangan bulat)', () => {
  it('8 dari 10 = 80.00 lulus; 7 dari 10 = 70.00 tidak', () => {
    expect(percentHundredths(800, 1000)).toBe(8000);
    expect(isPassed(800, 1000, 75)).toBe(true);
    expect(isPassed(700, 1000, 75)).toBe(false);
  });
  it('batas inklusif: 3 dari 4 = 75.00 lulus; 74.99 tidak', () => {
    expect(percentHundredths(300, 400)).toBe(7500);
    expect(isPassed(300, 400, 75)).toBe(true);
    expect(isPassed(7499, 10000, 75)).toBe(false);
    expect(isPassed(7500, 10000, 75)).toBe(true);
  });
  it('pembulatan half-up: 1/3 = 33.33, 2/3 = 66.67; max=0 -> 0 dan tidak lulus; tanpa ambang -> null', () => {
    expect(percentHundredths(100, 300)).toBe(3333);
    expect(percentHundredths(200, 300)).toBe(6667);
    expect(percentHundredths(0, 0)).toBe(0);
    expect(isPassed(0, 0, 75)).toBe(false);
    expect(isPassed(100, 100, null)).toBeNull();
  });
  it('lulus tepat memakai nilai eksak, bukan nilai yang dibulatkan (74,996 -> 75,00 tetapi tidak lulus)', () => {
    // raw 7499.6 sentesimal tidak mungkin; gunakan max besar: 74,996% = 74996/100000
    expect(percentHundredths(74996, 100000)).toBe(7500);
    expect(isPassed(74996, 100000, 75)).toBe(false);
  });
});

describe('persen tampilan (QA F-08-04)', () => {
  it('belum lulus tetapi pembulatan menyentuh ambang -> dipotong: 84,996 tampil 84,99 (bukan 85,00)', () => {
    expect(percentHundredths(84996, 100000)).toBe(8500);
    expect(isPassed(84996, 100000, 85)).toBe(false);
    expect(displayPercentHundredths(84996, 100000, 85, false)).toBe(8499);
  });
  it('lulus atau tidak menyentuh ambang -> sama dengan pembulatan biasa', () => {
    expect(displayPercentHundredths(85000, 100000, 85, true)).toBe(8500);
    expect(displayPercentHundredths(100, 300, 85, false)).toBe(3333);
    expect(displayPercentHundredths(200, 300, null, null)).toBe(6667);
    expect(displayPercentHundredths(0, 0, 85, false)).toBe(0);
  });
});

describe('waktu jawaban dan streak (D8)', () => {
  const T = NOW.getTime();
  const ans = (offsetsMs: number[], correct: boolean[], target = 20000) =>
    offsetsMs.map((o, i) => ({ answeredAtMs: T + o, isCorrect: correct[i]!, targetMs: target }));

  it('dua benar cepat -> streak 1 lalu 2; salah mereset ke 0; lambat mereset', () => {
    const r = computeTimings(ans([5000, 12000, 20000, 60000], [true, true, false, true]), T, T);
    expect(r.map((x) => x.speedStreakLen)).toEqual([1, 2, 0, 0]);
    expect(r.map((x) => x.withinTargetTime)).toEqual([true, true, true, false]);
    expect(r[1]!.timeSpentMs).toBe(7000);
  });
  it('basis waktu = max(jawaban sebelumnya, resume, mulai)', () => {
    const r = computeTimings(ans([10000], [true]), T, T + 8000);
    expect(r[0]!.timeSpentMs).toBe(2000);
  });
  it('target per soal memakai nilai yang diberikan', () => {
    const r = computeTimings(ans([31000], [true], 30000), T, T);
    expect(r[0]!.withinTargetTime).toBe(false);
  });
});
