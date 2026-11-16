import { expect, test, type Page } from '@playwright/test';
import { totalPoints } from './helpers/app';
import {
  ANSWERS,
  D121,
  D221,
  D221_MAX,
  SUB_TITLES,
  apiGet,
  apiPost,
  createCoreProfile,
  currentPrompt,
  deleteCoreProfile,
  ensureCoreContent,
  warmUpRoutes,
  learnFast,
  noHorizontalOverflow,
  setLearnMin,
  shot,
  subOf,
  uiAnswer,
  uiCheck,
  uiNext,
  unlockCode,
  type CoreProfile,
} from './helpers/core';

// SPEC-006 Mesin Soal & Active Drill + hasil (domain Inti Belajar). Drill 1.4.1 = 4 soal (lulus 75% = 3 benar);
// drill 2.2.1 = 10 tipe soal berbobot (maks 14 poin).
test.describe.configure({ timeout: 75_000 });
const profiles: CoreProfile[] = [];
const mk = async (tag: string) => {
  const p = await createCoreProfile(tag);
  profiles.push(p);
  return p;
};
test.beforeAll(async () => {
  test.setTimeout(300_000);
  ensureCoreContent();
  await warmUpRoutes();
  setLearnMin(10);
});
test.afterAll(() => {
  test.setTimeout(300_000);
  for (const p of profiles) deleteCoreProfile(p);
});

type Plan = (prompt: string, i: number) => 'right' | 'wrong';

/** Kerjakan drill di UI sambil menegaskan panel umpan balik setiap soal. Mengembalikan daftar prompt berurutan. */
async function runAsserting(page: Page, total: number, plan: Plan, opts: { dragMode?: 'drag' | 'select'; keyboardReorder?: boolean } = {}): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < total; i++) {
    await expect(page.getByTestId('question-counter')).toHaveText(`Soal ${i + 1} dari ${total}`);
    const prompt = await currentPrompt(page);
    seen.push(prompt);
    const mode = plan(prompt, i);
    // "Periksa" nonaktif sampai soal terjawab.
    await expect(page.getByRole('button', { name: 'Periksa', exact: true })).toBeDisabled();
    await uiAnswer(page, mode, opts);
    const { correct, feedback } = await uiCheck(page);
    if (mode === 'right') {
      expect(correct, `soal "${prompt}" seharusnya benar`).toBe(true);
      await expect(feedback).toContainText('Benar!');
    } else {
      expect(correct, `soal "${prompt}" seharusnya salah`).toBe(false);
      await expect(feedback).toContainText('Kurang tepat');
      await expect(feedback).toContainText('Jawaban benar');
    }
    await expect(feedback).toContainText('Pembahasan');
    // Jawaban terkunci setelah diperiksa: tidak ada kontrol jawaban yang bisa diubah.
    expect(await page.locator('main fieldset input:not([disabled]), main fieldset select:not([disabled])').count(), 'jawaban terkunci').toBe(0);
    if (await uiNext(page)) return seen;
  }
  throw new Error('drill tidak selesai');
}

async function openDrill(page: Page, code: string): Promise<void> {
  await page.goto(`/belajar/${code}?tab=latihan`);
  await expect(page.getByRole('button', { name: 'Mulai Latihan' })).toBeEnabled();
}

test('lulus tepat 75% (3 dari 4): umpan balik tiap soal, hasil Lulus, soal berikutnya terbuka, poin bertambah, tanpa kunci di payload', async ({ page, context }) => {
  const p = await mk('drl-p');
  await context.addCookies(p.cookies);
  await learnFast(page, '1.4.1');
  const pointsBefore = await totalPoints(page);
  await openDrill(page, '1.4.1');
  await expect(page.getByText('4 soal - 5 menit - lulus 75%')).toBeVisible();

  const [startRes] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/v1/attempts') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Mulai Latihan' }).click(),
  ]);
  expect(startRes.status()).toBe(201);
  const startText = await startRes.text();
  // Payload awal tidak memuat kunci (D9).
  expect(startText).not.toMatch(/"(correct_answers|explanation_id|correct|answer|accepted)"\s*:/);
  const attemptId = (JSON.parse(startText).data as { id: string }).id;
  const start = JSON.parse(startText).data as { mode: string; deadline_at: string | null; question_count: number; current_index: number };
  expect(start).toMatchObject({ mode: 'PRACTICE', deadline_at: null, question_count: 4, current_index: 0 });
  // URL memuat attempt untuk pemulihan.
  await expect(page).toHaveURL(/tab=latihan&attempt=[0-9a-f-]{36}/);
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);

  const order = await runAsserting(page, 4, (prompt) => (prompt === D121.fill ? 'wrong' : 'right'));
  expect(new Set(order)).toEqual(new Set([D121.mcq, D121.tfng, D121.fill, D121.short]));

  // Hasil: skor besar, ambang, status ikon + teks, poin mentah, terbuka berikutnya.
  await expect(page.getByTestId('score-percent')).toHaveText('75%');
  await expect(page.getByRole('status').filter({ hasText: /^Lulus$/ })).toBeVisible();
  await expect(page.getByText('Ambang lulus 75%')).toBeVisible();
  await expect(page.getByText('3 dari 4 poin')).toBeVisible();
  await expect(page.getByText('Kerja bagus! Anda sudah menguasai sub-modul ini.')).toBeVisible();
  await expect(page.getByText(`Terbuka: ${SUB_TITLES['1.4.2']}`)).toBeVisible();
  const next = page.getByRole('link', { name: 'Sub-Modul Berikutnya' });
  await expect(next).toHaveAttribute('href', '/belajar/1.4.2');
  // Mahkota/poin: total poin naik (server), dan layar hasil harus menampilkan blok poin/mahkota (SPEC-006 DrillResult, SPEC-016).
  expect(await totalPoints(page)).toBeGreaterThan(pointsBefore);
  const saved = await apiGet<{ data: { gamification: { points: { total: number }; crown: { current: string } } | null; attempt: { points_awarded: number } } }>(page, `/api/v1/attempts/${attemptId}/result`);
  expect(saved.body.data.gamification, 'GET /result memuat blok gamifikasi').not.toBeNull();
  expect(saved.body.data.attempt.points_awarded).toBeGreaterThan(0);
  expect.soft(await page.getByTestId('drill-gamification').count(), 'layar hasil drill harus menampilkan poin/mahkota segera setelah submit (respons submit memuat gamification)').toBe(1);
  // Tinjauan soal: 4 butir, 3 benar + 1 salah, dengan kunci dan pembahasan hanya di mode Latihan.
  const review = page.locator('details');
  await expect(review).toHaveCount(4);
  await expect(page.locator('details', { hasText: '· Benar' })).toHaveCount(3);
  await expect(page.locator('details', { hasText: '· Salah' })).toHaveCount(1);
  await page.locator('details', { hasText: '· Salah' }).locator('summary').click();
  await expect(page.locator('details[open]')).toContainText(D121.fill);
  await expect(page.locator('details[open]')).toContainText('Pembahasan');
  const m2 = await noHorizontalOverflow(page);
  expect(m2.sw).toBeLessThanOrEqual(m2.w);
  await shot(page, `drill-pass75-${test.info().project.name}`);

  // Server konsisten: sub-modul COMPLETED, berikutnya terbuka, tab Latihan bercentang.
  const sub = await subOf(page, '1.4.1');
  expect(sub).toMatchObject({ status: 'COMPLETED', best_score_percent: 75 });
  expect((await subOf(page, '1.4.2')).status).toBe('UNLOCKED');
  await expect(page.getByRole('tab', { name: /^Latihan/ })).toContainText('selesai');
  await next.click();
  await expect(page).toHaveURL(/\/belajar\/1\.2\.2/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SUB_TITLES['1.4.2']!);
});

test('gagal (2 dari 4 = 50%): Belum lulus, Ulangi Latihan membuat percobaan baru, Tinjau Materi ke tab Pelajari, berikutnya tetap terkunci; skor terbaik dipertahankan', async ({ page, context }) => {
  const p = await mk('drl-f');
  await context.addCookies(p.cookies);
  await learnFast(page, '1.4.1');
  await openDrill(page, '1.4.1');
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  const firstUrl = await (async () => {
    await expect(page).toHaveURL(/attempt=/);
    return page.url();
  })();
  await runAsserting(page, 4, (prompt) => (prompt === D121.fill || prompt === D121.short ? 'wrong' : 'right'));

  await expect(page.getByTestId('score-percent')).toHaveText('50%');
  await expect(page.getByRole('status').filter({ hasText: /^Belum lulus$/ })).toBeVisible();
  await expect(page.getByText('Belum lulus. Coba ulangi setelah meninjau materi.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sub-Modul Berikutnya' })).toHaveCount(0);
  await expect(page.getByText(/^Terbuka:/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ulangi Latihan' })).toBeVisible();
  await shot(page, `drill-fail-${test.info().project.name}`);

  // Gerbang: tetap belum COMPLETED; 1.4.2 masih terkunci; skor terbaik tercatat.
  const sub = await subOf(page, '1.4.1');
  expect(sub.status).toBe('IN_PROGRESS');
  expect(sub.best_score_percent).toBe(50);
  expect((await subOf(page, '1.4.2')).status).toBe('LOCKED');

  // Tinjau Materi -> tab Pelajari; kembali ke Latihan menampilkan ringkasan dengan skor terbaik.
  await page.getByRole('button', { name: 'Tinjau Materi' }).click();
  await expect(page.getByRole('tab', { name: /^Pelajari/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /^Latihan/ }).click();
  await expect(page.getByText('Skor terbaik: 50%')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mulai Latihan' })).toBeEnabled();
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 4');
  await expect(page).toHaveURL(/attempt=/);
  const secondUrl = page.url();
  expect(secondUrl).not.toBe(firstUrl);
  // Selesaikan percobaan kedua dengan buruk lalu gunakan "Ulangi Latihan" langsung dari layar hasil.
  await runAsserting(page, 4, (prompt) => (prompt === D121.mcq ? 'right' : 'wrong'));
  await expect(page.getByTestId('score-percent')).toHaveText('25%');
  expect((await subOf(page, '1.4.1')).best_score_percent, 'skor terbaik tidak turun').toBe(50);
  await page.getByRole('button', { name: 'Ulangi Latihan' }).click();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 4');
  expect(page.url()).not.toBe(secondUrl);
  await runAsserting(page, 4, () => 'right');
  await expect(page.getByTestId('score-percent')).toHaveText('100%');
  await expect(page.getByRole('status').filter({ hasText: /^Lulus$/ })).toBeVisible();
  expect((await subOf(page, '1.4.1')).status).toBe('COMPLETED');
  expect((await subOf(page, '1.4.2')).status).toBe('UNLOCKED');
  // Skor terbaik tidak turun ketika dikerjakan ulang lebih buruk.
  const detail = (await apiGet<{ data: { drill: { assessment_set_id: string } } }>(page, '/api/v1/sub-modules/1.4.1')).body.data;
  const again = await apiPost<{ data: { id: string; questions: Array<{ prompt: string }> } }>(page, '/api/v1/attempts', { assessment_set_id: detail.drill.assessment_set_id });
  expect(again.status).toBe(201);
  expect((await subOf(page, '1.4.1')).best_score_percent).toBe(100);
});

test('refresh di tengah drill melanjutkan di soal yang benar dengan jawaban tersimpan', async ({ page, context }) => {
  const p = await mk('drl-r');
  await context.addCookies(p.cookies);
  await learnFast(page, '1.4.1');
  await openDrill(page, '1.4.1');
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  await expect(page).toHaveURL(/attempt=/);
  const attemptId = /attempt=([0-9a-f-]{36})/.exec(page.url())![1]!;
  const firstTwo: string[] = [];
  for (let i = 0; i < 2; i++) {
    firstTwo.push(await currentPrompt(page));
    await uiAnswer(page, 'right');
    await uiCheck(page);
    await uiNext(page);
  }
  const thirdBefore = await currentPrompt(page);
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 3 dari 4');

  await page.reload();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 3 dari 4');
  expect(await currentPrompt(page), 'urutan soal identik setelah pulih').toBe(thirdBefore);
  const att = await apiGet<{ data: { answered_count: number; current_index: number; resumed: boolean; answers: Array<{ question_id: string }> } }>(page, `/api/v1/attempts/${attemptId}`);
  expect(att.body.data).toMatchObject({ answered_count: 2, current_index: 2 });
  // "Mulai Latihan" pada tab memulihkan attempt yang sama (bukan membuat baru).
  const resume = await apiPost<{ data: { id: string; resumed: boolean } }>(page, '/api/v1/attempts', {
    assessment_set_id: (await apiGet<{ data: { drill: { assessment_set_id: string } } }>(page, '/api/v1/sub-modules/1.4.1')).body.data.drill.assessment_set_id,
  });
  expect(resume.status).toBe(200);
  expect(resume.body.data).toMatchObject({ id: attemptId, resumed: true });
  // Sisa soal dapat diselesaikan dan sub-modul lulus.
  for (let i = 2; i < 4; i++) {
    await uiAnswer(page, 'right');
    await uiCheck(page);
    if (await uiNext(page)) break;
  }
  await expect(page.getByTestId('score-percent')).toHaveText('100%');
});

test('10 tipe soal: renderer per tipe, kredit parsial, batas kata, hasil berbobot 11 dari 14 poin lulus (seret di desktop, dropdown di mobile)', async ({ page, context, isMobile }) => {
  test.setTimeout(75_000);
  const p = await mk('drl-m');
  await context.addCookies(p.cookies);
  unlockCode(p, '2.2.1');
  await learnFast(page, '2.2.1');
  await openDrill(page, '2.2.1');
  await expect(page.getByText('10 soal - 10 menit - lulus 75%')).toBeVisible();
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 10');

  const wrong = new Set([D221.multi, D221.short, D221.drop]);
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    await expect(page.getByTestId('question-counter')).toHaveText(`Soal ${i + 1} dari 10`);
    const prompt = await currentPrompt(page);
    seen.push(prompt);
    const mode = wrong.has(prompt) ? 'wrong' : 'right';
    const a = ANSWERS.get(prompt)!;
    // Ciri khas tiap renderer.
    if (prompt === D221.multi) await expect(page.getByText('Pilih 2 jawaban')).toBeVisible();
    if (prompt === D221.mcq) await expect(page.getByText('Pilih satu jawaban')).toBeVisible();
    if (prompt === D221.tfng) await expect(page.getByRole('radiogroup').locator('label')).toHaveText(['True', 'False', 'Not Given']);
    if (prompt === D221.ynng) await expect(page.getByRole('radiogroup').locator('label')).toHaveText(['Yes', 'No', 'Not Given']);
    if (prompt === D221.drop) await expect(page.locator('main select')).toHaveCount(4);
    if (prompt === D221.reorder) await expect(page.getByText('Urutkan segmen kalimat.', { exact: false })).toBeVisible();
    if (prompt === D221.error) await expect(page.getByText('Ketuk kata yang salah (maksimal 3).')).toBeVisible();
    if (prompt === D221.fill) {
      await expect(page.getByText('Maksimal 2 kata dan/atau angka')).toBeVisible();
      await page.getByLabel('Jawaban Anda').fill('are sorted');
      await expect(page.getByText('2 kata', { exact: true })).toBeVisible();
      await page.getByLabel('Jawaban Anda').fill('  Are   Sorted. '); // normalisasi D6: spasi, huruf besar, tanda baca akhir
      await uiCheck(page);
      await expect(page.locator('[data-state="correct"]')).toContainText('Benar!');
    } else if (prompt === D221.short && mode === 'wrong') {
      // Tiga kata melampaui max_words=2: peringatan tampil, Periksa tetap aktif, server menilai salah.
      await page.getByLabel('Jawaban Anda').fill('past participle verb');
      await expect(page.locator('main p[role="alert"]')).toContainText('Jawaban melebihi 2 kata dan akan dinilai salah.');
      const { correct } = await uiCheck(page);
      expect(correct).toBe(false);
    } else {
      await uiAnswer(page, mode, { dragMode: isMobile ? 'select' : 'drag', keyboardReorder: true });
      const { correct, feedback } = await uiCheck(page);
      expect(correct, prompt).toBe(mode === 'right');
      if (prompt === D221.drop) {
        // Kredit parsial: 3 dari 4 pasangan benar (bobot 4) -> 3 poin.
        await expect(feedback).toContainText('Sebagian benar (3 dari 4 poin)');
      }
      if (mode === 'wrong') await expect(feedback).toContainText('Jawaban benar');
      if (a.t === 'match' && mode === 'right') await expect(feedback).toContainText('Benar!');
    }
    if (await uiNext(page)) break;
  }
  expect(new Set(seen).size).toBe(10);
  // 7 benar penuh (bobot 1+1+1+1+2+1+1 = 8... + sebagian 3) = 11 dari 14.
  await expect(page.getByText(`11 dari ${D221_MAX} poin`)).toBeVisible();
  await expect(page.getByTestId('score-percent')).toHaveText('78,6%');
  await expect(page.getByRole('status').filter({ hasText: /^Lulus$/ })).toBeVisible();
  await expect(page.getByText(`Terbuka: ${SUB_TITLES['2.2.2']}`)).toBeVisible();
  await expect(page.locator('details')).toHaveCount(10);
  await expect(page.locator('details', { hasText: '· Salah' })).toHaveCount(3);
  await shot(page, `drill-10types-${test.info().project.name}`);
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
});

test('keyboard saja: pintasan angka/huruf memilih opsi, Enter memeriksa dan melanjutkan', async ({ page, context }) => {
  const p = await mk('drl-k');
  await context.addCookies(p.cookies);
  unlockCode(p, '1.4.2');
  await learnFast(page, '1.4.2');
  await openDrill(page, '1.4.2');
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  for (let i = 0; i < 2; i++) {
    await expect(page.getByTestId('question-counter')).toHaveText(`Soal ${i + 1} dari 2`);
    const prompt = await currentPrompt(page);
    const a = ANSWERS.get(prompt)!;
    if (a.t !== 'mcq') throw new Error('fixture 1.4.2 harus MCQ');
    const texts = await page.locator('main label span[lang="en"]').allInnerTexts();
    const idx = texts.indexOf(a.right);
    expect(idx).toBeGreaterThanOrEqual(0);
    await page.locator('main fieldset > legend').focus();
    await page.keyboard.press(i === 0 ? String(idx + 1) : 'abcd'[idx]!);
    await expect(page.locator('main label').nth(idx).locator('input')).toBeChecked();
    await page.keyboard.press('Enter'); // Periksa
    await expect(page.locator('[data-state="correct"]')).toBeVisible();
    await page.keyboard.press('Enter'); // Lanjut / Lihat Hasil (fokus tetap di kepala soal)
  }
  await expect(page.getByTestId('score-percent')).toHaveText('100%');
});

test('gerbang: drill sub-modul terkunci ditolak 403 LOCKED_CONTENT; drill dengan materi belum selesai ditolak 409', async ({ page, context }) => {
  const unlocked = await mk('drl-g1');
  const fresh = await mk('drl-g2');
  await context.addCookies(unlocked.cookies);
  unlockCode(unlocked, '2.2.1');
  const d = (await apiGet<{ data: { drill: { assessment_set_id: string } } }>(page, '/api/v1/sub-modules/2.2.1')).body.data;
  const notLearned = await apiPost<{ error: { code: string } }>(page, '/api/v1/attempts', { assessment_set_id: d.drill.assessment_set_id });
  expect(notLearned.status).toBe(409);
  expect(notLearned.body.error.code).toBe('LEARN_NOT_COMPLETED');
  await context.clearCookies();
  await context.addCookies(fresh.cookies);
  const locked = await apiPost<{ error: { code: string; details: Array<{ code: string }> } }>(page, '/api/v1/attempts', { assessment_set_id: d.drill.assessment_set_id });
  expect(locked.status).toBe(403);
  expect(locked.body.error.code).toBe('LOCKED_CONTENT');
  expect(locked.body.error.details[0]!.code).toBe('TIER_LOCKED');
  const bad = await apiPost<{ error: { code: string } }>(page, '/api/v1/attempts', { assessment_set_id: 'bukan-uuid' });
  expect(bad.status).toBe(400);
});
