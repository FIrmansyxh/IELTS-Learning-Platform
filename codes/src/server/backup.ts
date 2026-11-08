/**
 * Cadangan harian dan pemulihan database SQLite lokal (SPEC-025 Fase 4, K5, P4-32..P4-39b).
 *
 * - `backupIfDue`: maksimal satu cadangan per tanggal lokal lewat `VACUUM INTO` (salinan konsisten dan mandiri,
 *   tanpa berkas -wal/-shm), ditulis ke `<nama>.tmp` lalu `rename` (atomik). Menyimpan 7 berkas bernama pola terbaru.
 * - `restoreBackup`: memulihkan cadangan ke `dbPath` setelah DB saat ini diamankan (nama di luar pola retensi).
 * Tidak pernah melempar dari `backupIfDue`; kegagalan dilaporkan lewat `status: 'failed'`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { logger } from './logger';

export const BACKUP_PATTERN = /^ielts-\d{4}-\d{2}-\d{2}\.db$/;
export const BACKUP_KEEP = 7;

export type BackupStatus = 'created' | 'skipped_today' | 'no_database' | 'failed';
export interface BackupResult {
  status: BackupStatus;
  file?: string;
  pruned: string[];
}

export interface BackupOptions {
  dbPath: string;
  backupDir: string;
  now?: Date;
  keep?: number;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Tanggal lokal mesin: YYYY-MM-DD. */
export function localDateStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Folder cadangan bawaan: `backups/` di samping berkas DB (bawaan data/backups). */
export function defaultBackupDir(dbPath: string): string {
  return path.join(path.dirname(dbPath), 'backups');
}

export function backupFileName(d: Date): string {
  return `ielts-${localDateStamp(d)}.db`;
}

/** Nama berkas cadangan bernama pola, terbaru dulu (nama berformat tanggal sehingga urut leksikal = urut waktu). */
export function listBackups(backupDir: string): string[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((n) => BACKUP_PATTERN.test(n))
    .sort()
    .reverse();
}

function removeQuietly(file: string): void {
  try {
    rmSync(file, { force: true });
  } catch {
    /* abaikan */
  }
}

export function backupIfDue(opts: BackupOptions): BackupResult {
  const { dbPath, backupDir } = opts;
  const now = opts.now ?? new Date();
  const keep = opts.keep ?? BACKUP_KEEP;
  if (!existsSync(dbPath)) return { status: 'no_database', pruned: [] };

  const name = backupFileName(now);
  const target = path.join(backupDir, name);
  const tmp = `${target}.tmp`;
  try {
    mkdirSync(backupDir, { recursive: true });
    if (existsSync(target)) return { status: 'skipped_today', file: target, pruned: [] };
    removeQuietly(tmp);
    const src = new DatabaseSync(dbPath);
    try {
      src.exec('PRAGMA busy_timeout = 5000');
      src.prepare('VACUUM INTO ?').run(tmp);
    } finally {
      src.close();
    }
    renameSync(tmp, target);
  } catch (err) {
    removeQuietly(tmp);
    logger.warn({ err: err instanceof Error ? err.message : 'tidak diketahui' }, 'backup_gagal');
    return { status: 'failed', pruned: [] };
  }

  const pruned: string[] = [];
  for (const old of listBackups(backupDir).slice(Math.max(1, keep))) {
    removeQuietly(path.join(backupDir, old));
    pruned.push(old);
  }
  return { status: 'created', file: target, pruned: pruned.reverse() };
}

export type RestoreErrorCode = 'NOT_FOUND' | 'CORRUPT' | 'IN_USE';
export class RestoreError extends Error {
  constructor(
    readonly code: RestoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RestoreError';
  }
}

export interface RestoreOptions {
  dbPath: string;
  backupDir: string;
  /** Nama berkas cadangan (mis. ielts-2026-11-07.db) atau 'latest'. */
  name: string;
  now?: Date;
}
export interface RestoreResult {
  restoredFrom: string;
  /** Salinan DB sebelum dipulihkan (null bila DB belum ada). */
  previous: string | null;
}

function integrityOk(file: string): boolean {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined;
    return row?.integrity_check === 'ok';
  } catch {
    return false;
  } finally {
    try {
      db?.close();
    } catch {
      /* abaikan */
    }
  }
}

/**
 * Pastikan tidak ada koneksi lain (termasuk koneksi idle milik server web): kunci EKSKLUSIF dalam 1 dtk.
 * Pada mode WAL kunci ini gagal selama ada koneksi lain yang terbuka, bukan hanya saat ada transaksi tulis,
 * sehingga tidak bergantung pada kegagalan rename (yang hanya terjadi di Windows).
 * Berkas rusak/bukan database dianggap tidak dipakai.
 */
function assertNotInUse(dbPath: string): void {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA busy_timeout = 1000');
    db.exec('PRAGMA locking_mode = EXCLUSIVE');
    db.exec('BEGIN EXCLUSIVE');
    db.exec('ROLLBACK');
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      /* bukan WAL atau gagal checkpoint: lanjut */
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/locked|busy/i.test(msg)) throw inUse();
    // DB saat ini rusak atau bukan database: boleh ditimpa (justru alasan memulihkan).
  } finally {
    try {
      db?.close();
    } catch {
      /* abaikan */
    }
  }
}

function inUse(): RestoreError {
  return new RestoreError('IN_USE', 'Database sedang dipakai. Hentikan aplikasi lalu ulangi.');
}

export function restoreBackup(opts: RestoreOptions): RestoreResult {
  const { dbPath, backupDir } = opts;
  const now = opts.now ?? new Date();

  let name = opts.name;
  if (name === 'latest') {
    const latest = listBackups(backupDir)[0];
    if (!latest) throw new RestoreError('NOT_FOUND', `Cadangan tidak ditemukan: ${name}`);
    name = latest;
  }
  if (name !== path.basename(name) || !/\.db$/.test(name) || !existsSync(path.join(backupDir, name)) || !statSync(path.join(backupDir, name)).isFile()) {
    throw new RestoreError('NOT_FOUND', `Cadangan tidak ditemukan: ${opts.name}`);
  }
  const source = path.join(backupDir, name);
  if (!integrityOk(source)) throw new RestoreError('CORRUPT', 'Cadangan rusak, tidak dipakai');

  let previous: string | null = null;
  if (existsSync(dbPath)) {
    assertNotInUse(dbPath);
    previous = path.join(backupDir, `ielts-sebelum-pulih-${timeStamp(now)}.db`);
    mkdirSync(backupDir, { recursive: true });
    try {
      renameSync(dbPath, previous);
    } catch (err) {
      // Windows: berkas masih dibuka proses lain. Tidak ada yang berubah.
      if (['EBUSY', 'EPERM', 'EACCES'].includes((err as NodeJS.ErrnoException).code ?? '')) throw inUse();
      throw err;
    }
  }
  removeQuietly(`${dbPath}-wal`);
  removeQuietly(`${dbPath}-shm`);

  mkdirSync(path.dirname(dbPath), { recursive: true });
  const tmp = `${dbPath}.pulih.tmp`;
  try {
    copyFileSync(source, tmp);
    renameSync(tmp, dbPath);
  } catch (err) {
    removeQuietly(tmp);
    if (previous) {
      // Kembalikan DB semula agar tidak kosong.
      try {
        renameSync(previous, dbPath);
      } catch {
        /* biarkan salinan pengaman di tempatnya */
      }
    }
    throw err;
  }
  if (!integrityOk(dbPath)) throw new RestoreError('CORRUPT', 'Cadangan rusak, tidak dipakai');
  return { restoredFrom: name, previous };
}
