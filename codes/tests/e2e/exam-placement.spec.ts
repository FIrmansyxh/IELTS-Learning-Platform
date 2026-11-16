import { expect, test, type APIRequestContext } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, signIn, type TestProfile } from './helpers/app';
import { answerVisible, completeSubModule, ensureExamContent, examIds, expectNoHorizontalScroll, solve, type ApiQuestion } from './helpers/exams';

// SPEC-015 Placement Test adaptif (paket sintetis: 30 soal, 6 per tingkat kesulitan 1-5; prompt memuat tingkatnya,
// mis. "Placement level 4 item 2"). Dijalankan lewat tests/e2e/helpers/run-e2e.mjs.
const orig = { headers: { Origin: BASE_URL } };
const levelOf = (prompt: string) => Number(/Placement level (\d)/.exec(prompt)![1]);

const made: TestProfile[] = [];
async function fresh(tag: string): Promise<TestProfile> {
  const p = await createProfile(tag);
  made.push(p);
  return p;
}
// Server dev kompilasi rute sesuai-permintaan dan mesin bisa sedang sibuk: beri batas waktu longgar per tes.
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  test.setTimeout(240_000); // impor konten + pemanasan rute dev (kompilasi dingin)
  await ensureExamContent();
});
test.afterAll(() => made.forEach((p) => deleteProfile(p)));
test.beforeEach(({ page }) => {
  page.on('dialog', (d) => void d.accept());
});

interface PlacementState {
  available: boolean;
  blocked_reason: string | null;
  assessment_set_id: string | null;
  question_count: number;
  pending_result: { attempt_id: string; recommended_tier: number } | null;
}
const status = async (r: APIRequestContext) => ((await (await r.get('/api/v1/placement')).json()) as { data: PlacementState }).data;

/** Jalankan seluruh placement lewat API; `plan(i, q)` menentukan benar/salah tiap soal. Mengembalikan attempt id + riwayat tingkat. */
async function runViaApi(r: APIRequestContext, plan: (i: number, q: ApiQuestion) => boolean, max = 25) {
  const st = await status(r);
  const start = await r.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: st.assessment_set_id } });
  expect(start.status(), await start.text()).toBe(201);
  const at = ((await start.json()) as { data: { id: string; questions: ApiQuestion[] } }).data;
  let q: ApiQuestion | null = at.questions[0]!;
  const levels: number[] = [];
  let i = 0;
  while (q && i < max) {
    levels.push(levelOf(q.prompt));
    const res = await r.put(`/api/v1/attempts/${at.id}/answers/${q.question_id}`, { ...orig, data: { response: solve(q, !plan(i, q)) } });
    expect(res.ok(), await res.text()).toBe(true);
    q = ((await res.json()) as { data: { next_question: ApiQuestion | null } }).data.next_question;
    i++;
  }
  const sub = await r.post(`/api/v1/attempts/${at.id}/submit`, orig);
  expect(sub.ok(), await sub.text()).toBe(true);
  return { id: at.id, levels, count: i };
}

test('ketersediaan + kontrak awal: available, 25 soal, hanya soal pertama (kesulitan 3) tersaji tanpa difficulty/kunci jawaban', async ({ page, context }) => {
  const p = await fresh('pl-start');
  await signIn(context, p);
  const st = await status(page.request);
  expect(st).toMatchObject({ available: true, blocked_reason: null, question_count: 25 });
  expect(st.assessment_set_id).toBeTruthy();
  const start = await page.request.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: st.assessment_set_id } });
  expect(start.status()).toBe(201);
  const raw = await start.text();
  const at = JSON.parse(raw) as { data: { id: string; question_count: number; questions: ApiQuestion[] } };
  expect(at.data.questions).toHaveLength(1);
  expect(at.data.question_count).toBe(25);
  expect(levelOf(at.data.questions[0]!.prompt), 'soal pertama berkesulitan 3').toBe(3);
  expect(raw).not.toContain('difficulty');
  expect(raw).not.toContain('correct_answers');
  expect(raw).not.toContain('explanation_id');
  // Jawaban benar -> soal berikutnya berkesulitan 4; soal yang sama dijawab lagi -> 409.
  const q1 = at.data.questions[0]!;
  const a1 = await page.request.put(`/api/v1/attempts/${at.data.id}/answers/${q1.question_id}`, { ...orig, data: { response: solve(q1) } });
  const n1 = ((await a1.json()) as { data: { next_question: ApiQuestion; feedback: unknown } }).data;
  expect(n1.feedback).toBeNull();
  expect(levelOf(n1.next_question.prompt)).toBe(4);
  const again = await page.request.put(`/api/v1/attempts/${at.data.id}/answers/${q1.question_id}`, { ...orig, data: { response: solve(q1) } });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe('QUESTION_ALREADY_ANSWERED');
  const unknown = await page.request.put(`/api/v1/attempts/${at.data.id}/answers/Q-E2E-PL-NOPE`, { ...orig, data: { response: { option_ids: ['x'] } } });
  expect(unknown.status()).toBe(404);
  // GET attempt hanya memuat soal yang tersaji (1 dijawab + 1 pending).
  const g = (await (await page.request.get(`/api/v1/attempts/${at.data.id}`)).json()) as { data: { questions: unknown[] } };
  expect(g.data.questions).toHaveLength(2);
  // Salah pada soal berkesulitan 4 -> berikutnya berkesulitan 3.
  const a2 = await page.request.put(`/api/v1/attempts/${at.data.id}/answers/${n1.next_question.question_id}`, { ...orig, data: { response: solve(n1.next_question, true) } });
  const n2 = ((await a2.json()) as { data: { next_question: ApiQuestion } }).data;
  expect(levelOf(n2.next_question.prompt)).toBe(3);
});

test('UI Placement: satu soal per layar, tombol Jawab nonaktif sampai ada jawaban, tanpa navigator/sebelumnya/umpan balik, adaptif naik-turun', async ({ page, context, isMobile }) => {
  const p = await fresh('pl-ui');
  await signIn(context, p);
  await page.goto('/');
  const entry = page.getByRole('link', { name: 'Ikut Placement Test' }).or(page.getByRole('button', { name: 'Ikut Placement Test' })).first();
  await expect(entry, 'SPEC-015: titik masuk "Ikut Placement Test" di beranda pengguna baru').toBeVisible({ timeout: 8000 });
  await entry.click();
  await expect(page).toHaveURL(/\/ujian\/mulai\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: /Placement Test/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mulai Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByText('Soal 1 dari 25')).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByTestId('placement-answer-btn')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Soal sebelumnya' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Navigasi soal' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Periksa' })).toHaveCount(0);
  if (isMobile) await expectNoHorizontalScroll(page);

  // Soal 1 (level 3) benar -> soal 2 level 4 -> salah -> soal 3 level 3.
  const p1 = await answerVisible(page);
  expect(levelOf(p1)).toBe(3);
  await expect(page.getByTestId('placement-answer-btn')).toBeEnabled();
  await page.getByTestId('placement-answer-btn').click();
  await expect(page.getByText('Soal 2 dari 25')).toBeVisible();
  const p2 = await answerVisible(page);
  expect(levelOf(p2)).toBe(4);
  await page.getByTestId('placement-answer-btn').click();
  await expect(page.getByText('Soal 3 dari 25')).toBeVisible();
  const p3 = await answerVisible(page, true);
  expect(levelOf(p3)).toBe(3);
  await page.getByTestId('placement-answer-btn').click();
  await expect(page.getByText('Soal 4 dari 25')).toBeVisible();
  const p4 = await answerVisible(page, true);
  expect(levelOf(p4), 'p3 benar -> naik ke 4').toBe(4);
});

test('placement lewat UI (8 soal benar lalu Akhiri): rekomendasi Tier 4, apply -> Tier 1-3 Dilewati, Tier 4 terbuka, /peta mencerminkan', async ({ page, context, isMobile }) => {
  test.setTimeout(240_000);
  const p = await fresh('pl-full');
  await signIn(context, p);
  const ids = await examIds(page.request);
  await page.goto(`/ujian/mulai/${ids.placement}`);
  await page.getByRole('button', { name: 'Mulai Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const attemptId = page.url().split('/').pop()!;
  for (let i = 1; i <= 8; i++) {
    await expect(page.getByText(`Soal ${i} dari 25`)).toBeVisible();
    await answerVisible(page);
    await page.getByTestId('placement-answer-btn').click();
  }
  await expect(page.getByText('Soal 9 dari 25')).toBeVisible();
  await page.getByRole('button', { name: 'Akhiri' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ya, Akhiri' }).click();
  await expect(page).toHaveURL(new RegExp(`/ujian/${attemptId}/hasil$`), { timeout: 30_000 });
  const view = page.getByTestId('placement-result-view');
  await expect(view).toContainText('Rekomendasi: Mulai di Tier 4');
  await expect(view).toContainText('8 dari 8 soal dijawab dengan benar');
  await expect(view).toContainText('Ini rekomendasi latihan, bukan penilaian resmi IELTS.');
  await expect(page.getByTestId('apply-recommended-btn')).toHaveText(/Mulai di Tier 4/);
  await expect(page.getByTestId('start-tier-1-btn')).toBeVisible();
  await expect(page.getByTestId('select-tier-trigger')).toBeVisible();
  if (isMobile) await expectNoHorizontalScroll(page);
  // Hasil server: tingkat kemampuan & tier.
  const r = (await (await page.request.get(`/api/v1/attempts/${attemptId}/result`)).json()) as { data: { placement: { recommended_tier: number; ability: number; correct_count: number; served_count: number } } };
  expect(r.data.placement).toMatchObject({ recommended_tier: 4, correct_count: 8, served_count: 8 });
  // Belum di-apply: placement menunggu, kartu di beranda.
  const st = await status(page.request);
  expect(st.blocked_reason).toBe('RESULT_PENDING_APPLY');
  expect(st.pending_result?.recommended_tier).toBe(4);
  await page.goto('/');
  await expect(page.getByText('Hasil Placement Anda Menunggu')).toBeVisible();
  await page.getByRole('link', { name: 'Lihat Hasil' }).or(page.getByRole('button', { name: 'Lihat Hasil' })).first().click();
  await expect(page).toHaveURL(new RegExp(`/ujian/${attemptId}/hasil$`));
  // Terapkan rekomendasi: dialog menyebut Tier yang dilewati.
  await page.getByTestId('apply-recommended-btn').click();
  await expect(page.getByRole('dialog')).toContainText(/Tier 1, 2(,| dan) 3 akan ditandai Dilewati/);
  await page.getByTestId('confirm-apply-btn').click();
  await expect(page.getByText('Tier awal Anda: Tier 4')).toBeVisible();
  await expect(page).toHaveURL(/\/peta$/, { timeout: 15_000 });
  const tree = (await (await page.request.get('/api/v1/curriculum/tree')).json()) as { data: { tiers: Array<{ tier_number: number; status: string; unlock_source: string | null }> } };
  const by = (n: number) => tree.data.tiers.find((t) => t.tier_number === n)!;
  expect(['SKIPPED', 'COMPLETED']).toContain(by(1).status);
  expect(by(1).status).toBe('SKIPPED');
  expect(by(2).status).toBe('SKIPPED');
  expect(by(3).status).toBe('SKIPPED');
  expect(by(4).status).toBe('UNLOCKED');
  expect(by(1).unlock_source).toBe('PLACEMENT');
  await expect(page.getByText('Dilewati').first()).toBeVisible();
  if (isMobile) await expectNoHorizontalScroll(page);
  // Setelah apply: tidak bisa diulang.
  expect((await status(page.request)).blocked_reason).toBe('ALREADY_COMPLETED');
  const again = await page.request.post('/api/v1/placement/apply', { ...orig, data: { attempt_id: attemptId, tier_number: 4 } });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe('PLACEMENT_ALREADY_APPLIED');
  const restart = await page.request.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: ids.placement } });
  expect(restart.status()).toBe(409);
  expect(((await restart.json()) as { error: { code: string } }).error.code).toBe('PLACEMENT_NOT_AVAILABLE');
});

test('placement penuh 25 soal (semua benar, API): tidak boleh ada galat server di tengah tes dan hasil memuat served_count 25', async ({ page, context }) => {
  test.setTimeout(75_000);
  const p = await fresh('pl-25');
  await signIn(context, p);
  const run = await runViaApi(page.request, () => true, 25);
  expect(run.count).toBe(25);
  const r = (await (await page.request.get(`/api/v1/attempts/${run.id}/result`)).json()) as { data: { placement: { served_count: number; recommended_tier: number } } };
  expect(r.data.placement.served_count).toBe(25);
  expect(r.data.placement.recommended_tier).toBe(4);
});

test('semua salah (API) -> Tier 1; hasil UI menyembunyikan "Mulai dari Tier 1"; apply Tier 2 ditolak (TIER_ABOVE_RECOMMENDATION); apply Tier 1 menandai selesai tanpa melewati Tier', async ({ page, context }) => {
  test.setTimeout(120_000);
  const p = await fresh('pl-wrong');
  await signIn(context, p);
  const run = await runViaApi(page.request, () => false, 8);
  expect(run.count).toBeLessThanOrEqual(25);
  // Staircase turun: tingkat tidak pernah naik setelah jawaban salah.
  for (let i = 1; i < run.levels.length; i++) expect(run.levels[i]!).toBeLessThanOrEqual(run.levels[i - 1]! + 0);
  await page.goto(`/ujian/${run.id}/hasil`);
  const view = page.getByTestId('placement-result-view');
  await expect(view).toContainText('Rekomendasi: Mulai di Tier 1');
  await expect(view).toContainText('0 dari');
  await expect(page.getByTestId('start-tier-1-btn')).toHaveCount(0);
  const bad = await page.request.post('/api/v1/placement/apply', { ...orig, data: { attempt_id: run.id, tier_number: 2 } });
  expect(bad.status()).toBe(409);
  expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('TIER_ABOVE_RECOMMENDATION');
  const ok = await page.request.post('/api/v1/placement/apply', { ...orig, data: { attempt_id: run.id, tier_number: 1 } });
  expect(ok.status(), await ok.text()).toBe(200);
  const tree = (await (await page.request.get('/api/v1/curriculum/tree')).json()) as { data: { tiers: Array<{ tier_number: number; status: string }> } };
  expect(tree.data.tiers.find((t) => t.tier_number === 1)!.status).toBe('UNLOCKED');
  expect(tree.data.tiers.find((t) => t.tier_number === 2)!.status).toBe('LOCKED');
  expect((await status(page.request)).blocked_reason).toBe('ALREADY_COMPLETED');
});

test('pilih Tier lain (semua benar): Tier 2 dipilih dari Select -> hanya Tier 1 Dilewati, Tier 2 terbuka', async ({ page, context }) => {
  test.setTimeout(120_000);
  const p = await fresh('pl-select');
  await signIn(context, p);
  const run = await runViaApi(page.request, () => true, 8);
  await page.goto(`/ujian/${run.id}/hasil`);
  await expect(page.getByTestId('placement-result-view')).toContainText('Rekomendasi: Mulai di Tier 4');
  await page.getByTestId('select-tier-trigger').click();
  await page.getByRole('option', { name: /Tier 2/ }).click();
  await page.getByTestId('apply-selected-btn').click();
  await expect(page.getByRole('dialog')).toContainText(/Tier 1 akan ditandai Dilewati/);
  await page.getByTestId('confirm-apply-btn').click();
  await expect(page).toHaveURL(/\/peta$/, { timeout: 15_000 });
  const tree = (await (await page.request.get('/api/v1/curriculum/tree')).json()) as { data: { tiers: Array<{ tier_number: number; status: string }> } };
  const st = (n: number) => tree.data.tiers.find((t) => t.tier_number === n)!.status;
  expect(st(1)).toBe('SKIPPED');
  expect(st(2)).toBe('UNLOCKED');
  expect(st(3)).toBe('LOCKED');
  // Apply ke Tier di atas rekomendasi untuk profil lain tidak relevan; apply atas attempt orang lain -> 404.
});

test('akhiri tes lebih awal: Dialog konfirmasi, hasil dihitung dari soal yang sudah dijawab; tanpa jawaban -> Tier 1', async ({ page, context }) => {
  const p = await fresh('pl-end');
  await signIn(context, p);
  const ids = await examIds(page.request);
  await page.goto(`/ujian/mulai/${ids.placement}`);
  await page.getByRole('button', { name: 'Mulai Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const attemptId = page.url().split('/').pop()!;
  await answerVisible(page);
  await page.getByTestId('placement-answer-btn').click();
  await expect(page.getByText('Soal 2 dari 25')).toBeVisible();
  await page.getByRole('button', { name: 'Akhiri' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Akhiri Tes Sekarang?');
  await expect(dlg).toContainText('Hasil akan dihitung dari soal yang sudah Anda jawab.');
  await dlg.getByRole('button', { name: 'Ya, Akhiri' }).click();
  await expect(page).toHaveURL(new RegExp(`/ujian/${attemptId}/hasil$`), { timeout: 30_000 });
  await expect(page.getByTestId('placement-result-view')).toContainText('1 dari 1 soal dijawab dengan benar');
});

test('placement tidak tersedia bila sudah ada progres (PROGRESS_EXISTS) dan POST attempts -> 409 PLACEMENT_NOT_AVAILABLE', async ({ page, context }) => {
  test.setTimeout(120_000);
  const p = await fresh('pl-block');
  await signIn(context, p);
  const ids = await examIds(page.request);
  await completeSubModule(page.request, '1.5.2');
  const st = await status(page.request);
  expect(st.available).toBe(false);
  expect(st.blocked_reason).toBe('PROGRESS_EXISTS');
  const r = await page.request.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: ids.placement } });
  expect(r.status()).toBe(409);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('PLACEMENT_NOT_AVAILABLE');
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Ikut Placement Test' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ikut Placement Test' })).toHaveCount(0);
});
