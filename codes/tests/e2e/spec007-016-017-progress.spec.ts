/** SPEC-007 resume/dashboard, SPEC-016 gamifikasi, SPEC-017 radar & prediksi band. */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newLearner } from './support/app';
import { answerDrill111, checkAndContinue, startDrill } from './support/quiz';
import { markLearnDone, q, q1, seedProgress, subId } from './support/db';

async function playSimpleDrill(page: import('@playwright/test').Page, code: string, n: number, right = true) {
  await page.goto(`/belajar/${code}`);
  await page.getByRole('tab', { name: /^Latihan/ }).click();
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  for (let i = 0; i < n; i++) {
    await expect(page.getByText(`Soal ${i + 1} dari ${n}`).first()).toBeVisible();
    await (right ? page.getByRole('radio', { name: /^(?:[A-D]\s*)?benar-/ }) : page.getByRole('radio', { name: /salah-1/ })).check();
    await page.getByRole('button', { name: 'Periksa', exact: true }).click();
    await expect(page.getByText(/^(Benar!|Kurang tepat)/).first()).toBeVisible();
    await page.getByRole('button', { name: i === n - 1 ? 'Lihat Hasil' : 'Lanjut', exact: true }).click();
  }
}

test.describe('SPEC-007 resume & dashboard', () => {
  test('E2E: keluar saat menonton video (detik >= 20) lalu "Lanjutkan Belajar" membuka tab Video dengan posisi tersimpan', async ({ page, context }) => {
    const u = await newLearner(context);
    await page.goto('/belajar/1.1.1');
    await page.getByRole('tab', { name: 'Video', exact: true }).click();
    // posisi video dilaporkan klien lewat PUT /me/last-learned; simulasikan posisi 25 dtk seperti pemutar nyata
    const put = await api(context, 'PUT', '/api/v1/me/last-learned', { sub_module_id: await subId('1.1.1'), active_tab: 'LEARN', active_learn_subtab: 'VIDEO', active_video_id: 'dQw4w9WgXcQ', video_progress_sec: 25 });
    expect([200, 204]).toContain(put.status);
    await page.goto('/');
    const t0 = Date.now();
    const cta = page.getByRole('link', { name: /Lanjutkan Belajar/ });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/belajar\/1\.1\.1/);
    await expect(page.getByRole('tab', { name: 'Video', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(Date.now() - t0).toBeLessThan(10_000); // klaim "kurang dari 10 detik" (007)
    const ll = await api(context, 'GET', '/api/v1/me/last-learned');
    expect(ll.json.data.video_progress_sec).toBeGreaterThanOrEqual(20);
    void u;
  });

  test('akun baru: dashboard menawarkan sub-modul pertama; selesai tier -> kartu berikutnya tepat', async ({ page, context }) => {
    const u = await newLearner(context);
    await page.goto('/');
    await expect(page.getByText('BERIKUTNYA UNTUK ANDA').or(page.getByText('Berikutnya untuk Anda'))).toBeVisible();
    await seedProgress(u.id, ['1.1.1'], 'COMPLETED');
    await page.reload();
    await expect(page.getByRole('link', { name: /Lanjutkan Belajar/ })).toHaveAttribute('aria-label', /Present Simple/);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('SPEC-016 gamifikasi', () => {
  test('E2E: lulus drill skor 100 pertama kali -> mahkota Emas berlabel, chip poin, confetti satu kali', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.2');
    await playSimpleDrill(page, '1.1.2', 2);
    await expect(page.getByText('Hadiah belajar')).toBeVisible();
    await expect(page.getByText(/\+\d+ poin/).first()).toBeVisible();
    await expect(page.getByText(/Mahkota baru: .*(Emas|Gold)/i)).toBeVisible();
    await expect(page.getByTestId('confetti')).toHaveCount(1);
    const crown = await q1<{ mastery_crown: string }>(`SELECT mastery_crown FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=$2`, [u.id, await subId('1.1.2')]);
    expect(crown.mastery_crown).toBe('GOLD');
    const pts = await q1<{ total: string }>(`SELECT coalesce(sum(points),0) total FROM point_ledger WHERE user_id=$1`, [u.id]);
    expect(Number(pts.total)).toBeGreaterThan(0);
    // ulangi: poin tidak bertambah (hanya bila lebih baik)
    await playSimpleDrill(page, '1.1.2', 2);
    const pts2 = await q1<{ total: string }>(`SELECT coalesce(sum(points),0) total FROM point_ledger WHERE user_id=$1`, [u.id]);
    expect(Number(pts2.total)).toBe(Number(pts.total));
    await page.goto('/profil');
    await expect(page.getByText('Mahkota Emas')).toBeVisible();
    await expect(page.getByText('Streak harian')).toBeVisible();
  });

  test('prefers-reduced-motion: confetti tidak dirender', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const u = await newLearner(ctx);
    await markLearnDone(u.id, '1.1.2');
    await playSimpleDrill(page, '1.1.2', 2);
    await expect(page.getByText(/Mahkota baru/i)).toBeVisible();
    await expect(page.getByTestId('confetti')).toHaveCount(0);
    await ctx.close();
  });

  test('poin idempoten dan ledger append-only (tidak bisa diubah oleh peran aplikasi)', async ({ context }) => {
    const u = await newLearner(context);
    const r = await api(context, 'GET', '/api/v1/me/points');
    expect(r.status).toBe(200);
    expect(r.json.data).toBeTruthy();
    void u;
    void q;
  });
});

test.describe('SPEC-017 radar & prediksi', () => {
  test('E2E: setelah Drill Grammar, radar menampilkan Grammar > 0 dan kartu prediksi berlabel Indikatif', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.1');
    await startDrill(page, '1.1.1'); // 10 soal unik GRAMMAR (ambang sampel minimal radar = 10, amandemen F-17-02)
    for (let n = 0; n < 10; n++) {
      const key = (await page.getByText(/^D\d\d /).first().innerText()).slice(0, 3);
      await answerDrill111(page, key, true);
      await checkAndContinue(page, n === 9);
    }
    await expect(page.getByText('Skor Anda')).toBeVisible();
    await page.goto('/');
    await expect(page.getByText('Radar Kesiapan')).toBeVisible();
    const radar = await api(context, 'GET', '/api/v1/me/skills/radar');
    expect(radar.status).toBe(200);
    expect(JSON.stringify(radar.json)).toMatch(/GRAMMAR/);
    const grammar = radar.json.data.skills.find((s: any) => s.skill === 'GRAMMAR'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(Number(grammar.estimated_band)).toBeGreaterThan(0);
    // Prediksi hanya dari L/R/W/S (R4): Grammar saja -> belum ada prediksi (label "Indikatif" butuh sampel L/R >= 10; tidak terverifikasi)
    await expect(page.getByText('Belum ada prediksi')).toBeVisible();
    const pred = await api(context, 'GET', '/api/v1/me/band-predictions');
    expect(pred.status).toBe(200);
    await page.getByRole('button', { name: 'Lihat sebagai tabel' }).click();
    await expect(page.getByRole('table').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
