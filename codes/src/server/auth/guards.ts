import { and, eq, isNull } from 'drizzle-orm';
import { users } from '@/db/schema';
import type { UserDTOType } from '@/contracts/common';
import { getDb } from '../db';
import { ApiError } from '../http/errors';
import { buildSetCookie, issueSessionToken, readSession, SESSION_UPDATE_AGE_SEC } from './session';

export interface SessionUser {
  id: string;
  displayName: string;
  targetBand: number | null;
  consentRecordingAt: Date | null;
  keepRecordings: boolean;
  placementCompletedAt: Date | null;
  tokenVersion: number;
}

type UserRow = typeof users.$inferSelect;

export function toSessionUser(r: UserRow): SessionUser {
  return {
    id: r.id,
    displayName: r.displayName,
    targetBand: r.targetBand === null ? null : Number(r.targetBand),
    consentRecordingAt: r.consentRecordingAt,
    keepRecordings: r.keepRecordings,
    placementCompletedAt: r.placementCompletedAt,
    tokenVersion: r.tokenVersion,
  };
}

/** Pemetaan 1:1 ke UserDTO kontrak (tanpa password_hash dan field internal). */
export function toUserDTO(u: SessionUser): UserDTOType {
  return {
    id: u.id,
    display_name: u.displayName,
    target_band: u.targetBand,
    consent_recording_at: u.consentRecordingAt ? u.consentRecordingAt.toISOString() : null,
    keep_recordings: u.keepRecordings,
    placement_completed_at: u.placementCompletedAt ? u.placementCompletedAt.toISOString() : null,
  };
}

/**
 * requireUser() (security-standards 1.4): verifikasi JWT, lalu muat user dari DB pada SETIAP
 * permintaan (status ACTIVE, belum dihapus, token_version sama, batas absolut sesi).
 */
export async function requireUser(
  req: Request,
): Promise<{ user: SessionUser; refreshedCookie?: string }> {
  const { claims } = await readSession(req.headers.get('cookie'));
  const now = Math.floor(Date.now() / 1000);
  if (!claims || claims.abs_exp <= now) throw new ApiError('UNAUTHENTICATED');

  const [row] = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.id, claims.uid), isNull(users.deletedAt)))
    .limit(1);
  if (!row || row.status !== 'ACTIVE' || row.tokenVersion !== claims.tv) throw new ApiError('UNAUTHENTICATED');

  const user = toSessionUser(row);

  // Sesi geser: perbarui cookie bila token lebih tua dari updateAge, tidak melewati batas absolut.
  let refreshedCookie: string | undefined;
  if (now - claims.iat > SESSION_UPDATE_AGE_SEC) {
    const t = await issueSessionToken({ id: user.id, tokenVersion: user.tokenVersion }, { absExp: claims.abs_exp, now });
    refreshedCookie = buildSetCookie(t.value, t.maxAge);
  }
  return { user, refreshedCookie };
}

/** Untuk Server Component/loader: baca user dari header Cookie mentah (null bila tidak valid). */
export async function getUserFromCookieHeader(cookieHeader: string | null): Promise<SessionUser | null> {
  try {
    const r = await requireUser(new Request('http://internal.invalid/', { headers: cookieHeader ? { cookie: cookieHeader } : {} }));
    return r.user;
  } catch {
    return null;
  }
}
