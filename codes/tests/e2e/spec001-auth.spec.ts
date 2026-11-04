/** SPEC-001: akun & sesi (UI + API lewat browser). */
import { expect, test } from './support/fixtures';
import { api, apiLogin, expectNoHorizontalScroll, freshIp, newLearner, ORIGIN } from './support/app';
import { createUser, PASSWORD, q, q1, setting } from './support/db';

test.describe('SPEC-001 auth', () => {
  test.beforeEach(async () => {
    await setting('signup.mode', 'open');
  });
  test.afterAll(async () => {
    await setting('signup.mode', 'invite');
  });

  test('@mobile E2E: daftar (mode open), masuk, ganti target band, keluar', async ({ page }, info) => {
    const email = `reg.${Date.now()}.${info.project.name}@example.test`;
    await page.goto('/daftar');
    await expect(page.getByLabel('Kode undangan')).toHaveCount(0); // hanya mode invite
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Nama tampilan').fill('Budi Uji');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Daftar' }).click();
    await expect(page).toHaveURL(/\/masuk/);
    await expect(page.getByText('Akun dibuat. Silakan masuk.')).toBeVisible();

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Halo, Budi Uji')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto('/profil');
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: '6.5' }).click();
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Profil disimpan.')).toBeVisible();
    const row = await q1<{ target_band: string }>('SELECT target_band FROM users WHERE email=$1', [email]);
    expect(Number(row.target_band)).toBe(6.5);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Keluar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/\/masuk/);
    await page.goto('/profil');
    await expect(page).toHaveURL(/\/masuk\?next=%2Fprofil$/);
  });

  test('login salah menampilkan pesan generik dan kunci akun pada percobaan ke-5', async ({ page }) => {
    const u = await createUser();
    await page.goto('/masuk');
    for (let i = 0; i < 4; i++) {
      await page.getByLabel('Email').fill(u.email);
      await page.getByLabel('Password', { exact: true }).fill('salah-salah-salah');
      await page.getByRole('button', { name: 'Masuk', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Email atau password salah.' })).toBeVisible();
    }
    // percobaan ke-5 mengunci; password benar tetap ditolak
    const r5 = await api(page.context(), 'POST', '/api/v1/auth/login', { email: u.email, password: 'salah-lagi-lagi' });
    expect(r5.status).toBe(401);
    const locked = await q1<{ locked_until: string | null }>('SELECT locked_until FROM users WHERE id=$1', [u.id]);
    expect(locked.locked_until).not.toBeNull();
    const ok = await api(page.context(), 'POST', '/api/v1/auth/login', { email: u.email, password: u.password });
    expect(ok.status).toBe(401);
    expect(ok.json.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('next berbahaya diabaikan setelah login (//evil.test -> /)', async ({ page }) => {
    const u = await createUser();
    await page.goto('/masuk?next=//evil.test');
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password', { exact: true }).fill(u.password);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page).toHaveURL(`${ORIGIN}/`);
  });

  test('login dengan next valid kembali ke halaman tujuan', async ({ page }) => {
    const u = await createUser();
    await page.goto('/profil');
    await expect(page).toHaveURL(/\/masuk\?next=%2Fprofil$/);
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password', { exact: true }).fill(u.password);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page).toHaveURL(/\/profil$/);
  });

  test('mode closed: halaman daftar menampilkan info tanpa form; invite: kode wajib', async ({ page }) => {
    await setting('signup.mode', 'closed');
    await page.goto('/daftar');
    await expect(page.getByText('Pendaftaran sedang ditutup')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Daftar' })).toHaveCount(0);
    const r = await api(page.context(), 'POST', '/api/v1/auth/register', { email: 'x@example.test', display_name: 'X Y', password: PASSWORD });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('SIGNUP_CLOSED');
    await setting('signup.mode', 'invite');
    const r2 = await api(page.context(), 'POST', '/api/v1/auth/register', { email: 'x2@example.test', display_name: 'X Y', password: PASSWORD });
    expect(r2.status).toBe(403);
    expect(r2.json.error.code).toBe('INVITE_INVALID');
    await page.goto('/daftar');
    await expect(page.getByLabel('Kode undangan')).toBeVisible();
  });

  test('validasi password & kunci tak dikenal pada register', async ({ page }) => {
    const c = page.context();
    const a = await api(c, 'POST', '/api/v1/auth/register', { email: 'v1@example.test', display_name: 'Va Li', password: 'abc123' });
    expect(a.status).toBe(400);
    expect(JSON.stringify(a.json)).toContain('password_too_short');
    const b = await api(c, 'POST', '/api/v1/auth/register', { email: 'v2@example.test', display_name: 'Va Li', password: 'passwordpassword' });
    expect(JSON.stringify(b.json)).toContain('password_too_common');
    const d = await api(c, 'POST', '/api/v1/auth/register', { email: 'v3@example.test', display_name: 'Va Li', password: PASSWORD, role: 'admin' });
    expect(d.status).toBe(400);
    expect(JSON.stringify(d.json)).toContain('unrecognized_key');
    expect((await q('SELECT 1 FROM users WHERE email LIKE $1', ['v_@example.test'])).length).toBe(0);
  });

  test('CSRF: Origin asing ditolak pada endpoint mutasi', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', { headers: { origin: 'https://evil.example', 'x-forwarded-for': freshIp() }, data: { email: 'a@example.test', password: 'x' } });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('CSRF_ORIGIN_MISMATCH');
  });

  test('profil: target_band 8.0 ditolak, 6.5 tersimpan (API)', async ({ context }) => {
    await newLearner(context);
    const bad = await api(context, 'PATCH', '/api/v1/me/profile', { target_band: 8.0 });
    expect(bad.status).toBe(400);
    const ok = await api(context, 'PATCH', '/api/v1/me/profile', { target_band: 6.5 });
    expect(ok.status).toBe(200);
  });

  test('ganti password: sesi lain keluar, token_version naik 1, password lama salah ditolak; UI wajib-ganti', async ({ browser }) => {
    const u = await createUser({ mustChange: true });
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    await apiLogin(ctxA.request, u);
    await apiLogin(ctxB.request, u);
    // must_change_password: endpoint non-akun diblokir, me tetap jalan
    const tree = await api(ctxA, 'GET', '/api/v1/curriculum/tree');
    expect(tree.status).toBe(403);
    expect(tree.json.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await api(ctxA, 'GET', '/api/v1/auth/me')).status).toBe(200);
    // UI: halaman apa pun diarahkan ke /ganti-password
    const pageA = await ctxA.newPage();
    await pageA.goto('/peta');
    await expect(pageA).toHaveURL(/\/ganti-password/);
    await expect(pageA.getByText('Anda harus mengganti password sementara.')).toBeVisible();
    // password lama salah
    await pageA.getByLabel('Password saat ini').fill('salah-salah-salah');
    await pageA.getByLabel('Password baru').fill('teh-tarik-hangat-77');
    await pageA.getByRole('button', { name: 'Simpan' }).click();
    await expect(pageA.getByText('Password saat ini salah.')).toBeVisible();
    const before = await q1<{ token_version: number; password_hash: string }>('SELECT token_version, password_hash FROM users WHERE id=$1', [u.id]);
    // benar
    await pageA.getByLabel('Password saat ini').fill(u.password);
    await pageA.getByRole('button', { name: 'Simpan' }).click();
    await expect(pageA).toHaveURL(/\/$/);
    const after = await q1<{ token_version: number; password_hash: string; must_change_password: boolean }>('SELECT token_version, password_hash, must_change_password FROM users WHERE id=$1', [u.id]);
    expect(after.token_version).toBe(before.token_version + 1);
    expect(after.password_hash).not.toBe(before.password_hash);
    expect(after.must_change_password).toBe(false);
    expect((await api(ctxB, 'GET', '/api/v1/auth/me')).status).toBe(401);
    expect((await api(ctxA, 'GET', '/api/v1/auth/me')).status).toBe(200);
    await ctxA.close();
    await ctxB.close();
  });

  test('akun dinonaktifkan: permintaan terproteksi berikutnya 401', async ({ context }) => {
    const u = await newLearner(context);
    expect((await api(context, 'GET', '/api/v1/auth/me')).status).toBe(200);
    await q(`UPDATE users SET status='DISABLED' WHERE id=$1`, [u.id]);
    expect((await api(context, 'GET', '/api/v1/auth/me')).status).toBe(401);
  });

  test('logout: 204 lalu me 401', async ({ context }) => {
    await newLearner(context);
    const out = await api(context, 'POST', '/api/v1/auth/logout');
    expect(out.status).toBe(204);
    expect((await api(context, 'GET', '/api/v1/auth/me')).status).toBe(401);
  });

  test('cookie sesi rusak: 401 (bukan 500)', async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: 'authjs.session-token', value: 'sampah.rusak.token', url: ORIGIN }]);
    const r = await api(ctx, 'GET', '/api/v1/auth/me');
    expect(r.status).toBe(401);
    await ctx.close();
  });

  test('rate limit login: permintaan ke-6 dari satu IP = 429 + Retry-After', async ({ request }) => {
    const ip = freshIp();
    let last = 0;
    let retry: string | undefined;
    for (let i = 0; i < 7; i++) {
      const r = await request.post('/api/v1/auth/login', { headers: { origin: ORIGIN, 'x-forwarded-for': ip }, data: { email: `tidakada${i}@example.test`, password: 'x'.repeat(12) } });
      last = r.status();
      if (last === 429) {
        retry = r.headers()['retry-after'];
        break;
      }
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThanOrEqual(1);
  });
});
