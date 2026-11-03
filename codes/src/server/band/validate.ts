/** Validasi tabel band (SPEC-009): cakupan 0..40 tepat sekali, band kelipatan 0.5, tidak menurun. Murni. */
import type { BandRowLike } from './convert';

export interface BandIssue {
  path: string;
  code: 'range_invalid' | 'band_invalid' | 'coverage_gap' | 'coverage_overlap' | 'non_monotonic';
  message: string;
}

export function validateBandRows(rows: readonly BandRowLike[]): BandIssue[] {
  const issues: BandIssue[] = [];
  rows.forEach((r, i) => {
    const okInt = (n: number) => Number.isInteger(n) && n >= 0 && n <= 40;
    if (!okInt(r.raw_min) || !okInt(r.raw_max) || r.raw_min > r.raw_max) {
      issues.push({ path: `rows.${i}`, code: 'range_invalid', message: 'Rentang skor harus bilangan bulat 0-40 dengan Dari <= Sampai.' });
    }
    if (!Number.isFinite(r.band) || r.band < 0 || r.band > 9 || !Number.isInteger(r.band * 2)) {
      issues.push({ path: `rows.${i}.band`, code: 'band_invalid', message: 'Band harus kelipatan 0.5 dalam rentang 0-9.' });
    }
  });
  if (issues.length > 0) return issues;

  const sorted = [...rows].sort((a, b) => a.raw_min - b.raw_min || a.raw_max - b.raw_max);
  let expected = 0;
  for (const r of sorted) {
    if (r.raw_min > expected) {
      const range = r.raw_min - 1 === expected ? `${expected}` : `${expected}-${r.raw_min - 1}`;
      issues.push({ path: 'rows', code: 'coverage_gap', message: `Celah: skor ${range} tidak tercakup.` });
    } else if (r.raw_min < expected) {
      issues.push({ path: 'rows', code: 'coverage_overlap', message: `Tumpang tindih di ${r.raw_min}-${Math.min(r.raw_max, expected - 1)}.` });
    }
    expected = Math.max(expected, r.raw_max + 1);
  }
  if (expected <= 40) {
    const range = expected === 40 ? '40' : `${expected}-40`;
    issues.push({ path: 'rows', code: 'coverage_gap', message: `Celah: skor ${range} tidak tercakup.` });
  }
  if (issues.length > 0) return issues;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.band < sorted[i - 1]!.band) {
      issues.push({ path: 'rows', code: 'non_monotonic', message: `Band turun pada skor ${sorted[i]!.raw_min}.` });
    }
  }
  return issues;
}
