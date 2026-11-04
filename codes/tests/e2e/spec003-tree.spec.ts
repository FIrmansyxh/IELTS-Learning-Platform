/** SPEC-003: peta belajar, gatekeeping berurutan. */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newLearner } from './support/app';
import { q1, seedProgress, subId } from './support/db';

test.describe('SPEC-003 peta & gatekeeping', () => {
  test('@mobile peta: sub-modul terkunci menampilkan alasan; tanpa scroll horizontal pada 375px', async ({ page, context }) => {
    await newLearner(context);
    await page.goto('/peta');
    await expect(page.getByRole('heading', { name: 'Peta Belajar' })).toBeVisible();
    // 1.1.1 terbuka (tautan), 1.1.2 terkunci (tombol)
    await expect(page.getByRole('link', { name: /Nouns, Pronouns/ })).toBeVisible();
    const locked = page.getByRole('button', { name: /Present Simple vs\. Present Continuous/ });
    await expect(locked).toBeVisible();
    await locked.click();
    await expect(page.locator('[data-radix-popper-content-wrapper]')).toContainText(/Selesaikan|selesai|lulus/i);
    await page.keyboard.press('Escape');
    await expectNoHorizontalScroll(page);
    // konten belum terbit tampil "Segera hadir"
    await expect(page.getByText('Segera hadir').first()).toBeVisible();
  });

  test('Tier 2 terkunci & Boss Stage tier terkunci menampilkan alasan Indonesia', async ({ page, context }) => {
    await newLearner(context);
    await page.goto('/peta');
    const t2 = page.getByRole('button', { name: /Boss Stage\s*\.\s*Tier ini masih terkunci/ }).first();
    await expect(t2).toBeVisible();
    const tree = await api(context, 'GET', '/api/v1/curriculum/tree');
    expect(tree.status).toBe(200);
    const tiers = tree.json.data.tiers;
    expect(tiers[0].status).not.toBe('LOCKED');
    expect(tiers[1].status).toBe('LOCKED');
    expect(tiers[0].boss.available).toBe(false);
    expect(tiers[0].boss.blocked_reason).toBe('MODULES_INCOMPLETE');
    expect(tiers[1].boss.blocked_reason).toBe('TIER_LOCKED');
  });

  test('akses langsung ke sub-modul terkunci ditolak (API 403 LOCKED_CONTENT, halaman tidak membocorkan materi)', async ({ context, page }) => {
    await newLearner(context);
    const r = await api(context, 'GET', '/api/v1/sub-modules/1.1.2');
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('LOCKED_CONTENT');
    await page.goto('/belajar/1.1.2');
    await expect(page.getByText('Writing mini')).toHaveCount(0);
  });

  test('menyelesaikan drill membuka sub-modul berikutnya (urutan rantai) dan progres ikut naik', async ({ context }) => {
    const u = await newLearner(context);
    await seedProgress(u.id, ['1.1.1'], 'COMPLETED');
    const tree = await api(context, 'GET', '/api/v1/curriculum/tree');
    const find = (code: string) => {
      for (const t of tree.json.data.tiers) for (const m of t.modules) for (const s of m.sub_modules) if (s.sub_module_code === code) return s;
    };
    expect(find('1.1.1').status).toBe('COMPLETED');
    expect(find('1.1.2').status).toBe('UNLOCKED');
    expect(find('1.1.3').status).toBe('LOCKED');
    const row = await q1<{ status: string; unlock_source: string }>(
      `SELECT status, unlock_source FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=$2`,
      [u.id, await subId('1.1.2')],
    );
    expect(row.status).toBe('UNLOCKED');
    expect(row.unlock_source).toBe('SEQUENTIAL');
  });

  test('D-001: halaman terautentikasi tidak boleh memiliki scroll horizontal pada desktop 1280x800', async ({ page, context }) => {
    test.skip(page.viewportSize()!.width < 1024, 'khusus desktop');
    await newLearner(context);
    for (const path of ['/', '/peta', '/profil']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expectNoHorizontalScroll(page, { force: true });
    }
  });
});
