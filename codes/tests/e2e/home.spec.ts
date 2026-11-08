import { expect, test } from '@playwright/test';

// Catatan: dibutuhkan server + DB hidup. Tanpa login (SPEC-025): rute terproteksi menuju pemilih profil.
test('tanpa profil terpilih, rute terproteksi dialihkan ke /pilih-profil dengan next', async ({ page }) => {
  await page.goto('/profil');
  await expect(page).toHaveURL(/\/pilih-profil\?next=%2Fprofil$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(page.getByRole('heading', { name: 'Siapa yang belajar?' })).toBeVisible();
});

test('next berbahaya diabaikan di pemilih profil', async ({ page }) => {
  await page.goto('/pilih-profil?next=//evil.test&pilih=1');
  await expect(page.getByRole('heading', { name: 'Siapa yang belajar?' })).toBeVisible();
});

test('halaman masuk dan daftar sudah tidak ada', async ({ request }) => {
  expect((await request.get('/masuk')).status()).toBe(404);
  expect((await request.get('/daftar')).status()).toBe(404);
});

test('GET /api/health menjawab 200 saat DB tersedia', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.status).toBe('ok');
});
