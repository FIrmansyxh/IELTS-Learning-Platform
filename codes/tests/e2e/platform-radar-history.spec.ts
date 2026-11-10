import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, finishDrill, signIn, type TestProfile } from './helpers/app';
import { apiFor, getJson, getLedger, getStats, getWarm, keepWarm, traceApiFailures, watchConsole } from './helpers/platform';

// SPEC-017 Radar 6 sumbu, prediksi band, riwayat latihan/ujian; lintas-fitur dengan Mix (SPEC-022: radar
// terbarui, poin/streak tidak berubah) dan Simulasi (SPEC-023: entri riwayat ujian). Skor objektif Grammar
// memakai Mix Builder karena hanya itu yang menghasilkan jawaban Grammar tanpa konten tambahan; Listening/
// Reading/Writing/Speaking-AI untuk vektor uji R1/R2 hanya terjangkau tes integrasi (band.itest.ts, skills).
test.describe.configure({ mode: 'serial' });

const DISCLAIMER = 'Perkiraan latihan, bukan skor resmi IELTS.';
const SKILL_ORDER = ['LISTENING', 'READING', 'WRITING', 'SPEAKING', 'GRAMMAR', 'VOCAB'];

interface Radar {
  skills: Array<{ skill: string; score_percent: number | null; estimated_band: number | null; sample_size: number; is_proxy: boolean; updated_at: string | null }>;
  target_band: number | null;
  prediction: {
    overall_band: number | null;
    indicative_band: number | null;
    range_low: number | null;
    range_high: number | null;
    complete: boolean;
    components: Record<string, number | null>;
    basis_note: string;
  };
  disclaimer: string;
}

let profile: TestProfile;
let other: TestProfile;
let api: APIRequestContext;
let stopWarm: (() => Promise<void>) | undefined;
let mixAttemptId = '';
let mixScore = -1;

// Mesin bersama dengan banyak agen + next dev: beri ruang waktu (bukan perilaku aplikasi).
test.describe.configure({ timeout: 120_000 });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  stopWarm = await keepWarm();
  profile = await createProfile('rad');
  other = await createProfile('rad2');
  api = await apiFor(profile);
});
test.afterAll(async () => {
  await api?.dispose();
  deleteProfile(profile);
  deleteProfile(other);
  await stopWarm?.();
});
let trace: ReturnType<typeof traceApiFailures>;
test.beforeEach(async ({ context, page }) => {
  await signIn(context, profile);
  trace = traceApiFailures(page);
});
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) trace.dump(info.title);
});

async function radar(a: APIRequestContext = api): Promise<Radar> {
  const r = await getJson<{ data: Radar }>(a, '/api/v1/me/skills/radar');
  expect(r.status).toBe(200);
  return r.body.data;
}

test('pengguna baru: radar 6 elemen berurutan, semua null, prediksi kosong, disclaimer dan target null', async () => {
  const r = await radar();
  expect(r.skills.map((s) => s.skill)).toEqual(SKILL_ORDER);
  for (const s of r.skills) {
    expect(s.score_percent, s.skill).toBeNull();
    expect(s.estimated_band, s.skill).toBeNull();
    expect(s.sample_size, s.skill).toBe(0);
    expect(s.is_proxy, s.skill).toBe(['GRAMMAR', 'VOCAB'].includes(s.skill));
  }
  expect(r.prediction).toMatchObject({ complete: false, overall_band: null, indicative_band: null, range_low: null, range_high: null });
  expect(r.target_band).toBeNull();
  expect(r.disclaimer).toBe(DISCLAIMER);
});

test('endpoint riwayat: validasi query (assessment_type palsu, page_size, page) dan kondisi kosong', async () => {
  const bad = await getWarm(api, '/api/v1/me/exam-history?assessment_type=FOO');
  expect(bad.status()).toBe(400);
  expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  expect((await getWarm(api, '/api/v1/me/band-predictions?page_size=101')).status()).toBe(400);
  expect((await getWarm(api, '/api/v1/me/band-predictions?page=0')).status()).toBe(400);
  expect((await getWarm(api, '/api/v1/me/exam-history?page_size=0')).status()).toBe(400);
  for (const t of ['SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'PLACEMENT_TEST']) {
    const ok = await getJson<{ data: unknown[]; meta: { total: number } }>(api, `/api/v1/me/exam-history?assessment_type=${t}`);
    expect(ok.status, t).toBe(200);
    expect(ok.body.data).toEqual([]);
    expect(ok.body.meta.total).toBe(0);
  }
  const preds = await getJson<{ data: unknown[]; meta: { page: number; page_size: number; total: number } }>(api, '/api/v1/me/band-predictions');
  expect(preds.body.data).toEqual([]);
  expect(preds.body.meta).toMatchObject({ page: 1, page_size: 20, total: 0 });
});

test('UI beranda tanpa data: kartu radar menampilkan kondisi kosong, tanpa grafik kosong', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/');
  await expect(page.getByText('Selesaikan latihan pertama untuk melihat radar Anda.')).toBeVisible();
  await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
  expect(watch.errors).toEqual([]);
});

test('UI /riwayat dialihkan ke /riwayat/ujian; kondisi kosong, tab Ujian | Penilaian AI', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/riwayat');
  await expect(page).toHaveURL(/\/riwayat\/ujian$/);
  await expect(page.getByRole('heading', { name: 'Riwayat Ujian & Evaluasi', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Ujian' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Belum ada riwayat perkembangan band.')).toBeVisible();
  await expect(page.getByText('Belum ada riwayat. Mulai latihan pertama Anda.')).toBeVisible();
  await page.getByRole('tab', { name: 'Penilaian AI' }).click();
  await expect(page.getByRole('tab', { name: 'Penilaian AI' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Penilaian AI Writing & Speaking')).toBeVisible();
  expect(watch.errors).toEqual([]);
});

async function chooseGrammarOnly(page: Page) {
  for (const s of ['Vocabulary', 'Reading', 'Writing', 'Speaking']) {
    const btn = page.getByRole('button', { name: new RegExp(`^${s}`) });
    if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
  }
  await expect(page.getByRole('button', { name: /^Grammar/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Pilihan ganda\s*\d+$/ }).click();
  await page.locator('#mix-count-input').fill('5');
  await expect(page.locator('output[for="mix-count-input"]')).toHaveText('5 soal');
}

test('lintas-fitur Mix: 5 soal Grammar memperbarui radar; poin, streak dan mahkota tidak berubah', async ({ page }) => {
  const beforeStats = await getStats(api);
  const beforeLedger = await getLedger(api);
  await page.goto('/latihan/campur');
  await chooseGrammarOnly(page);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await expect(page).toHaveURL(/\/latihan\/campur\/[0-9a-f-]{36}$/);
  mixAttemptId = page.url().split('/').pop()!;
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 5');
  await finishDrill(page, 5);
  await expect(page.getByRole('heading', { name: 'Hasil latihan campur' })).toBeVisible();

  const res = await getJson<{ data: { attempt: { score_percent: number; points_awarded: number; passed: boolean | null } } }>(api, `/api/v1/attempts/${mixAttemptId}/result`);
  expect(res.status).toBe(200);
  mixScore = res.body.data.attempt.score_percent;
  expect(res.body.data.attempt.points_awarded).toBe(0);
  expect(res.body.data.attempt.passed).toBeNull();

  // Poin/streak/mahkota identik, ledger identik.
  expect(await getStats(api)).toEqual(beforeStats);
  expect(await getLedger(api)).toEqual(beforeLedger);

  // Radar: hanya GRAMMAR terisi; sampel tepat 5 -> band dihitung; proksi.
  const r = await radar();
  const g = r.skills.find((s) => s.skill === 'GRAMMAR')!;
  expect(g.sample_size).toBe(5);
  expect(g.is_proxy).toBe(true);
  expect(g.score_percent).toBeCloseTo(mixScore, 1);
  expect(g.estimated_band, 'sampel = 5 -> band dihitung (batas inklusif)').not.toBeNull();
  expect(g.estimated_band! % 0.5).toBe(0);
  expect(g.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  for (const s of r.skills.filter((x) => x.skill !== 'GRAMMAR')) expect(s.sample_size, s.skill).toBe(0);
  // Grammar/Vocab tidak masuk rumus Overall: prediksi tetap kosong dan tidak lengkap.
  expect(r.prediction.complete).toBe(false);
  expect(r.prediction.overall_band).toBeNull();
  expect(r.prediction.indicative_band).toBeNull();
  expect(Object.values(r.prediction.components).every((v) => v === null)).toBe(true);
  // Riwayat prediksi: tidak ada baris (x null) dan riwayat ujian tetap kosong (Mix bukan ujian).
  const preds = await getJson<{ data: unknown[] }>(api, '/api/v1/me/band-predictions');
  expect(preds.body.data).toEqual([]);
  const hist = await getJson<{ data: unknown[] }>(api, '/api/v1/me/exam-history');
  expect(hist.body.data).toEqual([]);
});

test('UI radar: 6 sumbu berlabel, chart beraksesibilitas, kartu Indikatif, tabel alternatif 6 baris dengan Proksi', async ({ page, isMobile }) => {
  const watch = watchConsole(page);
  await page.goto('/');
  const card = page.locator('[data-slot="card"]').filter({ hasText: 'Radar Kesiapan 6 Keterampilan' });
  await expect(card).toBeVisible();
  await expect(card.locator('.recharts-wrapper')).toBeVisible();
  const full = ['Listening', 'Reading', 'Writing', 'Speaking', 'Grammar', 'Vocabulary'];
  const short = ['Lis', 'Rea', 'Wri', 'Spk', 'Gra', 'Voc'];
  const axis = card.locator('.recharts-polar-angle-axis-tick');
  await expect(axis).toHaveCount(6);
  const labels = (await axis.allTextContents()).map((t) => t.trim());
  expect(labels).toEqual(isMobile ? short : full);
  if (isMobile) {
    for (const t of ['Lis = Listening', 'Rea = Reading', 'Wri = Writing', 'Spk = Speaking', 'Gra = Grammar', 'Voc = Vocabulary']) {
      await expect(card.getByText(t)).toBeVisible();
    }
  }
  // Ringkasan teks untuk chart (role=img + aria-label).
  const img = card.locator('[role="img"][aria-label]').first();
  await expect(img).toHaveAttribute('aria-label', /Skor terendah|Belum cukup data|Data kesiapan/);
  // Kartu prediksi: berlabel "Indikatif" karena belum lengkap + catatan dasar + disclaimer.
  await expect(card.getByText('Indikatif', { exact: true })).toBeVisible();
  // Hanya Grammar (bukan komponen Overall): catatan dasar menyatakan belum ada data untuk prediksi band.
  await expect(card.getByText('Belum ada data latihan untuk prediksi band.')).toBeVisible();
  await expect(card.getByText(DISCLAIMER)).toBeVisible();
  // Tanpa target: tidak ada kotak Target Band.
  await expect(card.getByText('Target Band', { exact: true })).toHaveCount(0);

  await card.getByRole('button', { name: 'Lihat sebagai tabel' }).click();
  const table = card.locator('table');
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(6);
  const rows = (await table.locator('tbody tr').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  expect(rows[0]).toContain('Listening');
  expect(rows[4]).toContain('Grammar');
  expect(rows[4]).toContain('Proksi');
  expect(rows[5]).toContain('Vocabulary');
  expect(rows[5]).toContain('Proksi');
  expect(rows[0]).toContain('belum cukup data');
  await expect(table.locator('tbody tr').nth(4)).not.toContainText('belum cukup data');
  await expect(table).toHaveAttribute('aria-label', /.+/);
  // Tidak ada overflow horizontal pada kartu.
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  await card.getByRole('button', { name: 'Lihat sebagai radar' }).click();
  await expect(card.locator('.recharts-wrapper')).toBeVisible();
  expect(watch.errors).toEqual([]);
});

test('target band: garis/legenda target hanya muncul bila target_band diisi (PATCH /me/profile)', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-slot="card"]').filter({ hasText: 'Radar Kesiapan 6 Keterampilan' });
  await expect(card.getByText('Target Band', { exact: true })).toHaveCount(0);
  const r = await api.patch('/api/v1/me/profile', { data: { target_band: 6.5 } });
  expect(r.status(), await r.text()).toBe(200);
  expect((await radar()).target_band).toBe(6.5);
  await page.reload();
  await expect(card.getByText('Target Band', { exact: true })).toBeVisible();
  await expect(card.getByText('6.5', { exact: true }).first()).toBeVisible();
  const clear = await api.patch('/api/v1/me/profile', { data: { target_band: null } });
  expect(clear.status()).toBe(200);
  await page.reload();
  await expect(card.getByText('Target Band', { exact: true })).toHaveCount(0);
});

test('isolasi: profil lain tidak melihat Grammar milik profil ini; radar-nya tetap kosong', async () => {
  const apiB = await apiFor(other);
  const r = await radar(apiB);
  expect(r.skills.every((s) => s.sample_size === 0)).toBe(true);
  await apiB.dispose();
});

test('riwayat ujian: simulasi Speaking selesai muncul sebagai entri MOCK_TEST berstatus GRADED dengan tautan Lihat', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/simulasi');
  await expect(page.getByRole('heading', { name: 'Simulasi Tes IELTS General Training', level: 1 })).toBeVisible();
  // Bawaan: semua section tersedia tercentang; sisakan Speaking saja.
  await page.getByRole('checkbox', { name: 'Sertakan Reading' }).uncheck();
  await page.getByRole('checkbox', { name: 'Sertakan Writing' }).uncheck();
  await page.getByRole('button', { name: 'Mulai Simulasi' }).click();
  await expect(page).toHaveURL(/\/simulasi\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const simId = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Mulai Speaking' }).click();
  for (const part of [1, 2, 3]) {
    await page.getByRole('button', { name: new RegExp(`^Part ${part}`) }).click();
    await page.getByRole('button', { name: `Simpan Skor Part ${part}` }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^Part ${part} ✓`) })).toBeVisible();
  }
  const st = await getJson<{ data: { sections: Array<{ section: string; status: string }> } }>(api, `/api/v1/simulations/${simId}`);
  expect(st.body.data.sections.map((s) => s.section)).toEqual(['SPEAKING']);
  expect(st.body.data.sections[0]!.status).toBe('GRADED');

  const hist = await getJson<{ data: Array<{ attempt_id: string; assessment_type: string; title: string; status: string; result_path: string; passed: boolean | null }>; meta: { total: number } }>(api, '/api/v1/me/exam-history');
  expect(hist.status).toBe(200);
  const entry = hist.body.data.find((h) => h.attempt_id === simId);
  expect(entry, 'entri simulasi pada riwayat ujian').toBeTruthy();
  expect(entry!.assessment_type).toBe('MOCK_TEST');
  expect(entry!.result_path).toBe(`/simulasi/${simId}/hasil`);
  // Mix Grammar tidak muncul di riwayat ujian (bukan EXAM).
  expect(hist.body.data.find((h) => h.attempt_id === mixAttemptId)).toBeUndefined();

  await page.goto('/riwayat/ujian');
  const row = page.locator('tbody tr').first();
  await expect(row).toContainText(/Simulasi/i);
  await expect(row.getByRole('link', { name: /Lihat/ })).toHaveAttribute('href', `/simulasi/${simId}/hasil`);
  // Chip header disembunyikan hanya pada mode ujian, bukan di riwayat.
  await expect(page.getByTestId('header-chips')).toBeVisible();
  // Simulasi tidak memberi poin (SPEC-023 AC-17).
  expect((await getStats(api)).total_points).toBe(0);
  void BASE_URL;
});
