/** Kuota harian dan antrean AI (SPEC-012). Jendela 24 jam bergulir memakai jam DB (sama dengan `created_at`). */
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { asyncJobs, submissions } from '@/db/schema';
import type { DbOrTx } from '../db';
import { config } from '../config';
import { ApiError } from '../http/errors';
import { getSetting } from '../settings/service';

export const AI_JOB_KINDS = ['STT_TRANSCRIBE', 'GRADE_WRITING', 'GRADE_SPEAKING'] as const;
export const ACTIVE_SUBMISSION_STATUSES = ['RECEIVED', 'TRANSCRIBING', 'GRADING'] as const;

export interface QuotaValue {
  limit: number;
  used: number;
  remaining: number;
  resets_at: string | null;
}

export async function getQuota(db: DbOrTx, userId: string): Promise<QuotaValue> {
  if (!config.aiEnabled()) return { limit: 0, used: 0, remaining: 0, resets_at: null };
  const limit = await getSetting<number>(db, 'ai.daily_limit_per_user');
  const [row] = await db
    .select({ used: count(), oldest: sql<Date | null>`min(${submissions.createdAt})` })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), sql`${submissions.createdAt} > now() - interval '24 hours'`, sql`${submissions.status} <> 'FALLBACK_SELF_ASSESSMENT'`));
  const used = Number(row?.used ?? 0);
  const oldest = row?.oldest ? new Date(row.oldest) : null;
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resets_at: oldest ? new Date(oldest.getTime() + 24 * 3600_000).toISOString() : null,
  };
}

const wibTime = (d: Date): string =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace('.', ':');

export async function assertDailyQuota(db: DbOrTx, userId: string): Promise<void> {
  const q = await getQuota(db, userId);
  if (q.used < q.limit) return;
  const resets = q.resets_at ? new Date(q.resets_at) : new Date(Date.now() + 3600_000);
  const wait = Math.max(1, Math.ceil((resets.getTime() - Date.now()) / 1000));
  throw new ApiError('AI_DAILY_LIMIT_REACHED', {
    message: `Batas penilaian AI hari ini (${q.limit}) sudah tercapai. Coba lagi setelah ${wibTime(resets)} WIB.`,
    headers: { 'Retry-After': String(wait) },
  });
}

export async function countQueuedJobs(db: DbOrTx): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(asyncJobs)
    .where(and(eq(asyncJobs.status, 'QUEUED'), inArray(asyncJobs.kind, [...AI_JOB_KINDS])));
  return Number(r?.n ?? 0);
}

export async function assertQueueNotFull(db: DbOrTx): Promise<void> {
  const max = await getSetting<number>(db, 'ai.queue_max');
  if ((await countQueuedJobs(db)) >= max) throw new ApiError('AI_QUEUE_FULL', { headers: { 'Retry-After': '60' } });
}

export async function hasActiveSubmission(db: DbOrTx, userId: string, excludeId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.userId, userId), inArray(submissions.status, [...ACTIVE_SUBMISSION_STATUSES])));
  return rows.some((r) => r.id !== excludeId);
}
