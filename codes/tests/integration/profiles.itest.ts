import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ProfileListResponseSchema } from '@/contracts/profiles';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as listGet, POST as createPost } from '@/app/api/v1/profiles/route';
import { POST as selectPost } from '@/app/api/v1/profiles/[profile_id]/select/route';
import { DELETE as profileDelete } from '@/app/api/v1/profiles/[profile_id]/route';
import { POST as leavePost } from '@/app/api/v1/profiles/leave/route';
import { GET as meGet } from '@/app/api/v1/auth/me/route';
import { PATCH as profilePatch } from '@/app/api/v1/me/profile/route';
import { call, cookieOf } from './helpers';

const db = getDb();
/* eslint-disable @typescript-eslint/no-explicit-any */
afterAll(async () => {
  await wipeUsers();
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await wipeUsers(); // mulai dari nol: batas profil menghitung semua profil aktif
});

/** Hapus semua profil; batch impor lama menahan hapus lewat FK RESTRICT sehingga dibersihkan dulu. */
async function wipeUsers() {
  await db.execute(sql`DELETE FROM import_batches`);
  await db.execute(sql`DELETE FROM users`);
}

const create = (display_name: string) => call(createPost, 'POST', '/api/v1/profiles', { body: { display_name } });
const select = (id: string) => call(selectPost, 'POST', `/api/v1/profiles/${id}/select`, { params: { profile_id: id } });
const me = (cookie: string | null) => call(meGet, 'GET', '/api/v1/auth/me', { cookie });
const remove = (id: string, confirm_name: string, cookie?: string | null) =>
  call(profileDelete, 'DELETE', `/api/v1/profiles/${id}`, { params: { profile_id: id }, body: { confirm_name }, cookie });

describe('profil lokal (SPEC-025)', () => {
  it('tanpa profil/cookie: daftar kosong sesuai kontrak dan /auth/me 401', async () => {
    const r = await call(listGet, 'GET', '/api/v1/profiles');
    expect(r.status).toBe(200);
    expect(ProfileListResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ profiles: [], max_profiles: 10 });
    expect((await me(null)).status).toBe(401);
  });

  it('buat profil: 201, cookie sesi SameSite=Strict yang langsung berlaku, tanpa password/hash di respons', async () => {
    const r = await create('Rina Putri');
    expect(r.status).toBe(201);
    expect(r.json.data.user).toMatchObject({ display_name: 'Rina Putri', role: 'learner', must_change_password: false });
    expect(JSON.stringify(r.json)).not.toMatch(/password_hash|\$argon2/);
    expect(r.headers.getSetCookie().join(';')).toMatch(/SameSite=Strict/i);
    const cookie = cookieOf(r.cookie);
    expect(cookie).toBeTruthy();
    const m = await me(cookie);
    expect(m.status).toBe(200);
    expect(m.json.data.user.display_name).toBe('Rina Putri');
  });

  it('nama: dipangkas, 2-40 karakter, karakter kontrol ditolak, unik tanpa memedulikan huruf besar/kecil', async () => {
    expect((await create('  Budi  ')).json.data.user.display_name).toBe('Budi');
    expect((await create('A')).status).toBe(400);
    expect((await create('x'.repeat(41))).status).toBe(400);
    expect((await create('Bu\u0007di')).status).toBe(400);
    const dup = await create('BUDI');
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('PROFILE_NAME_TAKEN');
    expect((await call(createPost, 'POST', '/api/v1/profiles', { body: { display_name: 'Sari', role: 'admin' } })).status).toBe(400);
  });

  it('batas 10 profil: yang ke-11 ditolak PROFILE_LIMIT_REACHED; hapus satu membuka slot', async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 10; i++) ids.push((await create(`Profil ${i}`)).json.data.user.id);
    const over = await create('Profil 11');
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe('PROFILE_LIMIT_REACHED');
    expect((await remove(ids[0]!, 'Profil 1')).status).toBe(204);
    expect((await create('Profil 11')).status).toBe(201);
  });

  it('pilih profil: cookie berlaku; id tak dikenal 404; profil lain tidak tercampur', async () => {
    const a = (await create('Ani')).json.data.user.id as string;
    const b = (await create('Bayu')).json.data.user.id as string;
    const sa = await select(a);
    expect(sa.status).toBe(200);
    expect((await me(cookieOf(sa.cookie))).json.data.user.id).toBe(a);
    const sb = await select(b);
    expect((await me(cookieOf(sb.cookie))).json.data.user.id).toBe(b);
    expect((await select('5e1d7a90-2b3c-4d5e-8f60-718293a4b5c6')).status).toBe(404);
    expect((await call(selectPost, 'POST', '/api/v1/profiles/xyz/select', { params: { profile_id: 'xyz' } })).status).toBe(400);
  });

  it('ringkasan progres per profil terpisah', async () => {
    const a = (await create('Ani')).json.data.user.id as string;
    const b = (await create('Bayu')).json.data.user.id as string;
    await db.execute(sql`
      UPDATE user_sub_module_progress SET status = 'COMPLETED'
      WHERE user_id = ${a}::uuid AND sub_module_id IN (SELECT id FROM sub_modules LIMIT 2)`);
    const list = (await call(listGet, 'GET', '/api/v1/profiles')).json.data.profiles as any[];
    expect(list.find((p) => p.id === a).completed_sub_modules).toBe(2);
    expect(list.find((p) => p.id === b).completed_sub_modules).toBe(0);
  });

  it('ganti profil (leave) menghapus cookie dan idempoten', async () => {
    const r = await call(leavePost, 'POST', '/api/v1/profiles/leave');
    expect(r.status).toBe(204);
    expect(r.headers.getSetCookie().join(';')).toMatch(/Max-Age=0/);
  });

  it('ubah nama lewat /me/profile: nama kembar 409 PROFILE_NAME_TAKEN', async () => {
    await create('Ani');
    const b = await create('Bayu');
    const cookie = cookieOf(b.cookie);
    const ok = await call(profilePatch, 'PATCH', '/api/v1/me/profile', { cookie, body: { display_name: 'Bayu S.' } });
    expect(ok.status).toBe(200);
    const dup = await call(profilePatch, 'PATCH', '/api/v1/me/profile', { cookie, body: { display_name: 'ani' } });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('PROFILE_NAME_TAKEN');
  });

  it('hapus: wajib konfirmasi nama; progres ikut terhapus; cookie profil aktif dibatalkan; profil lain utuh', async () => {
    const a = await create('Ani');
    const b = await create('Bayu');
    const aid = a.json.data.user.id as string;
    const bid = b.json.data.user.id as string;

    const wrong = await remove(aid, 'Salah', cookieOf(a.cookie));
    expect(wrong.status).toBe(400);
    expect(wrong.json.error.code).toBe('CONFIRM_NAME_MISMATCH');
    expect((await me(cookieOf(a.cookie))).status).toBe(200);

    const rowsBefore = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM user_sub_module_progress WHERE user_id = ${aid}::uuid`)).rows[0] as any).n);
    expect(rowsBefore).toBeGreaterThan(0);

    const ok = await remove(aid, 'ani', cookieOf(a.cookie)); // tanpa memedulikan huruf besar/kecil
    expect(ok.status).toBe(204);
    expect(ok.headers.getSetCookie().join(';')).toMatch(/Max-Age=0/);
    expect((await me(cookieOf(a.cookie))).status).toBe(401);
    const rowsAfter = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM user_sub_module_progress WHERE user_id = ${aid}::uuid`)).rows[0] as any).n);
    expect(rowsAfter).toBe(0);

    const list = (await call(listGet, 'GET', '/api/v1/profiles')).json.data.profiles as any[];
    expect(list.map((p) => p.id)).toEqual([bid]);
    expect((await me(cookieOf(b.cookie))).status).toBe(200);
    expect((await remove(aid, 'Ani')).status).toBe(404);
  });

  it('nama yang sudah dihapus dapat dipakai lagi', async () => {
    const a = (await create('Ani')).json.data.user.id as string;
    expect((await remove(a, 'Ani')).status).toBe(204);
    expect((await create('Ani')).status).toBe(201);
  });
});

describe('penjaga Host dan Origin (SPEC-025 D4)', () => {
  it('Host asing -> 403 HOST_NOT_ALLOWED pada GET dan POST; loopback lolos', async () => {
    const bad = await createPostRaw('evil.example', 'GET');
    expect(bad.status).toBe(403);
    expect((await bad.json()).error.code).toBe('HOST_NOT_ALLOWED');
    expect((await createPostRaw('evil.example:3005', 'GET')).status).toBe(403);
    expect((await createPostRaw('localhost.evil.example', 'GET')).status).toBe(403);
    expect((await createPostRaw('127.0.0.1:3005', 'GET')).status).toBe(200);
    expect((await createPostRaw('localhost:3005', 'GET')).status).toBe(200);
    expect((await createPostRaw('[::1]:3005', 'GET')).status).toBe(200);
  });

  it('URL dengan hostname asing ditolak walau tanpa header Host', async () => {
    const res = await listGet(new Request('http://evil.example/api/v1/profiles'), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('Origin sama dengan Host (port berapa pun) diterima; port loopback lain ditolak', async () => {
    const post = (host: string, origin: string, name: string) =>
      createPost(
        new Request(`http://${host}/api/v1/profiles`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', host, origin },
          body: JSON.stringify({ display_name: name }),
        }),
        { params: Promise.resolve({}) },
      );
    expect((await post('127.0.0.1:3005', 'http://127.0.0.1:3005', 'Sama Origin')).status).toBe(201);
    expect((await post('localhost:4321', 'http://localhost:4321', 'Port Lain')).status).toBe(201);
    // halaman di localhost:8080 mengirim ke server di 3005: situs sama bagi SameSite, tetapi bukan same-origin
    const cross = await post('127.0.0.1:3005', 'http://localhost:8080', 'Silang Port');
    expect(cross.status).toBe(403);
    expect(((await cross.json()) as any).error.code).toBe('CSRF_ORIGIN_MISMATCH');
    // localhost vs 127.0.0.1 pada port sama juga bukan same-origin
    expect((await post('127.0.0.1:3005', 'http://localhost:3005', 'Beda Nama')).status).toBe(403);
  });

  it('mutasi dari Origin asing ditolak CSRF_ORIGIN_MISMATCH', async () => {
    const res = await createPost(
      new Request('http://localhost:3000/api/v1/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ display_name: 'Peretas' }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe('CSRF_ORIGIN_MISMATCH');
    expect(Number(((await db.execute(sql`SELECT count(*)::int AS n FROM users`)).rows[0] as any).n)).toBe(0);
  });
});

async function createPostRaw(host: string, method: string): Promise<Response> {
  return listGet(new Request('http://localhost:3000/api/v1/profiles', { method, headers: { host } }), { params: Promise.resolve({}) });
}
