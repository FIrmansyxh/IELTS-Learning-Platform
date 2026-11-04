/**
 * Pemulihan job AI berkala (F-12-02): `recoverStuckAiJobs` dijalankan tiap `AI_RECOVERY_INTERVAL_MS` (2 menit), terpisah dari
 * `retention-purge` harian, sehingga job QUEUED tanpa `boss_job_id` atau job pg-boss gagal tidak memblokir pengguna berjam-jam.
 * Idempotensi dijamin `recoverStuckAiJobs`; putaran tidak tumpang tindih (putaran berikutnya dilewati bila yang lama belum selesai).
 */
export const AI_RECOVERY_INTERVAL_MS = 2 * 60_000;

export interface RecoveryLog {
  warn: (obj: object, msg: string) => void;
}

export function startAiRecoveryLoop(
  run: () => Promise<unknown>,
  log: RecoveryLog,
  errToObj: (e: unknown) => unknown,
  intervalMs: number = AI_RECOVERY_INTERVAL_MS,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    run()
      .catch((err) => log.warn({ err: errToObj(err) }, 'recoverStuckAiJobs berkala gagal'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
