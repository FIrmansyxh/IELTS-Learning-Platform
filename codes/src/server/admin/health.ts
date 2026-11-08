import { readdir, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import type { AdminHealth } from '@/contracts/admin';
import { appSettings } from '@/db/schema';
import { config } from '../config';
import { getDb } from '../db';
import { logger } from '../logger';
import { safeErr } from '../safe-error';
import { SYSTEM_HEARTBEAT_KEY } from '../settings/registry';
import pkg from '../../../package.json';

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error('timeout')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
};

async function probe(url: string): Promise<'up' | 'down'> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    return r.status < 500 ? 'up' : 'down';
  } catch {
    return 'down';
  } finally {
    clearTimeout(t);
  }
}

async function dirSizeMb(dir: string, budgetMs = 1500): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let total = 0;
  const walk = async (d: string): Promise<void> => {
    if (Date.now() > deadline) return;
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) total += (await stat(p)).size;
    }
  };
  await walk(dir).catch(() => undefined);
  return Math.round(total / 1_048_576);
}

export async function getAdminHealth(): Promise<AdminHealth> {
  const db = getDb();
  const aiEnabled = config.aiEnabled();

  const dbCheck = (async () => {
    const t0 = Date.now();
    try {
      await withTimeout(db.execute(sql`SELECT 1`), 2000);
      return { status: 'up' as const, latency_ms: Date.now() - t0 };
    } catch {
      return { status: 'down' as const, latency_ms: null };
    }
  })();

  const queueCheck = (async () => {
    try {
      const r = await withTimeout(
        db.execute(sql`
          SELECT count(*) FILTER (WHERE state IN ('created', 'retry'))::int AS waiting,
                 count(*) FILTER (WHERE state = 'active')::int AS active,
                 count(*) FILTER (WHERE state = 'failed' AND completed_on > now() - interval '24 hours')::int AS failed_24h,
                 extract(epoch FROM (now() - min(created_on) FILTER (WHERE state IN ('created', 'retry'))))::int AS oldest
          FROM pgboss.job`),
        2000,
      );
      const row = r.rows[0] as { waiting: number; active: number; failed_24h: number; oldest: number | null };
      return {
        waiting: row.waiting,
        active: row.active,
        failed_24h: row.failed_24h,
        oldest_waiting_age_sec: row.waiting > 0 && row.oldest !== null ? Math.max(0, row.oldest) : null,
      };
    } catch (err) {
      logger.warn({ err: safeErr(err) }, 'health: gagal membaca antrean');
      return { waiting: 0, active: 0, failed_24h: 0, oldest_waiting_age_sec: null };
    }
  })();

  const llmCheck = (async (): Promise<AdminHealth['llm']> => {
    const driver = process.env.LLM_DRIVER ?? 'llamacpp';
    const isOllama = driver === 'ollama';
    const base = {
      enabled: aiEnabled,
      driver,
      model_writing: (isOllama ? process.env.OLLAMA_MODEL_WRITING : process.env.LLAMACPP_MODEL_WRITING) ?? null,
      model_speaking: isOllama ? (process.env.OLLAMA_MODEL_SPEAKING ?? null) : null,
    };
    if (!aiEnabled) return { ...base, status: 'disabled' };
    const url = isOllama ? process.env.OLLAMA_BASE_URL : (process.env.LLAMACPP_BASE_URL ?? 'http://127.0.0.1:8080');
    const path = isOllama ? '/api/tags' : '/health';
    return { ...base, status: url ? await probe(`${url.replace(/\/$/, '')}${path}`) : 'down' };
  })();

  const sttCheck = (async (): Promise<AdminHealth['stt']> => {
    const model = process.env.STT_MODEL ?? 'base';
    if (!aiEnabled) return { status: 'disabled', model };
    const url = process.env.STT_BASE_URL;
    return { status: url ? await probe(`${url.replace(/\/$/, '')}/`) : 'down', model };
  })();

  const workerCheck = (async () => {
    try {
      const [row] = await db.select({ v: appSettings.value }).from(appSettings).where(eq(appSettings.key, SYSTEM_HEARTBEAT_KEY));
      if (typeof row?.v !== 'string') return { heartbeat_age_sec: null };
      const t = Date.parse(row.v);
      return { heartbeat_age_sec: Number.isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 1000)) };
    } catch {
      return { heartbeat_age_sec: null };
    }
  })();

  const diskCheck = (async () => {
    const dir = config.assetsDir();
    try {
      const fsStat = await statfs(dir);
      return { assets_used_mb: await dirSizeMb(dir), assets_free_mb: Math.round((fsStat.bavail * fsStat.bsize) / 1_048_576) };
    } catch {
      return { assets_used_mb: 0, assets_free_mb: 0 };
    }
  })();

  const [dbR, queue, llm, stt, worker, disk] = await Promise.all([dbCheck, queueCheck, llmCheck, sttCheck, workerCheck, diskCheck]);
  return { db: dbR, queue, llm, stt, worker, disk, app: { version: pkg.version, node: process.versions.node } };
}
