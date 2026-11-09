/**
 * Cadangan, pemulihan, doctor, migrasi/seed idempoten, dan impor konten bawaan (SPEC-025 Fase 4):
 * P4-10, 12, 13, 32..39b, 41, 43, 45, 59. Tiap skenario memakai berkas SQLite sementara sendiri;
 * skrip dijalankan sebagai proses terpisah (seperti `start:local`).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { backupFileName, backupIfDue, defaultBackupDir, listBackups, localDateStamp, restoreBackup, RestoreError } from '@/server/backup';
import { runCli } from '@/server/cli/run';

/* eslint-disable @typescript-eslint/no-explicit-any */
const tsx = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');
const root = mkdtempSync(path.join(tmpdir(), 'ielts-backup-'));
let seq = 0;

function freshDir(): string {
  const d = path.join(root, `case-${++seq}`);
  mkdirSync(d, { recursive: true });
  return d;
}

function run(script: string, args: string[], dbPath: string, extra: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_PATH: dbPath, ...extra };
  delete env.DATABASE_URL;
  delete env.DATABASE_MIGRATOR_URL;
  delete env.TEST_DATABASE_URL;
  delete env.HOSTNAME;
  return spawnSync(process.execPath, [tsx, script, ...args], { env, encoding: 'utf8', timeout: 120_000 });
}

/** Versi asinkron `run`: tidak memblokir event loop worker (impor 33 paket konten memakan > 60 dtk jika sinkron). */
function runAsync(script: string, args: string[], dbPath: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_PATH: dbPath };
  delete env.DATABASE_URL;
  delete env.DATABASE_MIGRATOR_URL;
  delete env.TEST_DATABASE_URL;
  delete env.HOSTNAME;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsx, script, ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function scalar(file: string, query: string): any {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return Object.values(db.prepare(query).get() as object)[0];
  } finally {
    db.close();
  }
}

function makeDb(file: string, rows = 3) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, n TEXT); CREATE TABLE sub_modules (id INTEGER PRIMARY KEY)');
  for (let i = 0; i < rows; i++) db.prepare('INSERT INTO users (n) VALUES (?)').run(`u${i}`);
  db.exec('INSERT INTO sub_modules DEFAULT VALUES');
  return db;
}

const at = (iso: string) => new Date(iso);

afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* folder sementara sistem: biarkan bila Windows masih mengunci */
  }
});

describe('backupIfDue (P4-32..P4-37)', () => {
  it('P4-32: membuat cadangan valid, konsisten, tanpa sisa .tmp/-wal/-shm', () => {
    const dir = freshDir();
    const dbPath = path.join(dir, 'ielts.db');
    const live = makeDb(dbPath, 5);
    const backupDir = path.join(dir, 'backups');
    const now = new Date();
    const r = backupIfDue({ dbPath, backupDir, now });
    expect(r.status).toBe('created');
    expect(r.file).toBe(path.join(backupDir, `ielts-${localDateStamp(now)}.db`));
    expect(scalar(r.file!, 'PRAGMA integrity_check')).toBe('ok');
    expect(scalar(r.file!, 'SELECT count(*) FROM users')).toBe(scalar(dbPath, 'SELECT count(*) FROM users'));
    expect(scalar(r.file!, 'SELECT count(*) FROM sub_modules')).toBe(1);
    expect(readdirSync(backupDir)).toEqual([backupFileName(now)]);
    live.close();
  });

  it('P4-32: cadangan atas DB seed sungguhan (TEST_DATABASE_PATH) memuat jumlah baris yang sama', () => {
    const dir = freshDir();
    const src = process.env.TEST_DATABASE_PATH!;
    const r = backupIfDue({ dbPath: src, backupDir: path.join(dir, 'b'), now: new Date() });
    expect(r.status).toBe('created');
    for (const t of ['users', 'sub_modules', 'tiers']) {
      expect(scalar(r.file!, `SELECT count(*) FROM ${t}`)).toBe(scalar(src, `SELECT count(*) FROM ${t}`));
    }
    expect(scalar(r.file!, 'PRAGMA integrity_check')).toBe('ok');
  });

  it('P4-33: cadangan hari ini sudah ada -> skipped_today, mtime tidak berubah', () => {
    const dir = freshDir();
    const dbPath = path.join(dir, 'ielts.db');
    makeDb(dbPath).close();
    const backupDir = path.join(dir, 'backups');
    const now = new Date();
    const first = backupIfDue({ dbPath, backupDir, now });
    const m1 = statSync(first.file!).mtimeMs;
    const second = backupIfDue({ dbPath, backupDir, now });
    expect(second.status).toBe('skipped_today');
    expect(statSync(first.file!).mtimeMs).toBe(m1);
  });

  it('P4-34: menyimpan tepat 7 berkas pola terbaru; berkas lain utuh', () => {
    const dir = freshDir();
    const dbPath = path.join(dir, 'ielts.db');
    makeDb(dbPath).close();
    const backupDir = path.join(dir, 'backups');
    mkdirSync(backupDir);
    const old = Array.from({ length: 8 }, (_, i) => `ielts-2026-10-${String(10 + i).padStart(2, '0')}.db`);
    for (const n of old) writeFileSync(path.join(backupDir, n), 'x');
    writeFileSync(path.join(backupDir, 'catatan.txt'), 'penting');
    writeFileSync(path.join(backupDir, 'ielts-manual.db'), 'manual');
    const r = backupIfDue({ dbPath, backupDir, now: at('2026-11-08T12:00:00') });
    expect(r.status).toBe('created');
    const kept = readdirSync(backupDir).filter((n) => /^ielts-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort();
    expect(kept).toHaveLength(7);
    expect(kept).toContain('ielts-2026-11-08.db');
    expect(r.pruned).toEqual(['ielts-2026-10-10.db', 'ielts-2026-10-11.db']);
    expect(existsSync(path.join(backupDir, 'catatan.txt'))).toBe(true);
    expect(existsSync(path.join(backupDir, 'ielts-manual.db'))).toBe(true);
  });

  it('P4-35: penulis lain di tengah transaksi WAL -> berhasil, memuat baris yang sudah commit', () => {
    const dir = freshDir();
    const dbPath = path.join(dir, 'ielts.db');
    const writer = makeDb(dbPath, 4);
    writer.exec('BEGIN IMMEDIATE');
    writer.prepare('INSERT INTO users (n) VALUES (?)').run('belum-commit');
    const r = backupIfDue({ dbPath, backupDir: path.join(dir, 'backups'), now: new Date() });
    expect(r.status).toBe('created');
    expect(scalar(r.file!, 'SELECT count(*) FROM users')).toBe(4);
    expect(existsSync(`${r.file}-wal`)).toBe(false);
    expect(existsSync(`${r.file}-shm`)).toBe(false);
    writer.exec('ROLLBACK');
    writer.close();
  });

  it('P4-36: folder cadangan tidak dapat dibuat/ditulis -> failed, tidak melempar, DB sumber utuh', () => {
    const dir = freshDir();
    const dbPath = path.join(dir, 'ielts.db');
    makeDb(dbPath, 2).close();
    const blocker = path.join(dir, 'bukan-folder');
    writeFileSync(blocker, 'berkas biasa');
    const r = backupIfDue({ dbPath, backupDir: path.join(blocker, 'backups'), now: new Date() });
    expect(r.status).toBe('failed');
    expect(scalar(dbPath, 'SELECT count(*) FROM users')).toBe(2);
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    // jalur folder cadangan adalah berkas biasa itu sendiri: juga gagal, deterministik di semua OS
    const r2 = backupIfDue({ dbPath, backupDir: blocker, now: new Date() });
    expect(r2.status).toBe('failed');
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('P4-37: DB belum ada -> no_database, tidak ada berkas dibuat', () => {
    const dir = freshDir();
    const backupDir = path.join(dir, 'backups');
    const r = backupIfDue({ dbPath: path.join(dir, 'tidak-ada.db'), backupDir, now: new Date() });
    expect(r).toEqual({ status: 'no_database', pruned: [] });
    expect(existsSync(backupDir)).toBe(false);
  });
});

describe('restoreBackup dan CLI db (P4-39, 39a, 39b)', () => {
  const saved = process.env.DATABASE_PATH;
  afterEach(() => {
    process.env.DATABASE_PATH = saved;
  });

  async function cli(...args: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  function setup(rowsLive: number, rowsBackup: number) {
    const dir = freshDir();
    const dbPath = path.join(dir, 'ielts.db');
    const backupDir = defaultBackupDir(dbPath);
    // cadangan lama berisi rowsBackup baris
    const tmp = path.join(dir, 'src.db');
    makeDb(tmp, rowsBackup).close();
    mkdirSync(backupDir);
    backupIfDue({ dbPath: tmp, backupDir, now: at('2026-11-07T10:00:00') });
    makeDb(dbPath, rowsLive).close();
    return { dir, dbPath, backupDir };
  }

  it('P4-39: restore memindahkan DB saat ini, membuang -wal/-shm, hasil lolos integrity_check', () => {
    const { dbPath, backupDir } = setup(6, 2);
    writeFileSync(`${dbPath}-wal`, '');
    writeFileSync(`${dbPath}-shm`, '');
    const r = restoreBackup({ dbPath, backupDir, name: 'ielts-2026-11-07.db', now: at('2026-11-08T09:08:07') });
    expect(r.previous).toBe(path.join(backupDir, 'ielts-sebelum-pulih-20261108-090807.db'));
    expect(scalar(r.previous!, 'SELECT count(*) FROM users')).toBe(6);
    expect(scalar(dbPath, 'SELECT count(*) FROM users')).toBe(2);
    expect(scalar(dbPath, 'PRAGMA integrity_check')).toBe('ok');
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
    // nama pengaman di luar pola retensi
    expect(listBackups(backupDir)).toEqual(['ielts-2026-11-07.db']);
  });

  it('P4-39: `latest` lewat CLI db restore --yes (kode 0)', async () => {
    const { dbPath } = setup(5, 1);
    process.env.DATABASE_PATH = dbPath;
    const r = await cli('db', 'restore', 'latest', '--yes');
    expect(r.code, r.err).toBe(0);
    expect(scalar(dbPath, 'SELECT count(*) FROM users')).toBe(1);
  });

  it('P4-39a: tanpa --yes -> kode 1, DB tidak berubah', async () => {
    const { dbPath } = setup(5, 1);
    process.env.DATABASE_PATH = dbPath;
    const r = await cli('db', 'restore', 'latest');
    expect(r.code).toBe(1);
    expect(r.err).toContain('Tambahkan --yes untuk melanjutkan');
    expect(scalar(dbPath, 'SELECT count(*) FROM users')).toBe(5);
  });

  it('P4-39a: berkas tidak ada -> "Cadangan tidak ditemukan: <nama>"', async () => {
    const { dbPath } = setup(5, 1);
    process.env.DATABASE_PATH = dbPath;
    const r = await cli('db', 'restore', 'ielts-1999-01-01.db', '--yes');
    expect(r.code).toBe(1);
    expect(r.err).toContain('Cadangan tidak ditemukan: ielts-1999-01-01.db');
    expect((await cli('db', 'restore', '..\\..\\x.db', '--yes')).err).toContain('Cadangan tidak ditemukan');
    expect(scalar(dbPath, 'SELECT count(*) FROM users')).toBe(5);
  });

  it('P4-39a: cadangan rusak -> "Cadangan rusak, tidak dipakai", DB tidak berubah', async () => {
    const { dbPath, backupDir } = setup(5, 1);
    writeFileSync(path.join(backupDir, 'ielts-2026-11-09.db'), 'ini bukan database sqlite '.repeat(200));
    process.env.DATABASE_PATH = dbPath;
    const r = await cli('db', 'restore', 'ielts-2026-11-09.db', '--yes');
    expect(r.code).toBe(1);
    expect(r.err).toContain('Cadangan rusak, tidak dipakai');
    expect(scalar(dbPath, 'SELECT count(*) FROM users')).toBe(5);
    expect(() => restoreBackup({ dbPath, backupDir, name: 'ielts-2026-11-09.db' })).toThrow(RestoreError);
  });

  it('P4-39a: DB sedang dipakai (penulis memegang kunci) -> pesan "sedang dipakai", DB tidak berubah', async () => {
    const { dbPath } = setup(5, 1);
    process.env.DATABASE_PATH = dbPath;
    const holder = new DatabaseSync(dbPath);
    holder.exec('BEGIN IMMEDIATE');
    try {
      const r = await cli('db', 'restore', 'latest', '--yes');
      expect(r.code).toBe(1);
      expect(r.err).toContain('Database sedang dipakai. Hentikan aplikasi lalu ulangi.');
    } finally {
      holder.exec('ROLLBACK');
      holder.close();
    }
    expect(scalar(dbPath, 'SELECT count(*) FROM users')).toBe(5);
  });

  it('M-2: koneksi IDLE (seperti server web) menahan file -> IN_USE, DB dan cadangan tidak berubah', async () => {
    const { dbPath, backupDir } = setup(5, 1);
    process.env.DATABASE_PATH = dbPath;
    const idle = new DatabaseSync(dbPath);
    idle.exec('PRAGMA journal_mode = WAL');
    idle.prepare('SELECT count(*) FROM users').get(); // koneksi terbuka tanpa transaksi, seperti server idle
    try {
      expect(() => restoreBackup({ dbPath, backupDir, name: 'latest' })).toThrow('Database sedang dipakai. Hentikan aplikasi lalu ulangi.');
      const r = await cli('db', 'restore', 'latest', '--yes');
      expect(r.code).toBe(1);
      expect(r.err).toContain('Database sedang dipakai. Hentikan aplikasi lalu ulangi.');
      expect(r.err).not.toMatch(/EBUSY|EPERM/);
    } finally {
      idle.close();
    }
    expect(scalar(dbPath, 'SELECT count(*) FROM users')).toBe(5);
    expect(listBackups(backupDir)).toEqual(['ielts-2026-11-07.db']);
    expect(readdirSync(backupDir).filter((n) => n.includes('sebelum-pulih'))).toEqual([]);
  });

  it('M-2: setelah koneksi idle ditutup, restore berhasil', () => {
    const { dbPath, backupDir } = setup(5, 1);
    const idle = new DatabaseSync(dbPath);
    idle.exec('PRAGMA journal_mode = WAL');
    idle.prepare('SELECT 1').get();
    idle.close();
    expect(restoreBackup({ dbPath, backupDir, name: 'latest' }).restoredFrom).toBe('ielts-2026-11-07.db');
  });

  it('P4-39b: db backup mencetak created lalu skipped_today; kode 0', async () => {
    const dir = freshDir();
    const dbPath = path.join(dir, 'ielts.db');
    makeDb(dbPath).close();
    process.env.DATABASE_PATH = dbPath;
    const a = await cli('db', 'backup');
    expect(a.code).toBe(0);
    expect(a.out).toContain('created');
    const b = await cli('db', 'backup');
    expect(b.code).toBe(0);
    expect(b.out).toContain('skipped_today');
    expect(listBackups(defaultBackupDir(dbPath))).toHaveLength(1);
  });

  it('P4-39b: db backup gagal -> kode 1', async () => {
    const dir = freshDir();
    const dbPath = path.join(dir, 'ielts.db');
    makeDb(dbPath).close();
    writeFileSync(path.join(dir, 'backups'), 'berkas, bukan folder');
    process.env.DATABASE_PATH = dbPath;
    expect((await cli('db', 'backup')).code).toBe(1);
  });
});

describe('proses terpisah: migrate, seed, konten, doctor (P4-10, 12, 13, 41, 43, 45, 59)', () => {
  const dbPath = path.join(root, 'proses', 'ielts.db');
  const TABLES = ['tiers', 'modules', 'sub_modules', 'content_sources', 'app_settings', 'band_conversion_tables'];
  const counts = () => Object.fromEntries(TABLES.map((t) => [t, scalar(dbPath, `SELECT count(*) FROM ${t}`)]));

  beforeAll(() => mkdirSync(path.dirname(dbPath), { recursive: true }));

  it('P4-10: migrasi pertama membuat DB; kedua berkata "sudah terbaru" tanpa mengubah baris', () => {
    expect(existsSync(dbPath)).toBe(false);
    const first = run('scripts/migrate.ts', [], dbPath);
    expect(first.status, first.stderr).toBe(0);
    expect(existsSync(dbPath)).toBe(true);
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries.map((e: any) => e.tag);
    const mdb = new DatabaseSync(dbPath, { readOnly: true });
    const applied = mdb.prepare('SELECT tag FROM _migrations').all().map((r: any) => r.tag);
    mdb.close();
    expect(applied.sort()).toEqual([...journal].sort());
    const seeded = run('scripts/seed.ts', [], dbPath);
    expect(seeded.status, seeded.stderr).toBe(0);
    const before = counts();
    const second = run('scripts/migrate.ts', [], dbPath);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('sudah terbaru');
    expect(counts()).toEqual(before);
  });

  it('P4-12: seed dua kali -> jumlah baris sama dan nilai settings:set tidak ditimpa', () => {
    const before = counts();
    const set = run('scripts/cli.ts', ['settings', 'set', 'ai.daily_limit_per_user', '42'], dbPath);
    expect(set.status, set.stderr).toBe(0);
    for (let i = 0; i < 2; i++) {
      const s = run('scripts/seed.ts', [], dbPath);
      expect(s.status, s.stderr).toBe(0);
    }
    expect(counts()).toEqual(before);
    const get = run('scripts/cli.ts', ['settings', 'get', 'ai.daily_limit_per_user'], dbPath);
    expect(get.stdout).toContain('ai.daily_limit_per_user = 42');
  });

  it('P4-13: impor --publish tiap subfolder content/gt-modules menghasilkan >= 1 sub-modul PUBLISHED', async () => {
    expect(scalar(dbPath, "SELECT count(*) FROM sub_modules WHERE status = 'PUBLISHED'")).toBe(0);
    const root2 = path.resolve('content', 'gt-modules');
    const dirs = readdirSync(root2);
    for (const d of dirs) {
      const r = await runAsync('scripts/content-import.ts', ['import', '--dir', path.join(root2, d), '--publish'], dbPath);
      expect(r.status, `${d}\n${r.stdout}\n${r.stderr}`).toBe(0);
    }
    // Tiap paket berisi satu sub-modul dengan drill, sehingga semuanya harus terbit.
    expect(scalar(dbPath, "SELECT count(*) FROM sub_modules WHERE status = 'PUBLISHED'")).toBe(dirs.length);
  }, 300_000);

  it('P4-59: urutan start:local pada DB berisi 2 profil dan progres tidak mengubah users/progres', () => {
    expect(run('scripts/cli.ts', ['profile', 'create', 'Ani'], dbPath).status).toBe(0);
    expect(run('scripts/cli.ts', ['profile', 'create', 'Budi'], dbPath).status).toBe(0);
    expect(run('scripts/cli.ts', ['progress', 'unlock', 'Ani', '3.3.3'], dbPath).status).toBe(0);
    const snap = () => [scalar(dbPath, 'SELECT count(*) FROM users'), scalar(dbPath, 'SELECT count(*) FROM user_sub_module_progress')];
    const before = snap();
    expect(before[0]).toBe(2);
    expect(before[1]).toBeGreaterThan(0);
    for (const [script, args] of [
      ['scripts/cli.ts', ['db', 'backup']],
      ['scripts/migrate.ts', []],
      ['scripts/seed.ts', []],
    ] as const) {
      const r = run(script, [...args], dbPath);
      expect(r.status, r.stderr).toBe(0);
    }
    expect(snap()).toEqual(before);
    expect(existsSync(defaultBackupDir(dbPath))).toBe(true);
  });

  it('P4-41/P4-45/P4-44: doctor tanpa variabel Postgres: kode 0, baris Cadangan [OK], catatan internet', () => {
    const r = run('scripts/cli.ts', ['doctor'], dbPath, { AI_ENABLED: 'false', AUTH_SECRET: 'x'.repeat(40), IP_HMAC_SECRET: 'y'.repeat(40) });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).not.toContain('[GAGAL]');
    expect(r.stdout).toMatch(/\[OK\]\s+Cadangan: terakhir \d{4}-\d{2}-\d{2}/);
    expect(r.stdout).toMatch(/\[OK\]\s+Integritas database/);
    expect(r.stdout).toMatch(/\[CATAT\]\s+Penilai Writing \(LLM\)/);
    expect(r.stdout).toContain('Catatan koneksi internet:');
    expect(r.stdout).toContain('YouTube');
    expect(r.stdout).toContain('Speaking');
    expect(r.stdout).toContain('font');
  });

  it('P4-43: DB rusak / bukan database -> [GAGAL] Integritas database + petunjuk pemulihan, kode 1', () => {
    const bad = path.join(root, 'rusak.db');
    writeFileSync(bad, 'bukan database sqlite '.repeat(500));
    const r = run('scripts/cli.ts', ['doctor'], bad, { AUTH_SECRET: 'x'.repeat(40), IP_HMAC_SECRET: 'y'.repeat(40) });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/\[GAGAL\]\s+Integritas database: .*Pulihkan: npm run db:restore -- latest --yes/);
  });

  it('P4-44: cadangan lebih dari 48 jam -> [CATAT]; belum ada -> [CATAT] belum ada cadangan', () => {
    const old = defaultBackupDir(dbPath);
    for (const n of readdirSync(old)) {
      const t = (Date.now() - 5 * 24 * 3600 * 1000) / 1000;
      utimesSync(path.join(old, n), t, t);
    }
    const stale = run('scripts/cli.ts', ['doctor'], dbPath, { AUTH_SECRET: 'x'.repeat(40), IP_HMAC_SECRET: 'y'.repeat(40) });
    expect(stale.stdout).toMatch(/\[CATAT\]\s+Cadangan: cadangan terakhir \d{4}-\d{2}-\d{2} \(lebih dari 48 jam\)/);
    rmSync(old, { recursive: true, force: true });
    const none = run('scripts/cli.ts', ['doctor'], dbPath, { AUTH_SECRET: 'x'.repeat(40), IP_HMAC_SECRET: 'y'.repeat(40) });
    expect(none.stdout).toMatch(/\[CATAT\]\s+Cadangan: belum ada cadangan/);
  });
});
