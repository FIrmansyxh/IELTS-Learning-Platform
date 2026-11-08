/**
 * Setup integrasi (SQLite, SPEC-025 Fase 3): berkas DB sementara yang bersih, lalu migrasi + seed.
 * Tanpa Docker/Postgres. Semua proses uji memakai berkas ini lewat TEST_DATABASE_PATH.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dir: string | undefined;

export async function setup() {
  dir = mkdtempSync(path.join(tmpdir(), 'ielts-itest-'));
  const file = path.join(dir, 'test.db');
  const env = { ...process.env, DATABASE_PATH: file };
  for (const script of ['db:migrate', 'db:seed']) {
    const r = spawnSync('npm', ['run', script], { env, stdio: 'inherit', shell: true });
    if (r.status !== 0) throw new Error(`${script} gagal`);
  }
  process.env.TEST_DATABASE_PATH = file;
}

export async function teardown() {
  if (dir) rmSync(dir, { recursive: true, force: true });
}
