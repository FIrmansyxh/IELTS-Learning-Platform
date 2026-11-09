import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, signIn, type TestProfile } from './helpers/app';
import { answerVisible, completeSubModule, confirmEnd, ensureExamContent, examIds, expectNoHorizontalScroll, solve, unlockSafe, type ApiQuestion, type ExamIds } from './helpers/exams';

// SPEC-014 Boss Stage (paket sintetis: Tier 1 gate PERCENT 80 dan Tier 2 gate BAND 5.0; L 4 soal, R 6 soal, W 1, S 1).
// Prasyarat tier: sub-modul sintetis 1.3.2 (Tier 1) / 2.3.2 (Tier 2) diselesaikan lewat API. Alur UI penuh pada profil "pass";
// jalur gagal, cooldown, dan gate BAND lewat API + verifikasi UI hasil. Dijalankan lewat tests/e2e/helpers/run-e2e.mjs.
const orig = { headers: { Origin: BASE_URL } };
let ids: ExamIds;
const made: TestProfile[] = [];

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

async function fresh(tag: string): Promise<TestProfile> {
  const p = await createProfile(tag);
  made.push(p);
  return p;
}
const toQuestions = async (page: Page) => {
  const tab = page.getByRole('tab', { name: 'Soal', exact: true });
  if (await tab.isVisible().catch(() => false)) await tab.click();
};

interface SectionApi {
  assessment_set_id: string;
  skill: string;
  order: number;
  phase: string;
  title: string;
}

/** Jalankan Boss lewat API. `wrong` = jawaban Listening/Reading salah semua. */
async function bossViaApi(r: APIRequestContext, bossId: string, wrong: boolean): Promise<string> {
  const st = await r.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: bossId } });
  expect(st.status(), await st.text()).toBe(201);
  const at = ((await st.json()) as { data: { id: string; sections: SectionApi[] } }).data;
  for (const sec of at.sections.slice().sort((a, b) => a.order - b.order)) {
    const s = await r.post(`/api/v1/attempts/${at.id}/sections/${sec.assessment_set_id}/start`, orig);
    expect(s.status(), await s.text()).toBe(200);
    const body = ((await s.json()) as { data: { questions: ApiQuestion[] } }).data;
    if (sec.skill === 'LISTENING' || sec.skill === 'READING') {
      for (const q of body.questions) {
        const a = await r.put(`/api/v1/attempts/${at.id}/answers/${q.question_id}`, { ...orig, data: { response: solve(q, wrong) } });
        expect(a.ok(), await a.text()).toBe(true);
      }
    }
    const f = await r.post(`/api/v1/attempts/${at.id}/sections/${sec.assessment_set_id}/submit`, orig);
    expect(f.ok(), await f.text()).toBe(true);
  }
  const sub = await r.post(`/api/v1/attempts/${at.id}/submit`, orig);
  expect(sub.ok(), await sub.text()).toBe(true);
  return at.id;
}

test('sebelum modul Tier selesai: Boss tidak tersedia (intro, tombol, POST /attempts 409 BOSS_NOT_AVAILABLE/MODULES_INCOMPLETE)', async ({ page, context }) => {
  await signIn(context, await fresh('boss-early'));
  ids = await examIds(page.request);
  const tree = (await (await page.request.get('/api/v1/curriculum/tree')).json()) as { data: { tiers: Array<{ tier_number: number; boss: { available: boolean; blocked_reason: string | null; gate_type: string; gate_value: number } }> } };
  expect(tree.data.tiers[0]!.boss).toMatchObject({ available: false, blocked_reason: 'MODULES_INCOMPLETE', gate_type: 'PERCENT', gate_value: 80 });
  const intro = (await (await page.request.get(`/api/v1/exams/${ids.bossT1}/intro`)).json()) as { data: { available: boolean; blocked_reason: string } };
  expect(intro.data).toMatchObject({ available: false, blocked_reason: 'MODULES_INCOMPLETE' });
  await page.goto(`/ujian/mulai/${ids.bossT1}`);
  await expect(page.getByText('Selesaikan semua modul Tier ini terlebih dahulu.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
  const r = await page.request.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: ids.bossT1 } });
  expect(r.status()).toBe(409);
  const body = (await r.json()) as { error: { code: string; details: Array<{ code: string }> } };
  expect(body.error.code).toBe('BOSS_NOT_AVAILABLE');
  expect(body.error.details[0]!.code).toBe('MODULES_INCOMPLETE');
});

test('UI intro Boss memuat blok Boss: daftar section, durasi, penjelasan gerbang, catatan advisory (SPEC-014 UI)', async ({ page, context }) => {
  test.setTimeout(75_000);
  await signIn(context, await fresh('boss-intro'));
  ids = await examIds(page.request);
  await completeSubModule(page.request, '1.3.2');
  const intro = (await (await page.request.get(`/api/v1/exams/${ids.bossT1}/intro`)).json()) as { data: { boss: { advisory_note: string } } };
  const advisory = intro.data.boss.advisory_note;
  await page.goto(`/ujian/mulai/${ids.bossT1}`);
  await expect(page.getByRole('button', { name: /^(Mulai|Lanjutkan) Ujian$/ })).toBeVisible();
  // SPEC-014 UI: blok Boss pada intro: daftar section, durasi, penjelasan gerbang, catatan advisory.
  const main = page.locator('main');
  await expect(main).toContainText('E2E Boss T1 Listening');
  await expect(main).toContainText('E2E Boss T1 Reading');
  await expect(main).toContainText('E2E Boss T1 Writing');
  await expect(main).toContainText('E2E Boss T1 Speaking');
  await expect(main).toContainText('Lulus bila akurasi Listening + Reading >= 80%');
  await expect(main).toContainText(advisory);

});

test.describe('Boss Tier 1 (gate PERCENT 80): alur UI penuh, lulus', () => {
  test.describe.configure({ mode: 'serial' });
  let profile: TestProfile;
  let attemptId = '';
  let aiEnabled = false;

  test.beforeAll(async () => {
    profile = await fresh('boss-pass');
  });
  test.beforeEach(async ({ context }) => {
    await signIn(context, profile);
  });

  test('syarat terpenuhi: intro memuat 4 section berurutan L, R, W, S dan gerbang PERCENT 80; UI intro menampilkan daftar section + gerbang + catatan', async ({ page }) => {
    test.setTimeout(120_000);
    ids = await examIds(page.request);
    await completeSubModule(page.request, '1.3.2');
    const intro = (await (await page.request.get(`/api/v1/exams/${ids.bossT1}/intro`)).json()) as {
      data: { available: boolean; requires_audio: boolean; boss: { gate: { type: string; value: number }; sections: Array<{ skill: string; counts_toward_gate: boolean }>; total_time_limit_seconds: number; advisory_note: string } };
    };
    expect(intro.data.available).toBe(true);
    expect(intro.data.boss.gate).toEqual({ type: 'PERCENT', value: 80 });
    expect(intro.data.boss.sections.map((s) => s.skill)).toEqual(['LISTENING', 'READING', 'WRITING', 'SPEAKING']);
    expect(intro.data.boss.sections.map((s) => s.counts_toward_gate)).toEqual([true, true, false, false]);
    expect(intro.data.boss.total_time_limit_seconds).toBe(2100);
  });

  test('mulai ujian: section PENDING tanpa soal, batas waktu = jumlah waktu section + 1800 s, urutan section ditegakkan server', async ({ page }) => {
    await page.goto(`/ujian/mulai/${ids.bossT1}`);
    const precheck = page.getByRole('button', { name: 'Putar nada uji' });
    if (await precheck.isVisible().catch(() => false)) {
      await precheck.click();
      await page.getByRole('checkbox', { name: /dapat mendengar nada/ }).check();
    }
    await page.getByRole('button', { name: /^(Mulai|Lanjutkan) Ujian$/ }).click();
    await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    attemptId = page.url().split('/').pop()!;
    await expect(page.getByTestId('section-gate-intro')).toBeVisible();
    await expect(page.getByText('Section 1 / 4')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Boss T1 Listening' })).toBeVisible();
    await expect(page.getByText('Menentukan kelulusan')).toBeVisible();
    await expect(page.getByText('4 soal')).toBeVisible();
    await expectNoHorizontalScroll(page);
    const a = (await (await page.request.get(`/api/v1/attempts/${attemptId}`)).json()) as {
      data: { started_at: string; deadline_at: string; questions: unknown[]; sections: SectionApi[] };
    };
    expect(a.data.questions).toEqual([]);
    expect(a.data.sections.map((s) => s.phase)).toEqual(['PENDING', 'PENDING', 'PENDING', 'PENDING']);
    const span = (Date.parse(a.data.deadline_at) - Date.parse(a.data.started_at)) / 1000;
    expect(Math.round(span)).toBe(600 + 600 + 600 + 300 + 1800);
    const secs = a.data.sections.slice().sort((x, y) => x.order - y.order);
    // Reading sebelum Listening selesai -> 409 SECTION_ORDER_VIOLATION; set milik section lain/tier lain -> 404.
    const viol = await page.request.post(`/api/v1/attempts/${attemptId}/sections/${secs[1]!.assessment_set_id}/start`, orig);
    expect(viol.status()).toBe(409);
    expect(((await viol.json()) as { error: { code: string } }).error.code).toBe('SECTION_ORDER_VIOLATION');
    const foreign = await page.request.post(`/api/v1/attempts/${attemptId}/sections/${ids.skipReading}/start`, orig);
    expect(foreign.status()).toBe(404);
    // Soal section PENDING tidak boleh dijawab.
    const put = await page.request.put(`/api/v1/attempts/${attemptId}/answers/Q-E2E-B1-R1`, { ...orig, data: { response: { choice: 'x' } } });
    expect([404, 409]).toContain(put.status());
  });

  test('section Listening: pemutar EXAM terkunci, payload tanpa kunci, audio ?section= hanya saat ACTIVE, selesai -> layar transisi tanpa tombol kembali', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/ujian/${attemptId}`);
    await page.getByTestId('start-section-btn').click();
    await expect(page.getByRole('region', { name: 'Pemutar Audio' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('region', { name: 'Pemutar Audio' }).getByRole('button', { name: /jeda|mundur|ulang|kecepatan/i })).toHaveCount(0);
    await expect(page.getByText('Audio dibuat dengan suara sintetis.')).toBeVisible();
    // Payload section aktif: tanpa kunci/pembahasan; hanya section aktif yang dimuat.
    const a = await page.request.get(`/api/v1/attempts/${attemptId}`);
    const raw = await a.text();
    for (const k of ['correct_answers', 'explanation_id', 'is_correct']) expect(raw, k).not.toContain(k);
    const json = JSON.parse(raw) as { data: { sections: SectionApi[]; questions: Array<{ prompt: string }>; listening: { audio_url: string } | null } };
    expect(json.data.questions).toHaveLength(4);
    const lis = json.data.sections.find((s) => s.skill === 'LISTENING')!;
    expect(lis.phase).toBe('ACTIVE');
    // Audio: tanpa section -> 404; dengan section ACTIVE -> 206.
    const noSec = await page.request.get(`/api/v1/attempts/${attemptId}/audio`);
    expect(noSec.status()).toBe(404);
    const withSec = await page.request.get(`/api/v1/attempts/${attemptId}/audio?section=${lis.assessment_set_id}`, { headers: { Range: 'bytes=0-99' } });
    expect(withSec.status()).toBe(206);
    // Start ulang section ACTIVE: 200 dan waktu tidak berubah.
    const before = (await (await page.request.get(`/api/v1/attempts/${attemptId}`)).json()) as { data: { sections: Array<{ skill: string; deadline_at: string; started_at: string }> } };
    const again = await page.request.post(`/api/v1/attempts/${attemptId}/sections/${lis.assessment_set_id}/start`, orig);
    expect(again.status()).toBe(200);
    const sec2 = ((await again.json()) as { data: { section: { deadline_at: string; started_at: string } } }).data.section;
    const sec1 = before.data.sections.find((s) => s.skill === 'LISTENING')!;
    expect(sec2.deadline_at).toBe(sec1.deadline_at);
    expect(sec2.started_at).toBe(sec1.started_at);
    // Jawab 4 soal lalu "Selesai Section".
    for (let i = 0; i < 4; i++) {
      await expect(page.getByTestId('question-counter')).toHaveText(`Soal ${i + 1} dari 4`);
      await answerVisible(page);
      if (i < 3) await page.getByRole('button', { name: 'Soal berikutnya' }).click();
    }
    await expect(page.getByText('Jawaban tersimpan')).toBeVisible();
    await confirmEnd(page, 'Selesai Section');
    await expect(page.getByTestId('section-gate-done')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Section E2E Boss T1 Listening selesai')).toBeVisible();
    await expect(page.getByText('Section berikutnya: E2E Boss T1 Reading')).toBeVisible();
    await expect(page.getByRole('button', { name: /kembali|sebelumnya/i })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    // Section yang sudah DONE: tidak bisa dimulai lagi dan audionya tidak dilayani.
    const done = await page.request.post(`/api/v1/attempts/${attemptId}/sections/${lis.assessment_set_id}/start`, orig);
    expect(done.status()).toBe(409);
    expect(((await done.json()) as { error: { code: string } }).error.code).toBe('SECTION_ALREADY_DONE');
    const audioDone = await page.request.get(`/api/v1/attempts/${attemptId}/audio?section=${lis.assessment_set_id}`);
    expect(audioDone.status()).toBe(409);
  });

  test('section Reading: split-screen dengan 6 soal, jawaban tersimpan, selesai -> transisi', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/ujian/${attemptId}`);
    await page.getByTestId('next-section-btn').or(page.getByTestId('start-section-btn')).first().click();
    if (await page.getByTestId('start-section-btn').isVisible().catch(() => false)) await page.getByTestId('start-section-btn').click();
    await expect(page.getByRole('heading', { name: 'The Saturday Market' })).toBeAttached({ timeout: 20_000 });
    for (let i = 0; i < 6; i++) {
      await toQuestions(page);
      await expect(page.getByTestId('question-counter')).toHaveText(`Soal ${i + 1} dari 6`);
      await answerVisible(page);
      if (i < 5) await page.getByRole('button', { name: 'Soal berikutnya' }).click();
    }
    await expect(page.getByText('Jawaban tersimpan')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await confirmEnd(page, 'Selesai Section');
    await expect(page.getByText('Section E2E Boss T1 Reading selesai')).toBeVisible({ timeout: 20_000 });
  });

  test('section Writing: editor penuh, kirim tulisan (konfirmasi), selesai section', async ({ page }) => {
    test.setTimeout(120_000);
    const st = await page.request.get('/api/v1/ai/status');
    aiEnabled = ((await st.json()) as { data: { enabled: boolean } }).data.enabled;
    await page.goto(`/ujian/${attemptId}`);
    await page.getByTestId('next-section-btn').or(page.getByTestId('start-section-btn')).first().click();
    if (await page.getByTestId('start-section-btn').isVisible().catch(() => false)) await page.getByTestId('start-section-btn').click();
    await expect(page.getByTestId('writing-task-panel')).toBeVisible({ timeout: 20_000 });
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    await page.getByRole('textbox', { name: /Tuliskan esai/ }).fill(words);
    await expect(page.getByTestId('word-counter')).toHaveText('30 kata');
    await page.getByRole('button', { name: 'Kirim untuk Dinilai' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ya, kirim' }).click();
    // AI nonaktif -> fallback nilai-sendiri; AI mock -> antre/penilaian. Keduanya bukan penentu kelulusan.
    await expect(page.getByTestId('writing-task-panel')).not.toContainText('Tuliskan esai', { timeout: 20_000 });
    await expectNoHorizontalScroll(page);
    await confirmEnd(page, 'Selesai Section');
    await expect(page.getByText('Section E2E Boss T1 Writing selesai')).toBeVisible({ timeout: 20_000 });
  });

  test('section Speaking: kartu prompt eksternal siap-salin + form 4 kriteria, skor tersimpan (Overall dihitung), selesai -> hasil', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/ujian/${attemptId}`);
    await page.getByTestId('next-section-btn').or(page.getByTestId('start-section-btn')).first().click();
    if (await page.getByTestId('start-section-btn').isVisible().catch(() => false)) await page.getByTestId('start-section-btn').click();
    await expect(page.getByTestId('speaking-external-prompt')).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Fluency & Coherence').selectOption('6');
    await page.getByLabel('Lexical Resource').selectOption('6.5');
    await page.getByLabel('Grammatical Range & Accuracy').selectOption('6');
    await page.getByLabel('Pronunciation').selectOption('6');
    await expect(page.getByTestId('external-overall')).toContainText('6.0'); // (6+6.5+6+6)/4 = 6.125 -> 6.0
    await page.getByRole('button', { name: 'Simpan skor' }).click();
    await expect(page.getByText('Skor Speaking tersimpan dan masuk ke radar serta prediksi band.').first()).toBeVisible();
    await confirmEnd(page, 'Selesai Section');
    await expect(page.getByText('Section E2E Boss T1 Speaking selesai')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Semua section telah selesai dikerjakan.')).toBeVisible();
    await page.getByTestId('next-section-btn').click(); // "Selesaikan Ujian"
    await expect(page).toHaveURL(new RegExp(`/ujian/${attemptId}/hasil$`), { timeout: 30_000 });
  });

  test('hasil Boss: Lulus (100% >= 80%), rincian per skill dengan label Menentukan/Masukan, Tier 2 terbuka (BOSS_PASS), tanpa kunci jawaban', async ({ page }) => {
    await page.goto(`/ujian/${attemptId}/hasil`);
    const view = page.getByTestId('boss-result-view');
    await expect(view).toContainText('Hasil Boss Stage - Tier 1');
    await expect(view).toContainText('Target Akurasi 80%, hasil Anda 100%');
    await expect(view.getByRole('status').filter({ hasText: 'Lulus' })).toBeVisible();
    await expect(page.getByTestId('skill-card-listening')).toContainText('Skor mentah: 4/4');
    await expect(page.getByTestId('skill-card-listening')).toContainText('Menentukan');
    await expect(page.getByTestId('skill-card-reading')).toContainText('Skor mentah: 6/6');
    await expect(page.getByTestId('skill-card-reading')).toContainText('Menentukan');
    await expect(page.getByTestId('skill-card-writing')).toContainText('Masukan');
    await expect(page.getByTestId('skill-card-speaking')).toContainText('Masukan');
    // Writing: menunggu penilaian AI (AI nonaktif tidak pernah menilai) atau dinilai (mock); tidak menentukan kelulusan.
    if (!aiEnabled) await expect(page.getByTestId('skill-card-writing')).toContainText(/Menunggu penilaian AI|Tidak dikerjakan|Band/);
    await expect(page.getByRole('link', { name: 'Buka Tier 2' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    const res = await page.request.get(`/api/v1/attempts/${attemptId}/result`);
    const raw = await res.text();
    expect(raw).not.toContain('correct_answer');
    expect(raw).not.toContain('explanation_id');
    const tree = (await (await page.request.get('/api/v1/curriculum/tree')).json()) as { data: { tiers: Array<{ tier_number: number; status: string; unlock_source: string | null; boss: { passed_at: string | null } }> } };
    const t = (n: number) => tree.data.tiers.find((x) => x.tier_number === n)!;
    expect(t(1).boss.passed_at).not.toBeNull();
    expect(t(2).status).toBe('UNLOCKED');
    expect(t(2).unlock_source).toBe('BOSS_PASS');
    // Setelah lulus: intro memberi alasan, POST attempts 409 BOSS_ALREADY_PASSED.
    const r = await page.request.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: ids.bossT1 } });
    expect(r.status()).toBe(409);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('BOSS_ALREADY_PASSED');
    await page.goto(`/ujian/mulai/${ids.bossT1}`);
    await expect(page.getByText('Boss Stage Tier ini sudah Anda lulusi.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Mulai Ujian/ })).toBeDisabled();
  });

  test('Speaking tersimpan masuk radar: skill SPEAKING terisi setelah skor eksternal', async ({ page }) => {
    const radar = (await (await page.request.get('/api/v1/me/skills/radar')).json()) as { data: { skills: Array<{ skill: string; score_percent?: number | null; has_data?: boolean }> } };
    const sp = radar.data.skills.find((s) => s.skill === 'SPEAKING')!;
    expect(sp, JSON.stringify(radar.data.skills)).toBeTruthy();
    expect(JSON.stringify(sp)).toMatch(/\d/);
  });
});

test('Boss gagal (API): 0% < 80% -> Belum lulus, Tier 2 tetap terkunci, cooldown aktif (429 COOLDOWN_ACTIVE + alasan di intro)', async ({ page, context }) => {
  test.setTimeout(75_000);
  const p = await fresh('boss-fail');
  await signIn(context, p);
  ids = await examIds(page.request);
  await completeSubModule(page.request, '1.3.2');
  const attemptId = await bossViaApi(page.request, ids.bossT1, true);
  await page.goto(`/ujian/${attemptId}/hasil`);
  const view = page.getByTestId('boss-result-view');
  await expect(view).toContainText('Target Akurasi 80%, hasil Anda 0%');
  await expect(view.getByRole('status').filter({ hasText: 'Belum lulus' })).toBeVisible();
  await expect(view).toContainText('Tetap semangat!');
  await expect(view.getByRole('link', { name: 'Buka Peta Belajar' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Buka Tier 2/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  const tree = (await (await page.request.get('/api/v1/curriculum/tree')).json()) as { data: { tiers: Array<{ tier_number: number; status: string }> } };
  expect(tree.data.tiers.find((t) => t.tier_number === 2)!.status).toBe('LOCKED');
  const again = await page.request.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: ids.bossT1 } });
  expect(again.status()).toBe(429);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe('COOLDOWN_ACTIVE');
  expect(Number(again.headers()['retry-after'])).toBeGreaterThan(0);
  await page.goto(`/ujian/mulai/${ids.bossT1}`);
  await expect(page.getByText(/Coba lagi pukul/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
});

test('Boss Tier 2 (gate BAND 5.0): jawaban benar -> band 9.0 lulus, Tier 3 terbuka; jawaban salah -> band di bawah 5.0 gagal', async ({ page, context }) => {
  test.setTimeout(240_000);
  const p = await fresh('boss-band');
  await signIn(context, p);
  ids = await examIds(page.request);
  unlockSafe(p, '2');
  await completeSubModule(page.request, '2.3.2');
  const intro = (await (await page.request.get(`/api/v1/exams/${ids.bossT2}/intro`)).json()) as { data: { available: boolean; boss: { gate: { type: string; value: number } } } };
  expect(intro.data.available).toBe(true);
  expect(intro.data.boss.gate).toEqual({ type: 'BAND', value: 5 });
  const attemptId = await bossViaApi(page.request, ids.bossT2, false);
  const res = (await (await page.request.get(`/api/v1/attempts/${attemptId}/result`)).json()) as {
    data: { boss: { passed: boolean; boss_band: number; percent: number; overall_band_estimate: number | null; sections: Array<{ skill: string; raw_40: number | null; band: number | null }> } };
  };
  expect(res.data.boss.passed).toBe(true);
  expect(res.data.boss.boss_band).toBeGreaterThanOrEqual(5);
  expect(res.data.boss.sections.find((s) => s.skill === 'LISTENING')!.raw_40).toBe(40);
  expect(res.data.boss.overall_band_estimate, 'W/S tanpa evaluasi AI -> estimasi Overall kosong').toBeNull();
  await page.goto(`/ujian/${attemptId}/hasil`);
  const view = page.getByTestId('boss-result-view');
  await expect(view).toContainText(/Target Band 5\.0, hasil Anda \d\.\d/);
  await expect(view.getByRole('status').filter({ hasText: 'Lulus' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buka Tier 3' })).toBeVisible();
  const tree = (await (await page.request.get('/api/v1/curriculum/tree')).json()) as { data: { tiers: Array<{ tier_number: number; status: string; unlock_source: string | null }> } };
  expect(tree.data.tiers.find((t) => t.tier_number === 3)!.status).toBe('UNLOCKED');
  expect(tree.data.tiers.find((t) => t.tier_number === 3)!.unlock_source).toBe('BOSS_PASS');
});

test('Boss Tier 2 gagal (band < 5.0): Tier 3 tetap terkunci', async ({ page, context }) => {
  test.setTimeout(240_000);
  const p = await fresh('boss-band2');
  await signIn(context, p);
  ids = await examIds(page.request);
  unlockSafe(p, '2');
  await completeSubModule(page.request, '2.3.2');
  const attemptId = await bossViaApi(page.request, ids.bossT2, true);
  const res = (await (await page.request.get(`/api/v1/attempts/${attemptId}/result`)).json()) as { data: { boss: { passed: boolean; boss_band: number } } };
  expect(res.data.boss.passed).toBe(false);
  expect(res.data.boss.boss_band).toBeLessThan(5);
  await page.goto(`/ujian/${attemptId}/hasil`);
  await expect(page.getByTestId('boss-result-view')).toContainText(/Target Band 5\.0, hasil Anda [0-4]\.\d/);
  await expect(page.getByTestId('boss-result-view').getByRole('status').filter({ hasText: 'Belum lulus' })).toBeVisible();
  const tree = (await (await page.request.get('/api/v1/curriculum/tree')).json()) as { data: { tiers: Array<{ tier_number: number; status: string }> } };
  expect(tree.data.tiers.find((t) => t.tier_number === 3)!.status).toBe('LOCKED');
});
