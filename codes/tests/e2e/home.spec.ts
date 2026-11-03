import { expect, test } from '@playwright/test';

// Catatan: dibutuhkan server + DB hidup (belum dijalankan pada sesi W1 Frontend).
test('pengguna tanpa sesi yang membuka rute terproteksi dialihkan ke /masuk dengan next', async ({ page }) => {
  await page.goto('/profil');
  await expect(page).toHaveURL(/\/masuk\?next=%2Fprofil$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible();
});

test('next berbahaya diabaikan di halaman masuk', async ({ page }) => {
  await page.goto('/masuk?next=//evil.test');
  await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible();
});

test('GET /api/health menjawab 200 saat DB tersedia', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.status).toBe('ok');
});
