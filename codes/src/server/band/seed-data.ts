/** Tabel band Academic `v1-umum-2026-11` (SPEC-009; ADR-003 #2). Perkiraan, bervariasi antar versi tes. */
import type { BandRowLike } from './convert';

export const BAND_SEED_LABEL = 'v1-umum-2026-11';
export const BAND_SEED_NOTE = 'Tabel konversi Academic yang umum dipublikasikan. Perkiraan, bervariasi antar versi tes (ADR-003 #2).';

const mk = (spec: Array<[number, number, number]>): BandRowLike[] => spec.map(([raw_min, raw_max, band]) => ({ raw_min, raw_max, band }));

export const LISTENING_SEED_ROWS = mk([
  [0, 0, 0], [1, 1, 1], [2, 3, 2], [4, 5, 2.5], [6, 7, 3], [8, 9, 3.5], [10, 12, 4], [13, 15, 4.5], [16, 17, 5],
  [18, 22, 5.5], [23, 25, 6], [26, 29, 6.5], [30, 31, 7], [32, 34, 7.5], [35, 36, 8], [37, 38, 8.5], [39, 40, 9],
]);
/**
 * Tabel Reading IELTS General Training (ADR-004, SPEC-023). Jangkar yang umum dipublikasikan: 30/40 = 6.0,
 * 34/40 = 7.0, 40/40 = 9.0. Tepi bawah (di bawah band 4.0) adalah PERKIRAAN; admin dapat menggantinya
 * lewat Kelola Band tanpa mengubah kode.
 */
export const BAND_SEED_LABEL_GT = 'v1-gt-2026-11';
export const BAND_SEED_NOTE_GT = 'Tabel konversi Reading General Training yang umum dipublikasikan. Perkiraan, bervariasi antar versi tes; verifikasi ke sumber resmi (ADR-004).';
export const READING_GENERAL_SEED_ROWS = mk([
  [0, 0, 0], [1, 2, 1], [3, 5, 2], [6, 8, 2.5], [9, 11, 3], [12, 14, 3.5], [15, 18, 4], [19, 22, 4.5], [23, 26, 5],
  [27, 29, 5.5], [30, 31, 6], [32, 33, 6.5], [34, 35, 7], [36, 36, 7.5], [37, 38, 8], [39, 39, 8.5], [40, 40, 9],
]);
export const READING_ACADEMIC_SEED_ROWS = mk([
  [0, 0, 0], [1, 1, 1], [2, 3, 2], [4, 5, 2.5], [6, 7, 3], [8, 9, 3.5], [10, 12, 4], [13, 14, 4.5], [15, 18, 5],
  [19, 22, 5.5], [23, 26, 6], [27, 29, 6.5], [30, 32, 7], [33, 34, 7.5], [35, 36, 8], [37, 38, 8.5], [39, 40, 9],
]);
