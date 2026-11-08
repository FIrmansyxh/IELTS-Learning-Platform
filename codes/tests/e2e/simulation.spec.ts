import { expect, test, type Page } from '@playwright/test';
import { createProfile, deleteProfile, signIn, type TestProfile } from './helpers/app';

// SPEC-023 Simulasi Tes. Prasyarat: dijalankan lewat tests/e2e/helpers/run-e2e.mjs. Bank awal hanya memuat
// Writing + Speaking yang cukup; Listening (10 soal, 1 bagian) dan Reading (16 soal) belum mencapai 40 soal,
// jadi keduanya harus tampil tidak tersedia (CONTENT_MISSING).
test.describe.configure({ mode: 'serial' });

const DISCLAIMER = 'Perkiraan latihan, bukan skor resmi IELTS.';
const WORDS = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

let profile: TestProfile;
let attemptId = '';

test.beforeAll(async () => {
  profile = await createProfile('sim');
});
test.afterAll(() => deleteProfile(profile));
test.beforeEach(async ({ context, page }) => {
  await signIn(context, profile);
  page.on('dialog', (d) => void d.accept()); // confirm() "Selesai dan Kirim ..."
});

function sectionCard(page: Page, name: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${name}$`) }) });
}

test('pemilihan section: Listening/Reading tidak tersedia (CONTENT_MISSING), Writing/Speaking tersedia', async ({ page }) => {
  await page.goto('/simulasi');
  await expect(page.getByRole('heading', { name: 'Simulasi Tes IELTS General Training', level: 1 })).toBeVisible();
  await expect(page.getByText(DISCLAIMER).first()).toBeVisible();

  // Kontrak server: alasan tak tersedia = CONTENT_MISSING.
  const res = await page.request.get('/api/v1/simulations/options');
  expect(res.ok()).toBe(true);
  const opts = ((await res.json()) as { data: { sections: Array<{ section: string; available: boolean; unavailable_reason: string | null }> } }).data.sections;
  const by = Object.fromEntries(opts.map((s) => [s.section, s]));
  expect(by.LISTENING).toMatchObject({ available: false, unavailable_reason: 'CONTENT_MISSING' });
  expect(by.READING).toMatchObject({ available: false, unavailable_reason: 'CONTENT_MISSING' });
  expect(by.WRITING).toMatchObject({ available: true, unavailable_reason: null });
  expect(by.SPEAKING).toMatchObject({ available: true, unavailable_reason: null });

  // UI: pesan alasan tampil pada kartu yang tidak tersedia, kartu ditandai tidak dapat dipilih.
  await expect(sectionCard(page, 'Listening')).toContainText('Listening membutuhkan 4 bagian beraudio dengan total 40 soal.');
  await expect(sectionCard(page, 'Reading')).toContainText('Reading membutuhkan 3 teks dengan total 40 soal.');
  await expect(sectionCard(page, 'Writing')).not.toContainText('membutuhkan');
  await expect(sectionCard(page, 'Speaking')).not.toContainText('membutuhkan');

  // Menekan kartu yang tidak tersedia tidak memilihnya: tetap tersedia hanya Writing (bawaan) dan tombol mulai aktif.
  await sectionCard(page, 'Listening').click();
  await sectionCard(page, 'Reading').click();
  await expect(page.getByRole('button', { name: 'Mulai Simulasi' })).toBeEnabled();
  // Preset "Lengkap" hanya memilih yang tersedia: total waktu = Writing 60 menit (Speaking mandiri).
  await page.getByRole('button', { name: 'Lengkap (4 Section)' }).click();
  await expect(page.getByText('60 menit', { exact: true })).toBeVisible();
});

test('mode ujian tenang: chip streak/poin tidak tampil di /simulasi (tetap tampil di beranda)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('header-chips')).toBeVisible();
  await page.goto('/simulasi');
  await expect(page.getByRole('heading', { name: 'Simulasi Tes IELTS General Training', level: 1 })).toBeVisible();
  await expect(page.getByTestId('header-chips')).toHaveCount(0);
  await expect(page.getByTestId('chip-streak')).toHaveCount(0);
  await expect(page.getByTestId('chip-points')).toHaveCount(0);
  await expect(page.getByTestId('header-chips-loading')).toHaveCount(0);
});

test('mulai simulasi 2 section (Writing + Speaking) dan kerjakan Writing', async ({ page }) => {
  await page.goto('/simulasi');
  await expect(sectionCard(page, 'Speaking')).toBeVisible();
  await sectionCard(page, 'Speaking').click(); // Writing terpilih bawaan; tambah Speaking
  await page.getByRole('button', { name: 'Mulai Simulasi' }).click();
  await expect(page).toHaveURL(/\/simulasi\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  attemptId = page.url().split('/').pop()!;

  // Mode ujian tenang di runner: lencana, disclaimer, tanpa chip gamifikasi.
  await expect(page.getByText('Mode Ujian Tenang')).toBeVisible();
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Section 1 dari 2: Writing');
  await expect(page.getByTestId('header-chips')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mulai Writing' }).click();
  await expect(page.getByRole('button', { name: 'Task 1 (Surat)' })).toBeVisible();
  const editor = page.getByPlaceholder('Tuliskan jawaban esai Anda di sini...');
  await editor.fill(WORDS(160));
  await page.getByRole('button', { name: 'Kirim Task Ini' }).click();
  await expect(page.getByText('Terkirim untuk dinilai')).toBeVisible();
  await page.getByRole('button', { name: 'Task 2 (Esai)' }).click();
  await editor.fill(WORDS(260));
  await page.getByRole('button', { name: 'Kirim Task Ini' }).click();
  await expect(page.getByText('Terkirim untuk dinilai')).toBeVisible();

  await page.getByRole('button', { name: 'Selesai dan Kirim Writing' }).click();
  // Pindah ke section 2: Speaking.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Section 2 dari 2: Speaking');
});

test('kerjakan Speaking (skor eksternal per part): section Speaking GRADED', async ({ page }) => {
  await page.goto(`/simulasi/${attemptId}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Section 2 dari 2: Speaking');
  await page.getByRole('button', { name: 'Mulai Speaking' }).click();
  for (const part of [1, 2, 3]) {
    await page.getByRole('button', { name: new RegExp(`^Part ${part}`) }).click();
    await expect(page.getByText(`Prompt Part ${part}`)).toBeVisible();
    await page.getByRole('button', { name: `Simpan Skor Part ${part}` }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^Part ${part} ✓`) })).toBeVisible();
  }
  // Server: setelah tiga part tersimpan, section Speaking GRADED (skor eksternal), Writing menunggu penilaian AI
  // (AI dimatikan di stack E2E, jadi tetap AWAITING_GRADING).
  const st = await page.request.get(`/api/v1/simulations/${attemptId}`);
  const sections = ((await st.json()) as { data: { sections: Array<{ section: string; status: string }> } }).data.sections;
  expect(sections.find((x) => x.section === 'SPEAKING')?.status).toBe('GRADED');
  expect(sections.find((x) => x.section === 'WRITING')?.status).toBe('AWAITING_GRADING');
});

test('halaman hasil: disclaimer persis, Overall parsial, tanpa chip gamifikasi', async ({ page }) => {
  await page.goto(`/simulasi/${attemptId}/hasil`);
  await expect(page.getByRole('heading', { name: 'Hasil Simulasi Tes', level: 1 })).toBeVisible();
  // Disclaimer wajib muncul di atas dan di bawah, dengan teks persis.
  const disclaimers = page.getByText(DISCLAIMER, { exact: true });
  await expect(disclaimers).toHaveCount(2);
  await expect(disclaimers.first()).toBeVisible();
  await expect(disclaimers.last()).toBeVisible();
  // Overall parsial (2 dari 4 section), tidak pernah band Overall lengkap.
  await expect(page.getByText('Overall parsial: dipilih 2 dari 4 section')).toBeVisible();
  await expect(page.getByText('Perkiraan Sementara: Band 6.0')).toBeVisible();
  await expect(page.getByText('IELTS General Training Simulation')).toContainText('2 Section Terpilih');
  // Kartu per section: Speaking dinilai (Band 6.0), Writing masih menunggu penilaian.
  await expect(page.getByText('Band 6.0', { exact: true })).toBeVisible();
  await expect(page.getByText('P1: Band 6.0')).toBeVisible();
  await expect(page.getByText('Menilai...')).toBeVisible();
  await expect(page.getByTestId('header-chips')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Simulasi Baru' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke Beranda' })).toBeVisible();
});

test('simulasi berjalan: banner di layar pemilihan, lanjutkan atau tinggalkan', async ({ page }) => {
  await page.goto('/simulasi');
  await expect(page.getByText('Ada Simulasi yang Sedang Berjalan')).toHaveCount(0);
  await page.getByRole('button', { name: 'Writing saja' }).click();
  await page.getByRole('button', { name: 'Mulai Simulasi' }).click();
  await expect(page).toHaveURL(/\/simulasi\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const secondId = page.url().split('/').pop()!;
  expect(secondId).not.toBe(attemptId);

  await page.goto('/simulasi');
  await expect(page.getByText('Ada Simulasi yang Sedang Berjalan')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lanjutkan Simulasi' })).toHaveAttribute('href', `/simulasi/${secondId}`);
  await page.getByRole('button', { name: 'Tinggalkan Simulasi' }).click();
  await expect(page.getByText('Ada Simulasi yang Sedang Berjalan')).toHaveCount(0);
});
