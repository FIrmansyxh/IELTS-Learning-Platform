import { expect, test, type Page } from '@playwright/test';
import { createProfile, deleteProfile, signIn, unlock, type TestProfile } from './helpers/app';
import { focusIndicatorGaps, keepWarm, layoutMetrics, traceApiFailures, watchConsole } from './helpers/platform';

// Sweep responsif + kesehatan lintas rute (desktop 1280 dan mobile 375, dipilih lewat project Playwright):
// tanpa overflow horizontal, tanpa galat konsol, sidebar/bottom-nav tidak menutup konten, fokus keyboard terlihat,
// landmark dan nama aksesibel dasar. Dijalankan untuk SEMUA rute utama dan sub-modul 3.3.3 (tab Pelajari/Latihan/Terapkan).

interface Route {
  name: string;
  path: string;
  ready: RegExp | string; // teks yang menandai konten utama sudah tampil
  chrome?: boolean; // memakai AppShell (sidebar + bottom nav)
}

const ROUTES: Route[] = [
  { name: 'Beranda', path: '/', ready: /Halo, /, chrome: true },
  { name: 'Peta', path: '/peta', ready: /Pilihan Jalur Belajar|Peta/i, chrome: true },
  { name: 'Riwayat', path: '/riwayat/ujian', ready: 'Riwayat Ujian & Evaluasi', chrome: true },
  { name: 'Glosarium', path: '/glosarium', ready: 'Verb Forms', chrome: true },
  { name: 'Profil', path: '/profil', ready: 'Data profil', chrome: true },
  { name: 'Latihan campur', path: '/latihan/campur', ready: 'Latihan campur', chrome: true },
  { name: 'Simulasi', path: '/simulasi', ready: 'Simulasi Tes IELTS General Training', chrome: true },
  { name: 'Pilih profil', path: '/pilih-profil?pilih=1', ready: 'Siapa yang belajar?' },
  { name: 'Sub-modul 3.3.3 Pelajari', path: '/belajar/3.3.3?tab=pelajari', ready: /Task 1 General Training/, chrome: true },
  { name: 'Sub-modul 3.3.3 Latihan', path: '/belajar/3.3.3?tab=latihan', ready: /Task 1 General Training/, chrome: true },
  { name: 'Sub-modul 3.3.3 Terapkan', path: '/belajar/3.3.3?tab=terapkan', ready: /Task 1 General Training/, chrome: true },
];

let profile: TestProfile;
let stopWarm: (() => Promise<void>) | undefined;
let trace: ReturnType<typeof traceApiFailures>;

// Mesin bersama dengan banyak agen + next dev: beri ruang waktu (bukan perilaku aplikasi).
test.describe.configure({ timeout: 120_000 });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  stopWarm = await keepWarm();
  profile = await createProfile('sweep');
  unlock(profile, '3.3.3');
});
test.afterAll(async () => {
  deleteProfile(profile);
  await stopWarm?.();
});
test.beforeEach(async ({ context, page }) => {
  await signIn(context, profile);
  trace = traceApiFailures(page);
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) trace.dump(info.title);
});

async function open(page: Page, r: Route) {
  await page.goto(r.path);
  // `next dev` kadang menjawab halaman 404 bawaan Next untuk rute valid saat sedang dikompilasi ulang: muat ulang (maks 4x).
  for (let i = 0; i < 4 && (await page.getByText('This page could not be found.').count()) > 0; i++) {
    await page.waitForTimeout(1500);
    await page.goto(r.path);
  }
  await expect(page.getByText(r.ready).first(), `${r.name}: konten utama`).toBeVisible();
  // beri waktu fetch awal selesai (skeleton -> data) sebelum mengukur
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

for (const r of ROUTES) {
  test(`sweep ${r.name} (${r.path}): tata letak, konsol, aksesibilitas dasar`, async ({ page, isMobile }) => {
    const watch = watchConsole(page);
    await open(page, r);

    const m = await layoutMetrics(page);
    // 1. tanpa overflow horizontal
    expect(m.scrollWidth, 'scrollWidth <= innerWidth').toBeLessThanOrEqual(m.innerWidth);
    // 2. landmark & judul
    expect(m.mainCount, 'tepat satu <main>').toBe(1);
    expect(m.h1Count, 'tepat satu <h1> tampak').toBe(1);
    expect(m.badLandmarks).toEqual([]);
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    expect((await page.title()).trim().length, 'judul dokumen').toBeGreaterThan(0);
    // 3. nama aksesibel pada tombol/tautan/input tampak
    expect(m.unnamed, 'elemen interaktif tanpa nama aksesibel').toEqual([]);
    // 4. sidebar / bottom nav tidak menutup konten
    if (r.chrome) {
      if (isMobile) {
        expect(await page.locator('aside').first().isVisible(), 'sidebar desktop tersembunyi di mobile').toBe(false);
        expect(m.mainLeft).toBeGreaterThanOrEqual(0);
        expect(m.bottomNavTop, 'bottom nav ada di mobile').not.toBeNull();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const after = await page.evaluate(() => {
          const main = document.querySelector('main')!;
          const last = main.lastElementChild!.getBoundingClientRect().bottom;
          const nav = Array.from(document.querySelectorAll('nav')).find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().height > 0)!;
          return { last, navTop: nav.getBoundingClientRect().top };
        });
        expect(after.last, 'akhir konten berada di atas bottom nav').toBeLessThanOrEqual(after.navTop + 1);
      } else {
        const aside = await page.locator('aside').first().boundingBox();
        expect(aside, 'sidebar tampak di desktop').toBeTruthy();
        expect(m.mainLeft, 'konten dimulai setelah sidebar').toBeGreaterThanOrEqual(aside!.x + aside!.width - 1);
        expect(m.bottomNavTop, 'bottom nav tersembunyi di desktop').toBeNull();
      }
    }
    // 5. tanpa galat konsol / pageerror
    expect(watch.errors, 'galat konsol').toEqual([]);
  });

  test(`fokus keyboard terlihat di ${r.name}`, async ({ page }) => {
    await open(page, r);
    const gaps = await focusIndicatorGaps(page, 14);
    expect(gaps, 'elemen fokus tanpa indikator (outline/ring)').toEqual([]);
  });
}

test('tautan lewati-ke-konten: Tab pertama memfokuskan skip link, Enter memindahkan fokus ke <main>', async ({ page }) => {
  // Diuji di /pilih-profil: pada rute terautentikasi mode dev (React StrictMode) memindahkan fokus ke <main> saat muat awal.
  await open(page, ROUTES.find((r) => r.name === 'Pilih profil')!);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Lewati ke konten utama' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main');
});

test('navigasi utama: 6 tautan, aria-current pada rute aktif, tidak ada menu Admin/Masuk/Daftar', async ({ page, isMobile }) => {
  await open(page, ROUTES[0]!);
  const navs = page.getByRole('navigation', { name: 'Navigasi utama' });
  const visibleNav = isMobile ? navs.last() : navs.first();
  const links = visibleNav.getByRole('link');
  await expect(links).toHaveCount(7);
  expect((await links.allTextContents()).map((t) => t.trim())).toEqual(['Beranda', 'Peta', 'Latihan campur', 'Simulasi tes', 'Glosarium', 'Riwayat', 'Profil']);
  await expect(visibleNav.getByRole('link', { name: 'Beranda' })).toHaveAttribute('aria-current', 'page');
  for (const bad of ['Admin', 'Masuk', 'Daftar', 'Keluar']) await expect(page.getByRole('link', { name: bad, exact: true })).toHaveCount(0);
  if (isMobile) {
    for (const box of await Promise.all((await links.all()).map((l) => l.boundingBox()))) expect(box!.height, 'target sentuh bottom nav').toBeGreaterThanOrEqual(44);
  }
  await visibleNav.getByRole('link', { name: 'Peta' }).click();
  await expect(page).toHaveURL(/\/peta$/);
  await expect(visibleNav.getByRole('link', { name: 'Peta' })).toHaveAttribute('aria-current', 'page');
});

test('tautan internal pada tiap rute utama menuju halaman yang ada (tidak 404)', async ({ page, request }) => {
  test.setTimeout(180_000);
  const seen = new Set<string>();
  for (const r of ROUTES.filter((x) => x.chrome).slice(0, 7)) {
    await open(page, r);
    const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
    for (const h of hrefs) seen.add(h.split('#')[0]!);
  }
  const broken: string[] = [];
  for (const h of seen) {
    if (!h || h.startsWith('/api/')) continue;
    const res = await request.get(h, { maxRedirects: 0 });
    if (res.status() >= 400) broken.push(`${h} -> ${res.status()}`);
  }
  expect(broken).toEqual([]);
});

test('chip header dan dialog riwayat poin: Escape menutup dan fokus kembali ke chip; target >= 24px', async ({ page }) => {
  await open(page, ROUTES[0]!);
  const chip = page.getByTestId('chip-points');
  const box = await chip.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(24);
  await chip.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByTestId('points-history-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toHaveAttribute('role', 'dialog');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(chip).toBeFocused();
});

test('favicon tersedia: GET /favicon.ico tidak 404 (tidak ada galat konsol di setiap halaman)', async ({ request }) => {
  const res = await request.get('/favicon.ico');
  expect(res.status(), 'GET /favicon.ico').toBe(200);
});

test('tema gelap: halaman utama tetap tanpa overflow dan teks terbaca (kontras latar/teks berbeda)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, ROUTES[0]!);
  const r = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { bg: cs.backgroundColor, fg: cs.color, sw: document.documentElement.scrollWidth, w: window.innerWidth };
  });
  expect(r.sw).toBeLessThanOrEqual(r.w);
  expect(r.bg).not.toBe(r.fg);
});

test('viewport antara (768 dan 1024) tidak overflow dan navigasi tetap dapat dipakai', async ({ page }) => {
  for (const [w, h] of [[768, 1024], [1024, 768], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await open(page, ROUTES[0]!);
    const m = await layoutMetrics(page);
    expect(m.scrollWidth, `lebar ${w}`).toBeLessThanOrEqual(m.innerWidth);
    expect(m.h1Count).toBe(1);
    if (w >= 1024) expect(m.mainLeft, `sidebar ${w}`).toBeGreaterThanOrEqual(256);
    else expect(m.bottomNavTop, `bottom nav ${w}`).not.toBeNull();
  }
});
