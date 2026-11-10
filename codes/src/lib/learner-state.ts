import type { QueryClient } from '@tanstack/react-query';

/** Nama event yang dipancarkan `apiFetch` setelah permintaan yang mengubah progres/poin learner berhasil. */
export const LEARNER_STATE_EVENT = 'ielts:learner-state-changed';

/**
 * Endpoint yang hasilnya mengubah data turunan (poin, streak, radar, riwayat, peta, kartu lanjutkan).
 * Autosave jawaban, heartbeat posisi, dan bukti belajar sengaja tidak termasuk agar tidak memicu muat ulang per ketikan.
 */
const CHANGES_LEARNER_STATE =
  /(\/submit$|\/learn-complete$|\/mini-task\/complete$|\/self-assessment$|\/abandon$|^\/submissions\/|^\/placement\/apply$|^\/me\/profile$|^\/me\/active-track$)/;

export function changesLearnerState(method: string, path: string): boolean {
  return method !== 'GET' && CHANGES_LEARNER_STATE.test(path);
}

export function emitLearnerStateChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LEARNER_STATE_EVENT));
}

/** Awalan query key yang diturunkan dari progres learner. */
export const LEARNER_STATE_KEYS: readonly (readonly string[])[] = [
  ['gamification'],
  ['skills'],
  ['resume-card'],
  ['curriculum-tree'],
  ['tracks'],
  ['placement-status'],
];

/** Tandai basi semua data turunan; query yang sedang tampil (mis. chip streak/poin di header) langsung dimuat ulang. */
export function invalidateLearnerState(qc: QueryClient): void {
  for (const queryKey of LEARNER_STATE_KEYS) void qc.invalidateQueries({ queryKey });
}
