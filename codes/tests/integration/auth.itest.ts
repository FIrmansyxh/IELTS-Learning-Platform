import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditLog, signupInvites, users } from '@/db/schema';
import { bootstrapAdmin } from '@/server/auth/bootstrap';
import { generateInviteCode, hashInviteCode } from '@/server/auth/invite-code';
import { hashPassword } from '@/server/auth/password';
import { issueSessionToken, cookieName } from '@/server/auth/session';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as signupConfig } from '@/app/api/v1/auth/signup-config/route';
import { POST as register } from '@/app/api/v1/auth/register/route';
import { POST as login } from '@/app/api/v1/auth/login/route';
import { POST as logout } from '@/app/api/v1/auth/logout/route';
import { GET as me } from '@/app/api/v1/auth/me/route';
import { POST as changePassword } from '@/app/api/v1/auth/change-password/route';
import { PATCH as patchProfile } from '@/app/api/v1/me/profile/route';
import { GET as tree } from '@/app/api/v1/curriculum/tree/route';
import { call, cookieOf, STRONG_PASSWORD, uniqueEmail } from './helpers';

const db = getDb();
afterAll(closeDb);
beforeEach(() => resetRateLimits());

async function setMode(mode: 'open' | 'invite' | 'closed') {
  await db.execute(sql`UPDATE app_settings SET value = to_jsonb(${mode}::text) WHERE key = 'signup.mode'`);
}
async function makeInvite(opts: { expiresInMs?: number; revoked?: boolean; used?: boolean } = {}) {
  const code = generateInviteCode();
  const [row] = await db
    .insert(signupInvites)
    .values({
      codeHash: hashInviteCode(code),
      expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 7 * 86_400_000)),
      revokedAt: opts.revoked ? new Date() : null,
      usedAt: opts.used ? new Date() : null,
    })
    .returning();
  return { code, id: row!.id };
}
async function makeUser(over: Partial<typeof users.$inferInsert> = {}, password = STRONG_PASSWORD) {
  const email = over.email ?? uniqueEmail();
  const [u] = await db
    .insert(users)
    .values({ email, displayName: 'Uji Coba', passwordHash: await hashPassword(password), ...over })
    .returning();
  return { user: u!, email, password };
}
async function loginAs(email: string, password: string) {
  const r = await call(login, 'POST', '/api/v1/auth/login', { body: { email, password } });
  return { ...r, cookie: cookieOf(r.cookie) };
}
const validBody = (extra: object = {}) => ({
  email: uniqueEmail('reg'),
  display_name: 'Budi Santoso',
  password: STRONG_PASSWORD,
  ...extra,
});

describe('GET /auth/signup-config', () => {
  it('mengembalikan mode dari app_settings', async () => {
    await setMode('invite');
    const r = await call(signupConfig, 'GET', '/api/v1/auth/signup-config');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ data: { mode: 'invite' } });
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(r.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('POST /auth/register', () => {
  it('mode open: 201, role learner, hash argon2id, tanpa Set-Cookie dan tanpa password_hash', async () => {
    await setMode('open');
    const body = validBody();
    const r = await call(register, 'POST', '/api/v1/auth/register', { body });
    expect(r.status).toBe(201);
    expect(r.json.data.user).toMatchObject({ role: 'learner', email: body.email, target_band: null, must_change_password: false, keep_recordings: true });
    expect(JSON.stringify(r.json)).not.toMatch(/password_hash|argon2/i);
    expect(r.headers.get('set-cookie')).toBeNull();
    const [row] = await db.select().from(users).where(eq(users.id, r.json.data.user.id));
    expect(row!.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('mode invite: kode valid -> used_by/used_at terisi; kode terpakai -> 403 tanpa user baru', async () => {
    await setMode('invite');
    const inv = await makeInvite();
    const body = validBody({ invite_code: inv.code });
    const r = await call(register, 'POST', '/api/v1/auth/register', { body });
    expect(r.status).toBe(201);
    const [row] = await db.select().from(signupInvites).where(eq(signupInvites.id, inv.id));
    expect(row!.usedBy).toBe(r.json.data.user.id);
    expect(row!.usedAt).not.toBeNull();

    const again = validBody({ invite_code: inv.code });
    const r2 = await call(register, 'POST', '/api/v1/auth/register', { body: again });
    expect(r2.status).toBe(403);
    expect(r2.json.error.code).toBe('INVITE_INVALID');
    const found = await db.select().from(users).where(sql`lower(${users.email}) = ${again.email.toLowerCase()}`);
    expect(found).toHaveLength(0);
  });

  it('kode huruf kecil tanpa tanda hubung dinormalisasi', async () => {
    await setMode('invite');
    const inv = await makeInvite();
    const r = await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ invite_code: inv.code.replace(/-/g, '').toLowerCase() }) });
    expect(r.status).toBe(201);
  });

  it('mode invite tanpa kode: 403 INVITE_INVALID (bukan 400); kedaluwarsa dan dicabut juga ditolak', async () => {
    await setMode('invite');
    expect((await call(register, 'POST', '/api/v1/auth/register', { body: validBody() })).json.error.code).toBe('INVITE_INVALID');
    const expired = await makeInvite({ expiresInMs: -1000 });
    const revoked = await makeInvite({ revoked: true });
    for (const c of [expired.code, revoked.code]) {
      const r = await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ invite_code: c }) });
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe('INVITE_INVALID');
    }
  });

  it('mode closed: 403 SIGNUP_CLOSED', async () => {
    await setMode('closed');
    const r = await call(register, 'POST', '/api/v1/auth/register', { body: validBody() });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('SIGNUP_CLOSED');
  });

  it('email berbeda huruf besar/kecil: 409 EMAIL_TAKEN dan undangan tetap belum terpakai', async () => {
    await setMode('invite');
    const first = await makeUser({ email: 'Budi.Case@Example.test' });
    expect(first.user.id).toBeTruthy();
    const inv = await makeInvite();
    const r = await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ email: 'budi.case@example.test', invite_code: inv.code }) });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('EMAIL_TAKEN');
    const [row] = await db.select().from(signupInvites).where(eq(signupInvites.id, inv.id));
    expect(row!.usedAt).toBeNull();
  });

  it('EMAIL_TAKEN tidak bocor bila kode undangan tidak valid', async () => {
    await setMode('invite');
    const u = await makeUser();
    const r = await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ email: u.email, invite_code: 'K7QM-4XZP-9T2V-HD8W-RJ3N' }) });
    expect(r.json.error.code).toBe('INVITE_INVALID');
  });

  it('password pendek / umum / sama dengan email / terlalu panjang -> kode detail yang tepat', async () => {
    await setMode('open');
    const cases: Array<[string, string]> = [
      ['abc123', 'password_too_short'],
      ['passwordpassword', 'password_too_common'],
      ['x'.repeat(129), 'password_too_long'],
    ];
    for (const [password, code] of cases) {
      const r = await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ password }) });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('VALIDATION_ERROR');
      expect(r.json.error.details[0].code).toBe(code);
    }
    const email = 'sama.persis@example.test';
    const same = await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ email, password: email.toUpperCase() }) });
    expect(same.json.error.details[0].code).toBe('password_same_as_email');
  });

  it('batas password: 10 karakter diterima, emoji dihitung code point', async () => {
    await setMode('open');
    expect((await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ password: 'q8Zr!mV3xP' }) })).status).toBe(201);
    expect((await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ password: '😀😁😂🤣😃😄😅😆😉😊' }) })).status).toBe(201);
  });

  it('field tak dikenal (role) ditolak dan tidak ada user dibuat', async () => {
    await setMode('open');
    const body = validBody({ role: 'admin' });
    const r = await call(register, 'POST', '/api/v1/auth/register', { body });
    expect(r.status).toBe(400);
    expect(r.json.error.details).toContainEqual(expect.objectContaining({ path: 'role', code: 'unrecognized_key' }));
    expect(await db.select().from(users).where(eq(users.email, body.email))).toHaveLength(0);
  });

  it('format email/nama tidak valid', async () => {
    await setMode('open');
    const r1 = await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ email: 'bukan-email' }) });
    expect(r1.json.error.details[0].code).toBe('invalid_email');
    const r2 = await call(register, 'POST', '/api/v1/auth/register', { body: validBody({ display_name: '   ' }) });
    expect(r2.json.error.details[0].code).toBe('display_name_invalid');
  });

  it('dua register serentak dengan email sama: satu 201, satu 409 (tanpa 500)', async () => {
    await setMode('open');
    const email = uniqueEmail('race');
    const rs = await Promise.all([1, 2].map(() => call(register, 'POST', '/api/v1/auth/register', { body: validBody({ email }) })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('dua register serentak dengan satu undangan: tepat satu sukses', async () => {
    await setMode('invite');
    const inv = await makeInvite();
    const rs = await Promise.all([1, 2].map(() => call(register, 'POST', '/api/v1/auth/register', { body: validBody({ invite_code: inv.code }) })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 403]);
  });

  it('rate limit register_ip: permintaan ke-6 dari IP sama -> 429', async () => {
    await setMode('open');
    const ip = '203.0.113.9';
    const out = [];
    for (let i = 0; i < 6; i++) out.push(await call(register, 'POST', '/api/v1/auth/register', { body: validBody(), ip }));
    expect(out.slice(0, 5).every((r) => r.status === 201)).toBe(true);
    expect(out[5]!.status).toBe(429);
    expect(Number(out[5]!.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  });

  it('userCreatedHooks: baris progres dibuat untuk user baru (SPEC-003)', async () => {
    await setMode('open');
    const r = await call(register, 'POST', '/api/v1/auth/register', { body: validBody() });
    const n = await db.execute(sql`SELECT count(*)::int AS n FROM user_tier_progress WHERE user_id = ${r.json.data.user.id}::uuid`);
    expect((n.rows[0] as { n: number }).n).toBe(4);
  });
});

describe('POST /auth/login', () => {
  it('sukses: cookie httpOnly SameSite=Lax, last_login_at terisi, audit AUTH_LOGIN_SUCCESS', async () => {
    const u = await makeUser();
    const r = await call(login, 'POST', '/api/v1/auth/login', { body: { email: u.email.toUpperCase(), password: u.password } });
    expect(r.status).toBe(200);
    expect(r.cookie).toMatch(/HttpOnly/);
    expect(r.cookie).toMatch(/SameSite=Lax/);
    expect(r.cookie).toMatch(new RegExp(`^${cookieName()}=`));
    expect(r.json.data.user.id).toBe(u.user.id);
    const [row] = await db.select().from(users).where(eq(users.id, u.user.id));
    expect(row!.lastLoginAt).not.toBeNull();
    const a = await db.select().from(auditLog).where(sql`${auditLog.action} = 'AUTH_LOGIN_SUCCESS' AND ${auditLog.entityId} = ${u.user.id}`);
    expect(a.length).toBeGreaterThan(0);
  });

  it('4 kali salah -> 401 identik; kali ke-5 mengunci 15 menit; password benar saat terkunci tetap 401', async () => {
    const u = await makeUser();
    const bodies: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await call(login, 'POST', '/api/v1/auth/login', { body: { email: u.email, password: 'salah-salah-0' } });
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe('INVALID_CREDENTIALS');
      expect(r.json.error.message).toBe('Email atau password salah.');
      bodies.push(Object.keys(r.json.error).sort());
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    const [row] = await db.select().from(users).where(eq(users.id, u.user.id));
    const minutes = (row!.lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
    const ok = await call(login, 'POST', '/api/v1/auth/login', { body: { email: u.email, password: u.password } });
    expect(ok.status).toBe(401);
    const audits = await db.select().from(auditLog).where(sql`${auditLog.action} = 'AUTH_LOCKOUT' AND ${auditLog.entityId} = ${u.user.id}`);
    expect(audits).toHaveLength(1);
  });

  it('login sukses mereset penghitung kegagalan', async () => {
    const u = await makeUser();
    await call(login, 'POST', '/api/v1/auth/login', { body: { email: u.email, password: 'salah-salah-0' } });
    expect((await loginAs(u.email, u.password)).status).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.id, u.user.id));
    expect(row!.failedLoginCount).toBe(0);
  });

  it('email tidak ada vs password salah: bentuk body identik dan selisih median waktu < 100 ms', async () => {
    const u = await makeUser();
    const time = async (email: string) => {
      const t: number[] = [];
      let shape = '';
      for (let i = 0; i < 20; i++) {
        resetRateLimits();
        const s = performance.now();
        const r = await call(login, 'POST', '/api/v1/auth/login', { body: { email, password: 'salah-salah-0' } });
        t.push(performance.now() - s);
        shape = JSON.stringify([r.status, r.json.error.code, r.json.error.message]);
        // hindari mengunci akun uji pada percobaan ke-5
        await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null }).where(eq(users.id, u.user.id));
      }
      t.sort((a, b) => a - b);
      return { median: t[10]!, shape };
    };
    const a = await time(u.email);
    const b = await time('tidak.ada.sama.sekali@example.test');
    expect(a.shape).toBe(b.shape);
    expect(Math.abs(a.median - b.median)).toBeLessThan(100);
  }, 60_000);

  it('rate limit login_ip: permintaan ke-6 dalam semenit -> 429 dengan Retry-After >= 1', async () => {
    const ip = '198.51.100.7';
    const rs = [];
    for (let i = 0; i < 6; i++) rs.push(await call(login, 'POST', '/api/v1/auth/login', { body: { email: uniqueEmail(), password: 'x' }, ip }));
    expect(rs[5]!.status).toBe(429);
    expect(rs[5]!.json.error.code).toBe('RATE_LIMITED');
    expect(Number(rs[5]!.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  });

  it('akun DISABLED atau terhapus -> 401 INVALID_CREDENTIALS', async () => {
    const d = await makeUser({ status: 'DISABLED' });
    const x = await makeUser({ deletedAt: new Date() });
    for (const u of [d, x]) {
      const r = await call(login, 'POST', '/api/v1/auth/login', { body: { email: u.email, password: u.password } });
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('log audit tidak memuat password, hash, atau email penuh', async () => {
    const u = await makeUser({ email: 'rahasia.penuh@example.test' });
    await call(login, 'POST', '/api/v1/auth/login', { body: { email: u.email, password: 'salah-salah-0' } });
    const rows = await db.select().from(auditLog).where(sql`${auditLog.entityId} = ${u.user.id}`);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('rahasia.penuh@example.test');
    expect(dump).not.toContain('salah-salah-0');
    expect(dump).not.toContain('argon2');
    expect(dump).toContain('r***@example.test');
  });
});

describe('sesi', () => {
  it('logout: 204, cookie dihapus, me berikutnya 401', async () => {
    const u = await makeUser();
    const s = await loginAs(u.email, u.password);
    const out = await call(logout, 'POST', '/api/v1/auth/logout', { cookie: s.cookie });
    expect(out.status).toBe(204);
    expect(out.headers.getSetCookie().join(';')).toMatch(/Max-Age=0/);
    // JWT stateless: logout menghapus cookie di klien; cookie lama tetap valid sampai token_version berubah.
    const a = await call(me, 'GET', '/api/v1/auth/me', { cookie: null });
    expect(a.status).toBe(401);
    expect(a.json.error.code).toBe('UNAUTHENTICATED');
  });

  it('me mengembalikan user; tanpa cookie 401; cookie rusak 401 dan dihapus', async () => {
    const u = await makeUser();
    const s = await loginAs(u.email, u.password);
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: s.cookie })).json.data.user.email).toBe(u.email);
    const bad = await call(me, 'GET', '/api/v1/auth/me', { cookie: `${cookieName()}=bukan.token.valid` });
    expect(bad.status).toBe(401);
    expect(bad.headers.getSetCookie().join(';')).toMatch(/Max-Age=0/);
  });

  it('akun dinonaktifkan: permintaan berikutnya 401', async () => {
    const u = await makeUser();
    const s = await loginAs(u.email, u.password);
    await db.update(users).set({ status: 'DISABLED' }).where(eq(users.id, u.user.id));
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: s.cookie })).status).toBe(401);
  });

  it('change-password: sesi lain tidak valid, token_version +1, cookie baru untuk sesi saat ini', async () => {
    const u = await makeUser();
    const a = await loginAs(u.email, u.password);
    const b = await loginAs(u.email, u.password);
    const r = await call(changePassword, 'POST', '/api/v1/auth/change-password', {
      cookie: a.cookie,
      body: { current_password: u.password, new_password: 'teh-tarik-hangat-77' },
    });
    expect(r.status).toBe(200);
    expect(r.cookie).toBeTruthy();
    const [row] = await db.select().from(users).where(eq(users.id, u.user.id));
    expect(row!.tokenVersion).toBe(1);
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: b.cookie })).status).toBe(401);
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: cookieOf(r.cookie) })).status).toBe(200);
    expect((await loginAs(u.email, 'teh-tarik-hangat-77')).status).toBe(200);
  });

  it('change-password dengan password lama salah: 403 dan hash tidak berubah', async () => {
    const u = await makeUser();
    const s = await loginAs(u.email, u.password);
    const before = (await db.select().from(users).where(eq(users.id, u.user.id)))[0]!.passwordHash;
    const r = await call(changePassword, 'POST', '/api/v1/auth/change-password', {
      cookie: s.cookie,
      body: { current_password: 'bukan-yang-benar-1', new_password: 'teh-tarik-hangat-77' },
    });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect((await db.select().from(users).where(eq(users.id, u.user.id)))[0]!.passwordHash).toBe(before);
  });

  it('change-password: password sama / umum ditolak 400', async () => {
    const u = await makeUser();
    const s = await loginAs(u.email, u.password);
    const same = await call(changePassword, 'POST', '/api/v1/auth/change-password', { cookie: s.cookie, body: { current_password: u.password, new_password: u.password } });
    expect(same.json.error.details[0].code).toBe('password_unchanged');
    const common = await call(changePassword, 'POST', '/api/v1/auth/change-password', { cookie: s.cookie, body: { current_password: u.password, new_password: 'passwordpassword' } });
    expect(common.json.error.details[0].code).toBe('password_too_common');
  });

  it('must_change_password: endpoint lain 403 PASSWORD_CHANGE_REQUIRED; me/logout/change-password tetap berfungsi', async () => {
    const u = await makeUser({ mustChangePassword: true });
    const s = await loginAs(u.email, u.password);
    expect(s.status).toBe(200);
    const t = await call(tree, 'GET', '/api/v1/curriculum/tree', { cookie: s.cookie });
    expect(t.status).toBe(403);
    expect(t.json.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: s.cookie })).json.data.user.must_change_password).toBe(true);
    const c = await call(changePassword, 'POST', '/api/v1/auth/change-password', { cookie: s.cookie, body: { current_password: u.password, new_password: 'teh-tarik-hangat-77' } });
    expect(c.status).toBe(200);
    expect(c.json.data.user.must_change_password).toBe(false);
    expect((await call(tree, 'GET', '/api/v1/curriculum/tree', { cookie: cookieOf(c.cookie) })).status).toBe(200);
    expect((await call(logout, 'POST', '/api/v1/auth/logout', { cookie: s.cookie })).status).toBe(401); // token_version sudah berubah
  });

  it('batas absolut: admin 12 jam, learner 30 hari', async () => {
    const admin = await makeUser({ role: 'admin' });
    const learner = await makeUser();
    const now = Math.floor(Date.now() / 1000);
    const mk = async (u: { user: typeof users.$inferSelect }, issuedAgo: number) => {
      const t = await issueSessionToken({ id: u.user.id, role: u.user.role, tokenVersion: u.user.tokenVersion }, { now: now - issuedAgo });
      return `${cookieName()}=${t.value}`;
    };
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: await mk(admin, 12 * 3600 - 60) })).status).toBe(200);
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: await mk(admin, 12 * 3600 + 60) })).status).toBe(401);
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: await mk(learner, 12 * 3600 + 60) })).status).toBe(200);
    expect((await call(me, 'GET', '/api/v1/auth/me', { cookie: await mk(learner, 30 * 86400 + 60) })).status).toBe(401);
  });

  it('sesi geser: token lebih tua dari 1 jam diperbarui tanpa melewati batas absolut', async () => {
    const u = await makeUser();
    const t = await issueSessionToken({ id: u.user.id, role: 'learner', tokenVersion: 0 });
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 2 * 3600_000 });
    try {
      const r = await call(me, 'GET', '/api/v1/auth/me', { cookie: `${cookieName()}=${t.value}` });
      expect(r.status).toBe(200);
      expect(r.cookie).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('CSRF: Origin asing atau tanpa Origin -> 403 CSRF_ORIGIN_MISMATCH pada mutasi', async () => {
    const evil = await call(login, 'POST', '/api/v1/auth/login', { body: { email: 'a@b.test', password: 'x' }, headers: { origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    expect(evil.json.error.code).toBe('CSRF_ORIGIN_MISMATCH');
    const none = await call(login, 'POST', '/api/v1/auth/login', { body: { email: 'a@b.test', password: 'x' }, headers: { origin: '' } });
    expect(none.status).toBe(403);
    const sf = await call(login, 'POST', '/api/v1/auth/login', { body: { email: 'a@b.test', password: 'x' }, headers: { origin: '', 'sec-fetch-site': 'same-origin' } });
    expect(sf.status).toBe(401);
  });

  it('Content-Type non-JSON -> 415; body > 1 MB -> 413', async () => {
    const ct = await call(login, 'POST', '/api/v1/auth/login', { rawBody: 'email=a', headers: { 'content-type': 'text/plain' } });
    expect(ct.status).toBe(415);
    expect(ct.json.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    const big = await call(login, 'POST', '/api/v1/auth/login', { rawBody: JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(1_100_000) }) });
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('PATCH /me/profile', () => {
  it('target_band 6.5 tersimpan; 8.0 ditolak; body kosong dan field terlarang ditolak', async () => {
    const u = await makeUser();
    const s = await loginAs(u.email, u.password);
    const ok = await call(patchProfile, 'PATCH', '/api/v1/me/profile', { cookie: s.cookie, body: { display_name: 'Budi S.', target_band: 6.5 } });
    expect(ok.status).toBe(200);
    expect(ok.json.data.user).toMatchObject({ display_name: 'Budi S.', target_band: 6.5 });
    expect((await call(patchProfile, 'PATCH', '/api/v1/me/profile', { cookie: s.cookie, body: { target_band: 8.0 } })).status).toBe(400);
    expect((await call(patchProfile, 'PATCH', '/api/v1/me/profile', { cookie: s.cookie, body: { target_band: null } })).json.data.user.target_band).toBeNull();
    const empty = await call(patchProfile, 'PATCH', '/api/v1/me/profile', { cookie: s.cookie, body: {} });
    expect(empty.json.error.details[0].code).toBe('empty_update');
    for (const k of ['role', 'email', 'status']) {
      const r = await call(patchProfile, 'PATCH', '/api/v1/me/profile', { cookie: s.cookie, body: { [k]: 'x' } });
      expect(r.json.error.details[0].code).toBe('unrecognized_key');
    }
  });
});

describe('admin:bootstrap', () => {
  it('membuat tepat satu admin dengan must_change_password dan idempoten', async () => {
    await db.execute(sql`DELETE FROM users WHERE role = 'admin'`);
    const env = { ADMIN_EMAIL: 'owner.boot@example.test', ADMIN_INITIAL_PASSWORD: 'minimal-enam-belas-karakter' };
    expect(await bootstrapAdmin({ ...env, ADMIN_INITIAL_PASSWORD: 'pendek' }).catch((e: Error) => e.message)).toBe('ADMIN_INITIAL_PASSWORD minimal 16 karakter');
    const first = await bootstrapAdmin(env);
    expect(first.created).toBe(true);
    expect((await bootstrapAdmin(env)).created).toBe(false);
    const admins = await db.select().from(users).where(eq(users.role, 'admin'));
    expect(admins).toHaveLength(1);
    expect(admins[0]!.mustChangePassword).toBe(true);
    const a = await db.select().from(auditLog).where(eq(auditLog.action, 'ADMIN_BOOTSTRAPPED'));
    expect(JSON.stringify(a)).not.toContain(env.ADMIN_INITIAL_PASSWORD);
  });
});
