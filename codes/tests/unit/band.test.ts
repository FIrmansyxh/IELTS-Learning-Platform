import { describe, expect, it } from 'vitest';
import { averageBand, bossBand, convertRawToBand, overallBand, roundToHalfBand, scaleToForty } from '@/server/band/convert';
import { LISTENING_SEED_ROWS, READING_ACADEMIC_SEED_ROWS } from '@/server/band/seed-data';
import { validateBandRows } from '@/server/band/validate';

describe('roundToHalfBand', () => {
  it.each([
    [6.125, 6.0],
    [6.25, 6.5],
    [6.375, 6.5],
    [6.625, 6.5],
    [6.75, 7.0],
    [6.875, 7.0],
    [6.249, 6.0],
    [6.7494, 6.5],
    [6.7499, 7.0],
    [0, 0],
    [9, 9],
  ])('%s -> %s', (x, want) => {
    expect(roundToHalfBand(x)).toBe(want);
  });

  it('bebas galat float untuk rata-rata empat band', () => {
    // (6.5+6.5+6.0+6.0)/4 = 6.25 tepat -> 6.5
    expect(roundToHalfBand((6.5 + 6.5 + 6 + 6) / 4)).toBe(6.5);
    expect(roundToHalfBand(4.1 + 0.2 + 0.1)).toBe(4.5); // 4.3999999999999995 -> dibulatkan per-1/1000 = 4.400 -> 4.5
  });

  it('menolak nilai tak hingga/NaN', () => {
    expect(() => roundToHalfBand(Number.NaN)).toThrow();
  });
});

describe('overallBand (vektor spec)', () => {
  it.each([
    [[6, 6, 6, 6], 6.0],
    [[6.5, 6, 6, 6], 6.0],
    [[6.5, 6.5, 6, 6], 6.5],
    [[6.5, 6.5, 6.5, 6], 6.5],
    [[7, 6.5, 6.5, 6.5], 6.5],
    [[7, 7, 6.5, 6.5], 7.0],
    [[7, 7, 7, 6.5], 7.0],
    [[4, 4, 4, 4.5], 4.0],
    [[9, 9, 9, 9], 9.0],
    [[0, 0, 0, 0], 0.0],
  ] as Array<[number[], number]>)('%j -> %s', ([l, r, w, s], want) => {
    expect(overallBand({ listening: l!, reading: r!, writing: w!, speaking: s! })).toBe(want);
  });

  it('keempat band wajib ada', () => {
    expect(() => overallBand({ listening: 6, reading: 6, writing: 6 } as never)).toThrow();
  });
});

describe('bossBand / averageBand', () => {
  it.each([
    [5.0, 5.0, 5.0],
    [5.0, 5.5, 5.5],
    [5.5, 6.0, 6.0],
    [6.0, 6.5, 6.5],
    [6.0, 5.0, 5.5],
    [7.0, 7.5, 7.5],
  ])('(%s, %s) -> %s', (l, r, want) => {
    expect(bossBand(l, r)).toBe(want);
  });

  it('averageBand: kosong -> null', () => {
    expect(averageBand([])).toBeNull();
    expect(averageBand([6, 6.5, 7])).toBe(6.5);
  });
});

describe('scaleToForty', () => {
  it.each([
    [20, 20, 40],
    [7, 10, 28],
    [3, 8, 15],
    [1, 3, 13],
    [5, 12, 17],
    [1, 16, 3],
    [0, 12, 0],
    [25, 40, 25],
    [40, 40, 40],
    [29.5, 40, 30], // QA F-09-01: skor parsial dibulatkan setengah ke atas
    [28.4, 40, 28],
    [8.5, 40, 9],
    [39.5, 40, 40],
    [0.49, 40, 0],
  ])('(%s, %s) -> %s', (raw, max, want) => {
    expect(scaleToForty(raw, max)).toBe(want);
  });

  it('skor parsial max=40 selalu menemukan baris tabel (tidak melempar band_row_missing)', () => {
    const rows = [
      { raw_min: 0, raw_max: 25, band: 5 },
      { raw_min: 26, raw_max: 29, band: 5.5 },
      { raw_min: 30, raw_max: 31, band: 6 },
      { raw_min: 32, raw_max: 40, band: 6.5 },
    ];
    for (const raw of [29.5, 25.5, 31.5, 28.49]) expect(() => convertRawToBand(rows, scaleToForty(raw, 40))).not.toThrow();
    expect(convertRawToBand(rows, scaleToForty(29.5, 40))).toBe(6);
  });

  it('invalid melempar error', () => {
    expect(() => scaleToForty(41, 40)).toThrow();
    expect(() => scaleToForty(5, 0)).toThrow();
    expect(() => scaleToForty(-1, 40)).toThrow();
    expect(() => scaleToForty(Number.NaN, 40)).toThrow();
  });
});

describe('tabel seed v1-umum-2026-11', () => {
  it('masing-masing 17 baris menutup 0..40 tanpa celah/tumpang tindih dan monoton', () => {
    for (const rows of [LISTENING_SEED_ROWS, READING_ACADEMIC_SEED_ROWS]) {
      expect(rows).toHaveLength(17);
      expect(validateBandRows(rows)).toEqual([]);
    }
  });

  it('Listening 25/26/29/30/0/40 -> 6.0/6.5/6.5/7.0/0.0/9.0', () => {
    const got = [25, 26, 29, 30, 0, 40].map((n) => convertRawToBand(LISTENING_SEED_ROWS, n));
    expect(got).toEqual([6.0, 6.5, 6.5, 7.0, 0.0, 9.0]);
  });

  it('Reading Academic 14/15/18/19/26/27 -> 4.5/5.0/5.0/5.5/6.0/6.5', () => {
    const got = [14, 15, 18, 19, 26, 27].map((n) => convertRawToBand(READING_ACADEMIC_SEED_ROWS, n));
    expect(got).toEqual([4.5, 5.0, 5.0, 5.5, 6.0, 6.5]);
  });

  it('seluruh 0..40 terkonversi dan tidak pernah menurun', () => {
    for (const rows of [LISTENING_SEED_ROWS, READING_ACADEMIC_SEED_ROWS]) {
      let prev = -1;
      for (let n = 0; n <= 40; n++) {
        const b = convertRawToBand(rows, n);
        expect(b).toBeGreaterThanOrEqual(prev);
        prev = b;
      }
    }
  });

  it('baris hilang -> band_row_missing', () => {
    expect(() => convertRawToBand([{ raw_min: 0, raw_max: 10, band: 4 }], 20)).toThrow('band_row_missing');
  });
});

describe('validateBandRows', () => {
  const codes = (rows: Array<[number, number, number]>) => validateBandRows(rows.map(([raw_min, raw_max, band]) => ({ raw_min, raw_max, band }))).map((i) => i.code);

  it('contoh valid', () => {
    expect(codes([[0, 14, 4], [15, 29, 6], [30, 40, 7.5]])).toEqual([]);
  });
  it('tidak terurut tetap valid', () => {
    expect(codes([[30, 40, 7.5], [0, 14, 4], [15, 29, 6]])).toEqual([]);
  });
  it('celah', () => {
    const issues = validateBandRows([{ raw_min: 0, raw_max: 14, band: 4 }, { raw_min: 16, raw_max: 40, band: 6 }]);
    expect(issues.map((i) => i.code)).toEqual(['coverage_gap']);
    expect(issues[0]!.message).toBe('Celah: skor 15 tidak tercakup.');
  });
  it('celah di awal dan akhir', () => {
    expect(codes([[5, 40, 4]])).toEqual(['coverage_gap']);
    expect(codes([[0, 38, 4]])).toEqual(['coverage_gap']);
  });
  it('tumpang tindih dan duplikat raw_min', () => {
    expect(codes([[0, 20, 4], [18, 40, 6]])).toEqual(['coverage_overlap']);
    expect(codes([[0, 20, 4], [0, 40, 6]])).toEqual(['coverage_overlap']);
  });
  it('band bukan kelipatan 0.5 / di luar 0-9', () => {
    expect(codes([[0, 40, 6.3]])).toEqual(['band_invalid']);
    expect(codes([[0, 40, 9.5]])).toEqual(['band_invalid']);
    expect(codes([[0, 40, -0.5]])).toEqual(['band_invalid']);
  });
  it('rentang tidak valid', () => {
    expect(codes([[10, 5, 4]])).toContain('range_invalid');
    expect(codes([[0, 41, 4]])).toContain('range_invalid');
    expect(codes([[-1, 40, 4]])).toContain('range_invalid');
    expect(codes([[0.5, 40, 4]])).toContain('range_invalid');
  });
  it('band menurun', () => {
    expect(codes([[0, 20, 6], [21, 40, 5]])).toEqual(['non_monotonic']);
  });
});

describe('tabel Reading General Training (ADR-004)', () => {
  it('menutup 0..40 tanpa celah dan menaik', async () => {
    const { READING_GENERAL_SEED_ROWS } = await import('@/server/band/seed-data');
    let next = 0;
    let prev = -1;
    for (const r of READING_GENERAL_SEED_ROWS) {
      expect(r.raw_min).toBe(next);
      expect(r.band).toBeGreaterThan(prev);
      next = r.raw_max + 1;
      prev = r.band;
    }
    expect(next).toBe(41);
    expect(READING_GENERAL_SEED_ROWS).toHaveLength(17);
  });
  it('jangkar publik: 30/40 = 6.0, 34/40 = 7.0, 40/40 = 9.0', async () => {
    const { READING_GENERAL_SEED_ROWS } = await import('@/server/band/seed-data');
    const at = (n: number) => convertRawToBand(READING_GENERAL_SEED_ROWS, n);
    expect(at(30)).toBe(6);
    expect(at(34)).toBe(7);
    expect(at(40)).toBe(9);
  });
  it('General lebih ketat daripada Academic pada skor sama (kecuali tepi)', async () => {
    const { READING_GENERAL_SEED_ROWS, READING_ACADEMIC_SEED_ROWS } = await import('@/server/band/seed-data');
    for (const raw of [20, 25, 28, 30, 32, 34]) {
      expect(convertRawToBand(READING_GENERAL_SEED_ROWS, raw)).toBeLessThanOrEqual(convertRawToBand(READING_ACADEMIC_SEED_ROWS, raw));
    }
  });
});
