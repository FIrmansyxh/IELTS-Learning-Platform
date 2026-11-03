/**
 * Setup integrasi: memakai TEST_DATABASE_URL bila ada; jika tidak, memulai Testcontainers
 * (postgres:16.10-alpine). Membuat DB bersih, lalu menjalankan migrasi + seed.
 */
import { spawnSync } from 'node:child_process';
import pg from 'pg';

let stop: (() => Promise<void>) | undefined;

export async function setup() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:16.10-alpine')
      .withDatabase('ielts_test')
      .withUsername('postgres_admin')
      .withPassword('test-only-password-0001')
      .start();
    url = container.getConnectionUri();
    stop = async () => {
      await container.stop();
    };
  }

  // Reset skema agar DB selalu bersih.
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  } finally {
    await pool.end();
  }

  const env = { ...process.env, DATABASE_MIGRATOR_URL: url, DATABASE_URL: url, SKIP_PRE_MIGRATE_BACKUP: 'true' };
  for (const script of ['db:migrate', 'db:seed']) {
    const r = spawnSync('npm', ['run', script], { env, stdio: 'inherit', shell: true });
    if (r.status !== 0) throw new Error(`${script} gagal`);
  }
  process.env.TEST_DATABASE_URL = url;
}

export async function teardown() {
  await stop?.();
}
