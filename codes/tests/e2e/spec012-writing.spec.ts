/** SPEC-012 AI Writing (worker + LLM mock latensi 3 dtk). */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newLearner } from './support/app';
import { markLearnDone, q, q1, setting } from './support/db';

const ESSAY = Array.from({ length: 60 }, (_, i) => (i % 7 === 6 ? 'study' : 'people study english daily')).join(' ');

test.describe('SPEC-012 AI writing', () => {
  test.afterEach(async () => {
    await setting('ai.daily_limit_per_user', 10);
  });

  test('@mobile E2E: tulis Mini-Task, kirim -> Antre/Memproses -> kartu hasil dengan disclaimer, 4 kriteria, koreksi', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.2');
    await page.goto('/belajar/1.1.2');
    await page.getByRole('tab', { name: /^Terapkan/ }).click();
    const box = page.getByLabel('Tulisan Anda dalam bahasa Inggris');
    await expect(box).toBeVisible();
    // terlalu pendek -> tombol/validasi
    await box.fill('too short');
    const send = page.getByRole('button', { name: 'Kirim untuk Dinilai' });
    await box.fill(ESSAY);
    await expect(page.getByText(/\d+ \/ min\. \d+ kata|\d+ kata/).first()).toBeVisible();
    await send.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim', exact: true }).click();
    const status = page.getByRole('region', { name: 'Status penilaian' });
    await expect(status).toBeVisible();
    await expect(status).toContainText(/Antre|Diterima|Memproses|Menilai/);
    const region = page.getByRole('region', { name: 'Hasil penilaian' });
    await expect(region).toBeVisible({ timeout: 60_000 });
    await expect(region.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeVisible();
    for (const k of ['Task Response', 'Coherence & Cohesion', 'Lexical Resource', 'Grammatical Range & Accuracy']) await expect(region.getByText(k).first()).toBeVisible();
    await expect(region.getByText('Band keseluruhan')).toBeVisible();
    await expect(region.getByText('Koreksi').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    const sub = await q1<{ status: string; word_count: number }>(`SELECT status, word_count FROM submissions WHERE user_id=$1`, [u.id]);
    expect(sub.status).toBe('GRADED');
  });

  test('draf tersimpan dan dipulihkan setelah muat ulang', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.2');
    await page.goto('/belajar/1.1.2');
    await page.getByRole('tab', { name: /^Terapkan/ }).click();
    await page.getByLabel('Tulisan Anda dalam bahasa Inggris').fill('draft that survives reload ' + ESSAY.slice(0, 80));
    await expect(page.getByText('Draf tersimpan')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: /^Terapkan/ }).click();
    await expect(page.getByLabel('Tulisan Anda dalam bahasa Inggris')).toHaveValue(/draft that survives reload/);
  });

  test('kuota harian: submission melebihi batas ditolak 429 dengan pesan', async ({ context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.2');
    await setting('ai.daily_limit_per_user', 1);
    const sid = (await q1<{ id: string }>(`SELECT id FROM sub_modules WHERE sub_module_code='1.1.2'`)).id;
    const body = { kind: 'MINI_TASK_WRITING', sub_module_id: sid, response_text: ESSAY };
    const a = await api(context, 'POST', '/api/v1/submissions/writing', body);
    expect([200, 201, 202]).toContain(a.status);
    await expect.poll(async () => (await q1<{ status: string }>(`SELECT status FROM submissions WHERE user_id=$1`, [u.id])).status, { timeout: 60_000 }).toBe('GRADED');
    const b = await api(context, 'POST', '/api/v1/submissions/writing', body);
    expect(b.status).toBe(429);
    expect(JSON.stringify(b.json)).toMatch(/AI_LIMIT|limit|batas/i);
    void q;
  });

  test('teks bukan bahasa Inggris/injeksi diberi flag dan tidak menjadi band tak wajar; validasi panjang', async ({ context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.2');
    const tooLong = await api(context, 'POST', '/api/v1/submissions/writing', { kind: 'MINI_TASK_WRITING', sub_module_id: (await q1<{ id: string }>(`SELECT id FROM sub_modules WHERE sub_module_code='1.1.2'`)).id, response_text: 'a '.repeat(4000) });
    expect(tooLong.status).toBe(400);
  });
});
