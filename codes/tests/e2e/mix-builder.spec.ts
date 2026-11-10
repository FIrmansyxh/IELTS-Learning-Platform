import { expect, test } from '@playwright/test';
import { createProfile, deleteProfile, finishDrill, signIn, totalPoints, type TestProfile } from './helpers/app';

// SPEC-022 Mix Builder. Prasyarat: dijalankan lewat tests/e2e/helpers/run-e2e.mjs (DB temp + bank GT terbit).
test.describe.configure({ mode: 'serial' });

let profile: TestProfile;

test.beforeAll(async () => {
  profile = await createProfile('mix');
});
test.afterAll(() => deleteProfile(profile));
test.beforeEach(async ({ context }) => {
  await signIn(context, profile);
});

/** Biarkan hanya Grammar + tipe Pilihan ganda terpilih, jumlah minimum (5). */
async function chooseGrammarOnly(page: import('@playwright/test').Page) {
  for (const s of ['Reading', 'Writing', 'Speaking']) {
    const btn = page.getByRole('button', { name: new RegExp(`^${s}`) });
    if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
  }
  await expect(page.getByRole('button', { name: /^Grammar/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Pilihan ganda\s*\d+$/ }).click();
  await page.locator('#mix-count-input').fill('5');
  await expect(page.locator('output[for="mix-count-input"]')).toHaveText('5 soal');
}

test('layar Mix Builder: Listening tidak dapat dipilih, semua skill lain punya bank', async ({ page }) => {
  await page.goto('/latihan/campur');
  await expect(page.getByRole('heading', { name: 'Latihan campur', level: 1 })).toBeVisible();
  // Tidak ada tombol skill Listening; banknya tampil terkunci dengan keterangan.
  await expect(page.getByRole('button', { name: /^Listening/ })).toHaveCount(0);
  await expect(page.getByText('Listening belum tersedia di latihan campur')).toBeVisible();
  await expect(page.locator('#mix-bank-GT-LIS-S1-001')).toBeDisabled();
  // Semua skill kini punya bank (termasuk Vocabulary dan Reading): tombolnya aktif.
  await expect(page.getByRole('button', { name: /^Vocabulary/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Reading/ })).toBeEnabled();
  // Writing/Speaking membawa catatan AI.
  await expect(page.getByRole('button', { name: /^Grammar/ })).toBeEnabled();
  await expect(page.getByText('Maksimal 1 soal per sesi').first()).toBeVisible();
});

test('MANUAL Grammar sampai selesai, lihat hasil, dan tidak ada poin', async ({ page }) => {
  await page.goto('/latihan/campur');
  const before = await totalPoints(page);
  await chooseGrammarOnly(page);
  await expect(page.getByText('Latihan campur tidak menambah poin atau streak', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await expect(page).toHaveURL(/\/latihan\/campur\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 5');

  await finishDrill(page, 5);

  await expect(page.getByRole('heading', { name: 'Hasil latihan campur' })).toBeVisible();
  await expect(page.getByTestId('score-percent')).toContainText('%');
  await expect(page.getByText('Hasil per skill')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hasil per skill' })).toBeVisible();
  await expect(page.getByText('Grammar', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Latihan campur tidak memiliki batas lulus dan tidak menambah poin.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke beranda', exact: false })).toBeVisible();

  // Poin tidak berubah (SPEC-022: Mix tidak memberi poin/streak).
  expect(await totalPoints(page)).toBe(before);

  // Memuat ulang halaman hasil (attempt selesai) tetap menampilkan hasil yang sama.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hasil latihan campur' })).toBeVisible();
  await expect(page.getByTestId('score-percent')).toBeVisible();
});

test('AUTO_WEAKNESS memulai sesi campur otomatis', async ({ page }) => {
  await page.goto('/latihan/campur');
  await expect(page.getByText('Memilih soal dari semua skill', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Campur otomatis (fokus kelemahan)' }).click();
  await expect(page).toHaveURL(/\/latihan\/campur\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  // current_index = soal objektif pertama yang belum dijawab (soal Writing/Speaking tidak memblokir), jadi posisi awal
  // bisa > 1 bila pemilih acak menaruh soal AI di depan. Jumlah soal sesi otomatis adalah 10.
  await expect(page.getByTestId('question-counter')).toHaveText(/^Soal [1-9]\d* dari 10$/);
  // Sesi ini sengaja dibiarkan berjalan untuk tes berikutnya.
});

test('sesi aktif memunculkan banner & konfirmasi; sesi lama menjadi ABANDONED', async ({ page }) => {
  await page.goto('/latihan/campur');
  const banner = page.getByRole('status').filter({ hasText: 'Sesi latihan campur belum selesai' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/\d+ dari \d+ soal sudah dijawab/);
  const resume = banner.getByRole('link', { name: 'Lanjutkan sesi' });
  const oldHref = await resume.getAttribute('href');
  expect(oldHref).toMatch(/^\/latihan\/campur\/[0-9a-f-]{36}$/);

  // Pembatalan konfirmasi: tidak ada sesi baru.
  await chooseGrammarOnly(page);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Mulai sesi baru?')).toBeVisible();
  await expect(dialog.getByText('Sesi campur yang sedang berjalan akan dihentikan', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Kembali' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/latihan\/campur$/);

  // Konfirmasi: sesi baru dibuat.
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mulai sesi baru' }).click();
  await expect(page).toHaveURL(/\/latihan\/campur\/[0-9a-f-]{36}$/);
  expect(new URL(page.url()).pathname).not.toBe(oldHref);

  // Sesi lama kini ABANDONED.
  await page.goto(oldHref!);
  await expect(page.getByRole('heading', { name: 'Sesi ini dihentikan karena Anda memulai sesi baru.' })).toBeVisible();
  const state = await page.request.get('/api/v1/mix-sessions/active');
  expect(state.ok()).toBe(true);
  const active = (await state.json()) as { data: { attempt_id: string } | null };
  expect(active.data?.attempt_id).not.toBe(oldHref!.split('/').pop());
});
