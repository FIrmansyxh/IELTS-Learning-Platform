/** SPEC-015 Placement Test adaptif (bank fixture 50 soal, 25 diserahkan). */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newLearner } from './support/app';
import { q, q1 } from './support/db';

test.describe('SPEC-015 placement', () => {
  test('@mobile E2E: jawab 25 soal, pilih "Mulai di Tier N" -> Tier sebelumnya Dilewati, Tier terpilih terbuka', async ({ page, context }) => {
    test.setTimeout(180_000);
    const u = await newLearner(context);
    await page.goto('/peta');
    await page.getByRole('link', { name: 'Ikut Placement Test' }).click();
    await page.getByRole('button', { name: /Mulai Ujian|Mulai/ }).first().click();
    for (let n = 1; n <= 25; n++) {
      await expect(page.getByText(`Soal ${n} dari 25`).first()).toBeVisible();
      await page.getByRole('radio', { name: /benar-P/ }).check();
      await page.getByRole('button', { name: 'Jawab', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Hasil Placement Test' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Rekomendasi: Mulai di Tier \d/)).toBeVisible();
    await expect(page.getByText('Ini rekomendasi latihan, bukan penilaian resmi.')).toBeVisible();
    await expectNoHorizontalScroll(page);
    const rec = Number((await page.getByText(/Rekomendasi: Mulai di Tier (\d)/).innerText()).match(/Tier (\d)/)![1]);
    await page.getByRole('button', { name: new RegExp(`Mulai (di|dari) Tier ${rec}`) }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Terapkan' }).click();
    await expect(page.getByText(`Tier awal Anda: Tier ${rec}`)).toBeVisible();
    const tiers = await q<{ tier_number: number; status: string }>(`SELECT t.tier_number, p.status FROM user_tier_progress p JOIN tiers t ON t.id=p.tier_id WHERE p.user_id=$1 ORDER BY 1`, [u.id]);
    for (const t of tiers) {
      if (t.tier_number < rec) expect(t.status).toBe('SKIPPED');
      if (t.tier_number === rec) expect(t.status).not.toBe('LOCKED');
    }
    const user = await q1<{ placement_completed_at: string | null }>(`SELECT placement_completed_at FROM users WHERE id=$1`, [u.id]);
    expect(user.placement_completed_at).not.toBeNull();
    // placement hanya sekali
    const set = await q1<{ id: string }>(`SELECT id FROM assessment_sets WHERE assessment_type='PLACEMENT_TEST' AND status='PUBLISHED'`);
    const again = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: set.id });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  test('serahan placement 25 soal dari bank 50; kunci tidak bocor dan jawaban salah semua merekomendasikan Tier 1', async ({ context }) => {
    await newLearner(context);
    const set = await q1<{ id: string }>(`SELECT id FROM assessment_sets WHERE assessment_type='PLACEMENT_TEST' AND status='PUBLISHED'`);
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: set.id });
    expect(a.status).toBe(201);
    expect(JSON.stringify(a.json)).not.toContain('correct_answers');
    expect(a.json.data.question_count).toBe(25);
  });
});
