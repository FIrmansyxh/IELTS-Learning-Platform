/** Tabel band Academic `v1-umum-2026-11` (SPEC-009; ADR-003 #2). Perkiraan, bervariasi antar versi tes. */
import type { BandRowLike } from './convert';

export const BAND_SEED_LABEL = 'v1-umum-2026-11';
export const BAND_SEED_NOTE = 'Tabel konversi Academic yang umum dipublikasikan. Perkiraan, bervariasi antar versi tes (ADR-003 #2).';

const mk = (spec: Array<[number, number, number]>): BandRowLike[] => spec.map(([raw_min, raw_max, band]) => ({ raw_min, raw_max, band }));

export const LISTENING_SEED_ROWS = mk([
  [0, 0, 0], [1, 1, 1], [2, 3, 2], [4, 5, 2.5], [6, 7, 3], [8, 9, 3.5], [10, 12, 4], [13, 15, 4.5], [16, 17, 5],
  [18, 22, 5.5], [23, 25, 6], [26, 29, 6.5], [30, 31, 7], [32, 34, 7.5], [35, 36, 8], [37, 38, 8.5], [39, 40, 9],
]);
export const READING_ACADEMIC_SEED_ROWS = mk([
  [0, 0, 0], [1, 1, 1], [2, 3, 2], [4, 5, 2.5], [6, 7, 3], [8, 9, 3.5], [10, 12, 4], [13, 14, 4.5], [15, 18, 5],
  [19, 22, 5.5], [23, 26, 6], [27, 29, 6.5], [30, 32, 7], [33, 34, 7.5], [35, 36, 8], [37, 38, 8.5], [39, 40, 9],
]);
