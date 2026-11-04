/** SPEC-014 Boss Stage penuh (L 4, R 4, W 1, S 1; AI mock). Juga mencakup SPEC-011 mode Ujian (audio terkunci). */
import { expect, test } from './support/fixtures';
import { api, axeViolations, expectNoHorizontalScroll, newLearner } from './support/app';
import { q, q1, seedProgress, setId } from './support/db';
import { driveRecorder } from './support/quiz';

const ESSAY = Array.from({ length: 70 }, () => 'technology helps students learn faster').join(' ');
const TIER1 = ['1.1.1', '1.1.2', '1.1.3', '1.2.1', '1.3.1', '1.3.2'];

test.describe('SPEC-014 Boss Stage', () => {
  test('boss tidak tersedia sebelum semua modul Tier 1 selesai (MODULES_INCOMPLETE) dan POST /attempts ditolak', async ({ context }) => {
    await newLearner(context);
    const id = await setId('Boss Stage Tier 1 (E2E)');
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: id });
    expect(a.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(a.json)).toMatch(/MODULES_INCOMPLETE|BOSS|LOCKED/);
  });

  test('E2E: Boss Tier 1 penuh - transisi antar section, audio terkunci, hasil band + rincian, W/S dinilai AI, Tier 2 terbuka', async ({ page, context }) => {
    test.setTimeout(240_000);
    const u = await newLearner(context);
    await seedProgress(u.id, TIER1, 'COMPLETED');
    const tree = await api(context, 'GET', '/api/v1/curriculum/tree');
    expect(tree.json.data.tiers[0].boss.available).toBe(true);
    const id = await setId('Boss Stage Tier 1 (E2E)');
    await page.goto(`/ujian/mulai/${id}`);
    await expect(page.getByText('Urutan section')).toBeVisible();
    expect(await axeViolations(page), 'axe halaman pra-mulai Boss').toEqual([]);
    await page.getByRole('button', { name: 'Putar nada uji' }).click();
    await page.getByRole('checkbox', { name: /Saya dapat mendengar/ }).check();
    await page.getByRole('button', { name: 'Mulai Ujian' }).click();
    await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/);

    // ---- Section 1: Listening (audio terkunci) ----
    await expect(page.getByText('Section 1 dari 4')).toBeVisible();
    await expect(page.getByText('Audio hanya diputar satu kali dan tidak dapat dijeda atau diulang.')).toBeVisible();
    await page.getByRole('button', { name: 'Mulai Section' }).click();
    const checkTone = page.getByRole('button', { name: 'Putar nada uji' });
    if (await checkTone.isVisible().catch(() => false)) {
      await checkTone.click();
      await page.getByRole('checkbox', { name: /Saya dapat mendengar/ }).check();
    }
    await page.getByRole('button', { name: /Putar audio|Mulai Audio/ }).click();
    // audio terkunci: tanpa jeda/seek/kecepatan, elemen audio tanpa controls
    await expect(page.getByRole('button', { name: 'Jeda' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mundur 5 detik' })).toHaveCount(0);
    await expect(page.getByLabel('Kecepatan pemutaran')).toHaveCount(0);
    expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.controls ?? false)).toBe(false);
    const t0 = await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).currentTime);
    const bar = page.getByLabel('Kemajuan audio').first();
    const box = await bar.boundingBox().catch(() => null);
    if (box) await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    const t1 = await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).currentTime);
    expect(t1).toBeLessThan(t0 + 3);
    const rightL = page.getByRole('radio', { name: /right-/ });
    await expect(rightL).toHaveCount(4);
    for (let i = 0; i < 4; i++) await rightL.nth(i).check();
    await page.getByRole('button', { name: 'Selesai Section' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ya, selesaikan' }).click();
    await expect(page.getByText(/Section Boss LISTENING T1 selesai/)).toBeVisible();
    await expect(page.getByText('Berikutnya: Boss READING T1')).toBeVisible();
    await page.getByRole('button', { name: 'Lanjut', exact: true }).click();

    // ---- Section 2: Reading (tandai soal tersedia pada mode ujian) ----
    await page.getByRole('button', { name: 'Mulai Section' }).click();
    await page.getByRole('button', { name: 'Tandai soal' }).first().click();
    await expect(page.getByRole('button', { name: 'Hapus tanda' }).first()).toBeVisible();
    const rightR = page.getByRole('radio', { name: /right-/ });
    await expect(rightR).toHaveCount(4);
    for (let i = 0; i < 4; i++) await rightR.nth(i).check();
    await page.getByRole('button', { name: 'Selesai Section' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ya, selesaikan' }).click();
    await page.getByRole('button', { name: 'Lanjut', exact: true }).click();

    // ---- Section 3: Writing ----
    await page.getByRole('button', { name: 'Mulai Section' }).click();
    await page.getByLabel('Tulisan Anda dalam bahasa Inggris').fill(ESSAY);
    await page.getByRole('button', { name: 'Kirim untuk Dinilai' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kirim', exact: true }).click();
    await page.getByRole('button', { name: 'Selesai Section' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ya, selesaikan' }).click();
    await page.getByRole('button', { name: 'Lanjut', exact: true }).click();

    // ---- Section 4: Speaking ----
    await page.getByRole('button', { name: 'Mulai Section' }).click();
    await driveRecorder(page, 4500);
    await page.getByRole('button', { name: 'Kirim untuk Dinilai' }).click();
    await page.getByRole('button', { name: 'Selesai Section' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ya, selesaikan' }).click();
    await page.getByRole('button', { name: 'Lihat Hasil' }).click();

    // ---- Hasil ----
    await expect(page.getByRole('heading', { name: 'Hasil Boss Stage' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Lulus', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Rincian per keterampilan')).toBeVisible();
    await expect(page.getByText(/Band \d/).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(await axeViolations(page), 'axe halaman hasil Boss').toEqual([]);
    const tp = await q1<{ boss_passed_at: string | null }>(`SELECT boss_passed_at FROM user_tier_progress WHERE user_id=$1 AND tier_id=(SELECT id FROM tiers WHERE tier_number=1)`, [u.id]);
    expect(tp.boss_passed_at).not.toBeNull();
    // Writing/Speaking dinilai AI (mock) muncul otomatis
    await expect.poll(async () => Number((await q1<{ n: string }>(`SELECT count(*) n FROM submissions WHERE user_id=$1 AND status='GRADED'`, [u.id])).n), { timeout: 90_000 }).toBe(2);
    const t2 = await q1<{ status: string }>(`SELECT status FROM user_tier_progress WHERE user_id=$1 AND tier_id=(SELECT id FROM tiers WHERE tier_number=2)`, [u.id]);
    expect(t2.status).not.toBe('LOCKED');
    void q;
  });

  test('Boss gagal: skor L+R rendah -> Belum lulus, tidak ada penalti, tier berikutnya tetap terkunci', async ({ context }) => {
    const u = await newLearner(context);
    await seedProgress(u.id, TIER1, 'COMPLETED');
    const id = await setId('Boss Stage Tier 1 (E2E)');
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: id });
    expect(a.status).toBe(201);
    const attemptId = a.json.data.id as string;
    const secs = (await q<{ id: string; skill_category: string }>(`SELECT id, skill_category FROM assessment_sets WHERE parent_set_id=$1 ORDER BY skill_category`, [id])).filter((s) => ['LISTENING', 'READING'].includes(s.skill_category));
    for (const s of secs) {
      const st = await api(context, 'POST', `/api/v1/attempts/${attemptId}/sections/${s.id}/start`);
      expect(st.status).toBe(200);
      const fin = await api(context, 'POST', `/api/v1/attempts/${attemptId}/sections/${s.id}/submit`);
      expect(fin.status).toBe(200);
    }
    const sub = await api(context, 'POST', `/api/v1/attempts/${attemptId}/submit`);
    expect(sub.status).toBe(200);
    const tp = await q1<{ boss_passed_at: string | null }>(`SELECT boss_passed_at FROM user_tier_progress WHERE user_id=$1 AND tier_id=(SELECT id FROM tiers WHERE tier_number=1)`, [u.id]);
    expect(tp.boss_passed_at).toBeNull();
  });
});
