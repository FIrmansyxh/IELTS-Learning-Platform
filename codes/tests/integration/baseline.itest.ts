import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let raw: DatabaseSync;
const q = <T>(sql: string): T[] => raw.prepare(sql).all() as T[];

beforeAll(() => {
  raw = new DatabaseSync(process.env.TEST_DATABASE_PATH!);
});
afterAll(() => {
  raw.close();
});

describe('migrasi baseline (SQLite)', () => {
  it('membuat tabel aplikasi dan tidak membuat tabel login/impor/antrean eksternal', () => {
    const names = q<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).map((r) => r.name);
    expect(names.length).toBeGreaterThanOrEqual(28);
    for (const gone of ['import_batches', 'import_batch_items', 'signup_invites']) expect(names).not.toContain(gone);
    expect(names).toContain('users');
    expect(names).toContain('_migrations');
  });

  it('users tidak lagi memiliki kolom email/password/role', () => {
    const cols = q<{ name: string }>(`PRAGMA table_info(users)`).map((c) => c.name);
    for (const gone of ['email', 'password_hash', 'role', 'must_change_password', 'failed_login_count']) expect(cols).not.toContain(gone);
    expect(cols).toContain('display_name');
  });

  it('membuat view v_publish_blockers dengan kolom sesuai spec', () => {
    const c = q<{ name: string }>(`PRAGMA table_info(v_publish_blockers)`).map((x) => x.name);
    expect(c).toEqual(['entity_type', 'entity_id', 'reason_code', 'detail']);
  });

  it('memiliki FK melingkar user_last_learned_state -> attempts', () => {
    const fks = q<{ table: string; from: string }>(`PRAGMA foreign_key_list(user_last_learned_state)`);
    expect(fks.some((f) => f.table === 'attempts' && f.from === 'active_attempt_id')).toBe(true);
  });

  it('seed idempoten: 14 content_sources setelah dijalankan ulang', () => {
    const env = { ...process.env, DATABASE_PATH: process.env.TEST_DATABASE_PATH };
    const r = spawnSync('npm', ['run', 'db:seed'], { env, shell: true, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(Number(q<{ n: number }>('SELECT count(*) AS n FROM content_sources')[0]!.n)).toBe(14);
    expect(Number(q<{ n: number }>('SELECT count(*) AS n FROM app_settings')[0]!.n)).toBe(21); // 20 kunci registri + kunci sistem
  });

  it('migrate dijalankan ulang tanpa perubahan skema: exit 0', () => {
    const env = { ...process.env, DATABASE_PATH: process.env.TEST_DATABASE_PATH };
    const r = spawnSync('npm', ['run', 'db:migrate'], { env, shell: true, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/sudah terbaru/);
  });
});
