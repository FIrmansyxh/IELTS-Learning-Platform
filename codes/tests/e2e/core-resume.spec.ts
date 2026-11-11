import { expect, test, type Page } from '@playwright/test';
import {
  SUB_TITLES,
  VIDEO_ID,
  apiGet,
  completeSub,
  createCoreProfile,
  currentPrompt,
  deleteCoreProfile,
  ensureCoreContent,
  warmUpRoutes,
  learnFast,
  noHorizontalOverflow,
  setLearnMin,
  shot,
  stubYouTube,
  uiAnswer,
  uiCheck,
  uiNext,
  unlockCode,
  type CoreProfile,
} from './helpers/core';

// SPEC-007 Lanjutkan Belajar / posisi terakhir (domain Inti Belajar).
test.describe.configure({ timeout: 75_000 });
const profiles: CoreProfile[] = [];
const mk = async (tag: string) => {
  const p = await createCoreProfile(tag);
  profiles.push(p);
  return p;
};
test.beforeAll(async () => {
  test.setTimeout(300_000);
  ensureCoreContent();
  await warmUpRoutes();
  setLearnMin(10);
});
test.afterAll(() => {
  test.setTimeout(300_000);
  for (const p of profiles) deleteCoreProfile(p);
});

interface Card {
  state: 'RESUME' | 'FALLBACK_NEXT';
  sub_module: { sub_module_code: string; title: string };
  breadcrumb: { tier_label: string; module_title: string };
  active_tab: string;
  active_learn_subtab: string | null;
  video_progress_sec: number;
  last_question_index: number | null;
  question_count: number | null;
  position_label: string;
  progress_percent: number;
  resume_path: string;
  change_path: string;
}
async function lastLearned(page: Page): Promise<Card | null> {
  const r = await apiGet<{ data: Card | null }>(page, '/api/v1/me/last-learned');
  expect(r.status).toBe(200);
  return r.body.data;
}
/** Tunggu sampai posisi tersimpan di server berlabel `label` (perekam posisi mengirim dengan jeda). */
async function expectLabel(page: Page, label: string): Promise<void> {
  await expect.poll(async () => (await lastLearned(page))?.position_label, { timeout: 25_000, intervals: [500, 1000] }).toBe(label);
}
const cardCta = (page: Page) => page.getByTestId('resume-card').getByRole('link', { name: /^Lanjutkan Belajar:/ });

test('pengguna baru: kartu "Berikutnya untuk Anda" paling atas, satu CTA primer, a11y, satu klik membuka sub-modul', async ({ page, context }) => {
  const p = await mk('rsm-n');
  await context.addCookies(p.cookies);
  const api = await lastLearned(page);
  expect(api).toMatchObject({
    state: 'FALLBACK_NEXT',
    active_tab: 'LEARN',
    position_label: 'Sub-modul berikutnya',
    resume_path: '/belajar/1.4.1?tab=pelajari',
    change_path: '/peta',
  });
  expect(api!.sub_module.sub_module_code).toBe('1.4.1');

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Halo, ${p.name}`);
  const card = page.getByTestId('resume-card');
  await expect(card).toBeVisible();
  await expect(card.getByText('Berikutnya untuk Anda')).toBeVisible();
  await expect(card.getByRole('heading', { level: 2 })).toHaveText(SUB_TITLES['1.4.1']!);
  await expect(card).toContainText('Tier 1 > Survival Vocabulary & Pronunciation');
  await expect(card).toContainText('Sub-modul berikutnya');
  // Progress dengan nilai terbaca pembaca layar; tombol bernama "Lanjutkan Belajar: {judul}".
  const bar = card.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuenow', /^\d+$/);
  const cta = cardCta(page);
  await expect(cta).toHaveAttribute('aria-label', `Lanjutkan Belajar: ${SUB_TITLES['1.4.1']}`);
  await expect(cta).toHaveAttribute('href', '/belajar/1.4.1?tab=pelajari');
  await expect(card.getByRole('link', { name: 'Ganti sub-modul' })).toHaveAttribute('href', '/peta');
  // Satu-satunya CTA "Lanjutkan Belajar" di layar; kartu berada di atas slot lain (statistik/radar).
  await expect(page.getByRole('link', { name: /Lanjutkan Belajar/ })).toHaveCount(1);
  const cardBox = (await card.boundingBox())!;
  const slots = (await page.locator('#dashboard-slots').boundingBox())!;
  expect(cardBox.y).toBeLessThanOrEqual(slots.y + 1);
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
  await shot(page, `resume-fallback-${test.info().project.name}`);

  const t0 = Date.now();
  await cta.click();
  await expect(page).toHaveURL(/\/belajar\/1\.2\.1\?tab=pelajari$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SUB_TITLES['1.4.1']!);
  expect(Date.now() - t0, 'satu klik sampai halaman sub-modul < 10 detik').toBeLessThan(10_000);

  // Setelah sub-modul dibuka, posisi terakhir tersimpan: kartu menjadi "Lanjutkan Belajar" (RESUME).
  await expectLabel(page, 'Tab Pelajari - Artikel');
  await page.goto('/');
  await expect(page.getByTestId('resume-card').locator('p').filter({ hasText: /^Lanjutkan Belajar$/ })).toBeVisible();
  await expect(page.getByTestId('resume-card')).toContainText('Tab Pelajari - Artikel');
});

test('menonton video lalu kembali ke beranda: "Video mm:ss" dan Lanjutkan Belajar membuka video di detik tersimpan (< 10 detik)', async ({ page, context }) => {
  const p = await mk('rsm-v');
  await context.addCookies(p.cookies);
  await stubYouTube(page);
  await page.goto('/belajar/1.4.1?tab=pelajari&sub=video');
  await expect(page.locator('iframe[data-stub]')).toBeVisible();
  // Pemutar dalam keadaan PLAYING pada detik 22 lalu dijeda (stub mengendalikan getCurrentTime).
  await page.evaluate(() => {
    const w = window as unknown as { __yt: { time: number }; __ytState: (s: number) => void };
    w.__yt.time = 22;
    w.__ytState(1);
  });
  await page.waitForTimeout(6_000); // pelaporan berkala tiap 5 detik saat PLAYING
  await page.evaluate(() => {
    const w = window as unknown as { __yt: { time: number }; __ytState: (s: number) => void };
    w.__yt.time = 24;
    w.__ytState(2);
  });
  await expectLabel(page, 'Video 00:24');
  const saved = await lastLearned(page);
  expect(saved).toMatchObject({
    state: 'RESUME',
    active_tab: 'LEARN',
    active_learn_subtab: 'VIDEO',
    video_progress_sec: 24,
    resume_path: '/belajar/1.4.1?tab=pelajari&sub=video&t=24',
  });

  // "Tutup tab" (pindah ke beranda) lalu satu klik.
  await page.goto('/');
  const card = page.getByTestId('resume-card');
  await expect(card.locator('p').filter({ hasText: /^Lanjutkan Belajar$/ })).toBeVisible();
  await expect(card).toContainText('Video 00:24');
  const t0 = Date.now();
  await cardCta(page).click();
  await expect(page).toHaveURL(/\/belajar\/1\.2\.1\?tab=pelajari&sub=video&t=24$/);
  await expect(page.locator('iframe[data-stub]')).toBeVisible();
  const elapsed = Date.now() - t0;
  const start = await page.evaluate(() => (window as unknown as { __yt: { players: Array<{ playerVars: { start: number } }> } }).__yt.players.at(-1)!.playerVars.start);
  expect(Math.abs(start - 24), 'posisi pemutar dalam 3 detik dari posisi tersimpan').toBeLessThanOrEqual(3);
  expect(elapsed, 'dari klik sampai video siap diputar < 10 detik').toBeLessThan(10_000);
  expect(VIDEO_ID).toHaveLength(11);
});

test('keluar di soal ke-4 drill (10 soal): "Tab Latihan - Soal 4 dari 10" dan Lanjutkan Belajar membuka soal ke-4 dengan jawaban 1-3 tersimpan', async ({ page, context }) => {
  const p = await mk('rsm-d');
  await context.addCookies(p.cookies);
  unlockCode(p, '2.2.1');
  await learnFast(page, '2.2.1');
  await page.goto('/belajar/2.2.1?tab=latihan');
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 10');
  const attemptId = /attempt=([0-9a-f-]{36})/.exec(page.url())![1]!;
  const fourthPrompts: string[] = [];
  for (let i = 0; i < 3; i++) {
    await uiAnswer(page, 'right');
    await uiCheck(page);
    await uiNext(page);
  }
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 4 dari 10');
  fourthPrompts.push(await currentPrompt(page));
  await expectLabel(page, 'Tab Latihan - Soal 4 dari 10');
  const saved = await lastLearned(page);
  expect(saved).toMatchObject({ state: 'RESUME', active_tab: 'DRILL', last_question_index: 3, question_count: 10 });
  expect(saved!.resume_path).toBe(`/belajar/2.2.1?tab=latihan&q=3&attempt=${attemptId}`);

  await page.goto('/');
  await expect(page.getByTestId('resume-card')).toContainText('Tab Latihan - Soal 4 dari 10');
  await cardCta(page).click();
  await expect(page).toHaveURL(new RegExp(`/belajar/2\\.2\\.1\\?tab=latihan&q=3&attempt=${attemptId}`));
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 4 dari 10');
  expect(await currentPrompt(page)).toBe(fourthPrompts[0]);
  const att = await apiGet<{ data: { answered_count: number; current_index: number } }>(page, `/api/v1/attempts/${attemptId}`);
  expect(att.body.data).toMatchObject({ answered_count: 3, current_index: 3 });
  await shot(page, `resume-drill-q4-${test.info().project.name}`);
});

test('label posisi: Slide dan Terapkan; sub-tab Slide menyimpan sub=slide', async ({ page, context }) => {
  const p = await mk('rsm-s');
  await context.addCookies(p.cookies);
  await page.goto('/belajar/1.4.1?tab=pelajari&sub=slide');
  await expect(page.getByRole('region', { name: 'Slide materi' })).toBeVisible();
  await expectLabel(page, 'Tab Pelajari - Slide');
  expect((await lastLearned(page))!.resume_path).toBe('/belajar/1.4.1?tab=pelajari&sub=slide');
  await page.getByRole('tab', { name: /^Terapkan/ }).click();
  await expectLabel(page, 'Tab Terapkan');
  expect((await lastLearned(page))!.resume_path).toBe('/belajar/1.4.1?tab=terapkan');
  await page.goto('/');
  await expect(page.getByTestId('resume-card')).toContainText('Tab Terapkan');
  await cardCta(page).click();
  await expect(page).toHaveURL(/\/belajar\/1\.2\.1\?tab=terapkan$/);
  await expect(page.getByRole('tab', { name: /^Terapkan/ })).toHaveAttribute('aria-selected', 'true');
});

test('sub-modul tersimpan sudah selesai -> kartu berpindah ke sub-modul berikutnya; semua selesai -> keadaan kosong "Mulai dari Tier 1"', async ({ page, context }) => {
  const p = await mk('rsm-f');
  await context.addCookies(p.cookies);
  await page.goto('/belajar/1.4.1');
  await expectLabel(page, 'Tab Pelajari - Artikel');
  await completeSub(page, '1.4.1');
  // Sub-modul tersimpan kini COMPLETED -> FALLBACK_NEXT ke 1.4.2 (tab fallback: materi belum selesai = Pelajari).
  const next = await lastLearned(page);
  expect(next).toMatchObject({ state: 'FALLBACK_NEXT', active_tab: 'LEARN', resume_path: '/belajar/1.4.2?tab=pelajari' });
  expect(next!.sub_module.sub_module_code).toBe('1.4.2');
  await page.goto('/');
  await expect(page.getByTestId('resume-card').getByText('Berikutnya untuk Anda')).toBeVisible();
  await expect(page.getByTestId('resume-card').getByRole('heading', { level: 2 })).toHaveText(SUB_TITLES['1.4.2']!);

  // Materi 1.4.2 selesai tetapi drill belum: tab fallback = Latihan.
  await learnFast(page, '1.4.2');
  expect(await lastLearned(page)).toMatchObject({ state: 'FALLBACK_NEXT', active_tab: 'DRILL', resume_path: '/belajar/1.4.2?tab=latihan' });

  // Semua sub-modul yang terbuka selesai -> tidak ada kandidat: data null dan keadaan kosong.
  await completeSub(page, '1.4.2');
  expect(await lastLearned(page)).toBeNull();
  await page.goto('/');
  const empty = page.getByTestId('resume-empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('heading', { level: 2 })).toHaveText('Mulai perjalanan Anda');
  const start = empty.getByRole('link', { name: 'Mulai dari Tier 1' });
  await expect(start).toHaveAttribute('href', '/peta');
  await expect(page.getByTestId('resume-card')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Lanjutkan Belajar/ })).toHaveCount(0);
  // Tombol Placement hanya tampil bila layanan placement mengatakan tersedia.
  const placement = await apiGet<{ data: { available: boolean } }>(page, '/api/v1/placement');
  expect(placement.status).toBe(200);
  await expect(empty.getByRole('link', { name: 'Ikut Placement Test' })).toHaveCount(placement.body.data.available ? 1 : 0);
  // Tepat satu tombol primer pada kartu kosong (Placement berupa tombol sekunder/outline).
  expect(await empty.locator('a[data-variant="default"]').count()).toBe(1);
  await shot(page, `resume-empty-${test.info().project.name}`);
});

test('keadaan kosong untuk pengguna baru (respons last-learned null): hanya satu tombol primer, Placement tersembunyi bila tidak tersedia', async ({ page, context }) => {
  const p = await mk('rsm-e');
  await context.addCookies(p.cookies);
  await page.route('**/api/v1/me/last-learned', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) }));
  await page.route('**/api/v1/placement', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { available: false, blocked_reason: 'NO_PLACEMENT_PUBLISHED', assessment_set_id: null, question_count: 0, time_limit_seconds: 0, completed_at: null, active_attempt_id: null, pending_result: null } }) }));
  await page.goto('/');
  const empty = page.getByTestId('resume-empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('link')).toHaveCount(1);
  await expect(empty.getByRole('link', { name: 'Mulai dari Tier 1' })).toHaveAttribute('href', '/peta');
  await expect(empty.getByRole('link', { name: 'Ikut Placement Test' })).toHaveCount(0);
});
