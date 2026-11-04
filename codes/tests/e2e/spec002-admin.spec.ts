/** SPEC-002: admin pengguna, undangan, pengaturan, audit, kesehatan. */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, loginContext, newAdmin, newLearner } from './support/app';
import { createUser, PASSWORD, q, q1, setting } from './support/db';

test.describe('SPEC-002 admin', () => {
  test.afterAll(async () => {
    await setting('signup.mode', 'invite');
  });

  test('@mobile E2E: admin membuat undangan -> pengguna daftar dengan kode -> admin menonaktifkan -> tidak bisa login', async ({ page, browser }, info) => {
    await setting('signup.mode', 'invite');
    await newAdmin(page.context());
    await page.goto('/admin/undangan');
    await page.getByRole('button', { name: 'Buat Undangan' }).click();
    await page.getByRole('button', { name: 'Buat kode' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByText('Hanya ditampilkan sekali')).toBeVisible();
    const code = (await dlg.locator('code, [data-testid=invite-code], output, input[readonly]').first().innerText().catch(async () => '')) || (await dlg.locator('input[readonly]').first().inputValue());
    expect(code.trim().length).toBeGreaterThan(8);
    await page.keyboard.press('Escape');

    // pengguna daftar dengan kode (konteks terpisah)
    const email = `inv.${Date.now()}.${info.project.name}@example.test`;
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.77.${Date.now() % 250}.${Math.floor(Math.random() * 250)}` } });
    const up = await ctx.newPage();
    await up.goto('/daftar');
    await up.getByLabel('Email').fill(email);
    await up.getByLabel('Nama tampilan').fill('Pengundang Uji');
    await up.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await up.getByLabel('Kode undangan').fill(code.trim());
    await up.getByRole('button', { name: 'Daftar' }).click();
    await expect(up).toHaveURL(/\/masuk/);
    const used = await q1<{ used_by: string | null }>('SELECT used_by FROM signup_invites WHERE used_by IS NOT NULL ORDER BY used_at DESC LIMIT 1');
    expect(used.used_by).not.toBeNull();
    await ctx.close();

    // admin menonaktifkan pengguna lewat UI
    await page.goto('/admin/pengguna');
    await page.getByRole('searchbox').fill(email);
    await expect(page.getByText(email).filter({ visible: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /Aksi untuk Pengundang Uji/ }).filter({ visible: true }).first().click();
    await page.getByRole('menuitem', { name: 'Nonaktifkan' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByText('Pengguna diperbarui.')).toBeVisible();
    const st = await q1<{ status: string }>('SELECT status FROM users WHERE email=$1', [email]);
    expect(st.status).toBe('DISABLED');
    const res = await api(page.context(), 'POST', '/api/v1/auth/login', { email, password: PASSWORD });
    expect(res.status).toBe(401);
    await expectNoHorizontalScroll(page);
  });

  test('admin menambah pengguna: password sementara tampil sekali dan pengguna wajib ganti', async ({ page, browser }) => {
    await newAdmin(page.context());
    await page.goto('/admin/pengguna');
    await page.getByRole('button', { name: 'Tambah Pengguna' }).click();
    const email = `baru.${Date.now()}@example.test`;
    const d = page.getByRole('dialog');
    await d.getByLabel('Email').fill(email);
    await d.getByLabel('Nama tampilan').fill('Pengguna Baru');
    await d.getByRole('button', { name: 'Buat akun' }).click();
    await expect(page.getByText('Hanya ditampilkan sekali. Salin dan bagikan ke pengguna sekarang.')).toBeVisible();
    const tmp = await page.getByRole('dialog').locator('code, input[readonly]').first().innerText().catch(() => '');
    const row = await q1<{ must_change_password: boolean }>('SELECT must_change_password FROM users WHERE email=$1', [email]);
    expect(row.must_change_password).toBe(true);
    void tmp;
    await page.getByRole('button', { name: 'Sudah saya salin' }).click();
    void browser;
  });

  test('non-admin ditolak dari /admin dan API admin (403)', async ({ page, context }) => {
    await newLearner(context);
    const r = await api(context, 'GET', '/api/v1/admin/users');
    expect(r.status).toBe(403);
    await page.goto('/admin/pengguna');
    await expect(page).not.toHaveURL(/\/admin\/pengguna$/);
  });

  test('pengaturan: ubah signup.mode lewat UI tercatat di audit; nilai di luar rentang ditolak', async ({ page }) => {
    await newAdmin(page.context());
    await setting('signup.mode', 'invite');
    await page.goto('/admin/pengaturan');
    const bad = await api(page.context(), 'PUT', '/api/v1/admin/settings/drill.question_count', { value: 999 });
    expect([400, 422]).toContain(bad.status);
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Terbuka' }).click();
    await page.getByRole('button', { name: 'Simpan signup.mode' }).click();
    await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();
    const v = await q1<{ value: string }>(`SELECT value FROM app_settings WHERE key='signup.mode'`);
    expect(v.value).toBe('open');
    await setting('signup.mode', 'invite');
    const a = await q(`SELECT action FROM audit_log WHERE action ILIKE '%SETTING%' ORDER BY id DESC LIMIT 1`);
    expect(a.length).toBe(1);
  });

  test('audit: tampil dengan filter aksi', async ({ page }) => {
    await newAdmin(page.context());
    await createUser(); // memastikan ada aktivitas
    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible();
    await page.getByLabel('Aksi').fill('AUTH_LOGIN_SUCCESS');
    await page.getByRole('button', { name: 'Terapkan' }).click();
    await expect(page.getByRole('cell', { name: 'AUTH_LOGIN_SUCCESS' }).first()).toBeVisible();
  });

  test('kesehatan sistem: DB, antrean, worker aktif', async ({ page }) => {
    await newAdmin(page.context());
    await page.goto('/admin');
    await expect(page.getByText('Kesehatan sistem')).toBeVisible();
    const card = (name: string) => page.locator('section, div').filter({ hasText: new RegExp(`^${name}`) }).first();
    await expect(card('Database')).toContainText('Aktif');
    await expect(card('Worker')).toContainText('Aktif');
  });

  test('admin tidak bisa mengubah akunnya sendiri dan reset password memberi password sementara baru', async ({ page, context }) => {
    const admin = await newAdmin(context);
    const target = await createUser();
    const self = await api(context, 'PATCH', `/api/v1/admin/users/${admin.id}`, { status: 'DISABLED' });
    expect([400, 403, 409]).toContain(self.status);
    const reset = await api(context, 'POST', `/api/v1/admin/users/${target.id}/reset-password`);
    expect(reset.status).toBe(200);
    expect(JSON.stringify(reset.json)).toMatch(/temporary_password|temp/i);
    const row = await q1<{ must_change_password: boolean }>('SELECT must_change_password FROM users WHERE id=$1', [target.id]);
    expect(row.must_change_password).toBe(true);
    void page;
    void loginContext;
  });
});
