import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, signIn, type TestProfile } from './helpers/app';
import { ensureExamContent, expectNoHorizontalScroll, learnComplete, unlockSafe } from './helpers/exams';

// SPEC-013 addendum (ADR-004): Speaking dinilai AI pihak ketiga. Mini-Task Speaking sintetis 3.4.1 ("Terapkan"):
// kartu prompt siap-salin + form 4 kriteria (tempel blok PLATFORM RESULT atau isi manual); Overall dihitung server; skor
// masuk radar. Perekaman/STT lokal (SPEC-013 bagian utama) sudah digantikan ADR-004 dan tidak diuji di sini.
const orig = { headers: { Origin: BASE_URL } };
let profile: TestProfile;
let subId = '';

// Server dev kompilasi rute sesuai-permintaan dan mesin bisa sedang sibuk: beri batas waktu longgar per tes.
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  test.setTimeout(240_000); // impor konten + pemanasan rute dev (kompilasi dingin)
  await ensureExamContent();
  profile = await createProfile('speak');
});
test.afterAll(() => deleteProfile(profile));
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await signIn(context, profile);
});

async function prepare(page: Page) {
  if (subId) return; // materi cukup diselesaikan sekali per profil
  unlockSafe(profile, '3.4.1');
  const d = await learnComplete(page.request, '3.4.1');
  subId = d.data.sub_module.id;
}
async function openApply(page: Page) {
  await prepare(page);
  await page.goto('/belajar/3.4.1');
  await page.getByRole('tab', { name: /^Terapkan/ }).click();
  await expect(page.getByTestId('speaking-external-prompt')).toBeVisible();
}
const speakingRadar = async (page: Page) => {
  const r = (await (await page.request.get('/api/v1/me/skills/radar')).json()) as { data: { skills: Array<{ skill: string; score_percent: number | null; estimated_band: number | null; sample_size: number }> } };
  return r.data.skills.find((s) => s.skill === 'SPEAKING')!;
};

test('kartu Speaking eksternal: judul, petunjuk, tombol Salin prompt menyalin prompt lengkap (soal, rubrik 4 kriteria, format PLATFORM RESULT)', async ({ page, isMobile }) => {
  await openApply(page);
  const card = page.getByTestId('speaking-external-prompt');
  await expect(card).toContainText('Latihan Speaking dengan AI suara');
  await expect(card).toContainText('Perkiraan latihan, bukan skor resmi IELTS.');
  await card.getByRole('button', { name: 'Salin prompt' }).click();
  await expect(page.getByText('Prompt disalin').first()).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('What do you usually do on weekends?'); // soal
  for (const c of ['FLUENCY', 'LEXICAL', 'GRAMMAR', 'PRONUNCIATION']) expect(clip).toContain(c);
  for (const b of ['Band 4', 'Band 5', 'Band 6', 'Band 7', 'Band 8']) expect(clip).toContain(b); // deskriptor band 4-8
  expect(clip).toContain('=== PLATFORM RESULT ===');
  expect(clip).toContain('=== END ===');
  expect(clip).toMatch(/cap FLUENCY at 5\.5/); // aturan kalibrasi
  // "Lihat isi prompt" menampilkan prompt yang sama sebagai teks polos.
  await card.getByText('Lihat isi prompt').click();
  await expect(card.locator('pre')).toContainText('=== PLATFORM RESULT ===');
  if (isMobile) await expectNoHorizontalScroll(page);
});

test('tempel blok PLATFORM RESULT: koma/titik desimal terbaca, nilai bukan kelipatan 0,5 ditolak (kolom tetap kosong)', async ({ page }) => {
  await openApply(page);
  const form = page.getByTestId('external-score-form');
  const paste = form.getByLabel('Tempel jawaban AI (opsional)');
  await paste.fill('Feedback panjang...\n=== PLATFORM RESULT ===\nFLUENCY: 6,5\nLEXICAL: 6.0\nGRAMMAR: 6\nPRONUNCIATION: 5.5\nOVERALL: 6.0\n=== END ===');
  await form.getByRole('button', { name: 'Isi otomatis dari tempelan' }).click();
  await expect(form.getByText('Skor terbaca. Periksa lalu simpan.')).toBeVisible();
  await expect(form.getByLabel('Fluency & Coherence')).toHaveValue('6.5');
  await expect(form.getByLabel('Lexical Resource')).toHaveValue('6');
  await expect(form.getByLabel('Grammatical Range & Accuracy')).toHaveValue('6');
  await expect(form.getByLabel('Pronunciation')).toHaveValue('5.5');
  await expect(page.getByTestId('external-overall')).toContainText('6.0'); // (6.5+6+6+5.5)/4 = 6.0
  // Nilai tidak valid (6.3) tidak diisi; pesan sebagian.
  await paste.fill('=== PLATFORM RESULT ===\nFLUENCY: 6.3\nLEXICAL: 7\nGRAMMAR: 7\nPRONUNCIATION: abc\n=== END ===');
  await form.getByLabel('Fluency & Coherence').selectOption('');
  await form.getByLabel('Pronunciation').selectOption('');
  await form.getByRole('button', { name: 'Isi otomatis dari tempelan' }).click();
  await expect(form.getByText('Sebagian skor tidak terbaca. Lengkapi kolom yang masih kosong.')).toBeVisible();
  await expect(form.getByLabel('Fluency & Coherence')).toHaveValue('');
  await expect(form.getByLabel('Pronunciation')).toHaveValue('');
  await expect(form.getByRole('button', { name: 'Simpan skor' })).toBeDisabled();
});

test('Overall Speaking dihitung (dibulatkan ke 0,5: .25 naik ke .5, .75 naik ke 1,0) dan Simpan aktif hanya bila 4 kriteria terisi', async ({ page }) => {
  await openApply(page);
  const form = page.getByTestId('external-score-form');
  const overall = page.getByTestId('external-overall');
  await expect(overall).toContainText('-');
  const set = async (a: string, b: string, c: string, d: string) => {
    await form.getByLabel('Fluency & Coherence').selectOption(a);
    await form.getByLabel('Lexical Resource').selectOption(b);
    await form.getByLabel('Grammatical Range & Accuracy').selectOption(c);
    await form.getByLabel('Pronunciation').selectOption(d);
  };
  await form.getByLabel('Fluency & Coherence').selectOption('6');
  await expect(form.getByRole('button', { name: 'Simpan skor' })).toBeDisabled();
  await set('6', '6', '6.5', '6.5');
  await expect(overall).toContainText('6.5'); // 6.25 -> 6.5
  await set('7', '7', '6.5', '6.5');
  await expect(overall).toContainText('7.0'); // 6.75 -> 7.0
  await set('6', '6', '6', '6.5');
  await expect(overall).toContainText('6.0'); // 6.125 -> 6.0
  await expect(form.getByRole('button', { name: 'Simpan skor' })).toBeEnabled();
});

test('simpan skor: tersimpan (pesan), radar Speaking terisi; Overall dihitung server; klien tidak boleh mengirim overall; kirim ulang menambah run_number', async ({ page }) => {
  await openApply(page);
  const before = await speakingRadar(page);
  expect(before.sample_size, 'sebelum skor: radar Speaking kosong').toBe(0);
  const form = page.getByTestId('external-score-form');
  await form.getByLabel('Fluency & Coherence').selectOption('6');
  await form.getByLabel('Lexical Resource').selectOption('6.5');
  await form.getByLabel('Grammatical Range & Accuracy').selectOption('6');
  await form.getByLabel('Pronunciation').selectOption('6');
  await form.getByLabel('AI yang dipakai').selectOption('GEMINI');
  await form.getByLabel('Catatan umpan balik AI (opsional)').fill('Bagus tetapi kurang contoh.');
  const resp = page.waitForResponse((r) => r.url().includes('/submissions/speaking-external') && r.request().method() === 'POST');
  await form.getByRole('button', { name: 'Simpan skor' }).click();
  const r = await resp;
  expect(r.status()).toBe(201);
  const body = (await r.json()) as { data: { submission: { kind: string }; evaluation: { overall_band: number; method: string; criteria?: unknown } } };
  expect(body.data.evaluation.method).toBe('EXTERNAL_AI');
  expect(body.data.evaluation.overall_band).toBe(6);
  await expect(page.getByText('Skor Speaking tersimpan dan masuk ke radar serta prediksi band.').first()).toBeVisible();
  const after = await speakingRadar(page);
  expect(after.sample_size).toBeGreaterThanOrEqual(1);
  expect(after.estimated_band ?? after.score_percent, JSON.stringify(after)).not.toBeNull();
  // Kontrak: overall dari klien ditolak (strictObject); nilai bukan kelipatan 0,5 ditolak.
  const withOverall = await page.request.post('/api/v1/submissions/speaking-external', {
    ...orig,
    data: { kind: 'MINI_TASK_SPEAKING', sub_module_id: subId, tool: 'CLAUDE', criteria_scores: { fluency: 6, lexical: 6, grammar: 6, pronunciation: 6 }, overall_band: 9 },
  });
  expect(withOverall.status()).toBe(400);
  const badStep = await page.request.post('/api/v1/submissions/speaking-external', {
    ...orig,
    data: { kind: 'MINI_TASK_SPEAKING', sub_module_id: subId, tool: 'CLAUDE', criteria_scores: { fluency: 6.3, lexical: 6, grammar: 6, pronunciation: 6 } },
  });
  expect(badStep.status()).toBe(400);
  // Kirim ulang untuk konteks yang sama diterima; nilai terbaru dipakai (Overall server).
  const again = await page.request.post('/api/v1/submissions/speaking-external', {
    ...orig,
    data: { kind: 'MINI_TASK_SPEAKING', sub_module_id: subId, tool: 'CHATGPT', criteria_scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 6.5 } },
  });
  expect(again.status(), await again.text()).toBe(201);
  expect(((await again.json()) as { data: { evaluation: { overall_band: number } } }).data.evaluation.overall_band).toBe(7); // 6.875 -> 7.0
});

test('validasi konteks: Mini-Task sebelum materi selesai -> 409 LEARN_NOT_COMPLETED; kind tidak dikenal / konteks ganda -> 400', async ({ page, context }) => {
  // Profil lain tanpa materi selesai pada 3.4.1.
  const other = await createProfile('speak2');
  try {
    await context.clearCookies();
    await signIn(context, other);
    unlockSafe(other, '3.4.1');
    const d = (await (await page.request.get('/api/v1/sub-modules/3.4.1')).json()) as { data: { sub_module: { id: string } } };
    const base = { tool: 'CLAUDE', criteria_scores: { fluency: 6, lexical: 6, grammar: 6, pronunciation: 6 } };
    const notDone = await page.request.post('/api/v1/submissions/speaking-external', { ...orig, data: { ...base, kind: 'MINI_TASK_SPEAKING', sub_module_id: d.data.sub_module.id } });
    expect(notDone.status()).toBe(409);
    expect(((await notDone.json()) as { error: { code: string } }).error.code).toBe('LEARN_NOT_COMPLETED');
    const badKind = await page.request.post('/api/v1/submissions/speaking-external', { ...orig, data: { ...base, kind: 'WRITING_TASK1', sub_module_id: d.data.sub_module.id } });
    expect(badKind.status()).toBe(400);
    const mixed = await page.request.post('/api/v1/submissions/speaking-external', { ...orig, data: { ...base, kind: 'MINI_TASK_SPEAKING', sub_module_id: d.data.sub_module.id, attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a' } });
    expect(mixed.status()).toBe(400);
  } finally {
    await context.clearCookies();
    deleteProfile(other);
  }
});
