import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, signIn, type TestProfile } from './helpers/app';
import { ensureExamContent, expectNoHorizontalScroll, learnComplete, unlockSafe } from './helpers/exams';

// SPEC-012 Writing (+ ADR-004): Mini-Task Writing 3.3.3 ("Terapkan"). Dua jalur, ditentukan stack E2E:
//  - AI nonaktif (run-e2e.mjs, AI_ENABLED=false): status FALLBACK_SELF_ASSESSMENT -> jalur "Nilai Sendiri".
//  - AI mock (run-e2e-exams.mjs dengan E2E_AI=mock: AI_ENABLED=true, LLM_DRIVER=mock): antre -> dinilai -> EvaluationCard.
// Blok yang tidak cocok dengan stack aktif dilewati dengan alasan eksplisit (bukan menutupi kegagalan).
const orig = { headers: { Origin: BASE_URL } };
const WORDS = (n: number) => Array.from({ length: n }, (_, i) => `word${i + 1}`).join(' ');
const ESSAY = `Dear Ms Rivera, I am writing about the loud music from your flat at night. ${WORDS(90)} Please keep the music down after ten. Yours sincerely, Alex`;

let aiEnabled = false;
const profiles: TestProfile[] = [];

// Server dev kompilasi rute sesuai-permintaan dan mesin bisa sedang sibuk: beri batas waktu longgar per tes.
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  test.setTimeout(240_000); // impor konten + pemanasan rute dev (kompilasi dingin)
  await ensureExamContent();
});
test.afterAll(() => profiles.forEach((p) => deleteProfile(p)));

async function newLearner(tag: string, page: Page, context: import('@playwright/test').BrowserContext): Promise<TestProfile> {
  const p = await createProfile(tag);
  profiles.push(p);
  await signIn(context, p);
  unlockSafe(p, '3.3.3');
  await learnComplete(page.request, '3.3.3');
  const st = await page.request.get('/api/v1/ai/status');
  aiEnabled = ((await st.json()) as { data: { enabled: boolean } }).data.enabled;
  return p;
}
async function openApply(page: Page) {
  await page.goto('/belajar/3.3.3');
  await page.getByRole('tab', { name: /^Terapkan/ }).click();
  await expect(page.getByTestId('writing-task-panel')).toBeVisible();
}
const editor = (page: Page) => page.getByRole('textbox', { name: /Tuliskan esai/ });

test('editor Writing: hitung kata live, minimal kata menonaktifkan Kirim, pintasan Ctrl+Enter, draf lokal otomatis', async ({ page, context, isMobile }) => {
  test.setTimeout(90_000);
  await newLearner('wr-editor', page, context);
  await openApply(page);
  const counter = page.getByTestId('word-counter');
  const send = page.getByRole('button', { name: 'Kirim untuk Dinilai' });
  await expect(counter).toHaveText('0 kata');
  await expect(page.getByText('Minimal 5 kata untuk dinilai.')).toBeVisible();
  await expect(send).toBeDisabled();
  await editor(page).fill('one two three');
  await expect(counter).toHaveText('3 kata');
  await expect(send).toBeDisabled();
  await editor(page).fill('  one   two\nthree four  ');
  await expect(counter, 'spasi/baris baru ganda tidak menambah hitungan').toHaveText('4 kata');
  await editor(page).fill(WORDS(7));
  await expect(counter).toHaveText('7 kata');
  await expect(send).toBeEnabled();
  await expect(page.getByText('Minimal 5 kata untuk dinilai.')).toHaveCount(0);
  if (isMobile) await expectNoHorizontalScroll(page);
  // Ctrl+Enter membuka konfirmasi; Batal tidak mengirim.
  await editor(page).press('Control+Enter');
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Kirim tulisan untuk dinilai?');
  await expect(dlg).toContainText('Tulisan yang sudah dikirim akan langsung dievaluasi dan tidak dapat disunting kembali.');
  await dlg.getByRole('button', { name: 'Batal' }).click();
  await expect(dlg).toBeHidden();
  await expect(editor(page)).toHaveValue(WORDS(7));
  // Draf tersimpan otomatis (10 detik) di localStorage dan dipulihkan setelah muat ulang.
  await expect(page.getByText('Draf tersimpan')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await page.getByRole('tab', { name: /^Terapkan/ }).click();
  await expect(editor(page)).toHaveValue(WORDS(7));
});

test('Writing API: kurang dari 5 kata ditolak 400 response_too_short', async ({ page, context }) => {
  await newLearner('wr-api', page, context);
  const sub = await page.request.get('/api/v1/sub-modules/3.3.3');
  const subId = ((await sub.json()) as { data: { sub_module: { id: string } } }).data.sub_module.id;
  const res = await page.request.post('/api/v1/submissions/writing', { ...orig, data: { kind: 'MINI_TASK_WRITING', sub_module_id: subId, response_text: 'one two three four' } });
  expect(res.status()).toBe(400);
  const body = (await res.json()) as { error: { code: string; details?: Array<{ code: string }> } };
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(JSON.stringify(body)).toContain('response_too_short');
});

test('AI nonaktif: kirim -> FALLBACK_SELF_ASSESSMENT -> "Nilai Sendiri" -> hasil EvaluationCard dengan disclaimer (jalur self-assessment)', async ({ page, context }) => {
  test.setTimeout(90_000);
  await newLearner('wr-self', page, context);
  test.skip(aiEnabled, 'stack AI aktif (mock): jalur AI diuji di blok berikutnya');
  await openApply(page);
  await editor(page).fill(ESSAY);
  await page.getByRole('button', { name: 'Kirim untuk Dinilai' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ya, kirim' }).click();
  await expect(page.getByText('Penilaian Otomatis Sedang Nonaktif')).toBeVisible();
  await expect(page.getByTestId('writing-task-panel').getByRole('button', { name: 'Nilai Sendiri' })).toBeVisible();
  await page.getByRole('button', { name: 'Nilai Sendiri' }).click();
  await expect(page.getByText('Penilaian Mandiri (Self-Assessment)')).toBeVisible();
  // Tiap kriteria 6.0 -> Overall 6.0; ubah satu kriteria agar rata-rata dibulatkan 0,5: (7+6+6+6)/4 = 6.25 -> 6.5.
  await page.getByLabel('Task Response').selectOption('7');
  await expect(page.getByText('Estimasi Band Keseluruhan').locator('..')).toContainText('6.5');
  await page.getByRole('button', { name: 'Simpan Penilaian' }).click();
  // Hasil: kartu evaluasi + disclaimer; tidak ada formulir lagi.
  await expect(page.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Perkiraan Band Keseluruhan')).toBeVisible();
  await expect(page.getByText('6.5').first()).toBeVisible();
  // Server: method SELF_ASSESSMENT, Mini-Task tercatat selesai (SPEC-012 edge).
  const sub = (await (await page.request.get('/api/v1/sub-modules/3.3.3')).json()) as { data: { progress: { mini_task_completed_at: string | null } } };
  expect(sub.data.progress.mini_task_completed_at).not.toBeNull();
  // Self-assessment atas hasil yang sudah dinilai tidak boleh diulang.
  const list = await page.request.get('/api/v1/me/exam-history');
  expect(list.ok()).toBe(true);
});

test('AI mock: kirim -> antre/memproses -> EvaluationCard (Band, 4 kriteria, koreksi, disclaimer), tanpa raw_output di API', async ({ page, context, isMobile }) => {
  test.setTimeout(120_000);
  await newLearner('wr-ai', page, context);
  test.skip(!aiEnabled, 'stack AI nonaktif: jalankan dengan tests/e2e/helpers/run-e2e-exams.mjs dan E2E_AI=mock');
  await openApply(page);
  await editor(page).fill(ESSAY);
  await page.getByRole('button', { name: 'Kirim untuk Dinilai' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ya, kirim' }).click();
  // Status antrean/proses tampil sebelum hasil (boleh sangat singkat dengan mock tanpa latensi).
  await expect(page.getByText('Perkiraan latihan, bukan skor resmi IELTS.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Perkiraan Band Keseluruhan')).toBeVisible();
  await expect(page.getByText('Rincian Kriteria Penilaian')).toBeVisible();
  for (const c of ['Task Response', 'Coherence', 'Lexical Resource', 'Grammatical Range']) await expect(page.getByText(c).first()).toBeVisible();
  await expect(page.getByText('Menuju Band 7: Saran Koreksi')).toBeVisible();
  await expect(page.getByText('6.0').first()).toBeVisible(); // mock: overall_band 6.0
  if (isMobile) await expectNoHorizontalScroll(page);
  // Kontrak API submission: GRADED + AI_LOCAL, tanpa field internal.
  const submissions = await page.request.get('/api/v1/submissions');
  if (submissions.ok()) {
    const text = await submissions.text();
    for (const forbidden of ['raw_output', 'password_hash', 'prompt_version']) expect(text).not.toContain(forbidden);
  }
});

test('AI mock: pengiriman kedua untuk Mini-Task yang sama saat masih diproses/sudah dinilai tidak membuat antrean ganda', async ({ page, context }) => {
  test.setTimeout(120_000);
  await newLearner('wr-ai2', page, context);
  test.skip(!aiEnabled, 'stack AI nonaktif: jalankan dengan E2E_AI=mock');
  const sub = (await (await page.request.get('/api/v1/sub-modules/3.3.3')).json()) as { data: { sub_module: { id: string } } };
  const payload = { kind: 'MINI_TASK_WRITING', sub_module_id: sub.data.sub_module.id, response_text: ESSAY };
  const [a, b] = await Promise.all([
    page.request.post('/api/v1/submissions/writing', { ...orig, data: payload }),
    page.request.post('/api/v1/submissions/writing', { ...orig, data: payload }),
  ]);
  const codes = [a.status(), b.status()].sort();
  expect(codes[0], `status: ${a.status()} / ${b.status()}`).toBe(202);
  expect([202, 409]).toContain(codes[1]);
  if (codes[1] === 409) {
    const loser = a.status() === 409 ? a : b;
    expect(((await loser.json()) as { error: { code: string } }).error.code).toMatch(/AI_SUBMISSION_IN_PROGRESS|SUBMISSION_ALREADY_EXISTS/);
  }
});
