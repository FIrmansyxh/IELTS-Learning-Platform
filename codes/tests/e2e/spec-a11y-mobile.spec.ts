/** Lintas spec: halaman utama tanpa scroll horizontal pada 375x812 + axe-core (WCAG 2 A/AA serius/kritis). */
import { expect, test } from './support/fixtures';
import { axeViolations, expectNoHorizontalScroll, newAdmin, newLearner } from './support/app';

const LEARNER_PAGES = ['/', '/peta', '/profil', '/riwayat', '/riwayat/ujian', '/riwayat/penilaian', '/ganti-password', '/belajar/1.1.1'];
const ADMIN_PAGES = ['/admin', '/admin/pengguna', '/admin/undangan', '/admin/pengaturan', '/admin/band', '/admin/konten/sumber', '/admin/konten/aset', '/admin/konten/kurikulum', '/admin/konten/soal', '/admin/impor', '/admin/impor/baru', '/admin/audit'];

test.describe('layout mobile & aksesibilitas', () => {
  test('@mobile halaman publik: tanpa scroll horizontal', async ({ page }) => {
    for (const p of ['/masuk', '/daftar']) {
      await page.goto(p);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test('@mobile halaman Learner utama: tanpa scroll horizontal', async ({ page, context }) => {
    await newLearner(context);
    for (const p of LEARNER_PAGES) {
      await page.goto(p, { waitUntil: 'networkidle' });
      await expect(page.locator('main')).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test('@mobile halaman admin utama: tanpa scroll horizontal', async ({ page, context }) => {
    await newAdmin(context);
    for (const p of ADMIN_PAGES) {
      await page.goto(p, { waitUntil: 'networkidle' });
      await expect(page.locator('main')).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test('axe: halaman publik tanpa pelanggaran serius/kritis', async ({ page }) => {
    const found: string[] = [];
    for (const p of ['/masuk', '/daftar']) {
      await page.goto(p);
      await expect(page.getByRole('heading').first()).toBeVisible();
      found.push(...(await axeViolations(page)).map((v) => `${p}: ${v}`));
    }
    expect(found).toEqual([]);
  });

  test('axe: halaman Learner dan player tanpa pelanggaran serius/kritis', async ({ page, context }) => {
    await newLearner(context);
    const found: string[] = [];
    for (const p of LEARNER_PAGES) {
      await page.goto(p, { waitUntil: 'networkidle' });
      found.push(...(await axeViolations(page)).map((v) => `${p}: ${v}`));
    }
    expect(found).toEqual([]);
  });

  test('axe: halaman admin tanpa pelanggaran serius/kritis', async ({ page, context }) => {
    await newAdmin(context);
    const found: string[] = [];
    for (const p of ADMIN_PAGES) {
      await page.goto(p, { waitUntil: 'networkidle' });
      found.push(...(await axeViolations(page)).map((v) => `${p}: ${v}`));
    }
    expect(found).toEqual([]);
  });
});
