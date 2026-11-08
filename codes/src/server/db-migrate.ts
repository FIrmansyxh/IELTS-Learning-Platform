/**
 * Migrator SQLite sederhana: menjalankan berkas drizzle/*.sql sesuai jurnal, sekali saja, dalam satu transaksi
 * per berkas. Pemisah pernyataan: `--> statement-breakpoint` (format drizzle-kit).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
}

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
  const entries = journalTags(folder);
  const applied: string[] = [];
  for (const e of entries) {
    if (done.has(e.tag)) continue;
    const text = readFileSync(path.join(folder, `${e.tag}.sql`), 'utf8');
    const statements = text.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    db.exec('BEGIN');
    try {
      for (const s of statements) db.exec(s);
      db.prepare('INSERT INTO _migrations (tag, hash, applied_at) VALUES (?, ?, ?)').run(
        e.tag,
        createHash('sha256').update(text).digest('hex'),
        Date.now(),
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migrasi ${e.tag} gagal: ${(err as Error).message}`);
    }
    applied.push(e.tag);
  }
  return { applied, total: entries.length };
}
