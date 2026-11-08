/**
 * Migrator SQLite sederhana: menjalankan berkas drizzle/*.sql sesuai jurnal, sekali saja, dalam satu transaksi
 * per berkas. Pemisah pernyataan: `--> statement-breakpoint` (format drizzle-kit).
 *
 * Migrasi destruktif (pembangunan ulang tabel, SPEC-022): baris pertama `-- migrator: foreign_keys=off`.
 * `PRAGMA foreign_keys` tidak berlaku di dalam transaksi dan `DROP TABLE` dengan FK aktif memicu `ON DELETE CASCADE`
 * pada anak, sehingga untuk berkas bertanda itu migrator: (a) menyalin DB ke `<folder DB>/backups/pre-<tag>-<epoch_ms>.db`
 * lewat `VACUUM INTO` (dilewati pada instalasi baru yang belum pernah menerapkan migrasi apa pun, dan pada DB `:memory:`),
 * (b) menjalankan `PRAGMA foreign_keys=OFF` SEBELUM `BEGIN`, (c) menjalankan `PRAGMA foreign_key_check` sebelum `COMMIT`
 * dan `ROLLBACK` + galat bila ada baris hasil, (d) memulihkan nilai `foreign_keys` semula di blok `finally`.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- path berasal dari konfigurasi lokal (MIGRATIONS_DIR/DATABASE_PATH), bukan input pengguna */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

export interface MigrationReport {
  applied: string[];
  total: number;
  /** Berkas cadangan pra-migrasi yang dibuat pada run ini. */
  backups: string[];
}

function backupBeforeMigration(db: DatabaseSync, tag: string): string | null {
  const row = (db.prepare('PRAGMA database_list').all() as Array<{ name: string; file: string }>).find((r) => r.name === 'main');
  if (!row?.file) return null; // :memory: / DB sementara tanpa berkas
  const dir = path.join(path.dirname(row.file), 'backups');
  mkdirSync(dir, { recursive: true });
  let target = path.join(dir, `pre-${tag}-${Date.now()}.db`);
  for (let i = 1; existsSync(target); i++) target = path.join(dir, `pre-${tag}-${Date.now()}-${i}.db`);
  db.prepare('VACUUM INTO ?').run(target);
  return target;
}

export const FK_OFF_MARKER = /^\s*--\s*migrator:\s*foreign_keys=off\s*(\r?\n|$)/;

export function migrationsFolder(): string {
  return path.resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');
}

export function journalTags(folder = migrationsFolder()): JournalEntry[] {
  const journal = JSON.parse(readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
  return journal.entries;
}

export function appliedCount(db: DatabaseSync): number {
  const t = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_migrations'`).get();
  if (!t) return 0;
  return Number((db.prepare('SELECT count(*) AS n FROM _migrations').get() as { n: number }).n);
}

export function runMigrations(db: DatabaseSync, folder = migrationsFolder()): MigrationReport {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (tag TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const done = new Set((db.prepare('SELECT tag FROM _migrations').all() as Array<{ tag: string }>).map((r) => r.tag));
  // "Instalasi baru" = belum ada migrasi tercatat DAN tidak ada tabel aplikasi (DB hasil pemulihan manual dengan
  // `_migrations` kosong tetapi berisi data tetap dicadangkan sebelum migrasi destruktif).
  const appTables = Number(
    (db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migrations'`).get() as { n: number }).n,
  );
  const freshInstall = done.size === 0 && appTables === 0;
  const entries = journalTags(folder);
  const applied: string[] = [];
  const backups: string[] = [];
  for (const e of entries) {
    if (done.has(e.tag)) continue;
    const text = readFileSync(path.join(folder, `${e.tag}.sql`), 'utf8');
    const statements = text.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    const fkOff = FK_OFF_MARKER.test(text);
    let priorFk = 1;
    if (fkOff) {
      if (!freshInstall) {
        const b = backupBeforeMigration(db, e.tag);
        if (b) backups.push(b);
      }
      priorFk = Number((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys);
      db.exec('PRAGMA foreign_keys = OFF'); // harus sebelum BEGIN
    }
    try {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.exec(s);
        if (fkOff) {
          const bad = db.prepare('PRAGMA foreign_key_check').all();
          if (bad.length > 0) throw new Error(`foreign_key_check menemukan ${bad.length} pelanggaran`);
        }
        db.prepare('INSERT INTO _migrations (tag, hash, applied_at) VALUES (?, ?, ?)').run(
          e.tag,
          createHash('sha256').update(text).digest('hex'),
          Date.now(),
        );
        db.exec('COMMIT');
      } catch (err) {
        // ROLLBACK tidak boleh menutupi galat asal (SQLite dapat sudah membatalkan transaksinya sendiri).
        let rollbackNote = '';
        try {
          db.exec('ROLLBACK');
        } catch (rbErr) {
          rollbackNote = ` (ROLLBACK juga gagal: ${(rbErr as Error).message})`;
        }
        throw new Error(`Migrasi ${e.tag} gagal: ${(err as Error).message}${rollbackNote}`);
      }
    } finally {
      if (fkOff) db.exec(`PRAGMA foreign_keys = ${priorFk ? 'ON' : 'OFF'}`);
    }
    applied.push(e.tag);
  }
  return { applied, total: entries.length, backups };
}
