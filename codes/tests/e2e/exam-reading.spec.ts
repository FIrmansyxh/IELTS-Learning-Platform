import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, signIn, type TestProfile } from './helpers/app';
import { answerVisible, confirmEnd, ensureExamContent, examIds, expectNoHorizontalScroll, keyFor, type ExamIds } from './helpers/exams';

// SPEC-010 Reading split-screen + penyorot (ujian Skip Modul 1.5 = Reading 2 teks, 6 soal; paket sintetis).
// Dijalankan lewat tests/e2e/helpers/run-e2e.mjs. Desktop: panel terbelah; mobile 375px: tab "Teks | Soal".
// Tes saling independen (profil + attempt dibagi lewat state modul); kegagalan satu tes tidak membatalkan yang lain.

let profile: TestProfile;
let ids: ExamIds;
let attemptUrl = '';

// Server dev kompilasi rute sesuai-permintaan dan mesin bisa sedang sibuk: beri batas waktu longgar per tes.
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  test.setTimeout(240_000); // impor konten + pemanasan rute dev (kompilasi dingin)
  await ensureExamContent();
  profile = await createProfile('read');
});
test.afterAll(() => deleteProfile(profile));
test.beforeEach(async ({ context, page }) => {
  await signIn(context, profile);
  page.on('dialog', (d) => void d.accept()); // beforeunload / confirm
});

const para = (page: Page, label: string) => page.locator(`[data-paragraph-index]:has([aria-label="Paragraf ${label}"])`);

/** Seleksi teks nyata (Range/Selection) di dalam satu paragraf lalu picu mouseup seperti pengguna melepas tombol. */
async function selectIn(page: Page, label: string, text: string) {
  await page.evaluate(
    ({ label, text }) => {
      const row = document.querySelector(`[aria-label="Paragraf ${label}"]`)!.parentElement!;
      const p = row.querySelector('p')!;
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) {
        const i = (n as Text).data.indexOf(text);
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + text.length);
          const s = window.getSelection()!;
          s.removeAllRanges();
          s.addRange(r);
          break;
        }
      }
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    { label, text },
  );
}

async function openAttempt(page: Page) {
  if (!attemptUrl) {
    ids = await examIds(page.request);
    await page.goto(`/ujian/mulai/${ids.skipReading}`);
    await page.getByRole('button', { name: /^(Mulai|Lanjutkan) Ujian$/ }).click();
    await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    attemptUrl = new URL(page.url()).pathname;
  } else {
    await page.goto(attemptUrl);
  }
  await expect(page.getByTestId('question-counter')).toBeVisible();
}
const attemptId = () => attemptUrl.split('/').pop()!;
const lsGet = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test('intro ujian lalu mulai: ujian EXAM berjalan dengan teks, soal, header timer dan tombol Akhiri', async ({ page }) => {
  ids = await examIds(page.request);
  await page.goto(`/ujian/mulai/${ids.skipReading}`);
  await expect(page.getByRole('heading', { name: 'E2E Skip Modul 1.5 (Reading, 2 teks)' })).toBeVisible();
  await expect(page.getByText('6 soal - 10 menit')).toBeVisible();
  await page.getByRole('button', { name: 'Mulai Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  attemptUrl = new URL(page.url()).pathname;
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 6');
  await expect(page.getByRole('heading', { name: 'The Saturday Market' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Akhiri' })).toBeVisible();
  // Mode EXAM: tanpa panel umpan balik/pembahasan.
  await expect(page.getByRole('button', { name: 'Periksa' })).toHaveCount(0);
});

test('tata letak desktop: tepat dua area overflow-y:auto, tanpa scroll halaman, rasio awal 50', async ({ page, isMobile }) => {
  test.skip(isMobile, 'AC khusus viewport desktop 1280x800');
  await openAttempt(page);
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '50');
  const m = await page.evaluate(() => ({
    auto: [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight >= 0 && e.getBoundingClientRect().height > 100).length,
    sh: document.scrollingElement!.scrollHeight,
    ih: window.innerHeight,
  }));
  expect(m.auto, 'jumlah elemen overflow-y:auto').toBe(2);
  expect(m.sh, `scrollHeight ${m.sh} harus <= innerHeight ${m.ih}`).toBeLessThanOrEqual(m.ih);
});

test('pembagi panel: panah kanan 3x -> 65 (ke-4 tetap 65), panah kiri sampai min 35, rasio 40 bertahan setelah muat ulang', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pembagi hanya ada di desktop (>= 1024px)');
  await openAttempt(page);
  const sep = page.getByRole('separator');
  await sep.focus();
  for (const v of ['55', '60', '65', '65']) {
    await page.keyboard.press('ArrowRight');
    await expect(sep).toHaveAttribute('aria-valuenow', v);
  }
  for (const v of ['60', '55', '50', '45', '40', '35', '35']) {
    await page.keyboard.press('ArrowLeft');
    await expect(sep).toHaveAttribute('aria-valuenow', v);
  }
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(sep).toHaveAttribute('aria-valuenow', '45');
  await page.keyboard.press('ArrowLeft');
  await expect(sep).toHaveAttribute('aria-valuenow', '40');
  expect(await lsGet(page, 'split:v1')).toContain('40');
  await page.reload();
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '40');
});

test('label paragraf A/B tampil di margin dan tidak ada di teks paragraf', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await expect(page.locator('[aria-label="Paragraf A"]')).toContainText('A');
  await expect(page.locator('[aria-label="Paragraf B"]')).toContainText('B');
  const pA = para(page, 'A').locator('p');
  await expect(pA).toContainText('Green Lane Market opens every Saturday');
  expect(await pA.innerText()).not.toMatch(/^\s*\[?A\]?\s/);
});

test('sorot kuning pada seleksi satu paragraf: <mark> benar, hl:v1 berisi 1 sorotan dengan start/end tepat, bertahan setelah muat ulang', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await selectIn(page, 'A', 'Green Lane');
  await page.getByRole('button', { name: 'Sorot kuning' }).click();
  const mark = page.locator('mark[data-testid="highlight-yellow"]');
  await expect(mark).toHaveCount(1);
  // Teks yang dibungkus harus tepat teks yang diseleksi.
  await expect(mark).toHaveText('Green Lane');
  await expect(mark).toHaveCSS('background-color', /.+/);
  const hl = JSON.parse((await lsGet(page, `hl:v1:${attemptId()}`)) ?? '[]') as Array<{ paragraph_index: number; start: number; end: number; color: string; passage_no: number }>;
  expect(hl).toHaveLength(1);
  expect(hl[0]).toMatchObject({ passage_no: 1, paragraph_index: 0, start: 0, end: 10, color: 'yellow' });
  await page.reload();
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await expect(page.locator('mark[data-testid="highlight-yellow"]')).toHaveText('Green Lane');
});

test('sorot hijau lewat toolbar, pintasan H / Shift+H, dan hapus sorotan lewat tombol', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await selectIn(page, 'B', 'bread, cheese');
  await page.getByRole('button', { name: 'Sorot hijau' }).click();
  await expect(page.locator('mark[data-testid="highlight-green"]')).toHaveCount(1);

  await selectIn(page, 'B', 'Parking is free');
  await expect(page.getByRole('button', { name: 'Sorot kuning' })).toBeVisible(); // toolbar muncul 20 ms setelah mouseup
  await page.keyboard.press('Shift+H');
  await expect(page.locator('mark[data-testid="highlight-green"]')).toHaveCount(2);
  await selectIn(page, 'B', 'first two hours');
  await expect(page.getByRole('button', { name: 'Sorot kuning' })).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.locator('mark[data-testid="highlight-yellow"]')).toHaveCount(1);

  // Hapus semua: Dialog konfirmasi.
  await page.getByRole('button', { name: 'Hapus semua sorotan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /hapus/i }).click();
  await expect(page.locator('mark')).toHaveCount(0);
});

test('hapus satu sorotan: klik sorotan memunculkan toolbar dengan tombol "Hapus sorotan" yang tetap tampil dan berfungsi', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await selectIn(page, 'B', 'bread, cheese');
  await expect(page.getByRole('button', { name: 'Sorot hijau' })).toBeVisible();
  await page.getByRole('button', { name: 'Sorot hijau' }).click();
  await expect(page.locator('mark[data-testid="highlight-green"]')).toHaveCount(1);
  await page.locator('mark[data-testid="highlight-green"]').first().click();
  const remove = page.getByRole('button', { name: 'Hapus sorotan' });
  await expect(remove, 'toolbar sorotan aktif harus tetap tampil setelah klik (bukan menutup sendiri)').toBeVisible();
  await page.waitForTimeout(500);
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(page.locator('mark[data-testid="highlight-green"]')).toHaveCount(0);
});

test('hapus sorotan dengan keyboard: Delete pada sorotan terpilih menghapusnya', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await selectIn(page, 'B', 'Visitors can');
  await expect(page.getByRole('button', { name: 'Sorot kuning' })).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.locator('mark[data-testid="highlight-yellow"]')).toHaveCount(1);
  await page.locator('mark[data-testid="highlight-yellow"]').first().click(); // klik memberi fokus pada sorotan
  await page.keyboard.press('Delete');
  await expect(page.locator('mark[data-testid="highlight-yellow"]')).toHaveCount(0);
});

test('hapus sorotan dengan keyboard saja: sorotan yang difokuskan (Tab/focus) lalu Delete terhapus', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await selectIn(page, 'B', 'Visitors can');
  await expect(page.getByRole('button', { name: 'Sorot kuning' })).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.locator('mark[data-testid="highlight-yellow"]')).toHaveCount(1);
  await page.locator('mark[data-testid="highlight-yellow"]').first().focus(); // fokus keyboard, tanpa klik mouse
  await page.keyboard.press('Delete');
  await expect(page.locator('mark[data-testid="highlight-yellow"]'), 'SPEC-010: Delete pada sorotan terfokus = hapus').toHaveCount(0);
});

test('seleksi lintas dua paragraf: toolbar sorot tidak muncul dan Toast "Sorot dalam satu paragraf."', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await page.evaluate(() => {
    const a = document.querySelector('[aria-label="Paragraf A"]')!.parentElement!.querySelector('p')!.firstChild!;
    const b = document.querySelector('[aria-label="Paragraf B"]')!.parentElement!.querySelector('p')!.firstChild!;
    const r = document.createRange();
    r.setStart(a, 5);
    r.setEnd(b, 10);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.getByText('Sorot dalam satu paragraf.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sorot kuning' })).toHaveCount(0);
});

test('Teks 2: panel soal hanya soal teks 2 dengan judul "Teks 2: Soal 4-6" (penomoran global)', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Teks', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  await expect(page.getByText('Teks 1: Soal 1-3')).toBeAttached();
  await page.getByRole('button', { name: 'Teks 2', exact: true }).click();
  if (await page.getByRole('tab', { name: 'Soal', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Soal', exact: true }).click();
  await expect(page.getByText('Teks 2: Soal 4-6')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Library Notice' })).toBeAttached();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 4 dari 6');
  await expect(page.locator('main fieldset legend').first()).toHaveText('How long will the library be closed?');
});

test('mode EXAM: ganti jawaban cepat menghasilkan tepat satu PUT answers (debounce 400 ms), tanpa panel umpan balik', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Soal', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Soal', exact: true }).click();
  const puts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/answers/')) puts.push(r.postData() ?? '');
  });
  const opts = page.locator('main fieldset label').filter({ has: page.locator('input[type="radio"]') });
  await opts.nth(0).click();
  await opts.nth(1).click(); // < 400 ms setelah klik pertama
  await expect.poll(() => puts.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1500);
  expect(puts, `PUT terkirim: ${puts.join(' | ')}`).toHaveLength(1);
  await expect(page.getByText('Pembahasan')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Periksa' })).toHaveCount(0);
});

test('gagal simpan jawaban: ditandai belum tersimpan dan dicoba ulang 3 kali (jeda 2, 4, 8 detik) lalu Toast "Coba lagi"', async ({ page }) => {
  test.setTimeout(90_000);
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Soal', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Soal', exact: true }).click();
  const times: number[] = [];
  await page.route('**/api/v1/attempts/*/answers/*', (route) => {
    times.push(Date.now());
    void route.abort('failed');
  });
  await answerVisible(page);
  await expect(page.getByText('Belum tersimpan').first()).toBeVisible({ timeout: 25_000 });
  await expect.poll(() => times.length, { timeout: 40_000 }).toBeGreaterThanOrEqual(4);
  await page.waitForTimeout(1000);
  expect(times, `percobaan: 1 awal + 3 ulang; waktu ${times.map((t) => t - times[0]!).join(',')}`).toHaveLength(4);
  const gaps = times.slice(1).map((t, i) => Math.round((t - times[i]!) / 1000));
  expect(gaps).toEqual([2, 4, 8]);
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeVisible();
  await page.unroute('**/api/v1/attempts/*/answers/*');
});

test('tandai soal (bendera): sel navigator ditandai (ikon + teks) dan tanda bertahan setelah muat ulang', async ({ page }) => {
  await openAttempt(page);
  if (await page.getByRole('tab', { name: 'Soal', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Soal', exact: true }).click();
  const flagBtn = page.getByRole('button', { name: 'Tandai soal' });
  await flagBtn.click();
  await expect(page.getByRole('button', { name: 'Hapus tanda' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('summary').click();
  const cell = page.getByRole('button', { name: /^Ke soal 1, .*Ditandai/ });
  await expect(cell).toBeVisible();
  expect(await lsGet(page, `flag:v1:${attemptId()}`)).toContain('Q-E2E-SK13-R1');
  await page.reload();
  if (await page.getByRole('tab', { name: 'Soal', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Soal', exact: true }).click();
  await page.locator('summary').click();
  await expect(page.getByRole('button', { name: /^Ke soal 1, .*Ditandai/ })).toBeVisible();
});

test('timer ujian menghitung mundur dari deadline server', async ({ page }) => {
  await openAttempt(page);
  const timer = page.locator('header').getByText(/^\d{2}:\d{2}$/);
  await expect(timer).toBeVisible();
  const mm = async () => {
    const [m, s] = (await timer.innerText()).split(':').map(Number);
    return m! * 60 + s!;
  };
  const a = await mm();
  await page.waitForTimeout(3500);
  const b = await mm();
  expect(a).toBeLessThanOrEqual(600);
  expect(a - b).toBeGreaterThanOrEqual(2);
  expect(a - b).toBeLessThanOrEqual(5);
});

test('mobile 375px: tab "Teks | Soal", tanpa scroll horizontal, posisi scroll tab Teks dipertahankan (<= 2px), Lihat teks / Kembali ke soal', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'AC khusus viewport 375x812');
  await openAttempt(page);
  await expect(page.getByRole('tab', { name: 'Teks', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Soal', exact: true })).toBeVisible();
  await expect(page.getByRole('separator')).toBeHidden();
  await expectNoHorizontalScroll(page);
  await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  const panel = page.locator('[class*="overflow-y-auto"]').filter({ has: page.getByRole('heading', { name: 'The Saturday Market' }) }).first();
  const max = await panel.evaluate((e) => e.scrollHeight - e.clientHeight);
  expect(max, 'panel teks harus dapat digulir pada 375px (fixture teks panjang)').toBeGreaterThan(50);
  const target = Math.min(200, max);
  await panel.evaluate((e, t) => ((e as HTMLElement).scrollTop = t), target);
  const before = await panel.evaluate((e) => e.scrollTop);
  await page.getByRole('tab', { name: 'Soal', exact: true }).click();
  await expect(page.getByTestId('question-counter')).toBeVisible();
  await page.getByRole('tab', { name: 'Teks', exact: true }).click();
  const after = await panel.evaluate((e) => e.scrollTop);
  expect(Math.abs(after - before), `scrollTop sebelum ${before}, sesudah ${after}`).toBeLessThanOrEqual(2);
  // Tombol di panel Soal membawa ke teks dan kembali.
  await page.getByRole('tab', { name: 'Soal', exact: true }).click();
  await page.getByRole('button', { name: 'Lihat teks' }).click();
  await expect(page.getByRole('heading', { name: 'The Saturday Market' })).toBeVisible();
  await page.getByRole('button', { name: 'Kembali ke soal' }).click();
  await expect(page.getByTestId('question-counter')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`aksesibilitas axe-core pada Reading (${scheme}): 0 pelanggaran serious/critical`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openAttempt(page);
    await page.addScriptTag({ path: path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js') });
    const violations = await page.evaluate(async () => {
      // @ts-expect-error axe disuntik oleh addScriptTag
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.filter((v: { impact: string }) => v.impact === 'serious' || v.impact === 'critical').map((v: { id: string; impact: string; nodes: Array<{ target: unknown }> }) => ({ id: v.id, impact: v.impact, n: v.nodes.length, first: v.nodes[0]?.target }));
    });
    expect(violations, JSON.stringify(violations)).toEqual([]);
  });
}

test('selesaikan: jawab 6 soal, kirim, hasil tampil tanpa kunci jawaban dan tanpa correct_answer di API', async ({ page }) => {
  test.setTimeout(120_000);
  await openAttempt(page);
  for (let i = 0; i < 6; i++) {
    if (await page.getByRole('tab', { name: 'Soal', exact: true }).isVisible()) await page.getByRole('tab', { name: 'Soal', exact: true }).click();
    await expect(page.getByTestId('question-counter')).toHaveText(`Soal ${i + 1} dari 6`);
    const prompt = await answerVisible(page);
    expect(keyFor(prompt)).toBeTruthy();
    if (i < 5) await page.getByRole('button', { name: 'Soal berikutnya' }).click();
  }
  await expect(page.getByText('Jawaban tersimpan')).toBeVisible();
  const submit = page.waitForResponse((r) => r.url().includes(`/attempts/${attemptId()}/submit`) && r.request().method() === 'POST');
  await confirmEnd(page);
  expect((await submit).ok()).toBe(true);
  await expect(page).toHaveURL(new RegExp(`/ujian/${attemptId()}/hasil$`), { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Level dilewati' })).toBeVisible();
  await expect(page.getByText('6 dari 6 poin')).toBeVisible();
  await expect(page.getByText('Pembahasan')).toHaveCount(0);
  await expect(page.getByText('Kunci jawaban')).toHaveCount(0);
  const res = await page.request.get(`/api/v1/attempts/${attemptId()}/result`);
  const body = await res.text();
  expect(body).not.toContain('correct_answer');
  expect(body).not.toContain('explanation_id');
  expect(BASE_URL).toBeTruthy();
});
