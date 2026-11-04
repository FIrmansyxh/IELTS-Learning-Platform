/**
 * Kunci advisory global untuk job AI (SPEC-012/013): hanya satu job AI aktif lintas queue dan lintas proses worker.
 * Dipegang pada koneksi khusus selama eksekusi; dilepas di `finally` (atau otomatis bila proses mati).
 */
import { getPool } from '../db';

export const AI_LOCK_KEY = 727001;

export class AiLockTimeoutError extends Error {
  constructor() {
    super('AI_LOCK_TIMEOUT');
    this.name = 'AiLockTimeoutError';
  }
}

export async function withAiLock<T>(fn: () => Promise<T>, timeoutSec: number, pollMs = 200): Promise<T> {
  const client = await getPool().connect();
  let held = false;
  let destroy = false;
  try {
    const deadline = Date.now() + timeoutSec * 1000;
    for (;;) {
      const r = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [AI_LOCK_KEY]);
      if (r.rows[0]?.ok) {
        held = true;
        break;
      }
      if (Date.now() >= deadline) throw new AiLockTimeoutError();
      await new Promise((res) => setTimeout(res, pollMs));
    }
    return await fn();
  } finally {
    if (held) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [AI_LOCK_KEY]);
      } catch {
        destroy = true; // koneksi dibuang agar kunci sesi tidak tertinggal di pool
      }
    }
    client.release(destroy);
  }
}
