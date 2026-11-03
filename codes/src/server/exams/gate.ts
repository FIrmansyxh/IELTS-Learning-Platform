/**
 * Cooldown (D3) dan batas harian (D4) SPEC-008, dipakai bersama Skip dan (SPEC-014) Boss.
 * Waktu selalu berasal dari jam server yang diberikan pemanggil (bukan now() DB) agar dapat diuji.
 */
import { and, asc, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import { attempts } from '@/db/schema';
import type { DbOrTx } from '../db';
import { getSetting } from '../settings/service';

export const DAY_MS = 24 * 3600 * 1000;

export interface AttemptGate {
  cooldownMinutes: number;
  maxPerDay: number;
  /** submitted_at + cooldown bila masih aktif, selain itu null. */
  cooldownUntil: Date | null;
  attemptsInWindow: number;
  dailyBlocked: boolean;
  /** Saat percobaan baru kembali diizinkan bila batas harian tercapai. */
  dailyRetryAt: Date | null;
}

export async function loadAttemptGate(db: DbOrTx, userId: string, setId: string, now: Date): Promise<AttemptGate> {
  const cooldownMinutes = await getSetting<number>(db, 'attempt.cooldown_minutes');
  const maxPerDay = await getSetting<number>(db, 'attempt.max_per_set_per_day');

  const [last] = await db
    .select({ submittedAt: attempts.submittedAt })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.assessmentSetId, setId), inArray(attempts.status, ['GRADED', 'EXPIRED', 'SUBMITTED'])))
    .orderBy(desc(attempts.submittedAt))
    .limit(1);
  let cooldownUntil: Date | null = null;
  if (last?.submittedAt && cooldownMinutes > 0) {
    const until = new Date(last.submittedAt.getTime() + cooldownMinutes * 60_000);
    if (until.getTime() > now.getTime()) cooldownUntil = until;
  }

  const window = await db
    .select({ startedAt: attempts.startedAt })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.assessmentSetId, setId),
        ne(attempts.status, 'ABANDONED'),
        gt(attempts.startedAt, new Date(now.getTime() - DAY_MS)),
      ),
    )
    .orderBy(asc(attempts.startedAt));
  const attemptsInWindow = window.length;
  const dailyBlocked = attemptsInWindow >= maxPerDay;
  // Percobaan tertua yang harus keluar dari jendela agar hitungan turun di bawah batas.
  const leaving = dailyBlocked ? window[attemptsInWindow - maxPerDay] : undefined;
  const dailyRetryAt = dailyBlocked ? new Date((leaving?.startedAt.getTime() ?? now.getTime()) + DAY_MS) : null;
  return { cooldownMinutes, maxPerDay, cooldownUntil, attemptsInWindow, dailyBlocked, dailyRetryAt };
}

/** Detik (dibulatkan ke atas, minimal 1) sampai `until`. */
export const secondsUntil = (until: Date, now: Date): number => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));

/** Hitung percobaan dalam 24 jam terakhir relatif terhadap `anchor` (dipakai untuk `attempts_remaining_today`). */
export async function countAttemptsInWindow(db: DbOrTx, userId: string, setId: string, anchor: Date): Promise<number> {
  const rows = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.assessmentSetId, setId),
        ne(attempts.status, 'ABANDONED'),
        gt(attempts.startedAt, new Date(anchor.getTime() - DAY_MS)),
      ),
    );
  return rows.length;
}
