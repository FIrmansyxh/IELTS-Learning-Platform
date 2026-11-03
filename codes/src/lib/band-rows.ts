export type EditableRow = { raw_min: number | null; raw_max: number | null; band: number | null };
export type RowIssue = {
  row: number | null;
  code: 'range_invalid' | 'band_invalid' | 'coverage_gap' | 'coverage_overlap' | 'non_monotonic';
  message: string;
};

function runs(xs: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    if (last && last[1] === x - 1) last[1] = x;
    else out.push([x, x]);
  }
  return out;
}

/**
 * Validasi baris tabel band sisi klien (UX; server tetap memvalidasi). Cakupan 0..40 tanpa celah/tumpang-tindih,
 * band kelipatan 0,5 dalam [0,9], tidak menurun saat raw_min naik.
 */
export function validateBandRows(rows: EditableRow[]): RowIssue[] {
  const issues: RowIssue[] = [];
  const valid: Array<{ i: number; min: number; max: number; band: number }> = [];
  rows.forEach((r, i) => {
    const { raw_min: min, raw_max: max, band } = r;
    if (min === null || max === null || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 40 || min > max) {
      issues.push({
        row: i,
        code: 'range_invalid',
        message: 'Rentang tidak valid: isi Dari dan Sampai dengan bilangan bulat 0-40, Dari tidak lebih besar dari Sampai.',
      });
      return;
    }
    if (band === null || band < 0 || band > 9 || Math.round(band * 2) !== band * 2) {
      issues.push({ row: i, code: 'band_invalid', message: 'Band harus kelipatan 0,5 antara 0 dan 9.' });
      return;
    }
    valid.push({ i, min, max, band });
  });

  // Celah dan tumpang-tindih hanya dinilai bila semua baris sudah berbentuk valid.
  if (valid.length !== rows.length) return issues;

  const covered = new Array<number>(41).fill(0);
  for (const r of valid) for (let k = r.min; k <= r.max; k += 1) covered[k] = (covered[k] ?? 0) + 1;
  const overlaps: number[] = [];
  const gaps: number[] = [];
  covered.forEach((c, k) => {
    if (c > 1) overlaps.push(k);
    if (c === 0) gaps.push(k);
  });
  for (const [a, b] of runs(overlaps)) {
    issues.push({ row: null, code: 'coverage_overlap', message: `Tumpang tindih di ${a === b ? a : `${a}-${b}`}.` });
  }
  for (const [a, b] of runs(gaps)) {
    issues.push({
      row: null,
      code: 'coverage_gap',
      message: a === b ? `Celah: skor ${a} tidak tercakup.` : `Celah: skor ${a}-${b} tidak tercakup.`,
    });
  }
  const sorted = [...valid].sort((x, y) => x.min - y.min);
  for (let k = 1; k < sorted.length; k += 1) {
    if (sorted[k]!.band < sorted[k - 1]!.band) {
      issues.push({ row: sorted[k]!.i, code: 'non_monotonic', message: 'Band tidak boleh menurun saat skor naik.' });
    }
  }
  return issues;
}
