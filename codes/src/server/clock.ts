/** Jam server yang dapat dikendalikan di pengujian (timer otoritatif: deadline, D8 waktu jawaban, ping belajar). */
let override: (() => number) | null = null;

export const nowMs = (): number => (override ? override() : Date.now());
export const nowDate = (): Date => new Date(nowMs());

/** Hanya untuk pengujian. `null` mengembalikan jam sistem. */
export function setClockForTest(fn: (() => number) | null): void {
  override = fn;
}
