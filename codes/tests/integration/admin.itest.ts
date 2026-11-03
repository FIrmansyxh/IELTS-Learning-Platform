import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appSettings, auditLog, signupInvites, users } from '@/db/schema';
import { updateUserByAdmin, deleteUserByAdmin } from '@/server/admin/users';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { anonymizeDeletedUsers } from '@/worker/purge';
import { GET as usersList, POST as usersCreate } from '@/app/api/v1/admin/users/route';
import { PATCH as userPatch } from '@/app/api/v1/admin/users/[user_id]/route';
import { POST as userReset } from '@/app/api/v1/admin/users/[user_id]/reset-password/route';
import { POST as userDelete } from '@/app/api/v1/admin/users/[user_id]/delete/route';
import { GET as invitesList, POST as invitesCreate } from '@/app/api/v1/admin/invites/route';
import { DELETE as inviteRevoke } from '@/app/api/v1/admin/invites/[invite_id]/route';
import { GET as settingsList } from '@/app/api/v1/admin/settings/route';
import { PUT as settingPut } from '@/app/api/v1/admin/settings/[key]/route';
import { GET as auditGet } from '@/app/api/v1/admin/audit-log/route';
import { GET as healthGet } from '@/app/api/v1/admin/health/route';
import { GET as treeGet } from '@/app/api/v1/curriculum/tree/route';
import { POST as registerPost } from '@/app/api/v1/auth/register/route';
import { GET as meGet } from '@/app/api/v1/auth/me/route';
import { adminSession, call, learnerSession, loginAs, makeUser, uniqueEmail } from './helpers';

const db = getDb();
afterAll(closeDb);
beforeEach(() => resetRateLimits());

const ID = '5e1d7a90-2b3c-4d5e-8f60-718293a4b5c6';

describe('otorisasi admin', () => {
  it('learner -> 403 FORBIDDEN, tanpa sesi -> 401 pada semua endpoint admin', async () => {
    const l = await learnerSession();
    const targets: Array<[Parameters<typeof call>[0], string, string, Record<string, string>?, unknown?]> = [
      [usersList, 'GET', '/api/v1/admin/users'],
      [usersCreate, 'POST', '/api/v1/admin/users', undefined, { email: uniqueEmail(), display_name: 'Xx', role: 'learner' }],
      [userPatch, 'PATCH', `/api/v1/admin/users/${ID}`, { user_id: ID }, { status: 'DISABLED' }],
      [userReset, 'POST', `/api/v1/admin/users/${ID}/reset-password`, { user_id: ID }],
      [userDelete, 'POST', `/api/v1/admin/users/${ID}/delete`, { user_id: ID }],
      [invitesList, 'GET', '/api/v1/admin/invites'],
      [invitesCreate, 'POST', '/api/v1/admin/invites', undefined, {}],
      [inviteRevoke, 'DELETE', `/api/v1/admin/invites/${ID}`, { invite_id: ID }],
      [settingsList, 'GET', '/api/v1/admin/settings'],
      [settingPut, 'PUT', '/api/v1/admin/settings/drill.question_count', { key: 'drill.question_count' }, { value: 10 }],
      [auditGet, 'GET', '/api/v1/admin/audit-log'],
      [healthGet, 'GET', '/api/v1/admin/health'],
    ];
    for (const [h, m, u, params, body] of targets) {
      const forbidden = await call(h, m, u, { cookie: l.cookie, params, body });
      expect(forbidden.status, `${m} ${u}`).toBe(403);
      expect(forbidden.json.error.code).toBe('FORBIDDEN');
      const anon = await call(h, m, u, { params, body });
      expect(anon.status, `${m} ${u}`).toBe(401);
      expect(anon.json.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('user_id bukan uuid -> 400 invalid_uuid pada path user_id', async () => {
    const a = await adminSession();
    const r = await call(userPatch, 'PATCH', '/api/v1/admin/users/xyz', { cookie: a.cookie, params: { user_id: 'xyz' }, body: { status: 'DISABLED' } });
    expect(r.status).toBe(400);
    expect(r.json.error.details[0]).toMatchObject({ path: 'user_id', code: 'invalid_uuid' });
  });
});

describe('undangan', () => {
  it('buat: kode sesuai regex, hanya hash tersimpan, daftar tidak memuat kode, status turunan, cabut', async () => {
    const a = await adminSession();
    const r = await call(invitesCreate, 'POST', '/api/v1/admin/invites', { cookie: a.cookie, body: { expires_in_days: 7 } });
    expect(r.status).toBe(201);
    const { id, code } = r.json.data;
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    const [row] = await db.select().from(signupInvites).where(eq(signupInvites.id, id));
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(code);

    const list = await call(invitesList, 'GET', '/api/v1/admin/invites?status=active', { cookie: a.cookie });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain(code);
    expect(list.json.data.some((i: { id: string }) => i.id === id)).toBe(true);

    // default expires_in_days 7 saat body kosong
    const dflt = await call(invitesCreate, 'POST', '/api/v1/admin/invites', { cookie: a.cookie, body: {} });
    expect(new Date(dflt.json.data.expires_at).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);

    expect((await call(inviteRevoke, 'DELETE', `/api/v1/admin/invites/${id}`, { cookie: a.cookie, params: { invite_id: id } })).status).toBe(204);
    const again = await call(inviteRevoke, 'DELETE', `/api/v1/admin/invites/${id}`, { cookie: a.cookie, params: { invite_id: id } });
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe('INVITE_NOT_ACTIVE');
    const revoked = await call(invitesList, 'GET', '/api/v1/admin/invites?status=revoked', { cookie: a.cookie });
    expect(revoked.json.data.some((i: { id: string }) => i.id === id)).toBe(true);

    await db.execute(sql`UPDATE app_settings SET value = '"invite"'::jsonb WHERE key = 'signup.mode'`);
    const reg = await call(registerPost, 'POST', '/api/v1/auth/register', { body: { email: uniqueEmail(), display_name: 'Budi', password: 'kopi-tubruk-2026!', invite_code: code } });
    expect(reg.json.error.code).toBe('INVITE_INVALID');
  });

  it('kedaluwarsa muncul di filter expired; 404 untuk id tak dikenal', async () => {
    const a = await adminSession();
    const [inv] = await db.insert(signupInvites).values({ codeHash: 'a'.repeat(64), expiresAt: new Date(Date.now() - 1000) }).returning();
    const l = await call(invitesList, 'GET', '/api/v1/admin/invites?status=expired', { cookie: a.cookie });
    expect(l.json.data.some((i: { id: string }) => i.id === inv!.id)).toBe(true);
    expect((await call(inviteRevoke, 'DELETE', `/api/v1/admin/invites/${inv!.id}`, { cookie: a.cookie, params: { invite_id: inv!.id } })).status).toBe(409);
    const nf = await call(inviteRevoke, 'DELETE', `/api/v1/admin/invites/${ID}`, { cookie: a.cookie, params: { invite_id: ID } });
    expect(nf.status).toBe(404);
  });
});

describe('pengguna', () => {
  it('buat pengguna: password sementara 16 karakter, wajib ganti, login lalu endpoint lain 403', async () => {
    const a = await adminSession();
    const email = uniqueEmail('baru');
    const r = await call(usersCreate, 'POST', '/api/v1/admin/users', { cookie: a.cookie, body: { email, display_name: 'Sari Dewi', role: 'learner' } });
    expect(r.status).toBe(201);
    const temp = r.json.data.temporary_password as string;
    expect(temp).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{16}$/);
    expect(r.json.data.user.must_change_password).toBe(true);
    expect(JSON.stringify(r.json.data.user)).not.toContain(temp);
    const s = await loginAs(email, temp);
    expect(s.status).toBe(200);
    const t = await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: s.cookie });
    expect(t.json.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const dup = await call(usersCreate, 'POST', '/api/v1/admin/users', { cookie: a.cookie, body: { email: email.toUpperCase(), display_name: 'Sari Dewi', role: 'learner' } });
    expect(dup.json.error.code).toBe('EMAIL_TAKEN');
    const logs = await db.select().from(auditLog).where(eq(auditLog.action, 'USER_CREATED_BY_ADMIN'));
    expect(JSON.stringify(logs)).not.toContain(temp);
  });

  it('PATCH status DISABLED: sesi pengguna tidak valid, token_version +1; nilai sama tidak menaikkan versi', async () => {
    const a = await adminSession();
    const l = await learnerSession();
    expect((await call(meGet, 'GET', '/api/v1/auth/me', { cookie: l.cookie })).status).toBe(200);
    const r = await call(userPatch, 'PATCH', `/api/v1/admin/users/${l.user.id}`, { cookie: a.cookie, params: { user_id: l.user.id }, body: { status: 'DISABLED' } });
    expect(r.status).toBe(200);
    expect(r.json.data.user.status).toBe('DISABLED');
    expect((await db.select().from(users).where(eq(users.id, l.user.id)))[0]!.tokenVersion).toBe(1);
    expect((await call(meGet, 'GET', '/api/v1/auth/me', { cookie: l.cookie })).status).toBe(401);
    const same = await call(userPatch, 'PATCH', `/api/v1/admin/users/${l.user.id}`, { cookie: a.cookie, params: { user_id: l.user.id }, body: { status: 'DISABLED' } });
    expect(same.status).toBe(200);
    expect((await db.select().from(users).where(eq(users.id, l.user.id)))[0]!.tokenVersion).toBe(1);
    const n = await db.execute(sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'USER_STATUS_CHANGED' AND entity_id = ${l.user.id}`);
    expect((n.rows[0] as { n: number }).n).toBe(1);
  });

  it('PATCH body kosong / field tak dikenal -> 400; id tak ada -> 404', async () => {
    const a = await adminSession();
    const l = await makeUser();
    const e = await call(userPatch, 'PATCH', `/api/v1/admin/users/${l.user.id}`, { cookie: a.cookie, params: { user_id: l.user.id }, body: {} });
    expect(e.json.error.details[0].code).toBe('empty_update');
    const x = await call(userPatch, 'PATCH', `/api/v1/admin/users/${l.user.id}`, { cookie: a.cookie, params: { user_id: l.user.id }, body: { email: 'a@b.test' } });
    expect(x.json.error.details[0].code).toBe('unrecognized_key');
    const nf = await call(userPatch, 'PATCH', `/api/v1/admin/users/${ID}`, { cookie: a.cookie, params: { user_id: ID }, body: { status: 'DISABLED' } });
    expect(nf.status).toBe(404);
  });

  it('CANNOT_MODIFY_SELF untuk patch/reset/hapus diri sendiri', async () => {
    const a = await adminSession();
    for (const [h, m, u, body] of [
      [userPatch, 'PATCH', `/api/v1/admin/users/${a.user.id}`, { role: 'learner' }],
      [userReset, 'POST', `/api/v1/admin/users/${a.user.id}/reset-password`, undefined],
      [userDelete, 'POST', `/api/v1/admin/users/${a.user.id}/delete`, undefined],
    ] as const) {
      const r = await call(h, m, u, { cookie: a.cookie, params: { user_id: a.user.id }, body });
      expect(r.status, u).toBe(409);
      expect(r.json.error.code).toBe('CANNOT_MODIFY_SELF');
    }
  });

  it('LAST_ADMIN: tidak boleh mengosongkan admin aktif; dua admin: A menonaktifkan B lalu A terlindungi', async () => {
    await db.execute(sql`UPDATE users SET status = 'DISABLED' WHERE role = 'admin'`);
    const a = await adminSession();
    const b = await adminSession();
    expect((await call(userPatch, 'PATCH', `/api/v1/admin/users/${b.user.id}`, { cookie: a.cookie, params: { user_id: b.user.id }, body: { status: 'DISABLED' } })).status).toBe(200);
    // Aktor "akun lain" (bukan A) mencoba menurunkan A, admin aktif terakhir.
    await expect(updateUserByAdmin(b.user.id, a.user.id, { role: 'learner' }, '')).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    await expect(deleteUserByAdmin(b.user.id, a.user.id, '')).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('reset password: temp password, penghitung gagal & kunci direset, must_change, audit', async () => {
    const a = await adminSession();
    const l = await makeUser({ failedLoginCount: 4, lockedUntil: new Date(Date.now() + 600_000) });
    const r = await call(userReset, 'POST', `/api/v1/admin/users/${l.user.id}/reset-password`, { cookie: a.cookie, params: { user_id: l.user.id } });
    expect(r.status).toBe(200);
    expect(r.json.data.temporary_password).toHaveLength(16);
    const [row] = await db.select().from(users).where(eq(users.id, l.user.id));
    expect(row).toMatchObject({ failedLoginCount: 0, lockedUntil: null, mustChangePassword: true, tokenVersion: 1 });
    const audit = await db.select().from(auditLog).where(sql`${auditLog.action} = 'USER_PASSWORD_RESET' AND ${auditLog.entityId} = ${l.user.id}`);
    expect(audit).toHaveLength(1);
    expect((await loginAs(l.email, r.json.data.temporary_password)).status).toBe(200);
  });

  it('hapus: hilang dari daftar default, muncul dengan include_deleted, login 401; anonimisasi 31 hari vs 29 hari, idempoten, email bebas', async () => {
    const a = await adminSession();
    const old = await makeUser();
    const recent = await makeUser();
    for (const u of [old, recent]) {
      expect((await call(userDelete, 'POST', `/api/v1/admin/users/${u.user.id}/delete`, { cookie: a.cookie, params: { user_id: u.user.id } })).status).toBe(204);
    }
    const q = encodeURIComponent(old.email);
    expect((await call(usersList, 'GET', `/api/v1/admin/users?q=${q}`, { cookie: a.cookie })).json.data).toHaveLength(0);
    const inc = await call(usersList, 'GET', `/api/v1/admin/users?q=${q}&include_deleted=true`, { cookie: a.cookie });
    expect(inc.json.data[0].deleted_at).not.toBeNull();
    expect((await loginAs(old.email, old.password)).json.error.code).toBe('INVALID_CREDENTIALS');
    // email milik akun terhapus yang belum teranonimisasi masih terpakai
    const taken = await call(usersCreate, 'POST', '/api/v1/admin/users', { cookie: a.cookie, body: { email: old.email, display_name: 'Xx', role: 'learner' } });
    expect(taken.json.error.code).toBe('EMAIL_TAKEN');

    await db.execute(sql`UPDATE users SET deleted_at = now() - interval '31 days' WHERE id = ${old.user.id}::uuid`);
    await db.execute(sql`UPDATE users SET deleted_at = now() - interval '29 days' WHERE id = ${recent.user.id}::uuid`);
    const n1 = await anonymizeDeletedUsers(db);
    expect(n1).toBeGreaterThanOrEqual(1);
    const [o] = await db.select().from(users).where(eq(users.id, old.user.id));
    expect(o).toMatchObject({ email: `deleted-${old.user.id}@invalid`, displayName: 'Pengguna dihapus', passwordHash: '!deleted' });
    const [rc] = await db.select().from(users).where(eq(users.id, recent.user.id));
    expect(rc!.email).toBe(recent.email);
    expect(await anonymizeDeletedUsers(db)).toBe(0);
    const ok = await call(usersCreate, 'POST', '/api/v1/admin/users', { cookie: a.cookie, body: { email: old.email, display_name: 'Xx', role: 'learner' } });
    expect(ok.status).toBe(201);
    expect((await db.select().from(auditLog).where(sql`${auditLog.action} = 'USER_ANONYMIZED' AND ${auditLog.entityId} = ${old.user.id}`))).toHaveLength(1);
  });

  it('pencarian q: % dan _ diperlakukan literal; filter peran/status; paginasi', async () => {
    const a = await adminSession();
    const tag = `zz${Date.now()}`;
    await makeUser({ email: `${tag}.literal%x@example.test` });
    await makeUser({ email: `${tag}.biasa@example.test` });
    const lit = await call(usersList, 'GET', `/api/v1/admin/users?q=${encodeURIComponent(`${tag}.literal%`)}`, { cookie: a.cookie });
    expect(lit.json.data).toHaveLength(1);
    const wild = await call(usersList, 'GET', `/api/v1/admin/users?q=${encodeURIComponent('%')}&page_size=100`, { cookie: a.cookie });
    expect(wild.json.data.every((u: { email: string; display_name: string }) => u.email.includes('%') || u.display_name.includes('%'))).toBe(true);
    const roleF = await call(usersList, 'GET', '/api/v1/admin/users?role=admin&page_size=1', { cookie: a.cookie });
    expect(roleF.json.data.every((u: { role: string }) => u.role === 'admin')).toBe(true);
    expect(roleF.json.meta).toMatchObject({ page: 1, page_size: 1 });
    expect((await call(usersList, 'GET', '/api/v1/admin/users?page_size=101', { cookie: a.cookie })).status).toBe(400);
  });
});

describe('pengaturan', () => {
  it('GET: semua kunci registri muncul dengan default bila tabel kosong; kunci sistem tersembunyi', async () => {
    const a = await adminSession();
    await db.delete(appSettings);
    const r = await call(settingsList, 'GET', '/api/v1/admin/settings', { cookie: a.cookie });
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(21);
    const cd = r.json.data.find((s: { key: string }) => s.key === 'attempt.cooldown_minutes');
    expect(cd).toMatchObject({ value: 60, default: 60, type: 'int', min: 0, max: 1440, updated_at: null });
    expect(r.json.data.some((s: { key: string }) => s.key === 'system.worker_heartbeat_at')).toBe(false);
    // pulihkan seed untuk tes lain
    await db.execute(sql`INSERT INTO app_settings (key, value) VALUES ('signup.mode', '"invite"'::jsonb), ('system.worker_heartbeat_at', 'null'::jsonb) ON CONFLICT DO NOTHING`);
  });

  it('PUT: di luar rentang -> out_of_range; 45 tersimpan dan audit memuat nilai lama (60) dan baru (45)', async () => {
    const a = await adminSession();
    const put = (key: string, value: unknown) => call(settingPut, 'PUT', `/api/v1/admin/settings/${key}`, { cookie: a.cookie, params: { key }, body: { value } });
    const bad = await put('attempt.cooldown_minutes', 2000);
    expect(bad.status).toBe(400);
    expect(bad.json.error.details[0].code).toBe('out_of_range');
    expect((await put('attempt.cooldown_minutes', '45')).json.error.details[0].code).toBe('invalid_type');
    expect((await put('attempt.cooldown_minutes', 4.5)).json.error.details[0].code).toBe('invalid_type');
    expect((await put('signup.mode', 'tutup')).json.error.details[0].code).toBe('invalid_enum');
    await db.delete(appSettings).where(eq(appSettings.key, 'attempt.cooldown_minutes'));
    const ok = await put('attempt.cooldown_minutes', 45);
    expect(ok.status).toBe(200);
    expect(ok.json.data).toMatchObject({ key: 'attempt.cooldown_minutes', value: 45, updated_by: a.user.id });
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'attempt.cooldown_minutes'));
    expect(row!.value).toBe(45);
    const logs = await db.select().from(auditLog).where(sql`${auditLog.action} = 'SETTINGS_CHANGED' AND ${auditLog.entityId} = 'attempt.cooldown_minutes'`);
    expect(logs.at(-1)!.metadata).toMatchObject({ old: 60, new: 45 });
  });

  it('kunci di luar registri dan kunci sistem -> 404; crown.gold harus > silver', async () => {
    const a = await adminSession();
    const put = (key: string, value: unknown) => call(settingPut, 'PUT', `/api/v1/admin/settings/${key}`, { cookie: a.cookie, params: { key }, body: { value } });
    expect((await put('tidak.ada', 1)).status).toBe(404);
    expect((await put('system.worker_heartbeat_at', 1)).status).toBe(404);
    const r = await put('crown.gold_min', 70);
    expect(r.status).toBe(400);
    expect(r.json.error.details[0].code).toBe('gold_not_greater_than_silver');
    expect((await put('crown.gold_min', 95)).status).toBe(200);
    await put('crown.gold_min', 90);
  });
});

describe('audit-log dan health', () => {
  it('filter action + from, urutan id DESC; from > to -> range_invalid; ip_hash_prefix 8 karakter', async () => {
    const a = await adminSession();
    const l = await makeUser();
    await call((await import('@/app/api/v1/auth/login/route')).POST, 'POST', '/api/v1/auth/login', { body: { email: l.email, password: 'salah-salah-0' } });
    const from = new Date(Date.now() - 60_000).toISOString();
    const r = await call(auditGet, 'GET', `/api/v1/admin/audit-log?action=AUTH_LOGIN_FAILED&from=${encodeURIComponent(from)}`, { cookie: a.cookie });
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBeGreaterThan(0);
    expect(r.json.data.every((x: { action: string }) => x.action === 'AUTH_LOGIN_FAILED')).toBe(true);
    const ids = r.json.data.map((x: { id: number }) => x.id);
    expect([...ids].sort((p, q) => q - p)).toEqual(ids);
    expect(r.json.data[0].ip_hash_prefix).toMatch(/^[0-9a-f]{8}$/);
    expect(r.json.data[0].actor_email_masked).toMatch(/^.\*\*\*@/);
    const bad = await call(auditGet, 'GET', `/api/v1/admin/audit-log?from=${encodeURIComponent('2026-11-04T00:00:00.000Z')}&to=${encodeURIComponent('2026-11-03T00:00:00.000Z')}`, { cookie: a.cookie });
    expect(bad.status).toBe(400);
    expect(bad.json.error.details[0].code).toBe('range_invalid');
  });

  it('health: 200 dengan db up; LLM mati -> down, komponen lain tetap dilaporkan, < 5 detik', async () => {
    const a = await adminSession();
    process.env.AI_ENABLED = 'true';
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
    process.env.STT_BASE_URL = 'http://127.0.0.1:1';
    try {
      const t0 = Date.now();
      const r = await call(healthGet, 'GET', '/api/v1/admin/health', { cookie: a.cookie });
      expect(Date.now() - t0).toBeLessThan(5000);
      expect(r.status).toBe(200);
      expect(r.json.data.db.status).toBe('up');
      expect(r.json.data.llm).toMatchObject({ enabled: true, status: 'down' });
      expect(r.json.data.stt.status).toBe('down');
      expect(r.json.data.queue).toMatchObject({ waiting: expect.any(Number), active: expect.any(Number) });
      expect(r.json.data.app.node).toBe(process.versions.node);
    } finally {
      delete process.env.AI_ENABLED;
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.STT_BASE_URL;
    }
    const off = await call(healthGet, 'GET', '/api/v1/admin/health', { cookie: a.cookie });
    expect(off.json.data.llm.status).toBe('disabled');
  });
});
