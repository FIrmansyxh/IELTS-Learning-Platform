import PgBoss from 'pg-boss';
import type { QueueName } from '@/worker/queues';
import { logger } from '../logger';
import { safeErr } from '../safe-error';

/**
 * Klien pg-boss sisi aplikasi (hanya `send`). Skema pgboss dan queue dibuat oleh scripts/migrate.ts;
 * proses web tidak menjalankan migrasi, supervisor, maupun jadwal.
 */
let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  starting ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL tidak diset');
    const b = new PgBoss({ connectionString: url, max: 2, migrate: false, schedule: false, supervise: false });
    b.on('error', (e) => logger.error({ err: safeErr(e) }, 'pg-boss error'));
    await b.start();
    boss = b;
    return b;
  })().catch((e) => {
    starting = undefined;
    throw e;
  });
  return starting;
}

/** Kirim job; mengembalikan id job pg-boss (atau null bila pg-boss menolak). */
export async function enqueue(queue: QueueName, data: Record<string, unknown>): Promise<string | null> {
  const b = await getBoss();
  return b.send(queue, data);
}

export async function closeQueue(): Promise<void> {
  const b = boss;
  boss = undefined;
  starting = undefined;
  if (b) await b.stop({ graceful: false, timeout: 3000 }).catch(() => undefined);
}
