/** Interval pemeriksa cadangan harian (SPEC-025 K5): 6 jam. */
const BACKUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let backupTimerStarted = false;

/** Validasi env di proses web saat start (QA F-02): rahasia pendek / konfigurasi salah menghentikan proses. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { getEnv } = await import('./server/env');
    getEnv();
    if (process.env.NODE_ENV === 'production' && !backupTimerStarted) {
      backupTimerStarted = true;
      // Cadangan harian dalam proses (P4-38): hanya produksi lokal, tidak menahan proses keluar.
      const { backupIfDue, defaultBackupDir } = await import('./server/backup');
      const { databasePath } = await import('./server/db');
      const tick = () => {
        const dbPath = databasePath();
        backupIfDue({ dbPath, backupDir: defaultBackupDir(dbPath), now: new Date() });
      };
      setInterval(tick, BACKUP_CHECK_INTERVAL_MS).unref();
    }
  }
}
