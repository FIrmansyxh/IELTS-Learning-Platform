import type { Tx } from '../db';
import type { AttemptRow, SetRow } from './dto';

export interface ScoreSummary {
  rawH: number;
  maxH: number;
  percentH: number;
  /** Persen untuk tampilan (dipotong bila pembulatan menyentuh ambang padahal belum lulus); bukan untuk keputusan lulus. */
  percentDisplayH: number;
  passPercent: number | null;
  passed: boolean | null;
  perSkill: Array<{ skill: string; rawH: number; maxH: number; percentH: number }>;
  /** Band attempt (Boss: `bossBand`); null/undefined = tidak ada. */
  bandScore?: number | null;
  /** Rincian khusus tipe (Boss: perhitungan section) untuk `onFinish` tipe itu; tidak dipakai hook lain. */
  detail?: unknown;
}

export interface AttemptCompletedContext {
  tx: Tx;
  userId: string;
  attempt: AttemptRow;
  set: SetRow;
  result: ScoreSummary;
}
export type AttemptCompletedHook = (ctx: AttemptCompletedContext) => Promise<void>;

/**
 * Urutan tetap (_api-contract.md bagian 7): (1) handler tipe + GatekeepingService (di dalam handler, bukan hook),
 * (2) SPEC-016 gamificationHook, (3) SPEC-017 skillScoreHook. Dijalankan dalam transaksi submit; kegagalan
 * membatalkan seluruh submit.
 */
export const attemptCompletedHooks: AttemptCompletedHook[] = [];
