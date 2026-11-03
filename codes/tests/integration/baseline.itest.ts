import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let pool: pg.Pool;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
});
afterAll(async () => {
  await pool.end();
});

describe('migrasi baseline', () => {
  it('membuat >= 31 tabel public dan skema pgboss', async () => {
    const t = await pool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
    expect(t.rows[0].n).toBeGreaterThanOrEqual(31);
    const s = await pool.query(`SELECT 1 FROM information_schema.schemata WHERE schema_name='pgboss'`);
    expect(s.rowCount).toBe(1);
  });

  it('membuat view v_publish_blockers dengan kolom sesuai spec', async () => {
    const c = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='v_publish_blockers' ORDER BY ordinal_position`,
    );
    expect(c.rows.map((r) => r.column_name)).toEqual(['entity_type', 'entity_id', 'reason_code', 'detail']);
  });

  it('memiliki FK melingkar dari 0001', async () => {
    const r = await pool.query(
      `SELECT conname FROM pg_constraint WHERE conname IN ('user_last_learned_state_active_attempt_id_attempts_id_fk','async_jobs_import_batch_id_import_batches_id_fk')`,
    );
    expect(r.rowCount).toBe(2);
  });

  it('seed idempoten: 14 content_sources setelah dijalankan ulang', async () => {
    const env = { ...process.env, DATABASE_MIGRATOR_URL: process.env.TEST_DATABASE_URL };
    const r = spawnSync('npm', ['run', 'db:seed'], { env, shell: true, encoding: 'utf8' });
    expect(r.status).toBe(0);
    const n = await pool.query('SELECT count(*)::int AS n FROM content_sources');
    expect(n.rows[0].n).toBe(14);
    const a = await pool.query('SELECT count(*)::int AS n FROM app_settings');
    expect(a.rows[0].n).toBe(22); // 21 kunci registri + system.worker_heartbeat_at (SPEC-002)
  });

  it('migrate dijalankan ulang tanpa perubahan skema: exit 0', () => {
    const env = {
      ...process.env,
      DATABASE_MIGRATOR_URL: process.env.TEST_DATABASE_URL,
      SKIP_PRE_MIGRATE_BACKUP: 'true',
    };
    const r = spawnSync('npm', ['run', 'db:migrate'], { env, shell: true, encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});

describe('hak akses app_rw (hanya bila role ada)', () => {
  it('UPDATE audit_log dan DELETE point_ledger ditolak', async () => {
    const role = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname='app_rw'`);
    if (!role.rowCount) return; // DB CI tanpa skrip init: diuji manual / di stack Compose
    const c = await pool.connect();
    try {
      await c.query('SET ROLE app_rw');
      await expect(c.query(`UPDATE audit_log SET action='x'`)).rejects.toThrow(/permission denied/);
      await expect(c.query('DELETE FROM point_ledger')).rejects.toThrow(/permission denied/);
    } finally {
      await c.query('RESET ROLE').catch(() => undefined);
      c.release();
    }
  });
});
