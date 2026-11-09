import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  SUB_TITLES,
  apiGet,
  completeSub,
  createCoreProfile,
  deleteCoreProfile,
  ensureCoreContent,
  warmUpRoutes,
  getTree,
  noHorizontalOverflow,
  setLearnMin,
  shot,
  subOf,
  unlockCode,
  type CoreProfile,
} from './helpers/core';

// SPEC-003 Skill Tree & Gatekeeping (domain Inti Belajar). Dijalankan lewat tests/e2e/helpers/run-e2e.mjs.
// Konten sintetis: tests/fixtures/e2e-content/core (1.2.1/1.2.2 Tier 1; 2.1.1/2.2.x Tier 2; Tier 4 punya celah 4.2.2).
test.describe.configure({ timeout: 75_000 });

let fresh: CoreProfile; // tidak pernah menyelesaikan apa pun
let learner: CoreProfile; // dipakai tes alur penyelesaian

test.beforeAll(async () => {
  test.setTimeout(300_000);
  ensureCoreContent();
  await warmUpRoutes();
  setLearnMin(10);
  fresh = await createCoreProfile('tree-a');
  learner = await createCoreProfile('tree-b');
});
test.afterAll(() => {
  test.setTimeout(300_000);
  deleteCoreProfile(fresh);
  deleteCoreProfile(learner);
});

/** Baris sub-modul pada peta berdasarkan judulnya. */
function node(page: Page, code: string): Locator {
  return page.locator('li[data-node-id]').filter({ hasText: SUB_TITLES[code] ?? code }).first();
}
function tierSection(page: Page, n: number): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: new RegExp(`^Tier ${n}:`) }) });
}

test('profil baru: Tier 1 terbuka, sub-modul pertama terbuka, berikutnya terkunci, Tier 2-4 terkunci (API)', async ({ page, context }) => {
  await context.addCookies(fresh.cookies);
  const res = await page.request.get('/api/v1/curriculum/tree');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('no-store');
  const tiers = ((await res.json()) as { data: { tiers: Awaited<ReturnType<typeof getTree>> } }).data.tiers;
  expect(tiers.map((t) => t.tier_number)).toEqual([1, 2, 3, 4]);
  expect(tiers[0]).toMatchObject({ status: 'UNLOCKED', unlock_source: 'DEFAULT' });
  const t1 = tiers[0]!.modules.find((m) => m.module_code === '1.2')!;
  const [s121, s122] = t1.sub_modules;
  expect(s121).toMatchObject({ sub_module_code: '1.2.1', status: 'UNLOCKED', content_state: 'AVAILABLE', lock_reason: null });
  expect(s122).toMatchObject({ sub_module_code: '1.2.2', status: 'LOCKED', lock_reason: { code: 'PREVIOUS_INCOMPLETE' } });
  expect(s122!.lock_reason!.message).toBe(`Selesaikan ${s121!.title} dan capai skor latihan 75% untuk membuka.`);
  for (const t of tiers.slice(1)) {
    expect(t.status).toBe('LOCKED');
    for (const m of t.modules) {
      for (const s of m.sub_modules.filter((x) => x.content_state === 'AVAILABLE')) {
        expect(s.status, s.sub_module_code).toBe('LOCKED');
        expect(s.lock_reason?.code, s.sub_module_code).toBe('TIER_LOCKED');
      }
    }
  }
  // Sub-modul yang belum terbit: "Segera hadir" (COMING_SOON) dengan alasan NOT_PUBLISHED, modul tanpa konten ikut COMING_SOON.
  const m11 = tiers[0]!.modules.find((m) => m.module_code === '1.1')!;
  expect(m11.content_state).toBe('COMING_SOON');
  expect(m11.sub_modules[0]).toMatchObject({ content_state: 'COMING_SOON', lock_reason: { code: 'NOT_PUBLISHED', message: 'Materi ini belum tersedia. Segera hadir.' } });
});

test('peta belajar: status berlabel teks + ikon, alasan terkunci muncul di Popover, tanpa overflow horizontal', async ({ page, context }) => {
  await context.addCookies(fresh.cookies);
  await page.goto('/peta');
  await expect(page.getByRole('heading', { name: 'Peta Belajar', level: 1 })).toBeVisible();
  for (const n of [1, 2, 3, 4]) await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Tier ${n}:`) })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Peta Belajar' })).toBeVisible();

  // Tier 1: sub-modul terbuka berupa tautan dengan label "Sedang dipelajari".
  const n121 = node(page, '1.2.1');
  await expect(n121.getByRole('link')).toHaveAttribute('href', '/belajar/1.2.1');
  await expect(n121).toContainText('Sedang dipelajari');

  // Terkunci berantai: Popover menampilkan alasan Indonesia (nama predecessor + ambang 75%).
  const n122 = node(page, '1.2.2');
  await expect(n122).toContainText('Terkunci');
  await n122.getByRole('button').click();
  const pop = page.locator('[role="dialog"][data-state="open"]');
  await expect(pop).toContainText('Mengapa terkunci?');
  await expect(pop).toContainText(`Selesaikan ${SUB_TITLES['1.2.1']} dan capai skor latihan 75% untuk membuka.`);
  await page.keyboard.press('Escape');

  // Tier terkunci: alasan Boss Stage + tombol Uji Kompetensi (modul 2.1 punya set Skip terbit).
  const n211 = node(page, '2.1.1');
  await expect(n211).toContainText('Terkunci');
  await n211.getByRole('button').click();
  await expect(page.locator('[role="dialog"][data-state="open"]')).toContainText('Selesaikan Boss Stage Tier 1 atau ikuti Uji Kompetensi untuk membuka Tier ini.');
  await expect(page.locator('[role="dialog"][data-state="open"]').getByRole('button', { name: 'Uji Kompetensi' })).toBeVisible();
  await page.keyboard.press('Escape');

  // "Segera hadir": tidak dapat diklik (bukan tautan/tombol), modul tanpa konten diberi label yang sama.
  const comingSoon = node(page, '1.2.2').locator('xpath=ancestor::li[contains(@class,"rounded-lg")][1]');
  await expect(comingSoon).toBeVisible();
  const m11 = page.locator('li').filter({ has: page.getByText('Modul 1.1', { exact: true }) }).first();
  await expect(m11).toContainText('Segera hadir');
  await expect(page.locator('a[href^="/belajar/1.1."]')).toHaveCount(0);
  await expect(page.locator('li[data-node-id]').filter({ hasText: SUB_TITLES['1.2.2'] }).locator('a')).toHaveCount(0);

  // Tidak ada overflow horizontal; di desktop konten tidak tertutup sidebar.
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
  await shot(page, `tree-fresh-${test.info().project.name}`);
});

test('header Tier: Boss Stage nonaktif beralasan; Uji Kompetensi hanya pada Tier yang punya set Skip terbit', async ({ page, context }) => {
  await context.addCookies(fresh.cookies);
  await page.goto('/peta');
  // Tier 1 terbuka tetapi modulnya belum selesai: alasan MODULES_INCOMPLETE (atau Boss belum terbit di DB ini).
  const t1Boss = tierSection(page, 1).getByRole('button', { name: /Boss Stage/ });
  await expect(t1Boss).toBeDisabled();
  await expect(t1Boss).toContainText(/Selesaikan semua modul di Tier ini untuk membuka Boss Stage\.|Boss Stage belum tersedia\. Segera hadir\./);
  // Tier 4 terkunci walau Boss terbit: urutan prioritas alasan = TIER_LOCKED.
  const t4Boss = tierSection(page, 4).getByRole('button', { name: /Boss Stage/ });
  await expect(t4Boss).toBeDisabled();
  await expect(t4Boss).toContainText('Tier ini masih terkunci.');
  // Tooltip dapat dibuka dengan fokus keyboard pada pembungkus.
  await tierSection(page, 4).locator('span[tabindex="0"]').first().focus();
  await expect(page.getByRole('tooltip')).toContainText('Tier ini masih terkunci.');
  await page.keyboard.press('Escape');

  // Uji Kompetensi Tier 3 (set Skip Tier terbit) dan Modul 2.1 (set Skip Modul terbit); Tier 1 tidak punya.
  await expect(tierSection(page, 3).getByRole('button', { name: 'Uji Kompetensi' }).first()).toBeVisible();
  await expect(tierSection(page, 1).getByRole('button', { name: 'Uji Kompetensi' })).toHaveCount(0);
  const mod21 = page.locator('li').filter({ has: page.getByText('Modul 2.1', { exact: true }) }).first();
  await expect(mod21.getByRole('button', { name: 'Uji Kompetensi' })).toBeVisible();
});

test('modul dapat dilipat (aria-expanded)', async ({ page, context }) => {
  await context.addCookies(fresh.cookies);
  await page.goto('/peta');
  const toggle = page.getByRole('button', { name: /Modul 1\.2/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(node(page, '1.2.1')).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(node(page, '1.2.1')).toBeHidden();
  await toggle.click();
  await expect(node(page, '1.2.1')).toBeVisible();
});

test('akses langsung: sub-modul terkunci 403 tanpa materi, belum terbit 404, kode tak dikenal 404, format salah 400', async ({ page, context }) => {
  await context.addCookies(fresh.cookies);
  // API
  const locked = await apiGet<{ error: { code: string; details: Array<{ code: string; message: string }> } }>(page, '/api/v1/sub-modules/2.2.1');
  expect(locked.status).toBe(403);
  expect(locked.body.error.code).toBe('LOCKED_CONTENT');
  expect(locked.body.error.details[0]).toMatchObject({ code: 'TIER_LOCKED' });
  const raw = JSON.stringify(locked.body);
  expect(raw).not.toContain('article_markdown');
  expect(raw).not.toContain('ai_rubric_criteria');
  const chained = await apiGet<{ error: { code: string; details: Array<{ code: string }> } }>(page, '/api/v1/sub-modules/1.2.2');
  expect(chained.status).toBe(403);
  expect(chained.body.error.details[0]!.code).toBe('PREVIOUS_INCOMPLETE');
  expect((await apiGet(page, '/api/v1/sub-modules/1.1.1')).status).toBe(404); // DRAFT
  expect((await apiGet(page, '/api/v1/sub-modules/9.9.9')).status).toBe(404);
  expect((await apiGet(page, '/api/v1/sub-modules/abc')).status).toBe(400);
  // UI
  await page.goto('/belajar/1.2.2');
  await expect(page.getByRole('heading', { name: 'Sub-modul ini masih terkunci' })).toBeVisible();
  await expect(page.getByText('Selesaikan sub-modul sebelumnya terlebih dahulu.')).toBeVisible();
  await page.getByRole('link', { name: 'Kembali ke Peta' }).click();
  await expect(page).toHaveURL(/\/peta$/);
  await page.goto('/belajar/2.2.1');
  await expect(page.getByText('Tier ini masih terkunci.')).toBeVisible();
  await page.goto('/belajar/9.9.9');
  await expect(page.getByRole('heading', { name: 'Sub-modul tidak ditemukan' })).toBeVisible();
  await page.goto('/belajar/1.1.1');
  await expect(page.getByRole('heading', { name: 'Sub-modul tidak ditemukan' })).toBeVisible();
});

test('lulus drill membuka sub-modul berikutnya (peta: Selesai + Sedang dipelajari), progres Modul/Tier naik', async ({ page, context }) => {
  await context.addCookies(learner.cookies);
  const before = await subOf(page, '1.2.1');
  expect(before.status).toBe('UNLOCKED');
  const result = await completeSub(page, '1.2.1');
  expect(result.attempt.passed).toBe(true);
  expect(result.progress.status).toBe('COMPLETED');
  // Catatan: label berupa judul saja; contoh spec SPEC-003 menulis "2.1.4 Conditional Sentences" (awalan kode). Lihat laporan (Minor).
  expect(result.progress.unlocked.map((u: { label: string }) => u.label)).toEqual([SUB_TITLES['1.2.2']]);

  await page.goto('/peta');
  await expect(node(page, '1.2.1')).toContainText('Selesai');
  await expect(node(page, '1.2.2')).toContainText('Sedang dipelajari');
  await expect(node(page, '1.2.2').getByRole('link')).toHaveAttribute('href', '/belajar/1.2.2');
  const sub = await subOf(page, '1.2.1');
  expect(sub).toMatchObject({ status: 'COMPLETED', progress_percent: 100 });
  expect(sub.module.progress_percent).toBe(50); // 1 dari 2 sub-modul AVAILABLE
  expect(sub.tier.status).toBe('IN_PROGRESS');

  await completeSub(page, '1.2.2');
  const after = await subOf(page, '1.2.2');
  expect(after.module.status).toBe('COMPLETED');
  expect(after.module.progress_percent).toBe(100);
  await page.reload();
  // Modul selesai terlipat secara bawaan dan berlabel "Selesai".
  await expect(page.getByRole('button', { name: /Modul 1\.2/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('li').filter({ has: page.getByText('Modul 1.2', { exact: true }) }).first()).toContainText('Selesai');
});

test('rantai melewati sub-modul yang belum terbit; Boss Stage terbuka setelah semua modul Tier selesai', async ({ page, context }) => {
  const prof = await createCoreProfile('tree-c');
  try {
    await context.addCookies(prof.cookies);
    unlockCode(prof, '4');
    let t4 = (await getTree(page)).find((t) => t.tier_number === 4)!;
    expect(t4.status).toBe('UNLOCKED');
    const m42 = t4.modules.find((m) => m.module_code === '4.2')!;
    expect(m42.sub_modules.find((s) => s.sub_module_code === '4.2.1')!.status).toBe('UNLOCKED');
    expect(m42.sub_modules.find((s) => s.sub_module_code === '4.2.2')).toMatchObject({ content_state: 'COMING_SOON', status: 'LOCKED' });
    expect(t4.boss).toMatchObject({ available: false, blocked_reason: 'MODULES_INCOMPLETE' });

    await completeSub(page, '4.2.1');
    t4 = (await getTree(page)).find((t) => t.tier_number === 4)!;
    // 4.2.2 belum terbit -> predecessor 4.3.1 adalah 4.2.1 (rantai melewati yang tidak AVAILABLE).
    expect(t4.modules.find((m) => m.module_code === '4.3')!.sub_modules[0]).toMatchObject({ sub_module_code: '4.3.1', status: 'UNLOCKED' });
    expect(t4.boss.blocked_reason).toBe('MODULES_INCOMPLETE');

    await completeSub(page, '4.3.1');
    t4 = (await getTree(page)).find((t) => t.tier_number === 4)!;
    expect(t4.boss.available).toBe(true);
    expect(t4.boss.assessment_set_id).toBeTruthy();
    await page.goto('/peta');
    const boss = tierSection(page, 4).getByRole('link', { name: /Boss Stage/ });
    await expect(boss).toHaveAttribute('href', `/ujian/mulai/${t4.boss.assessment_set_id}`);
    // Status Tier tidak pernah turun/naik sendiri tanpa lulus Boss.
    expect(t4.status).not.toBe('COMPLETED');
  } finally {
    deleteCoreProfile(prof);
  }
});

test('Uji Kompetensi dari peta: Dialog konfirmasi lalu layar pra-ujian', async ({ page, context }) => {
  await context.addCookies(fresh.cookies);
  await page.goto('/peta');
  const t3 = tierSection(page, 3);
  await t3.getByRole('button', { name: 'Uji Kompetensi' }).first().click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Ikut Uji Kompetensi?');
  await expect(dlg).toContainText('Skor minimal 85% membuka level ini tanpa materi');
  await dlg.getByRole('button', { name: 'Batal' }).click();
  await expect(dlg).toBeHidden();
  await t3.getByRole('button', { name: 'Uji Kompetensi' }).first().click();
  await page.getByRole('link', { name: 'Lanjut ke Halaman Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/mulai\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tier 3');
});
