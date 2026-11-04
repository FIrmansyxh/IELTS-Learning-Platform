/** SPEC-013 AI Speaking (Chromium fake media stream; STT + LLM mock). */
import { expect, test } from './support/fixtures';
import { expectNoHorizontalScroll, newLearner } from './support/app';
import { markLearnDone, q1 } from './support/db';
import { driveRecorder } from './support/quiz';

test.describe('SPEC-013 AI speaking', () => {
  test('@mobile E2E: consent, rekam 5 detik (fake mic), kirim -> transkrip + 4 kriteria Speaking tampil', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.3');
    await page.goto('/belajar/1.1.3');
    await page.getByRole('tab', { name: /^Terapkan/ }).click();
    await driveRecorder(page, 5500);
    await expect(page.getByText('Dengarkan rekaman Anda')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Kirim untuk Dinilai' }).click();
    const region = page.getByRole('region', { name: 'Hasil penilaian' });
    await expect(region).toBeVisible({ timeout: 90_000 });
    await expect(region.getByText('Transkrip jawaban Anda')).toBeVisible();
    for (const k of ['Fluency & Coherence', 'Lexical Resource', 'Grammatical Range & Accuracy', 'Pronunciation']) await expect(region.getByText(k).first()).toBeVisible();
    await expect(region.getByText('Pronunciation diperkirakan').first()).toBeVisible();
    const row = await q1<{ status: string }>(`SELECT status FROM submissions WHERE user_id=$1`, [u.id]);
    expect(row.status).toBe('GRADED');
    const consentRow = await q1<{ consent_recording_at: string | null }>(`SELECT consent_recording_at FROM users WHERE id=$1`, [u.id]);
    expect(consentRow.consent_recording_at).not.toBeNull();
  });
});
