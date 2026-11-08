import { describe, expect, it } from 'vitest';
import { assembleFromPool, type BankRow } from '@/server/simulation/assemble';
import { ApiError } from '@/server/http/errors';
import type { MockTestState, SimulationSection } from '@/contracts/simulation';
import {
  abundantPool,
  idsOf,
  listeningBank,
  makeBank,
  minimalPool,
  readingBank,
  readingQs,
  speakingBank,
  writingBank,
} from '../fixtures/sim-banks';

/**
 * Bukti unit murni (tanpa DB) untuk perakit SPEC-023 D3: AC-13, AC-14, AC-15.
 * Fixture sintetis dari tests/fixtures/sim-banks.ts.
 */
const SEEDS = Array.from({ length: 25 }, (_, i) => (i.toString(16).padStart(2, '0') + 'ab').repeat(8)); // 32 hex
const ALL: SimulationSection[] = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];

const sectionOf = (st: MockTestState, s: SimulationSection) => st.sections.find((x) => x.section === s)!;
const qids = (st: MockTestState, s: SimulationSection) => sectionOf(st, s).questions.map((q) => q.question_id);
const assemble = (pool: BankRow[], sections: SimulationSection[], seen: Iterable<string> = [], seed = SEEDS[0]!) =>
  assembleFromPool(pool, sections, new Set(seen), seed).state;
const failure = (fn: () => unknown): ApiError => {
  try {
    fn();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('diharapkan ApiError, tetapi tidak ada galat');
};

describe('AC-13: anti-ulang (D3: pilih yang belum dilihat lebih dulu)', () => {
  it('AC-13: dengan stok melimpah, simulasi kedua tidak berbagi question_id Writing/Speaking/Reading dengan yang pertama (25 seed)', () => {
    for (const seed of SEEDS) {
      const pool = abundantPool();
      const first = assemble(pool, ['READING', 'WRITING', 'SPEAKING'], [], seed);
      const seen = new Set([...qids(first, 'READING'), ...qids(first, 'WRITING'), ...qids(first, 'SPEAKING')]);
      const second = assemble(pool, ['READING', 'WRITING', 'SPEAKING'], seen, seed.split('').reverse().join(''));
      for (const s of ['READING', 'WRITING', 'SPEAKING'] as const) {
        const overlap = qids(second, s).filter((id) => seen.has(id));
        expect(overlap, `${s} seed ${seed}`).toEqual([]);
      }
      // Reading kedua tetap utuh 40 soal dari paket berbeda
      expect(qids(second, 'READING')).toHaveLength(40);
    }
  });

  it('AC-13: stok tepat minimum -> soal berulang dipakai dan perakitan tidak gagal', () => {
    const pool = minimalPool();
    const first = assemble(pool, ['READING', 'WRITING', 'SPEAKING']);
    const seen = new Set([...qids(first, 'READING'), ...qids(first, 'WRITING'), ...qids(first, 'SPEAKING')]);
    let second: MockTestState | undefined;
    expect(() => {
      second = assemble(pool, ['READING', 'WRITING', 'SPEAKING'], seen, SEEDS[3]);
    }).not.toThrow();
    expect(qids(second!, 'READING')).toHaveLength(40);
    expect(qids(second!, 'WRITING')).toHaveLength(2);
    expect(qids(second!, 'SPEAKING')).toHaveLength(9);
    // seluruhnya berulang karena tidak ada stok lain
    for (const s of ['READING', 'WRITING', 'SPEAKING'] as const) {
      expect(new Set(qids(second!, s))).toEqual(new Set(qids(first, s)));
    }
  });

  it('AC-13: stok sebagian (Speaking P1 = 6, 4 sudah dilihat) -> 2 soal baru dipakai lebih dulu, sisanya diisi dari yang sudah dilihat', () => {
    const pool: BankRow[] = [speakingBank(1, 'PT-P1', 6), speakingBank(2, 'PT-P2', 1), speakingBank(3, 'PT-P3', 4)];
    const seenP1 = ['Q-PT-P1-1', 'Q-PT-P1-2', 'Q-PT-P1-3', 'Q-PT-P1-4'];
    for (const seed of SEEDS) {
      const st = assemble(pool, ['SPEAKING'], seenP1, seed);
      const p1 = sectionOf(st, 'SPEAKING')
        .questions.filter((q) => q.part_no === 1)
        .map((q) => q.question_id);
      expect(p1).toHaveLength(4);
      expect(new Set(p1).size).toBe(4); // tanpa duplikat
      expect(p1).toContain('Q-PT-P1-5');
      expect(p1).toContain('Q-PT-P1-6');
    }
  });

  it('AC-13: Reading dengan semua kombinasi sudah dilihat tetap dirakit (tidak gagal) dan memilih kombinasi dengan soal terlihat paling sedikit', () => {
    const pool = abundantPool();
    // tandai seluruh paket kecuali RD1B/RD2B/RD3B sudah dilihat sebagian: semua soal RD1A,RD2A,RD3A + sebagian RD1B
    const seen = [...idsOf(pool.filter((b) => b.bankCode?.endsWith('A') && b.bankKind?.startsWith('READING'))), 'Q-AB-RD1B-01'];
    const st = assemble(pool, ['READING'], seen, SEEDS[7]);
    const codes = sectionOf(st, 'READING').parts.map((p) => p.bank_code);
    // kombinasi B,B,B memuat 1 soal terlihat (jumlah terkecil)
    expect(codes).toEqual(['AB-RD1B', 'AB-RD2B', 'AB-RD3B']);
    // semua terlihat -> tidak gagal
    const allSeen = idsOf(pool.filter((b) => b.bankKind?.startsWith('READING')));
    expect(() => assemble(pool, ['READING'], allSeen)).not.toThrow();
  });

  it('AC-13: Writing menghindari soal terlihat bila ada alternatif (Task 1 dan Task 2), dan memakai ulang bila semuanya terlihat', () => {
    const pool: BankRow[] = [writingBank('WRITING_GT_T1_FORMAL', 'WP-1', 2), writingBank('WRITING_GT_T2', 'WP-2', 2)];
    for (const seed of SEEDS) {
      const st = assemble(pool, ['WRITING'], ['Q-WP-1-1', 'Q-WP-2-1'], seed);
      expect(qids(st, 'WRITING')).toEqual(['Q-WP-1-2', 'Q-WP-2-2']);
    }
    const all = assemble(pool, ['WRITING'], idsOf(pool), SEEDS[1]);
    expect(qids(all, 'WRITING')).toHaveLength(2);
  });
});

describe('AC-14: komposisi Reading', () => {
  it('AC-14: tiga paket S1, S2, S3 berurutan (apa pun urutan pool) dengan total tepat 40 soal', () => {
    const pool = [
      readingBank('READING_GT_S3', 'CR-3', 13),
      readingBank('READING_GT_S1', 'CR-1', 14),
      readingBank('READING_GT_S2', 'CR-2', 13),
    ];
    for (const seed of SEEDS) {
      const sec = sectionOf(assemble(pool, ['READING'], [], seed), 'READING');
      expect(sec.parts.map((p) => [p.part_no, p.bank_code])).toEqual([
        [1, 'CR-1'],
        [2, 'CR-2'],
        [3, 'CR-3'],
      ]);
      expect(sec.questions).toHaveLength(40);
      expect(sec.questions.map((q) => q.part_no)).toEqual([...Array(14).fill(1), ...Array(13).fill(2), ...Array(13).fill(3)]);
      expect(sec.questions.map((q) => q.position)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
      expect(sec.time_limit_seconds).toBe(3600);
    }
  });

  it('AC-14: hanya kombinasi berjumlah tepat 40 yang dipilih (paket S1 15 soal diabaikan)', () => {
    const pool = [
      readingBank('READING_GT_S1', 'K-1A', 15), // 15+13+13 = 41, bukan 40
      readingBank('READING_GT_S1', 'K-1B', 14),
      readingBank('READING_GT_S2', 'K-2', 13),
      readingBank('READING_GT_S3', 'K-3', 13),
    ];
    for (const seed of SEEDS) {
      const sec = sectionOf(assemble(pool, ['READING'], [], seed), 'READING');
      expect(sec.parts.map((p) => p.bank_code)).toEqual(['K-1B', 'K-2', 'K-3']);
      expect(sec.questions).toHaveLength(40);
    }
  });

  it('AC-14: satu bank berisi beberapa teks (passage_no) dihitung sebagai paket per teks', () => {
    const s1 = makeBank({
      kind: 'READING_GT_S1',
      code: 'MP-1',
      passage: 'Teks pertama\n===PASSAGE===\nTeks kedua',
      questions: [...readingQs('MP-1a', 14, 1), ...readingQs('MP-1b', 20, 2)], // paket (S1,p1)=14, (S1,p2)=20
    });
    const pool = [s1, readingBank('READING_GT_S2', 'MP-2', 13), readingBank('READING_GT_S3', 'MP-3', 13)];
    const sec = sectionOf(assemble(pool, ['READING']), 'READING');
    expect(sec.questions).toHaveLength(40);
    expect(sec.parts[0]).toMatchObject({ part_no: 1, bank_code: 'MP-1', passage_no: 1, passage_markdown: 'Teks pertama' });
    expect(qids(assemble(pool, ['READING']), 'READING').filter((id) => id.startsWith('Q-MP-1b'))).toHaveLength(0);
  });

  it.each([
    ['total 39', [14, 13, 12]],
    ['total 41', [14, 14, 13]],
    ['total 30', [10, 10, 10]],
  ])('AC-14: tanpa kombinasi tepat 40 (%s) perakitan gagal SIMULATION_NOT_ENOUGH_CONTENT dengan sections.READING', (_label, counts) => {
    const pool = [
      readingBank('READING_GT_S1', 'F-1', counts[0]!),
      readingBank('READING_GT_S2', 'F-2', counts[1]!),
      readingBank('READING_GT_S3', 'F-3', counts[2]!),
    ];
    const err = failure(() => assemble(pool, ['READING']));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('SIMULATION_NOT_ENOUGH_CONTENT');
    expect(err.status).toBe(422);
    expect(err.details).toEqual([
      { path: 'sections.READING', code: 'content_missing', message: 'Reading membutuhkan 3 teks dengan total 40 soal.' },
    ]);
  });

  it('AC-14: salah satu jenis (S2) tidak punya paket -> gagal; bank lain (mis. S1 dua kali) tidak menggantikan S2', () => {
    const pool = [readingBank('READING_GT_S1', 'G-1A', 20), readingBank('READING_GT_S1', 'G-1B', 20), readingBank('READING_GT_S3', 'G-3', 13)];
    const err = failure(() => assemble(pool, ['READING']));
    expect(err.code).toBe('SIMULATION_NOT_ENOUGH_CONTENT');
    expect(err.details?.map((d) => d.path)).toEqual(['sections.READING']);
  });
});

describe('AC-15: komposisi Speaking 4 + 1 + 4', () => {
  it('AC-15: tepat 4 soal part 1, 1 soal part 2, 4 soal part 3 (unik) dari stok melimpah (25 seed)', () => {
    for (const seed of SEEDS) {
      const sec = sectionOf(assemble(abundantPool(), ['SPEAKING'], [], seed), 'SPEAKING');
      const byPart = (n: number) => sec.questions.filter((q) => q.part_no === n);
      expect(byPart(1)).toHaveLength(4);
      expect(byPart(2)).toHaveLength(1);
      expect(byPart(3)).toHaveLength(4);
      expect(sec.questions).toHaveLength(9);
      expect(new Set(sec.questions.map((q) => q.question_id)).size).toBe(9);
      expect(sec.questions.map((q) => q.part_no)).toEqual([1, 1, 1, 1, 2, 3, 3, 3, 3]);
      expect(sec.parts.map((p) => p.part_no)).toEqual([1, 2, 3]);
      expect(sec.time_limit_seconds).toBeNull();
      // part dalam soal sesuai part_no
      for (const q of sec.questions) expect((q.question as { part: number }).part).toBe(q.part_no);
    }
  });

  it.each([
    ['Part 1 hanya 3', [3, 1, 4]],
    ['Part 2 kosong', [4, 0, 4]],
    ['Part 3 hanya 3', [4, 1, 3]],
  ])('AC-15: stok kurang (%s) -> SIMULATION_NOT_ENOUGH_CONTENT sections.SPEAKING', (_label, c) => {
    const pool = [speakingBank(1, 'S-1', c[0]!), speakingBank(2, 'S-2', c[1]!), speakingBank(3, 'S-3', c[2]!)].filter((b) => b.questionCount > 0);
    const err = failure(() => assemble(pool, ['SPEAKING']));
    expect(err.code).toBe('SIMULATION_NOT_ENOUGH_CONTENT');
    expect(err.details?.[0]).toMatchObject({ path: 'sections.SPEAKING', code: 'content_missing' });
  });

  it('AC-15: stok tepat minimum 4/1/4 diterima', () => {
    const sec = sectionOf(assemble(minimalPool(), ['SPEAKING']), 'SPEAKING');
    expect(sec.questions).toHaveLength(9);
  });
});

describe('D3/AC-16: perakitan Listening dan pemilihan section', () => {
  it('AC-16: Listening 4 bagian x 10 soal audio 5+5+5+5 -> time_limit_seconds = 20 + 120 = 140', () => {
    const pool = [listeningBank(1, 'L1'), listeningBank(2, 'L2'), listeningBank(3, 'L3'), listeningBank(4, 'L4')];
    const sec = sectionOf(assemble(pool, ['LISTENING']), 'LISTENING');
    expect(sec.time_limit_seconds).toBe(140);
    expect(sec.questions).toHaveLength(40);
    expect(sec.parts.map((p) => p.audio_duration_sec)).toEqual([5, 5, 5, 5]);
  });

  it('Listening dengan audio NULL pada satu bagian dianggap tidak lengkap (gagal)', () => {
    const noAudio = makeBank({ kind: 'LISTENING_GT_S4', code: 'L4x', questions: listeningBank(4, 'L4x').questionsJson as never });
    const pool = [listeningBank(1, 'L1'), listeningBank(2, 'L2'), listeningBank(3, 'L3'), noAudio];
    const err = failure(() => assemble(pool, ['LISTENING']));
    expect(err.details?.[0]?.path).toBe('sections.LISTENING');
  });

  it('semua section dirakit bersamaan dalam urutan tetap LISTENING, READING, WRITING, SPEAKING', () => {
    const pool = [...abundantPool(), listeningBank(1, 'L1'), listeningBank(2, 'L2'), listeningBank(3, 'L3'), listeningBank(4, 'L4')];
    const st = assemble(pool, [...ALL].reverse());
    expect(st.sections.map((s) => [s.order, s.section])).toEqual([
      [1, 'LISTENING'],
      [2, 'READING'],
      [3, 'WRITING'],
      [4, 'SPEAKING'],
    ]);
    expect(st.schema).toBe('mock.v1');
    expect(st.rng_seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it('seed yang sama menghasilkan perakitan identik (reproduksibel)', () => {
    const pool = abundantPool();
    const a = assemble(pool, ['READING', 'WRITING', 'SPEAKING'], [], SEEDS[5]);
    const b = assemble(pool, ['READING', 'WRITING', 'SPEAKING'], [], SEEDS[5]);
    expect(qids(a, 'SPEAKING')).toEqual(qids(b, 'SPEAKING'));
    expect(qids(a, 'READING')).toEqual(qids(b, 'READING'));
    expect(qids(a, 'WRITING')).toEqual(qids(b, 'WRITING'));
  });
});
