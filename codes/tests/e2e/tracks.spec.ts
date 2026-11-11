import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, signIn, unlock, type TestProfile } from './helpers/app';

// SPEC-021 Jalur Belajar. Prasyarat: dijalankan lewat tests/e2e/helpers/run-e2e.mjs (DB temp, jalur diseed,
// 3.3.3 terbit dengan varian PRACTICE_FIRST sintetis; sub-modul lain "Segera hadir").
test.describe.configure({ mode: 'serial' });

let profile: TestProfile;

test.beforeAll(async () => {
  profile = await createProfile('trk');
  unlocked = false;
});
test.afterAll(() => deleteProfile(profile));
test.beforeEach(async ({ context }) => {
  await signIn(context, profile);
});

async function setActive(page: Page, code: string) {
  const res = await page.request.put('/api/v1/me/active-track', { headers: { Origin: BASE_URL }, data: { track_code: code } });
  expect(res.status()).toBe(204);
}

function picker(page: Page) {
  return page.getByRole('region', { name: 'Pilihan Jalur Belajar' });
}
function trackCard(page: Page, title: string) {
  return picker(page).locator('[aria-pressed]').filter({ hasText: title });
}

test('pemilih jalur: lima jalur tampil, ganti jalur aktif ke GT-WRITING', async ({ page }) => {
  await page.goto('/peta');
  await expect(picker(page)).toBeVisible();
  for (const title of ['Terstruktur Tier 1-4', 'Intensif Writing GT', 'Intensif Reading GT', 'Sprint 4 Minggu', 'Fondasi Grammar (Basic ke Intermediate)']) {
    await expect(trackCard(page, title)).toBeVisible();
  }
  // Bawaan: GT-STRUCT aktif.
  await expect(trackCard(page, 'Terstruktur Tier 1-4').getByText('Jalur Utama Profil')).toBeVisible();
  await expect(picker(page).getByText('Jalur Aktif Anda:')).toContainText('Terstruktur Tier 1-4');
  // Gaya penyampaian bawaan jalur tampil sebagai chip.
  await expect(trackCard(page, 'Intensif Writing GT')).toContainText('Studi kasus');
  await expect(trackCard(page, 'Intensif Reading GT')).toContainText('Latihan dulu');

  await trackCard(page, 'Intensif Writing GT').getByRole('button', { name: 'Jadikan Jalur Aktif' }).click();
  await expect(page.getByText('Jalur belajar aktif diubah ke GT-WRITING')).toBeVisible();
  await expect(picker(page).getByText('Jalur Aktif Anda:')).toContainText('Intensif Writing GT');
  await expect(trackCard(page, 'Intensif Writing GT').getByText('Jalur Utama Profil')).toBeVisible();
  await expect(page.getByTestId('curated-list-track-view')).toBeVisible();

  // Server menyimpan pilihan: dimuat ulang tetap GT-WRITING.
  await page.reload();
  await expect(picker(page).getByText('Jalur Aktif Anda:')).toContainText('Intensif Writing GT');
  await expect(page.getByTestId('curated-list-track-view')).toBeVisible();
  const api = await page.request.get('/api/v1/tracks');
  const tracks = ((await api.json()) as { data: Array<{ code: string; is_active: boolean }> }).data;
  expect(tracks.filter((t) => t.is_active).map((t) => t.code)).toEqual(['GT-WRITING']);
});

test('tampilan jalur: daftar item GT-WRITING, "Segera hadir", dan Checkpoint belum siap', async ({ page }) => {
  await setActive(page, 'GT-WRITING');
  await page.goto('/peta');
  const list = page.getByTestId('curated-list-track-view');
  await expect(list).toBeVisible();
  // Sub-modul tanpa materi terbit diberi label "Segera Hadir" dan tidak dapat dibuka.
  const comingSoon = page.getByTestId('sub-module-item-1.1.1');
  await expect(comingSoon).toContainText('Segera Hadir');
  await expect(page.locator('a[href="/belajar/1.1.1"]')).toHaveCount(0);
  // Checkpoint pertama: belum siap, tombol nonaktif, ada alasan.
  const cp = page.getByTestId('checkpoint-card-1');
  await expect(cp).toContainText('Checkpoint 1');
  await expect(cp).toContainText('Belum Siap');
  await expect(cp).toContainText('Selesaikan semua sub-modul sebelum checkpoint');
  await expect(cp.getByRole('button', { name: 'Mulai Checkpoint' })).toBeDisabled();
  // Tiga checkpoint pada jalur ini.
  await expect(page.locator('[data-testid^="checkpoint-card-"]')).toHaveCount(3);
});

test('tampilan jalur Sprint dikelompokkan per minggu dengan label hari', async ({ page }) => {
  await setActive(page, 'GT-SPRINT-4W');
  await page.goto('/peta');
  const sprint = page.getByTestId('sprint-track-view');
  await expect(sprint).toBeVisible();
  for (const w of [1, 2, 3, 4]) await expect(sprint.getByRole('heading', { name: `Minggu ${w}` })).toBeVisible();
  await expect(sprint.getByText('Hari 1', { exact: true }).first()).toBeVisible();
  await expect(sprint.locator('[data-testid^="checkpoint-card-"]')).toHaveCount(4);
});

test('gerbang Tier tetap berlaku di setiap jalur (sub-modul Tier terkunci tetap terkunci, alasan tampil)', async ({ page }) => {
  // Profil baru: Tier 3 terkunci. 3.3.3 terbit, tetapi harus tetap terkunci di jalur mana pun.
  for (const track of ['GT-WRITING', 'GT-SPRINT-4W']) {
    await setActive(page, track);
    await page.goto('/peta');
    const item = page.getByTestId('sub-module-item-3.3.3');
    await expect(item, `item 3.3.3 pada ${track}`).toBeVisible();
    await expect(item).toContainText('Terkunci');
    // Alasan terkunci tampil + tautan ke Boss Stage, dan item bukan tautan ke pemutar.
    await expect(item.getByRole('button', { name: 'Lihat Boss Stage' })).toBeVisible();
    await expect(item.locator('p, span').filter({ hasText: /Tier|Boss|selesaikan/i }).first()).toBeVisible();
    await expect(page.locator('a[href="/belajar/3.3.3"]')).toHaveCount(0);

    // Server menolak akses langsung: 403 pada API dan layar terkunci pada URL.
    const direct = await page.request.get('/api/v1/sub-modules/3.3.3');
    expect(direct.status(), `GET /sub-modules/3.3.3 pada ${track}`).toBe(403);
    await page.goto('/belajar/3.3.3');
    await expect(page.getByText('Sub-modul ini masih terkunci')).toBeVisible();
  }
  // Mengganti jalur tidak boleh membuka gerbang Checkpoint juga: jalur tidak mengubah status kunci Tier di pohon GT-STRUCT.
  await setActive(page, 'GT-STRUCT');
  const tree = await page.request.get('/api/v1/curriculum/tree');
  expect(tree.ok()).toBe(true);
  const treeJson = JSON.stringify(await tree.json());
  expect(treeJson).toContain('"3.3.3"');
});

test('setelah Tier dibuka lewat CLI, 3.3.3 dapat dibuka dari jalur', async ({ page }) => {
  unlockOnce();
  await setActive(page, 'GT-WRITING');
  await page.goto('/peta');
  const item = page.getByTestId('sub-module-item-3.3.3');
  await expect(page.locator('a[href="/belajar/3.3.3"]')).toHaveCount(1);
  await expect(item).not.toContainText('Lihat Boss Stage');
  await item.click();
  await expect(page).toHaveURL(/\/belajar\/3\.3\.3/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

// Regresi: tabel lebar di artikel pernah melebarkan seluruh halaman pemutar di mobile (halaman 743px di layar 375px)
// karena kolom grid bawaan memakai min-content. Perbaikan: grid-cols-[minmax(0,1fr)] di sub-module-player/learn-tab.
test('pemutar sub-modul: tanpa overflow horizontal (tabel lebar digulir di dalam pembungkusnya)', async ({ page }) => {
  unlockOnce();
  await page.goto('/belajar/3.3.3');
  await expect(page.getByRole('tab', { name: /^Pelajari/ })).toBeVisible();
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  // Tab "Latihan" dapat diklik (tidak tertutup elemen lain).
  await page.getByRole('tab', { name: /^Latihan/ }).click();
  await expect(page.getByRole('tab', { name: /^Latihan/ })).toHaveAttribute('aria-selected', 'true');
});

test('gaya LEARN_FIRST (GT-STRUCT) memblokir drill sebelum belajar selesai', async ({ page }) => {
  unlockOnce();
  await setActive(page, 'GT-STRUCT');
  await page.goto('/belajar/3.3.3');
  await page.getByRole('tab', { name: /^Latihan/ }).click();
  await expect(page.getByRole('button', { name: 'Mulai Latihan' })).toBeDisabled();
  await expect(page.getByText('Selesaikan materi terlebih dahulu.')).toBeVisible();
  // Server juga menolak.
  const sm = await page.request.get('/api/v1/sub-modules/3.3.3');
  const body = (await sm.json()) as { data: { drill: { assessment_set_id: string }; delivery: { applied_style: string } } };
  expect(body.data.delivery.applied_style).toBe('LEARN_FIRST');
  const res = await page.request.post('/api/v1/attempts', { headers: { Origin: BASE_URL }, data: { assessment_set_id: body.data.drill.assessment_set_id } });
  expect(res.status()).toBe(409);
});

test('gaya PRACTICE_FIRST (GT-SPRINT-4W): server mengizinkan attempt drill sebelum belajar selesai (AC-15)', async ({ page }) => {
  unlockOnce();
  await setActive(page, 'GT-SPRINT-4W');
  const sm = await page.request.get('/api/v1/sub-modules/3.3.3');
  const body = (await sm.json()) as {
    data: { drill: { assessment_set_id: string; can_start: boolean }; delivery: { applied_style: string; available_styles: string[] }; progress: { learn_completed_at: string | null } };
  };
  expect(body.data.delivery.applied_style).toBe('PRACTICE_FIRST');
  expect(body.data.delivery.available_styles).toContain('PRACTICE_FIRST');
  expect(body.data.progress.learn_completed_at).toBeNull();

  const api = await page.request.post('/api/v1/attempts', { headers: { Origin: BASE_URL }, data: { assessment_set_id: body.data.drill.assessment_set_id } });
  expect(api.status(), await api.text()).toBeLessThan(300);
  // Penyelesaian sub-modul tetap mensyaratkan belajar: status bukan COMPLETED.
  const after = await page.request.get('/api/v1/sub-modules/3.3.3');
  const afterBody = (await after.json()) as { data: { progress: { status: string } } };
  expect(afterBody.data.progress.status).not.toBe('COMPLETED');
});

test('gaya PRACTICE_FIRST (GT-SPRINT-4W): UI mengizinkan Mulai Latihan sebelum belajar selesai', async ({ page }) => {
  unlockOnce();
  await setActive(page, 'GT-SPRINT-4W');
  await page.goto('/belajar/3.3.3');
  await page.getByRole('tab', { name: /^Latihan/ }).click();
  const start = page.getByRole('button', { name: 'Mulai Latihan' });
  await expect(start).toBeEnabled({ timeout: 3000 });
  await expect(page.getByText('Selesaikan materi terlebih dahulu.')).toHaveCount(0);
  await start.click();
  await expect(page.getByTestId('question-counter')).toHaveText(/^Soal 1 dari \d+$/);
});

let unlocked = false;
function unlockOnce() {
  if (!unlocked) {
    try {
      unlock(profile, '3.3.3');
    } catch {
      /* sudah terbuka */
    }
    unlocked = true;
  }
}
