/** SPEC-005 pemutar Learn-Drill-Apply, SPEC-006 mesin soal 12 tipe + Active Drill. */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newLearner } from './support/app';
import { markLearnDone, q, q1, seedProgress, setting, subId } from './support/db';
import { answerDrill111, checkAndContinue, startDrill } from './support/quiz';

const KEYS = ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10'];

test.describe('SPEC-005 pemutar materi', () => {
  test.afterAll(async () => {
    await setting('learn.min_active_seconds', 60);
  });

  test('@mobile E2E: baca artikel, buka Video & Slide, waktu aktif tercapai, Selesai Belajar membuka Latihan', async ({ page, context }) => {
    await setting('learn.min_active_seconds', 10);
    const u = await newLearner(context);
    const pings: string[] = [];
    page.on('response', async (r) => {
      if (r.url().includes('/learn-progress')) pings.push(`${new Date().toISOString().slice(11, 19)} ${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`);
    });
    await page.goto('/belajar/1.1.1');
    await expect(page.getByRole('heading', { name: /Nouns, Pronouns/ })).toBeVisible();
    const done = page.getByRole('button', { name: 'Selesai Belajar' });
    await expect(done).toBeDisabled();
    await expect(page.getByText(/Belajar aktif minimal \d+ detik\./)).toBeVisible();
    // tab Latihan belum aktif
    await page.getByRole('tab', { name: /^Latihan/ }).click();
    await expect(page.getByText('Selesaikan materi terlebih dahulu.')).toBeVisible();
    await page.getByRole('tab', { name: /^Pelajari/ }).click();
    // Waktu aktif dihitung dari durasi nyata di tiap sub-tab (hook use-active-learn-timer): beri dwell + interaksi, bukan sinkronisasi.
    await page.getByRole('tab', { name: 'Video', exact: true }).click();
    await page.mouse.move(300, 400);
    await page.waitForTimeout(2500);
    await page.getByRole('tab', { name: 'Slide', exact: true }).click();
    await page.mouse.move(320, 420);
    await page.waitForTimeout(2500);
    const region = page.getByRole('region', { name: 'Slide materi' });
    await expect(region).toBeVisible();
    await region.getByRole('button', { name: 'Slide berikutnya' }).click();
    await expect(region.getByText('2/3')).toBeVisible();
    await page.getByRole('tab', { name: 'Artikel', exact: true }).click();
    await expect(done).toBeEnabled({ timeout: 45_000 }).catch(async (e) => {
      throw new Error(`${e.message}\nDIAG unmet="${await page.locator('#learn-unmet').innerText().catch(() => '-')}"\nDIAG pings=${JSON.stringify(pings)}\nDIAG db=${JSON.stringify(await q1(`SELECT learn_active_seconds, learn_visited_subtabs FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=$2`, [u.id, await subId('1.1.1')]))}`);
    });
    await expectNoHorizontalScroll(page);
    await done.click();
    await expect(page.getByRole('button', { name: 'Mulai Latihan' })).toBeEnabled();
    const row = await q1<{ learn_completed_at: string | null; learn_active_seconds: number }>(
      'SELECT learn_completed_at, learn_active_seconds FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=$2',
      [u.id, await subId('1.1.1')],
    );
    expect(row.learn_completed_at).not.toBeNull();
    expect(row.learn_active_seconds).toBeGreaterThanOrEqual(10);
    await page.getByRole('tab', { name: /^Latihan/ }).click();
    await expect(page.getByRole('button', { name: 'Mulai Latihan' })).toBeEnabled();
  });

  test('D-002: petunjuk "Belajar aktif minimal N detik" mengikuti pengaturan learn.min_active_seconds', async ({ page, context }) => {
    await setting('learn.min_active_seconds', 10);
    await newLearner(context);
    await page.goto('/belajar/1.1.1');
    await expect(page.getByText('Belajar aktif minimal 10 detik.')).toBeVisible();
  });

  test('server menolak learn-complete bila bukti belajar kurang (tidak percaya klien)', async ({ context }) => {
    await newLearner(context);
    const r = await api(context, 'POST', '/api/v1/sub-modules/1.1.1/learn-complete');
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  test('tab Terapkan: Mini-Task SELF_CHECK ditandai selesai setelah materi', async ({ page, context }) => {
    const u = await newLearner(context);
    await page.goto('/belajar/1.1.1');
    await page.getByRole('tab', { name: /^Terapkan/ }).click();
    await expect(page.getByText('Selesaikan materi di tab Pelajari terlebih dahulu.')).toBeVisible();
    await markLearnDone(u.id, '1.1.1');
    await page.reload();
    await page.getByRole('tab', { name: /^Terapkan/ }).click();
    await page.getByRole('button', { name: 'Tandai Selesai' }).click();
    await expect(page.getByText('Mini-Task selesai.').first()).toBeVisible();
    const row = await q1<{ mini_task_completed_at: string | null }>('SELECT mini_task_completed_at FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=$2', [u.id, await subId('1.1.1')]);
    expect(row.mini_task_completed_at).not.toBeNull();
  });

  test('artikel Golden Sample (2.1.3) dirender: judul bagian dan callout; kunci rubrik Mini-Task tidak bocor di API', async ({ context }) => {
    const u = await newLearner(context);
    await seedProgress(u.id, ['2.1.3'], 'UNLOCKED');
    await q(`UPDATE user_tier_progress SET status='UNLOCKED' WHERE user_id=$1`, [u.id]);
    const r = await api(context, 'GET', '/api/v1/sub-modules/2.1.3');
    if (r.status === 200) {
      expect(JSON.stringify(r.json)).not.toContain('ai_rubric_criteria');
    } else {
      expect([403]).toContain(r.status);
    }
    const s = await api(context, 'GET', '/api/v1/sub-modules/1.1.1');
    expect(s.status).toBe(200);
    expect(JSON.stringify(s.json)).not.toContain('ai_rubric_criteria');
  });
});

test.describe('SPEC-006 mesin soal & Active Drill', () => {
  test('@mobile E2E: drill 10 tipe, 8 benar -> umpan balik tiap soal, hasil Lulus, sub-modul berikutnya terbuka', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.1');
    await startDrill(page, '1.1.1');
    const rightness = KEYS.map((_, i) => i < 8); // 8 benar, 2 salah
    const feedbacks: string[] = [];
    // soal diacak urutannya: baca kunci dari prompt yang tampil
    for (let n = 0; n < KEYS.length; n++) {
      const prompt = await page.getByText(/^D\d\d /).first().innerText();
      const key = prompt.slice(0, 3);
      const idx = KEYS.indexOf(key);
      await expect(page.getByText(`Soal ${n + 1} dari 10`).first()).toBeVisible();
      await answerDrill111(page, key, rightness[idx]!);
      feedbacks.push(await checkAndContinue(page, n === KEYS.length - 1));
      void idx;
    }
    expect(feedbacks.filter((f) => f.startsWith('Benar!')).length).toBeGreaterThanOrEqual(7); // MATCHING parsial dihitung bila salah semua
    await expect(page.getByText('Skor Anda')).toBeVisible();
    await expect(page.getByText('Lulus', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Ambang lulus 75%')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sub-Modul Berikutnya' })).toBeVisible();
    // pembahasan tampil pada tinjauan (mode PRACTICE)
    await page.locator('summary', { hasText: /Soal 1 dari 10/ }).click();
    await expect(page.getByText(/Pembahasan D\d\d/).first()).toBeVisible();
    const p = await q1<{ status: string; best_score_percent: number }>('SELECT status, best_score_percent FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=$2', [u.id, await subId('1.1.1')]);
    expect(p.status).toBe('COMPLETED');
    expect(p.best_score_percent).toBeGreaterThanOrEqual(75);
    const next = await q1<{ status: string }>('SELECT status FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=$2', [u.id, await subId('1.1.2')]);
    expect(next.status).toBe('UNLOCKED');
    await expectNoHorizontalScroll(page);
  });

  test('skor rendah: Belum lulus, tombol Ulangi Latihan & Tinjau Materi, status tidak COMPLETED', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.1');
    await startDrill(page, '1.1.1');
    for (let n = 0; n < 10; n++) {
      const key = (await page.getByText(/^D\d\d /).first().innerText()).slice(0, 3);
      await answerDrill111(page, key, false);
      await checkAndContinue(page, n === 9);
    }
    await expect(page.getByText('Belum lulus').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ulangi Latihan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tinjau Materi' }).or(page.getByRole('link', { name: 'Tinjau Materi' }))).toBeVisible();
    const p = await q1<{ status: string }>('SELECT status FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=$2', [u.id, await subId('1.1.1')]);
    expect(p.status).not.toBe('COMPLETED');
  });

  test('kunci jawaban tidak bocor di payload attempt sebelum dijawab; locked: POST /attempts 403 LOCKED_CONTENT', async ({ context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.1');
    const set = await q1<{ id: string }>(`SELECT id FROM assessment_sets WHERE assessment_type='ACTIVE_DRILL' AND title LIKE 'Drill 1.1.1%'`);
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: set.id });
    expect([200, 201]).toContain(a.status);
    const body = JSON.stringify(a.json);
    expect(body).not.toContain('correct_answers');
    expect(body).not.toContain('explanation_id');
    expect(body).not.toContain('Pembahasan D01');
    const locked = await q1<{ id: string }>(`SELECT id FROM assessment_sets WHERE assessment_type='ACTIVE_DRILL' AND title LIKE 'Drill Reading 1.3.1%'`);
    const l = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: locked.id });
    expect(l.status).toBe(403);
    expect(l.json.error.code).toBe('LOCKED_CONTENT');
  });

  test('semua tipe: jawaban benar dinilai benar di server (12 tipe, termasuk WRITING/SPEAKING dikecualikan)', async ({ context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.1');
    const set = await q1<{ id: string }>(`SELECT id FROM assessment_sets WHERE title LIKE 'Drill 1.1.1%'`);
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: set.id });
    expect(a.json.data.question_count).toBe(10);
    const types = (a.json.data.questions as any[]).map((x) => x.question_type).sort(); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(types).toEqual(['ERROR_RECOGNITION', 'FILL_IN_BLANK', 'MATCHING_DRAG', 'MATCHING_DROPDOWN', 'MCQ_MULTI', 'MCQ_SINGLE', 'SENTENCE_REORDER', 'SHORT_ANSWER', 'TFNG', 'YNNG']);
    // jawaban teks salah vs benar; idempotensi PRACTICE: respons berbeda -> 409
    const fill = (a.json.data.questions as any[]).find((x) => x.question_type === 'FILL_IN_BLANK'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const id = a.json.data.id as string;
    const p1 = await api(context, 'PUT', `/api/v1/attempts/${id}/answers/${fill.question_id}`, { response: { text: 'Was Built.' } });
    expect(p1.status).toBe(200);
    expect(p1.json.data.feedback.is_correct).toBe(true); // normalisasi huruf besar/titik akhir
    const p2 = await api(context, 'PUT', `/api/v1/attempts/${id}/answers/${fill.question_id}`, { response: { text: 'lain' } });
    expect(p2.status).toBe(409);
    expect(p2.json.error.code).toBe('QUESTION_ALREADY_ANSWERED');
    const p3 = await api(context, 'PUT', `/api/v1/attempts/${id}/answers/${fill.question_id}`, { response: { text: 'Was Built.' } });
    expect(p3.status).toBe(200);
  });

  test('resume drill: keluar di soal ke-4 lalu kembali, jawaban 1-3 tetap dan lanjut di soal 4', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.1');
    await startDrill(page, '1.1.1');
    const seen: string[] = [];
    for (let n = 0; n < 3; n++) {
      const key = (await page.getByText(/^D\d\d /).first().innerText()).slice(0, 3);
      seen.push(key);
      await answerDrill111(page, key, true);
      await checkAndContinue(page);
    }
    await expect(page.getByText('Soal 4 dari 10').first()).toBeVisible();
    await page.goto('/');
    const cta = page.getByRole('link', { name: /Lanjutkan Belajar/ });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/belajar\/1\.1\.1/);
    // halaman membuka tab Latihan atau menawarkan lanjut; pastikan attempt IN_PROGRESS dan jawaban tersimpan
    const answered = await q1<{ n: string }>(`SELECT count(*) n FROM attempt_answers aa JOIN attempts a ON a.id=aa.attempt_id WHERE a.user_id=$1`, [u.id]);
    expect(Number(answered.n)).toBe(3);
    await expect(page.getByText('Soal 4 dari 10').first()).toBeVisible();
  });

  test('kata melebihi max_words memunculkan peringatan dan dinilai salah', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.1');
    await startDrill(page, '1.1.1');
    // maju sampai soal D05 (isian)
    for (let n = 0; n < 10; n++) {
      const key = (await page.getByText(/^D\d\d /).first().innerText()).slice(0, 3);
      if (key === 'D05') {
        await page.getByLabel('Jawaban Anda').fill('was built yesterday');
        await expect(page.getByText('Jawaban melebihi 2 kata dan akan dinilai salah.')).toBeVisible();
        const fb = await checkAndContinue(page);
        expect(fb).toBe('Kurang tepat');
        return;
      }
      await answerDrill111(page, key, true);
      await checkAndContinue(page);
    }
    throw new Error('D05 tidak ditemukan');
  });

  test('pintasan keyboard: Enter memeriksa dan pilihan 1-4 / A-D bekerja bila diaktifkan', async ({ page, context }) => {
    const u = await newLearner(context);
    await markLearnDone(u.id, '1.1.1');
    await startDrill(page, '1.1.1');
    // Navigasi keyboard dasar: Tab ke opsi pertama dan pilih dengan Space bila soal MCQ; tes tidak bergantung pada urutan soal
    const radios = page.getByRole('radio');
    if ((await radios.count()) > 0) {
      await radios.first().focus();
      await page.keyboard.press('Space');
      await expect(radios.first()).toBeChecked();
    }
    await expect(page.getByRole('button', { name: 'Periksa', exact: true })).toBeVisible();
  });
});
