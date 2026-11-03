import type { Tx } from '../db';

/** Aktivitas belajar yang dicatat (SPEC-016 `recordActivity` mendaftar di sini). */
export interface ActivityEvent {
  userId: string;
  kind: 'LEARN_COMPLETE' | 'MINI_TASK_COMPLETE' | 'DRILL_SUBMIT';
  subModuleId: string | null;
}
export type ActivityHook = (tx: Tx, event: ActivityEvent) => Promise<void>;

/** Registri hook SPEC-005/006 -> 016 (_api-contract.md bagian 7). Dijalankan di dalam transaksi pemicu. */
export const activityHooks: ActivityHook[] = [];

export async function runActivityHooks(tx: Tx, event: ActivityEvent): Promise<void> {
  for (const hook of activityHooks) await hook(tx, event);
}
