import { writeFile } from 'node:fs/promises';
import pino from 'pino';
import PgBoss from 'pg-boss';
import pg from 'pg';
import { parseEnv } from '../server/env';
import { safeErr } from '../server/safe-error';
import { AI_QUEUES, QUEUE_NAMES, type QueueName } from './queues';
import { jobHandlers } from './registry';

const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker.heartbeat';
const HEARTBEAT_MS = 15_000;

/** Semaphore sederhana: satu job AI aktif pada satu waktu lintas queue AI. */
function createLimiter(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiters.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiters.shift()?.();
    }
  };
}

async function main() {
  const parsed = parseEnv(process.env);
  if (!parsed.ok) {
    for (const m of parsed.messages) console.error(m);
    process.exit(1);
  }
  const env = parsed.env;
  const log = pino({ level: env.LOG_LEVEL, base: { svc: 'worker' } });

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3 });
  // Runtime: tanpa migrasi/DDL (peran app_rw). Skema pgboss dan queue dibuat oleh scripts/migrate.ts.
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, migrate: false, max: 5 });
  boss.on('error', (err) => log.error({ err: safeErr(err) }, 'pg-boss error'));

  await boss.start();

  const aiLimit = createLimiter(1);
  for (const name of QUEUE_NAMES) {
    const handler = jobHandlers[name as QueueName];
    const isAi = AI_QUEUES.includes(name);
    await boss.work(name, { batchSize: 1, pollingIntervalSeconds: 2 }, async (jobs) => {
      const run = () => handler(jobs, { log: log.child({ queue: name }) });
      await (isAi ? aiLimit(run) : run());
    });
  }

  await boss.schedule('retention-purge', '0 3 * * *', {}, { tz: env.APP_TIMEZONE });

  const beat = async () => {
    try {
      await writeFile(HEARTBEAT_FILE, new Date().toISOString());
      await pool.query(
        `INSERT INTO app_settings (key, value, description) VALUES ('system.worker_heartbeat_at', to_jsonb($1::text), 'Heartbeat worker (sistem)')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [new Date().toISOString()],
      );
    } catch (err) {
      log.warn({ err: safeErr(err) }, 'heartbeat gagal');
    }
  };
  await beat();
  const timer = setInterval(beat, HEARTBEAT_MS);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'menghentikan worker');
    clearInterval(timer);
    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
      await pool.end();
      process.exit(0);
    } catch (err) {
      log.error({ err: safeErr(err) }, 'gagal berhenti dengan rapi');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  log.info({ queues: QUEUE_NAMES }, 'worker siap');
}

main().catch((err) => {
  console.error(safeErr(err));
  process.exit(1);
});
