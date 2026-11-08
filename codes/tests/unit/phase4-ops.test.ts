/**
 * SPEC-025 Fase 4, sisi unit: pemeriksa cadangan di instrumentation (P4-38), catatan sisa Postgres (P4-42),
 * baris Cadangan doctor (P4-44), catatan internet (P4-45), dan package.json (P4-53).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('P4-38: pemeriksa cadangan di instrumentation.register()', () => {
  const backupIfDue = vi.fn(() => ({ status: 'skipped_today', pruned: [] }));

  beforeEach(() => {
    vi.resetModules();
    backupIfDue.mockClear();
    vi.doMock('@/server/env', () => ({ getEnv: () => ({}) }));
    vi.doMock('../../src/server/env', () => ({ getEnv: () => ({}) }));
    vi.doMock('../../src/server/backup', () => ({ backupIfDue, defaultBackupDir: () => '/b' }));
    vi.doMock('../../src/server/db', () => ({ databasePath: () => '/d/ielts.db' }));
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.doUnmock('../../src/server/env');
    vi.doUnmock('../../src/server/backup');
    vi.doUnmock('../../src/server/db');
  });

  it('NODE_ENV=production: terdaftar sekali, interval 6 jam, unref, tiap tik memanggil backupIfDue', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const unref = vi.fn();
    let tick: (() => void) | undefined;
    const spy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
      tick = fn;
      return { unref } as any;
    }) as any);
    const { register } = await import('../../src/instrumentation');
    await register();
    await register();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toBe(21_600_000);
    expect(unref).toHaveBeenCalledTimes(1);
    tick!();
    expect(backupIfDue).toHaveBeenCalledWith(expect.objectContaining({ dbPath: '/d/ielts.db', backupDir: '/b' }));
  });

  it.each(['development', 'test'])('NODE_ENV=%s: pemeriksa tidak terdaftar', async (env) => {
    vi.stubEnv('NODE_ENV', env);
    const spy = vi.spyOn(globalThis, 'setInterval');
    const { register } = await import('../../src/instrumentation');
    await register();
    expect(spy).not.toHaveBeenCalled();
    expect(backupIfDue).not.toHaveBeenCalled();
  });
});

describe('doctor: sisa Postgres dan cadangan (P4-42, P4-44, P4-45)', () => {
  let dir: string;
  const saved = process.env.DATABASE_PATH;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'doctor-'));
    process.env.DATABASE_PATH = path.join(dir, 'ielts.db');
  });
  afterEach(() => {
    process.env.DATABASE_PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it('P4-42: .env berisi kunci Postgres -> satu [CATAT] menyebut nama kunci, bukan nilai', async () => {
    const { postgresLeftoverCheck } = await import('../../src/server/cli/doctor');
    const f = path.join(dir, '.env');
    writeFileSync(f, 'AUTH_SECRET=abc\nDATABASE_URL=postgres://u:RAHASIA@h/db\nDATABASE_MIGRATOR_URL=postgres://m:RAHASIA2@h/db\n');
    const c = postgresLeftoverCheck(f)!;
    expect(c.status).toBe('warn');
    expect(c.name).toBe('Sisa konfigurasi Postgres');
    expect(c.detail).toContain('DATABASE_URL');
    expect(c.detail).toContain('DATABASE_MIGRATOR_URL');
    expect(c.detail).toContain('aman dihapus dari .env');
    expect(c.detail).not.toContain('RAHASIA');
  });

  it('P4-42: tanpa kunci Postgres atau tanpa .env -> tidak ada catatan', async () => {
    const { postgresLeftoverCheck } = await import('../../src/server/cli/doctor');
    const f = path.join(dir, '.env');
    expect(postgresLeftoverCheck(f)).toBeNull();
    writeFileSync(f, 'AUTH_SECRET=abc\n');
    expect(postgresLeftoverCheck(f)).toBeNull();
  });

  it('P4-44: [OK] <=48 jam, [CATAT] belum ada, [CATAT] lebih dari 48 jam', async () => {
    const { backupCheck } = await import('../../src/server/cli/doctor');
    expect(backupCheck()).toMatchObject({ name: 'Cadangan', status: 'warn' });
    expect(backupCheck().detail).toContain('belum ada cadangan');

    const b = path.join(dir, 'backups');
    mkdirSync(b);
    const f = path.join(b, 'ielts-2026-11-07.db');
    writeFileSync(f, 'x');
    const t = new Date('2026-11-07T10:00:00').getTime();
    utimesSync(f, t / 1000, t / 1000);
    const fresh = backupCheck(new Date(t + 47 * 3600_000));
    expect(fresh.status).toBe('ok');
    expect(fresh.detail).toContain('2026-11-07');
    const stale = backupCheck(new Date(t + 49 * 3600_000));
    expect(stale.status).toBe('warn');
    expect(stale.detail).toContain('cadangan terakhir 2026-11-07 (lebih dari 48 jam)');
  });

  it('P4-45: OFFLINE_NOTES memuat YouTube, Speaking pihak ketiga, dan unduhan font/model', async () => {
    const { OFFLINE_NOTES } = await import('../../src/server/cli/doctor');
    const all = OFFLINE_NOTES.join('\n');
    expect(all).toContain('YouTube');
    expect(all).toMatch(/Speaking.*(Claude|GPT|Gemini)/);
    expect(all).toMatch(/font.*model/);
  });
});

describe('P4-53: package.json', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  it('skrip dan engines sesuai spec', () => {
    expect(pkg.scripts.start).toBe('next start -H 127.0.0.1 -p 3005');
    expect(pkg.scripts['start:local']).toBe('node scripts/start-local.mjs');
    expect(pkg.scripts['db:backup']).toBeDefined();
    expect(pkg.scripts['db:restore']).toBeDefined();
    expect(pkg.scripts['build:worker']).toBeUndefined();
    expect(pkg.engines.node).toBe('>=22.20.0');
  });
  it('tidak ada dependensi Postgres/pg-boss', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const k of ['pg', 'pg-boss', '@types/pg', 'testcontainers']) expect(all[k]).toBeUndefined();
  });
});
