import { describe, expect, it } from 'vitest';
import { passwordLength, RegisterRequestSchema, UpdateProfileRequestSchema } from '@/contracts/auth';
import { generateInviteCode, hashInviteCode, normalizeInviteCode } from '@/server/auth/invite-code';
import { checkPasswordPolicy, generateTemporaryPassword, hashPassword, verifyPassword } from '@/server/auth/password';
import { loadCommonPasswords } from '@/server/auth/common-passwords';
import { buildClearCookie, buildSetCookie, cookieName, issueSessionToken, parseCookies, readSession } from '@/server/auth/session';
import { maskEmail } from '@/server/audit';
import { checkSettingValue, findSetting, SETTING_DEFS } from '@/server/settings/registry';
import { BUCKETS, consume, resetRateLimits } from '@/server/http/rate-limit';
import { zodDetails } from '@/server/http/zod-errors';

describe('kebijakan password', () => {
  it('panjang dihitung code point setelah NFKC', () => {
    expect(passwordLength('😀'.repeat(10))).toBe(10);
    expect(checkPasswordPolicy('q8Zr!mV3xP', 'a@b.test')).toBeNull();
    expect(checkPasswordPolicy('q8Zr!mV3x', 'a@b.test')).toBe('password_too_short');
    expect(checkPasswordPolicy('x'.repeat(129), 'a@b.test')).toBe('password_too_long');
  });

  it('password umum (huruf besar/kecil tidak dibedakan) dan sama dengan email ditolak', () => {
    expect(checkPasswordPolicy('PasswordPassword', 'a@b.test')).toBe('password_too_common');
    expect(checkPasswordPolicy('1234567890', 'a@b.test')).toBe('password_too_common');
    expect(checkPasswordPolicy('Budi.Santoso@Example.test', 'budi.santoso@example.test')).toBe('password_same_as_email');
    expect(loadCommonPasswords().size).toBeGreaterThanOrEqual(9000);
  });

  it('argon2id dengan parameter spesifikasi; verifikasi memakai NFKC', async () => {
    const h = await hashPassword('kopi-tubruk-2026!');
    expect(h.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await verifyPassword(h, 'kopi-tubruk-2026!')).toBe(true);
    expect(await verifyPassword(h, 'salah')).toBe(false);
    expect(await verifyPassword('bukan-hash', 'x')).toBe(false);
    expect(await verifyPassword(await hashPassword('ｐａｓｓｗｏｒｄ-ｕｎｉｋ-１'), 'password-unik-1')).toBe(true);
  });

  it('password sementara 16 karakter dari alfabet tanpa karakter membingungkan', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generateTemporaryPassword();
      expect(p).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{16}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});

describe('kode undangan', () => {
  it('format 5x4 Crockford, normalisasi, hash sha256 stabil', () => {
    const c = generateInviteCode();
    expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    expect(normalizeInviteCode(c.toLowerCase())).toBe(c.replace(/-/g, ''));
    expect(hashInviteCode(c)).toBe(hashInviteCode(c.toLowerCase().replace(/-/g, '')));
    expect(hashInviteCode(c)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sesi JWT', () => {
  it('terbit, terbaca, dan klaim lengkap; token rusak/ber-salt lain ditolak', async () => {
    const t = await issueSessionToken({ id: '7a1b2c3d-0001-4000-8000-000000000001', role: 'admin', tokenVersion: 3 });
    const cookie = `${cookieName()}=${t.value}`;
    const { claims } = await readSession(cookie);
    expect(claims).toMatchObject({ uid: '7a1b2c3d-0001-4000-8000-000000000001', role: 'admin', tv: 3 });
    expect(claims!.abs_exp - claims!.iat).toBeLessThanOrEqual(43200);
    expect(claims!.abs_exp - claims!.iat).toBeGreaterThanOrEqual(43199);
    expect(t.maxAge).toBeLessThanOrEqual(43200);
    expect((await readSession(`${cookieName()}=${t.value}x`)).claims).toBeNull();
    expect((await readSession(`other=${t.value}`)).present).toBe(false);
  });

  it('atribut cookie: httpOnly, SameSite=Lax, Path=/, Secure hanya di HTTPS', () => {
    expect(buildSetCookie('v', 10)).toMatch(/HttpOnly; SameSite=Lax$/);
    expect(buildSetCookie('v', 10)).toContain('Path=/');
    expect(buildSetCookie('v', 10)).not.toContain('Secure');
    expect(buildClearCookie()).toContain('Max-Age=0');
    process.env.AUTH_URL = 'https://belajar.example.test';
    try {
      expect(cookieName()).toBe('__Secure-authjs.session-token');
      expect(buildSetCookie('v', 10)).toContain('Secure');
    } finally {
      process.env.AUTH_URL = 'http://localhost:3000';
    }
    expect(parseCookies('a=1; b=2=3')).toEqual({ a: '1', b: '2=3' });
  });
});

describe('util', () => {
  it('maskEmail', () => {
    expect(maskEmail('budi@example.test')).toBe('b***@example.test');
    expect(maskEmail('tanpa-at')).toBe('***');
  });

  it('registri pengaturan: 21 kunci, validasi tipe/rentang/enum', () => {
    expect(SETTING_DEFS).toHaveLength(21);
    expect(new Set(SETTING_DEFS.map((d) => d.key)).size).toBe(21);
    const cd = findSetting('attempt.cooldown_minutes')!;
    expect(checkSettingValue(cd, 45)).toEqual({ ok: true, value: 45 });
    expect(checkSettingValue(cd, 2000)).toEqual({ ok: false, code: 'out_of_range' });
    expect(checkSettingValue(cd, '45')).toEqual({ ok: false, code: 'invalid_type' });
    expect(checkSettingValue(cd, 1.5)).toEqual({ ok: false, code: 'invalid_type' });
    expect(checkSettingValue(cd, true)).toEqual({ ok: false, code: 'invalid_type' });
    expect(checkSettingValue(findSetting('signup.mode')!, 'x')).toEqual({ ok: false, code: 'invalid_enum' });
    expect(findSetting('system.worker_heartbeat_at')).toBeUndefined();
  });

  it('token bucket: batas, Retry-After >= 1, pengisian ulang', () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < BUCKETS.login_ip.limit; i++) expect(consume('login_ip', 'k', t0)).toBeNull();
    expect(consume('login_ip', 'k', t0)).toBeGreaterThanOrEqual(1);
    expect(consume('login_ip', 'k', t0 + 13_000)).toBeNull(); // 5/menit = 1 token per 12 dtk
    expect(consume('login_ip', 'lain', t0)).toBeNull(); // kunci berbeda
  });

  it('zodDetails: kode kontrak dan tanpa nilai input', () => {
    const r = RegisterRequestSchema.safeParse({ email: 'x', display_name: ' ', password: 'abc', role: 'admin', rahasia: 'nilai-sensitif' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const d = zodDetails(r.error);
      const codes = d.map((x) => `${x.path}:${x.code}`);
      expect(codes).toContain('email:invalid_email');
      expect(codes).toContain('display_name:display_name_invalid');
      expect(codes).toContain('password:password_too_short');
      expect(codes).toContain('role:unrecognized_key');
      expect(JSON.stringify(d)).not.toContain('nilai-sensitif');
    }
    expect(UpdateProfileRequestSchema.safeParse({ target_band: 8 }).success).toBe(false);
  });
});
