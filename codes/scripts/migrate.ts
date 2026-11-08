/**
 * Migrasi SQLite lokal (SPEC-025 Fase 3): menjalankan drizzle/*.sql yang belum terpasang. Idempoten.
 * Berkas DB dibuat otomatis bila belum ada (DATABASE_PATH, bawaan ./data/ielts.db).
 */
import './_env';
import { closeDb, databasePath, getRaw } from '../src/server/db';
import { runMigrations } from '../src/server/db-migrate';

try {
  const r = runMigrations(getRaw());
  console.log(`[migrate] ${databasePath()}: ${r.applied.length === 0 ? 'sudah terbaru' : `terpasang ${r.applied.join(', ')}`} (${r.total} migrasi)`);
} catch (err) {
  console.error('[migrate] gagal:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
