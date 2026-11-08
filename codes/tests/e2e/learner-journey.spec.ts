import { expect, test } from '@playwright/test';

// Prasyarat: server + DB hidup, seed dijalankan, sub-modul 3.3.3 terbit
// (npm run db:seed && npm run content:import -- content/gt-modules/3.3.3 --publish).
// Sub-modul dibuka lewat CLI sebelum tes: npm run progress:unlock -- "<profil>" 3.3.3 (lihat E2E_PROFILE).
const PROFILE = process.env.E2E_PROFILE ?? `E2E ${Date.now().toString(36)}`.slice(0, 40);

test.describe.configure({ mode: 'serial' });

test('buat profil lalu masuk ke beranda', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/pilih-profil/);
  await page.getByLabel('Nama profil').fill(PROFILE);
  await page.getByRole('button', { name: 'Buat profil' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText(`Halo, ${PROFILE}`)).toBeVisible();
});

test('tata letak: tanpa overflow horizontal dan konten tidak tertutup sidebar', async ({ page, isMobile }) => {
  await page.goto('/pilih-profil');
  // Satu profil: pemilih langsung masuk sendiri. Beberapa profil: pilih yang pertama.
  const enter = page.getByRole('button', { name: /masuk|pilih/i }).first();
  await Promise.race([page.waitForURL('/', { timeout: 8000 }).catch(() => undefined), enter.waitFor({ timeout: 8000 }).catch(() => undefined)]);
  if (new URL(page.url()).pathname !== '/') await enter.click();
  await expect(page).toHaveURL('/');
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    w: window.innerWidth,
    left: document.querySelector('main')!.getBoundingClientRect().left,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  if (!isMobile) expect(m.left).toBeGreaterThanOrEqual(256);
});

test('API menolak Host asing dan POST lintas-origin', async ({ request, baseURL }) => {
  const evil = await request.get('/api/v1/profiles', { headers: { Host: 'evil.example' } });
  expect(evil.status()).toBe(403);
  const csrf = await request.post('/api/v1/profiles', {
    headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' },
    data: { display_name: 'x' },
  });
  expect(csrf.status()).toBe(403);
  expect(baseURL).toBeTruthy();
});
