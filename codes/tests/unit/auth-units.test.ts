import { describe, expect, it } from 'vitest';
import { UpdateProfileRequestSchema } from '@/contracts/auth';
import { CreateProfileRequestSchema } from '@/contracts/profiles';
import { buildClearCookie, buildSetCookie, cookieName, issueSessionToken, parseCookies, readSession } from '@/server/auth/session';
import { maskEmail } from '@/server/audit';
import { checkSettingValue, findSetting, SETTING_DEFS } from '@/server/settings/registry';
import { BUCKETS, consume, resetRateLimits } from '@/server/http/rate-limit';
import { zodDetails } from '@/server/http/zod-errors';

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

  it('atribut cookie: httpOnly, SameSite=Strict, Path=/, Secure hanya di HTTPS', () => {
    expect(buildSetCookie('v', 10)).toMatch(/HttpOnly; SameSite=Strict$/);
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

  it('registri pengaturan: 20 kunci, validasi tipe/rentang', () => {
    expect(SETTING_DEFS).toHaveLength(20);
    expect(new Set(SETTING_DEFS.map((d) => d.key)).size).toBe(20);
    const cd = findSetting('attempt.cooldown_minutes')!;
    expect(checkSettingValue(cd, 45)).toEqual({ ok: true, value: 45 });
    expect(checkSettingValue(cd, 2000)).toEqual({ ok: false, code: 'out_of_range' });
    expect(checkSettingValue(cd, '45')).toEqual({ ok: false, code: 'invalid_type' });
    expect(checkSettingValue(cd, 1.5)).toEqual({ ok: false, code: 'invalid_type' });
    expect(checkSettingValue(cd, true)).toEqual({ ok: false, code: 'invalid_type' });
    expect(findSetting('signup.mode')).toBeUndefined();
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
    const r = CreateProfileRequestSchema.safeParse({ display_name: ' ', role: 'admin', rahasia: 'nilai-sensitif' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const d = zodDetails(r.error);
      const codes = d.map((x) => `${x.path}:${x.code}`);
      expect(codes).toContain('display_name:profile_name_invalid');
      expect(codes).toContain('role:unrecognized_key');
      expect(JSON.stringify(d)).not.toContain('nilai-sensitif');
    }
    expect(UpdateProfileRequestSchema.safeParse({ target_band: 8 }).success).toBe(false);
  });
});

describe('isLoopbackHost (SPEC-025 D4)', () => {
  it('menerima localhost, 127.0.0.1, [::1] dengan atau tanpa port', async () => {
    const { isLoopbackHost } = await import('@/server/http/withApi');
    for (const h of ['localhost', 'LOCALHOST', 'localhost:3005', '127.0.0.1', '127.0.0.1:3005', '[::1]', '[::1]:3005']) {
      expect(isLoopbackHost(h), h).toBe(true);
    }
  });
  it('menolak host lain, subdomain mirip, port tidak valid, dan nilai aneh', async () => {
    const { isLoopbackHost } = await import('@/server/http/withApi');
    for (const h of ['evil.example', 'localhost.evil.example', 'evil.example:3005', '127.0.0.1.evil.example', 'localhost:', 'localhost:abc', 'localhost:123456', '[::2]', '', '0.0.0.0', '192.168.1.5:3005', 'localhost@evil.example', 'localhost:3005@evil.example']) {
      expect(isLoopbackHost(h), h).toBe(false);
    }
  });
});
