/**
 * Migrasi: (1) backup pg_dump bila users berisi baris, (2) migrator Drizzle,
 * (3) PgBoss.start() sekali + buat queue, (4) GRANT ke app_rw. Idempoten.
 * Dijalankan dengan peran app_migrator (DATABASE_MIGRATOR_URL).
 */
import './_env';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import PgBoss from 'pg-boss';
import pg from 'pg';
import { QUEUE_NAMES, queueOptions } from '../src/worker/queues';

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) {
  console.error('Konfigurasi env tidak valid: DATABASE_MIGRATOR_URL');
  process.exit(1);
}
const aiTimeout = Number(process.env.AI_JOB_TIMEOUT_SEC ?? '180');

async function preMigrateBackup(pool: pg.Pool) {
  const exists = await pool.query<{ t: string | null }>(`SELECT to_regclass('public.users')::text AS t`);
  if (!exists.rows[0]?.t) return;
  const count = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM users');
  if (Number(count.rows[0]?.n ?? '0') === 0) return;

  if (process.env.SKIP_PRE_MIGRATE_BACKUP === 'true') {
    console.warn('[migrate] backup pra-migrasi dilewati (SKIP_PRE_MIGRATE_BACKUP=true)');
    return;
  }
  const dir = process.env.MIGRATE_BACKUP_DIR ?? '/backups/pre-migrate';
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pre-migrate-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
  const r = spawnSync('pg_dump', ['-Fc', '-f', file, '--dbname', url!], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('[migrate] pg_dump gagal; migrasi dibatalkan agar data aman');
    process.exit(1);
  }
  console.log(`[migrate] backup pra-migrasi: ${file}`);
}

async function main() {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    await preMigrateBackup(pool);

    await migrate(drizzle(pool), { migrationsFolder: path.resolve('drizzle') });
    console.log('[migrate] migrasi Drizzle selesai');

    const boss = new PgBoss({ connectionString: url, max: 2, schedule: false, supervise: false });
    boss.on('error', (e) => console.error('[migrate] pg-boss error', e));
    await boss.start();
    for (const name of QUEUE_NAMES) {
      const opts = queueOptions(name, aiTimeout);
      await boss.createQueue(name, { ...opts }); // salinan: pg-boss memutasi objek opsi (menambah policy)
      await boss.updateQueue(name, { ...opts });
    }
    await boss.stop({ graceful: true, timeout: 10_000 });
    console.log('[migrate] skema pgboss + queue siap');

    // Hak akses untuk app_rw (dilewati bila role tidak ada, mis. DB CI).
    const role = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'app_rw'`);
    if (role.rowCount) {
      await pool.query(`
        GRANT USAGE ON SCHEMA public TO app_rw;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
        REVOKE UPDATE, DELETE ON audit_log, point_ledger FROM app_rw;
        GRANT USAGE ON SCHEMA pgboss TO app_rw;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO app_rw;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO app_rw;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO app_rw;
      `);
      console.log('[migrate] GRANT app_rw selesai');
    } else {
      console.warn('[migrate] role app_rw tidak ada; GRANT dilewati');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] gagal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
