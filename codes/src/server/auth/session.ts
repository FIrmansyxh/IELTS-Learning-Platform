import { createHmac } from 'node:crypto';
import { decode, encode } from 'next-auth/jwt';
import { config } from '../config';

/** Sesi = JWT Auth.js (JWE) di cookie `authjs.session-token` (SPEC-001). Klaim: uid, role, tv, abs_exp. */
export const SESSION_MAX_AGE_SEC = 604_800; // 7 hari
export const SESSION_UPDATE_AGE_SEC = 3_600;
export const ABS_TTL_LEARNER_SEC = 2_592_000; // 30 hari

export interface SessionClaims {
  uid: string;
  role: 'learner' | 'admin';
  tv: number;
  abs_exp: number;
  iat: number;
}

export function cookieName(): string {
  return config.secureCookie() ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

const nowSec = () => Math.floor(Date.now() / 1000);

export async function issueSessionToken(
  user: { id: string; tokenVersion: number },
  opts: { absExp?: number; now?: number } = {},
): Promise<{ value: string; maxAge: number }> {
  const now = opts.now ?? nowSec();
  const absExp = opts.absExp ?? now + ABS_TTL_LEARNER_SEC;
  const maxAge = Math.max(1, Math.min(SESSION_MAX_AGE_SEC, absExp - now));
  const name = cookieName();
  const value = await encode({
    token: { sub: user.id, uid: user.id, role: 'learner', tv: user.tokenVersion, abs_exp: absExp, iat: now },
    secret: config.authSecret(),
    salt: name,
    maxAge,
  });
  return { value, maxAge };
}

export function buildSetCookie(value: string, maxAge: number): string {
  const parts = [`${cookieName()}=${value}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Strict'];
  if (config.secureCookie()) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookie(): string {
  const parts = [`${cookieName()}=`, 'Path=/', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'HttpOnly', 'SameSite=Strict'];
  if (config.secureCookie()) parts.push('Secure');
  return parts.join('; ');
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

/** Baca & verifikasi cookie sesi. null bila tidak ada/rusak/kedaluwarsa. `present` = cookie sesi ada (untuk penghapusan). */
export async function readSession(cookieHeader: string | null): Promise<{ claims: SessionClaims | null; present: boolean }> {
  const raw = parseCookies(cookieHeader)[cookieName()];
  if (!raw) return { claims: null, present: false };
  try {
    const t = await decode({ token: raw, secret: config.authSecret(), salt: cookieName() });
    if (
      !t ||
      typeof t.uid !== 'string' ||
      (t.role !== 'learner' && t.role !== 'admin') ||
      typeof t.tv !== 'number' ||
      typeof t.abs_exp !== 'number' ||
      typeof t.iat !== 'number'
    ) {
      return { claims: null, present: true };
    }
    return { claims: { uid: t.uid, role: t.role, tv: t.tv, abs_exp: t.abs_exp, iat: t.iat }, present: true };
  } catch {
    return { claims: null, present: true };
  }
}

/** HMAC-SHA256 hex dari IP (disimpan sebagai ip_hash; IP mentah tidak pernah disimpan). */
export function hashIp(ip: string): string {
  return createHmac('sha256', config.ipHmacSecret()).update(ip).digest('hex');
}
