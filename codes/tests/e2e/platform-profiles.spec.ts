import { expect, request, test, type Page } from '@playwright/test';
import { BASE_URL, type TestProfile } from './helpers/app';
import { cliRun, dropProfile, listProfiles, putWarm, getWarm, wipeAllProfiles } from './helpers/platform';
import { keepWarm } from './helpers/platform';

let stopWarm: (() => Promise<void>) | undefined;
// Mesin bersama dengan banyak agen + next dev: beri ruang waktu (bukan perilaku aplikasi).
test.describe.configure({ timeout: 120_000 });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  stopWarm = await keepWarm();
});
test.afterAll(async () => {
  await stopWarm?.();
});

// SPEC-025 Fase 1: profil lokal (buat, validasi, unik tanpa peduli huruf, batas 10, ganti, hapus dengan konfirmasi
// nama, auto-masuk satu profil, redirect rute terproteksi dengan next aman). Tiap tes menyiapkan DB-nya sendiri
// (wipeAllProfiles) sehingga kegagalan satu tes tidak memutus tes lain. Kuota general_ip (60/menit) dijaga
// dengan pembuatan profil lewat API seperlunya.

async function createNamed(name: string): Promise<{ status: number; body: any; profile?: TestProfile }> {
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  let res = await api.post('/api/v1/profiles', { data: { display_name: name } });
  for (let i = 0; i < 3 && res.status() === 429; i++) {
    await new Promise((r) => setTimeout(r, (Number(res.headers()['retry-after'] ?? '2') + 1) * 1000));
    res = await api.post('/api/v1/profiles', { data: { display_name: name } });
  }
  const body = await res.json().catch(() => ({}));
  const state = await api.storageState();
  await api.dispose();
  return { status: res.status(), body, profile: res.status() === 201 ? { name, cookies: state.cookies as never } : undefined };
}

async function mustCreate(name: string): Promise<TestProfile> {
  const r = await createNamed(name);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.profile!;
}

function card(page: Page, name: string) {
  return page.locator('li').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: 'Pilih' }) });
}

const apiFailures: string[] = [];
test.beforeEach(async ({ page }) => {
  apiFailures.length = 0;
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) apiFailures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} [${r.headers()['content-type'] ?? ''}]`);
  });
  await wipeAllProfiles();
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && apiFailures.length) {
    console.log(`[api>=400 selama "${info.title}"] ` + apiFailures.join(' | '));
  }
});
test.afterAll(async () => {
  await wipeAllProfiles();
});

test('DB tanpa profil: pemilih menawarkan "Buat profil"; membuat profil pertama membuka beranda', async ({ page, context }) => {
  await page.goto('/pilih-profil');
  await expect(page.getByRole('heading', { name: 'Siapa yang belajar?', level: 1 })).toBeVisible();
  await expect(page.getByText('Belum ada profil. Buat profil pertama Anda')).toBeVisible();
  await page.getByLabel('Nama profil').fill('Aku Uji');
  await page.getByRole('button', { name: 'Buat profil' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Halo, Aku Uji')).toBeVisible();
  // D2: cookie sesi httpOnly, SameSite=Strict, tanpa Secure (HTTP loopback).
  const cookie = (await context.cookies()).find((c) => c.name.endsWith('session-token'));
  expect(cookie, 'cookie sesi').toBeTruthy();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe('Strict');
  expect(cookie!.secure).toBe(false);
  // Header: tidak ada menu Admin / Masuk / Daftar.
  for (const t of ['Admin', 'Masuk', 'Daftar']) await expect(page.getByRole('link', { name: t, exact: true })).toHaveCount(0);
});

test('validasi nama di UI: 1 karakter, 41 karakter, hanya spasi', async ({ page }) => {
  await page.goto('/pilih-profil');
  const input = page.getByLabel('Nama profil');
  const submit = page.getByRole('button', { name: 'Buat profil' });
  await expect(submit).toBeDisabled();
  await input.fill('   ');
  await expect(submit).toBeDisabled();
  await input.fill('a');
  await submit.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Nama harus 2 sampai 40 karakter.' })).toBeVisible();
  await input.fill('x'.repeat(41));
  await submit.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Nama harus 2 sampai 40 karakter.' })).toBeVisible();
  expect(await listProfiles()).toHaveLength(0);
  await input.fill('ab');
  await submit.click();
  await expect(page).toHaveURL(/\/$/);
});

test('validasi nama di API: batas 2 dan 40, kontrol karakter, field tak dikenal', async () => {
  expect((await createNamed('a')).status).toBe(400);
  expect((await createNamed('x'.repeat(41))).status).toBe(400);
  expect((await createNamed('tab\there')).status).toBe(400);
  const ok2 = await createNamed('ab');
  expect(ok2.status).toBe(201);
  const ok40 = await createNamed('y'.repeat(40));
  expect(ok40.status).toBe(201);
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const extra = await api.post('/api/v1/profiles', { data: { display_name: 'Valid Nama', email: 'a@b.c', password: 'x' } });
  expect(extra.status()).toBe(400);
  await api.dispose();
});

test('nama profil unik tanpa memedulikan huruf besar/kecil dan spasi tepi (UI dan API)', async ({ page }) => {
  await mustCreate('Budi Test');
  const dup = await createNamed('BUDI test');
  expect(dup.status).toBe(409);
  expect(dup.body.error.code).toBe('PROFILE_NAME_TAKEN');
  expect((await createNamed('  budi TEST  ')).status).toBe(409);
  await page.goto('/pilih-profil?pilih=1');
  await page.getByLabel('Nama profil').fill('bUdI tEsT');
  await page.getByRole('button', { name: 'Buat profil' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Nama profil sudah dipakai.' })).toBeVisible();
  expect(await listProfiles()).toHaveLength(1);
});

test('batas 10 profil: form dikunci, API 409 PROFILE_LIMIT_REACHED, hapus satu membuka lagi', async ({ page }) => {
  for (let i = 1; i <= 10; i++) await mustCreate(`Batas ${String(i).padStart(2, '0')}`);
  const eleventh = await createNamed('Batas 11');
  expect(eleventh.status).toBe(409);
  expect(eleventh.body.error.code).toBe('PROFILE_LIMIT_REACHED');
  await page.goto('/pilih-profil');
  await expect(page.getByText('Batas 10 profil tercapai. Hapus profil lain untuk menambah.')).toBeVisible();
  await expect(page.locator('#profile-name')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Buat profil' })).toBeDisabled();
  await page.getByRole('button', { name: 'Hapus Batas 10' }).click();
  await page.getByLabel('Ketik nama profil untuk konfirmasi').fill('Batas 10');
  await page.getByRole('button', { name: 'Hapus permanen' }).click();
  await expect(page.locator('#profile-name')).toBeEnabled();
  expect((await createNamed('Batas Baru')).status).toBe(201);
});

test('satu profil + tanpa sesi: pemilih langsung masuk; ?pilih=1 menahan di pemilih', async ({ page }) => {
  await mustCreate('Sendirian');
  await page.goto('/pilih-profil');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Halo, Sendirian')).toBeVisible();
  // Ganti profil lalu pemilih tidak boleh masuk otomatis lagi.
  await page.goto('/profil');
  await page.getByRole('button', { name: 'Ganti profil' }).click();
  await expect(page).toHaveURL(/\/pilih-profil\?pilih=1$/);
  await expect(page.getByRole('heading', { name: 'Siapa yang belajar?' })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/pilih-profil\?pilih=1$/);
  await card(page, 'Sendirian').getByRole('button', { name: 'Pilih' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('dua profil: tidak auto-masuk; ganti profil membatalkan sesi; progres terpisah antar profil', async ({ page, context }) => {
  const a = await mustCreate('Profil Alfa');
  const b = await mustCreate('Profil Beta');
  expect(cliRun('progress', 'unlock', 'Profil Alfa', '3.3.3').code).toBe(0);
  await page.goto('/pilih-profil');
  await expect(page.getByRole('heading', { name: 'Siapa yang belajar?' })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/\/pilih-profil/);
  await card(page, 'Profil Alfa').getByRole('button', { name: 'Pilih' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Halo, Profil Alfa')).toBeVisible();
  // 3.3.3 terbuka hanya untuk Alfa.
  const sm = await getWarm(page.request, '/api/v1/sub-modules/3.3.3');
  expect(sm.status()).toBe(200);

  await page.goto('/profil');
  await page.getByRole('button', { name: 'Ganti profil' }).click();
  await expect(page).toHaveURL(/\/pilih-profil\?pilih=1$/);
  const me401 = await getWarm(page.request, '/api/v1/auth/me');
  expect(me401.status(), 'sesi dibatalkan setelah "Ganti profil"').toBe(401);

  await card(page, 'Profil Beta').getByRole('button', { name: 'Pilih' }).click();
  await expect(page.getByText('Halo, Profil Beta')).toBeVisible();
  const smB = await getWarm(page.request, '/api/v1/sub-modules/3.3.3');
  expect(smB.status(), 'progres Beta terpisah dari Alfa').toBe(403);
  expect(a.cookies.length + b.cookies.length).toBeGreaterThan(0);
  void context;
});

test('rute terproteksi tanpa sesi dialihkan ke /pilih-profil?next=; setelah memilih kembali ke tujuan', async ({ page }) => {
  await mustCreate('Tujuan A');
  await mustCreate('Tujuan B');
  for (const path of ['/', '/peta', '/profil', '/latihan/campur', '/simulasi']) {
    await page.goto(path);
    await expect(page, `redirect dari ${path}`).toHaveURL(new RegExp(`/pilih-profil\\?next=${encodeURIComponent(path)}$`));
    await expect(page.getByRole('heading', { name: 'Siapa yang belajar?' })).toBeVisible();
  }
  await page.goto('/peta');
  await expect(page).toHaveURL(/\/pilih-profil\?next=%2Fpeta$/);
  await card(page, 'Tujuan A').getByRole('button', { name: 'Pilih' }).click();
  await expect(page).toHaveURL(/\/peta$/);
});

test('/riwayat tanpa sesi juga berakhir di pemilih profil dengan next ke riwayat', async ({ page }) => {
  await mustCreate('Riwayat A');
  await mustCreate('Riwayat B');
  await page.goto('/riwayat');
  await expect(page).toHaveURL(/\/pilih-profil\?next=%2Friwayat(%2Fujian)?$/);
});

test('next berbahaya diabaikan: //evil, https://evil, /\\evil, javascript:', async ({ page }) => {
  await mustCreate('Aman A');
  await mustCreate('Aman B');
  for (const evil of ['//evil.test', 'https://evil.test/x', '/\\evil.test', 'javascript:alert(1)']) {
    await page.goto(`/pilih-profil?pilih=1&next=${encodeURIComponent(evil)}`);
    await card(page, 'Aman A').getByRole('button', { name: 'Pilih' }).click();
    await expect(page.getByText('Halo, Aman A'), `next=${evil}`).toBeVisible();
    expect(new URL(page.url()).origin).toBe(BASE_URL);
    expect(new URL(page.url()).pathname, `next=${evil}`).toBe('/');
    await page.goto('/profil');
    await page.getByRole('button', { name: 'Ganti profil' }).click();
    await expect(page).toHaveURL(/\/pilih-profil\?pilih=1$/);
  }
});

test('hapus profil: wajib mengetik nama, progres/poin ikut terhapus, daftar CLI bersih', async ({ page }) => {
  await mustCreate('Hapus Aku');
  await mustCreate('Tetap Ada');
  expect(cliRun('progress', 'unlock', 'Hapus Aku', '3.3.3').code).toBe(0);
  expect(cliRun('points', 'adjust', 'Hapus Aku', '30', '--reason', 'uji hapus').code).toBe(0);
  expect(cliRun('points', 'show').stdout).toContain('Hapus Aku');

  await page.goto('/pilih-profil?pilih=1');
  await expect(card(page, 'Hapus Aku')).toBeVisible();
  await expect(card(page, 'Hapus Aku')).toContainText('sub-modul selesai');
  await page.getByRole('button', { name: 'Hapus Hapus Aku' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Hapus profil Hapus Aku?');
  await expect(dlg).toContainText('dihapus permanen');
  const confirm = dlg.getByRole('button', { name: 'Hapus permanen' });
  await expect(confirm).toBeDisabled();
  await dlg.getByLabel('Ketik nama profil untuk konfirmasi').fill('hapus');
  await expect(confirm).toBeDisabled();
  await dlg.getByLabel('Ketik nama profil untuk konfirmasi').fill('Hapus Aku');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(card(page, 'Hapus Aku')).toHaveCount(0);
  await expect(card(page, 'Tetap Ada')).toBeVisible();
  const names = (await listProfiles()).map((p) => p.display_name);
  expect(names).toEqual(['Tetap Ada']);
  // Progres/poin ikut terhapus (cascade): tidak ada lagi di CLI.
  const out = cliRun('points', 'show').stdout;
  expect(out).not.toContain('Hapus Aku');
  expect(out).toContain('Tetap Ada');
});

test('API hapus profil tanpa/dengan nama salah ditolak; nama benar (beda huruf) berhasil 204', async () => {
  const p = await mustCreate('Konfirmasi Nama');
  const id = (await listProfiles())[0]!.id;
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const wrong = await api.delete(`/api/v1/profiles/${id}`, { data: { confirm_name: 'salah' } });
  expect(wrong.status()).toBe(400);
  expect(((await wrong.json()) as any).error.code).toBe('CONFIRM_NAME_MISMATCH');
  const empty = await api.delete(`/api/v1/profiles/${id}`, { data: {} });
  expect(empty.status()).toBe(400);
  expect((await listProfiles()).length).toBe(1);
  const ok = await api.delete(`/api/v1/profiles/${id}`, { data: { confirm_name: 'konfirmasi NAMA' } });
  expect(ok.status()).toBe(204);
  expect((await listProfiles()).length).toBe(0);
  await api.dispose();
  expect(p.name).toBeTruthy();
});

test('menghapus profil yang sedang aktif membatalkan sesi dan kembali ke pemilih profil', async ({ page, context }) => {
  const a = await mustCreate('Aktif Dihapus');
  await mustCreate('Cadangan Ada');
  await context.addCookies(a.cookies as never);
  await page.goto('/profil');
  await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
  // Profil dihapus dari luar (CLI) saat tab terbuka: aksi berikutnya mengembalikan ke pemilih.
  dropProfile('Aktif Dihapus');
  await page.goto('/peta');
  await expect(page).toHaveURL(/\/pilih-profil\?next=%2Fpeta$/);
  expect((await getWarm(page.request, '/api/v1/auth/me')).status()).toBe(401);
});

test('hapus profil aktif lewat API membersihkan cookie sesi (Set-Cookie Max-Age=0)', async () => {
  const a = await mustCreate('Cookie Bersih');
  const id = (await listProfiles())[0]!.id;
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL }, storageState: { cookies: a.cookies as never, origins: [] } });
  const res = await api.delete(`/api/v1/profiles/${id}`, { data: { confirm_name: 'Cookie Bersih' } });
  expect(res.status()).toBe(204);
  const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value).join('\n');
  expect(setCookie).toMatch(/Max-Age=0/i);
  expect(setCookie).toMatch(/SameSite=Strict/i);
  await api.dispose();
});

test('dua tab: cookie terakhir menang dan UI menampilkan profil aktif sebenarnya', async ({ browser }) => {
  const a = await mustCreate('Tab Satu');
  const b = await mustCreate('Tab Dua');
  const ctx = await browser.newContext();
  await ctx.addCookies(a.cookies as never);
  const p1 = await ctx.newPage();
  const p2 = await ctx.newPage();
  await p1.goto('/');
  await expect(p1.getByText('Halo, Tab Satu')).toBeVisible();
  await ctx.clearCookies();
  await ctx.addCookies(b.cookies as never);
  await p2.goto('/');
  await expect(p2.getByText('Halo, Tab Dua')).toBeVisible();
  await p1.reload();
  await expect(p1.getByText('Halo, Tab Dua')).toBeVisible();
  await ctx.close();
});

test('ganti nama lewat /profil: duplikat (beda huruf) ditolak 409, nama baru tersimpan dan tampil', async ({ page, context }) => {
  const a = await mustCreate('Nama Lama');
  await mustCreate('Nama Terpakai');
  await context.addCookies(a.cookies as never);
  const dup = await page.request.patch('/api/v1/me/profile', { headers: { Origin: BASE_URL }, data: { display_name: 'NAMA terpakai' } });
  expect(dup.status()).toBe(409);
  expect(((await dup.json()) as any).error.code).toBe('PROFILE_NAME_TAKEN');
  await page.goto('/profil');
  await page.getByLabel('Nama tampilan').fill('Nama Baru');
  await page.getByRole('button', { name: /Simpan/ }).click();
  await expect(page.getByText('Profil disimpan.')).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Halo, Nama Baru')).toBeVisible();
});

test('API profil: select id tak dikenal 404, leave idempoten 204', async () => {
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const nf = await api.post('/api/v1/profiles/00000000-0000-4000-8000-000000000000/select');
  expect(nf.status()).toBe(404);
  const bad = await api.post('/api/v1/profiles/bukan-uuid/select');
  expect(bad.status()).toBe(400);
  expect((await api.post('/api/v1/profiles/leave')).status()).toBe(204);
  expect((await api.post('/api/v1/profiles/leave')).status()).toBe(204);
  await api.dispose();
  void putWarm;
});

// Penyimpangan dari SPEC-025 bagian UI/UX (merah sampai diperbaiki; diletakkan paling akhir).
test('UI/UX 025: header menampilkan nama profil aktif + tautan "Ganti profil"; kartu pemilih punya menu ganti nama', async ({ page, context }) => {
  const a = await mustCreate('Header Nama');
  await mustCreate('Header Lain');
  await context.addCookies(a.cookies as never);
  await page.goto('/peta');
  const header = page.locator('main').first();
  await expect(header.getByText('Header Nama', { exact: true }), 'nama profil aktif di header').toBeVisible();
  await expect(page.getByRole('link', { name: 'Ganti profil' }).or(page.getByRole('button', { name: 'Ganti profil' })).first(), 'tautan Ganti profil di header').toBeVisible();
  await page.goto('/pilih-profil?pilih=1');
  await expect(page.getByRole('button', { name: /Ganti nama/ }).first(), 'menu ganti nama per profil').toBeVisible();
});
