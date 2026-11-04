/**
 * SPEC-012 AI mati -> self-assessment. Hanya dijalankan pada fase "AI mati":
 * server web dan worker dijalankan dengan AI_ENABLED=false, lalu `E2E_AI_DOWN=1 npx playwright test spec012b`.
 */
import { expect, test } from './support/fixtures';
import { newLearner } from './support/app';
import { markLearnDone, q1 } from './support/db';

const ESSAY = Array.from({ length: 60 }, () => 'people study english daily').join(' ');

test.describe('SPEC-012 AI mati', () => {
  test.skip(!process.env.E2E_AI_DOWN, 'butuh server dengan AI_ENABLED=false (fase terpisah)');

  test('E2E: penilai AI mati -> pesan fallback dan form self-assessment berfungsi', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.2');
    await page.goto('/belajar/1.1.2');
    await page.getByRole('tab', { name: /^Terapkan/ }).click();
    await page.getByLabel('Tulisan Anda dalam bahasa Inggris').fill(ESSAY);
    await page.getByRole('button', { name: 'Kirim untuk Dinilai' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim', exact: true }).click();
    await expect(page.getByText('Penilai AI sedang tidak tersedia. Anda tetap bisa menilai sendiri.')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Nilai sendiri' }).click();
    for (const k of ['Task Response', 'Coherence & Cohesion', 'Lexical Resource', 'Grammatical Range & Accuracy']) {
      await page.getByRole('combobox', { name: `Band untuk ${k}` }).click();
      await page.getByRole('option', { name: /^6([.,]0)?$/ }).click();
    }
    await page.getByRole('button', { name: 'Simpan Penilaian' }).click();
    await expect(page.getByText('Penilaian sendiri').first()).toBeVisible();
    const row = await q1<{ status: string }>(`SELECT status FROM submissions WHERE user_id=$1`, [u.id]);
    expect(row.status).toBe('GRADED');
  });
});
