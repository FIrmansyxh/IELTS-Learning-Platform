/** SPEC-010 split-screen reading + highlighter, SPEC-011 listening dengan audio terkunci. */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newLearner } from './support/app';
import { q1, seedProgress, setId } from './support/db';

const RIGHT: Record<string, string> = { R1: 'Membuat kebun kecil' };

async function selectText(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator, from: number, to: number) {
  await locator.evaluate((el, [a, b]) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = w.nextNode()!;
    const r = document.createRange();
    r.setStart(node, a as number);
    r.setEnd(node, b as number);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.dispatchEvent(new Event('selectionchange'));
  }, [from, to]);
}

test.describe('SPEC-010 reading', () => {
  test('@mobile E2E: sorot teks, jawab 6 soal, tandai 1, selesai; hasil tampil (mode Latihan)', async ({ page, context }, info) => {
    const u = await newLearner(context);
    await seedProgress(u.id, ['1.3.1'], 'UNLOCKED', { learnDone: true });
    await page.goto('/belajar/1.3.1');
    await page.getByRole('tab', { name: /^Latihan/ }).click();
    await page.getByRole('button', { name: 'Mulai Latihan' }).click();
    const mobile = info.project.name === 'mobile';
    if (mobile) await expect(page.getByRole('tab', { name: 'Teks' })).toBeVisible();
    else await expect(page.getByRole('region', { name: 'Teks bacaan' }).or(page.getByLabel('Teks bacaan')).first()).toBeVisible();
    // soal pertama dulu karena mobile menampilkan tab Teks | Soal
    const textTab = mobile ? page.getByRole('tab', { name: 'Teks' }) : null;
    if (textTab) await textTab.click();
    const para = page.getByText(/Urban gardens have grown rapidly/).first();
    await expect(para).toBeVisible();
    await selectText(page, para, 0, 12);
    await page.getByRole('button', { name: 'Sorot kuning' }).click();
    await expect(page.locator('mark').first()).toBeVisible();
    // sorotan tersimpan di localStorage
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hl:v1:')).length);
    expect(stored).toBe(1);
    if (mobile) await page.getByRole('tab', { name: 'Soal' }).click();
    await expect(page.getByText(/R\d /).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    for (let n = 0; n < 6; n++) {
      const key = (await page.getByText(/^R\d /).first().innerText()).slice(0, 2);
      if (key === 'R1') await page.getByRole('radio', { name: RIGHT.R1! }).check();
      else if (key === 'R2') await page.getByRole('radio', { name: 'True', exact: true }).check({ force: true });
      else if (key === 'R3') await page.getByRole('radio', { name: 'False', exact: true }).check({ force: true });
      else if (key === 'R4') await page.getByLabel('Jawaban Anda').fill('tourists');
      else if (key === 'R5') await page.getByLabel('Jawaban Anda').fill('sales');
      else await page.getByRole('radio', { name: 'Yes', exact: true }).check({ force: true });
      await page.getByRole('button', { name: 'Periksa', exact: true }).click();
      await expect(page.getByText(/^(Benar!|Kurang tepat)/).first()).toBeVisible();
      await page.getByRole('button', { name: n === 5 ? 'Lihat Hasil' : 'Lanjut', exact: true }).click();
    }
    await expect(page.getByText('Skor Anda')).toBeVisible();
    await expect(page.getByText('Lulus', { exact: true }).first()).toBeVisible();
    const p = await q1<{ status: string }>(`SELECT status FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=(SELECT id FROM sub_modules WHERE sub_module_code='1.3.1')`, [u.id]);
    expect(p.status).toBe('COMPLETED');
  });

  test('payload attempt membawa passage_markdown dan passage_no tanpa kunci', async ({ context }) => {
    const u = await newLearner(context);
    await seedProgress(u.id, ['1.3.1'], 'UNLOCKED', { learnDone: true });
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: await setId('Drill Reading 1.3.1') });
    expect(a.status).toBe(201);
    expect(a.json.data.passage_markdown).toContain('===PASSAGE===');
    expect(JSON.stringify(a.json.data.questions.map((x: any) => x.passage_no).sort())).toBe('[1,1,1,2,2,2]'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(JSON.stringify(a.json)).not.toContain('correct_answers');
  });
});

test.describe('SPEC-011 listening', () => {
  test('E2E: pemutar audio Drill Listening (mode Latihan): putar, selesai, jawab, hasil tampil', async ({ page, context }) => {
    const u = await newLearner(context);
    await seedProgress(u.id, ['1.3.2'], 'UNLOCKED', { learnDone: true });
    await page.goto('/belajar/1.3.2');
    await page.getByRole('tab', { name: /^Latihan/ }).click();
    await page.getByRole('button', { name: 'Mulai Latihan' }).click();
    const card = page.getByRole('region', { name: 'Pemutar audio ujian' }).or(page.getByLabel('Pemutar audio ujian')).first();
    await expect(card).toBeVisible();
    await expect(page.getByText('Belum diputar')).toBeVisible();
    await page.getByRole('button', { name: 'Putar audio' }).click();
    await expect(page.getByText('Sedang diputar')).toBeVisible();
    // mode Latihan (PRACTICE): kontrol bantu tersedia; versi terkunci diuji pada Boss (mode Ujian)
    await expect(page.getByRole('button', { name: 'Mundur 5 detik' })).toBeVisible();
    await expect(page.getByText('Audio selesai').first()).toBeVisible({ timeout: 30_000 });
    for (let n = 0; n < 4; n++) {
      await page.getByRole('radio', { name: /dengar-/ }).check();
      await page.getByRole('button', { name: 'Periksa', exact: true }).click();
      await expect(page.getByText(/^(Benar!|Kurang tepat)/).first()).toBeVisible();
      await page.getByRole('button', { name: n === 3 ? 'Lihat Hasil' : 'Lanjut', exact: true }).click();
    }
    await expect(page.getByText('Skor Anda')).toBeVisible();
  });

  test('audio hanya diakses lewat URL aset terautentikasi; pengguna tanpa sesi ditolak, mendukung Range', async ({ context, request }) => {
    const u = await newLearner(context);
    await seedProgress(u.id, ['1.3.2'], 'UNLOCKED', { learnDone: true });
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: await setId('Drill Listening 1.3.2') });
    expect(a.status).toBe(201);
    const url = a.json.data.listening?.audio_url ?? a.json.data.listening?.url;
    expect(typeof url).toBe('string');
    const anon = await request.get(url);
    expect([401, 403, 404]).toContain(anon.status());
    const ranged = await context.request.get(url, { headers: { range: 'bytes=0-99' } });
    expect(ranged.status()).toBe(206);
    expect(ranged.headers()['content-range']).toMatch(/^bytes 0-99\//);
  });
});
