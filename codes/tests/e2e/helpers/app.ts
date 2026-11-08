/**
 * Helper E2E bersama (Mix Builder, Jalur Belajar, Simulasi).
 *
 * Profil dibuat lewat API (cookie sesi diambil dari APIRequestContext) lalu dipasang ke context tiap tes,
 * sehingga tidak bergantung pada auto-masuk pemilih profil. Setiap spec WAJIB memanggil `deleteProfile`
 * di afterAll agar batas 10 profil tidak terlampaui. Pembukaan kunci progres lewat CLI resmi
 * (`progress unlock`), bukan SQL.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, request, type BrowserContext, type Page } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3005';
const CODES_DIR = process.cwd();

type Cookie = Awaited<ReturnType<BrowserContext['cookies']>>[number];
export interface TestProfile {
  name: string;
  cookies: Cookie[];
}

/** Nama unik per run (maks 40 karakter). */
export function uniqueName(tag: string): string {
  return `E2E ${tag} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.slice(0, 40);
}

/** Buat profil lewat API publik dan simpan cookie sesinya. */
export async function createProfile(tag: string): Promise<TestProfile> {
  const name = uniqueName(tag);
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const res = await api.post('/api/v1/profiles', { data: { display_name: name } });
  expect(res.status(), await res.text()).toBe(201);
  const state = await api.storageState();
  await api.dispose();
  return { name, cookies: state.cookies as unknown as Cookie[] };
}

/** Pasang sesi profil ke context browser (panggil di beforeEach). */
export async function signIn(context: BrowserContext, profile: TestProfile): Promise<void> {
  await context.addCookies(profile.cookies);
}

/** Panggil CLI pemeliharaan (tsx scripts/cli.ts ...) pada DB E2E. */
export function cli(...args: string[]): string {
  const dbPath = process.env.E2E_DATABASE_PATH;
  if (!dbPath) throw new Error('E2E_DATABASE_PATH tidak diset: jalankan lewat tests/e2e/helpers/run-e2e.mjs');
  return execFileSync(process.execPath, [path.join(CODES_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/cli.ts', ...args], {
    cwd: CODES_DIR,
    env: { ...process.env, DATABASE_PATH: dbPath, LOG_LEVEL: 'error' },
    encoding: 'utf8',
  });
}

export function unlock(profile: TestProfile, code: string): void {
  cli('progress', 'unlock', profile.name, code);
}

export function deleteProfile(profile: TestProfile | undefined): void {
  if (!profile) return;
  try {
    cli('profile', 'delete', profile.name, '--yes');
  } catch (e) {
    console.warn('[e2e] gagal menghapus profil', profile.name, (e as Error).message);
  }
}

/** Total poin saat ini lewat API (sumber kebenaran server). */
export async function totalPoints(page: Page): Promise<number> {
  const res = await page.request.get('/api/v1/me/stats');
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { data: { total_points: number } };
  return body.data.total_points;
}

/**
 * Jawab soal aktif pada Active Drill (pilihan ganda / TFNG / isian). Mengembalikan false bila soal tidak
 * dapat dijawab otomatis (mis. tugas AI).
 */
export async function answerCurrent(page: Page): Promise<boolean> {
  const radios = page.locator('main input[type="radio"]:not([disabled])');
  const text = page.locator('main input[type="text"]:not([disabled]), main textarea:not([disabled])');
  if ((await radios.count()) > 0) {
    await radios.first().check({ force: true });
    return true;
  }
  if ((await text.count()) > 0) {
    await text.first().fill('answer');
    return true;
  }
  return false;
}

/** Jawab semua soal Active Drill sampai tombol "Lihat Hasil" ditekan. */
export async function finishDrill(page: Page, maxQuestions = 60): Promise<void> {
  for (let i = 0; i < maxQuestions; i++) {
    const ok = await answerCurrent(page);
    expect(ok, 'soal tidak dapat dijawab otomatis').toBe(true);
    await page.getByRole('button', { name: 'Periksa' }).click();
    const last = page.getByRole('button', { name: 'Lihat Hasil' });
    const next = page.getByRole('button', { name: 'Lanjut', exact: true });
    await expect(last.or(next)).toBeVisible();
    if (await last.isVisible()) {
      await last.click();
      return;
    }
    await next.click();
  }
  throw new Error('drill tidak selesai');
}
