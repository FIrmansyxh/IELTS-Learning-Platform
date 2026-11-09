import { expect, request as pwRequest, test, type Page } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, signIn, type TestProfile } from './helpers/app';
import { answerVisible, confirmEnd, ensureExamContent, examIds, expectNoHorizontalScroll, learnComplete, unlockSafe, type ExamIds } from './helpers/exams';

// SPEC-011 + SPEC-024 (sisi UI): pemutar audio terkunci pada mode ujian (Skip Modul 2.3 = Listening, 4 soal, 2 section;
// audio sintetis nada 12 detik, WAV 192044 byte). Dijalankan lewat tests/e2e/helpers/run-e2e.mjs.
let profile: TestProfile;
let other: TestProfile;
let ids: ExamIds;
let attemptUrl = '';

const AUDIO_BYTES = 192044;

// Server dev kompilasi rute sesuai-permintaan dan mesin bisa sedang sibuk: beri batas waktu longgar per tes.
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  test.setTimeout(240_000); // impor konten + pemanasan rute dev (kompilasi dingin)
  await ensureExamContent();
  profile = await createProfile('listen');
  other = await createProfile('listen2');
});
test.afterAll(() => {
  deleteProfile(profile);
  deleteProfile(other);
});
test.beforeEach(async ({ context, page }) => {
  await signIn(context, profile);
  page.on('dialog', (d) => void d.accept());
});

const attemptId = () => attemptUrl.split('/').pop()!;
const audioState = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector('audio')!;
    return { t: a.currentTime, paused: a.paused, ended: a.ended, rate: a.playbackRate, controls: a.controls, preload: a.preload, tab: a.getAttribute('tabindex'), dur: a.duration };
  });

async function passPrecheck(page: Page) {
  await page.getByRole('button', { name: 'Putar nada uji' }).click();
  await page.getByRole('checkbox', { name: /dapat mendengar nada/ }).check();
}

async function openAttempt(page: Page) {
  if (attemptUrl) {
    await page.goto(attemptUrl);
  } else {
    ids = await examIds(page.request);
    await page.goto(`/ujian/mulai/${ids.skipListening}`);
    await passPrecheck(page);
    await page.getByRole('button', { name: /^(Mulai|Lanjutkan) Ujian$/ }).click();
    await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    attemptUrl = new URL(page.url()).pathname;
  }
  await expect(page.getByRole('region', { name: 'Pemutar Audio' })).toBeVisible();
  await expect.poll(async () => (await audioState(page)).dur, { timeout: 15_000 }).toBeGreaterThan(5);
}

test('pra-cek audio: "Mulai Ujian" nonaktif dengan teks arahan sampai nada diputar dan dikonfirmasi', async ({ page }) => {
  ids = await examIds(page.request);
  await page.goto(`/ujian/mulai/${ids.skipListening}`);
  await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
  await expect(page.getByText('Lakukan pengecekan audio terlebih dahulu.')).toBeVisible();
  await page.getByRole('button', { name: 'Putar nada uji' }).click();
  await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /dapat mendengar nada/ }).check();
  await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeEnabled();
  await expect(page.getByText('Lakukan pengecekan audio terlebih dahulu.')).toHaveCount(0);
});

test('ujian Listening: pemutar terkunci (tanpa controls, tanpa autoplay), catatan sintetis tampil di bawah pemutar', async ({ page }) => {
  await openAttempt(page);
  const s = await audioState(page);
  expect(s.controls, 'elemen <audio> tidak boleh punya atribut controls').toBe(false);
  expect(s.preload).toBe('metadata');
  expect(s.tab, '<audio> tidak fokusable').toBe('-1');
  await page.waitForTimeout(1500);
  const s2 = await audioState(page);
  expect(s2.paused, 'tidak ada autoplay').toBe(true);
  expect(s2.t).toBe(0);
  const region = page.getByRole('region', { name: 'Pemutar Audio' });
  await expect(region).toContainText('Belum diputar');
  await expect(region).toContainText('00:00 / 00:12');
  await expect(region).toContainText('Audio hanya diputar satu kali seperti di ujian sebenarnya.');
  await expect(region).toContainText('Audio dibuat dengan suara sintetis.'); // SPEC-024 listening.note
  // Catatan berada di bawah pemutar (setelah kartu audio), bukan di atas.
  const noteBox = await page.getByText('Audio dibuat dengan suara sintetis.').boundingBox();
  const playBox = await page.getByRole('button', { name: 'Putar audio' }).boundingBox();
  expect(noteBox!.y).toBeGreaterThan(playBox!.y);
  // Kontrak API: note ikut di GET attempt.
  const a = await page.request.get(`/api/v1/attempts/${attemptId()}`);
  const body = (await a.json()) as { data: { listening: { audio_url: string; note: string | null; duration_sec: number } } };
  expect(body.data.listening.note).toBe('Audio dibuat dengan suara sintetis.');
  expect(body.data.listening.audio_url).toBe(`/api/v1/attempts/${attemptId()}/audio`);
  expect(body.data.listening.duration_sec).toBe(12);
});

test('mode EXAM: tidak ada kontrol Jeda/Mundur/Ulang/Kecepatan, progress hanya-baca, kontrol volume ada, tombol Putar besar', async ({ page, isMobile }) => {
  await openAttempt(page);
  const region = page.getByRole('region', { name: 'Pemutar Audio' });
  for (const bad of [/jeda/i, /mundur/i, /ulang/i, /kecepatan/i, /pause/i]) {
    await expect(region.getByRole('button', { name: bad })).toHaveCount(0);
    await expect(region.getByText(bad)).toHaveCount(0);
  }
  await expect(region.getByRole('progressbar')).toHaveAttribute('aria-readonly', 'true');
  await expect(region.getByRole('slider', { name: 'Kemajuan audio' })).toHaveCount(0);
  await expect(region.getByLabel('Volume')).toBeVisible();
  const box = await page.getByRole('button', { name: 'Putar audio' }).boundingBox();
  expect(box!.height, 'tombol Putar EXAM >= 56px').toBeGreaterThanOrEqual(isMobile ? 56 : 56);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  if (isMobile) await expectNoHorizontalScroll(page);
});

test('memutar audio: klik pada bar progress tidak mengubah posisi, status "Sedang diputar", Putar nonaktif saat berjalan', async ({ page }) => {
  await openAttempt(page);
  await page.getByRole('button', { name: 'Putar audio' }).click();
  const region = page.getByRole('region', { name: 'Pemutar Audio' });
  await expect(region).toContainText('Sedang diputar', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Putar audio' })).toBeDisabled();
  await expect.poll(async () => (await audioState(page)).t, { timeout: 8000 }).toBeGreaterThan(1.5);
  const before = await audioState(page);
  const bar = await region.getByRole('progressbar').boundingBox();
  await page.mouse.click(bar!.x + bar!.width * 0.9, bar!.y + bar!.height / 2);
  await page.waitForTimeout(400);
  const after = await audioState(page);
  expect(after.t - before.t, `posisi sebelum ${before.t}, sesudah klik bar ${after.t}`).toBeLessThan(1.5);
  expect(after.t).toBeGreaterThanOrEqual(before.t - 0.5);
});

test('guard EXAM: seek mundur dikembalikan ke posisi terakhir, playbackRate dikembalikan ke 1', async ({ page }) => {
  await openAttempt(page);
  const st = await audioState(page);
  if (st.ended) test.skip(true, 'audio sudah selesai pada tes sebelumnya');
  await page.evaluate(() => void document.querySelector('audio')!.play());
  await expect.poll(async () => (await audioState(page)).t, { timeout: 8000 }).toBeGreaterThan(3);
  const last = (await audioState(page)).t;
  await page.evaluate(() => {
    document.querySelector('audio')!.currentTime = 0.2;
  });
  await expect.poll(async () => (await audioState(page)).t, { timeout: 4000 }).toBeGreaterThanOrEqual(last - 1.5);
  await page.evaluate(() => {
    document.querySelector('audio')!.playbackRate = 2;
  });
  await expect.poll(async () => (await audioState(page)).rate, { timeout: 3000 }).toBe(1);
});

test('gangguan non-learner: banner "Audio terhenti." lalu "Lanjutkan Audio" melanjutkan dari posisi terakhir, bukan dari 0', async ({ page }) => {
  await openAttempt(page);
  const st = await audioState(page);
  test.skip(st.ended, 'audio sudah selesai');
  const region = page.getByRole('region', { name: 'Pemutar Audio' });
  if (st.paused) {
    const resume = page.getByRole('button', { name: /Putar audio|Lanjutkan Audio/ }).first();
    await resume.click();
  }
  await expect.poll(async () => (await audioState(page)).t, { timeout: 8000 }).toBeGreaterThan(2);
  const at = (await audioState(page)).t;
  await page.evaluate(() => document.querySelector('audio')!.pause()); // pause yang bukan dari learner
  const alert = page.getByRole('alert').filter({ hasText: 'Audio terhenti.' });
  await expect(alert).toBeVisible({ timeout: 5000 });
  await alert.getByRole('button', { name: 'Lanjutkan Audio' }).click();
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 5000 }).toBe(false);
  const resumed = (await audioState(page)).t;
  expect(Math.abs(resumed - at), `posisi saat terhenti ${at}, setelah lanjut ${resumed}`).toBeLessThanOrEqual(2.5);
  void region;
});

test('muat ulang halaman saat EXAM: posisi tersimpan di audio:v1 dan pemutaran dilanjutkan dari posisi itu (bukan dari 0)', async ({ page }) => {
  await openAttempt(page);
  const st = await audioState(page);
  test.skip(st.ended, 'audio sudah selesai');
  if (st.paused) await page.getByRole('button', { name: /Putar audio|Lanjutkan Audio/ }).first().click();
  await expect.poll(async () => (await audioState(page)).t, { timeout: 8000 }).toBeGreaterThan(4);
  await page.waitForTimeout(1200); // simpan posisi tiap ~500 ms
  const saved = await page.evaluate((id) => localStorage.getItem(`audio:v1:${id}`), attemptId());
  expect(saved, 'audio:v1:{attempt_id} harus tersimpan').toBeTruthy();
  const pos = (JSON.parse(saved!) as { position_sec: number }).position_sec;
  expect(pos).toBeGreaterThan(3);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Pemutar Audio' })).toBeVisible();
  // SPEC-011: "pemutar menampilkan 'Lanjutkan Audio'" bila posisi tersimpan.
  await expect.soft(page.getByRole('button', { name: /Lanjutkan Audio/ }), 'tombol "Lanjutkan Audio" setelah muat ulang').toBeVisible({ timeout: 2000 });
  await page.getByRole('button', { name: /Lanjutkan Audio|Putar audio/ }).first().click();
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 8000 }).toBe(false);
  const t = (await audioState(page)).t;
  expect(Math.abs(t - pos), `posisi tersimpan ${pos}, dimulai di ${t}`).toBeLessThanOrEqual(2.5);
});

test('audio berakhir: "Audio selesai", tombol Putar nonaktif, banner info, timer ujian tetap berjalan', async ({ page }) => {
  test.setTimeout(60_000);
  await openAttempt(page);
  let st = await audioState(page);
  if (!st.ended) {
    if (st.paused) await page.getByRole('button', { name: /Putar audio|Lanjutkan Audio/ }).first().click();
    await expect.poll(async () => (await audioState(page)).ended, { timeout: 30_000 }).toBe(true);
  }
  st = await audioState(page);
  const region = page.getByRole('region', { name: 'Pemutar Audio' });
  await expect(region).toContainText('Audio selesai');
  await expect(page.getByRole('button', { name: 'Putar audio' })).toBeDisabled();
  await expect(page.getByText('Audio selesai. Periksa jawaban Anda sebelum waktu habis.')).toBeVisible();
  const timer = page.locator('header').getByText(/^\d{2}:\d{2}$/);
  const secs = async () => {
    const [m, s] = (await timer.innerText()).split(':').map(Number);
    return m! * 60 + s!;
  };
  const a = await secs();
  await page.waitForTimeout(2500);
  expect(a - (await secs())).toBeGreaterThanOrEqual(1);
});

test('Section 1 / Section 2: tab berpindah bebas dan jawaban tidak ter-reset', async ({ page }) => {
  await openAttempt(page);
  const tabs = page.getByRole('tablist', { name: 'Section Soal' });
  await expect(tabs.getByRole('tab', { name: 'Section 1' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'Section 2' })).toBeVisible();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 4');
  const prompt1 = await answerVisible(page);
  expect(prompt1).toContain('speaker');
  await expect(page.getByText('Jawaban tersimpan')).toBeVisible();
  await tabs.getByRole('tab', { name: 'Section 2' }).click();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 3 dari 4');
  await tabs.getByRole('tab', { name: 'Section 1' }).click();
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 4');
  await expect(page.locator('main fieldset input[type="radio"]:checked')).toHaveCount(1);
});

test('endpoint audio: Range -> 206 dengan header wajib, tanpa Range -> 200, sufiks, 416, tanpa sesi 401, milik orang lain 404', async ({ page }) => {
  await openAttempt(page);
  const url = `/api/v1/attempts/${attemptId()}/audio`;
  const r206 = await page.request.get(url, { headers: { Range: 'bytes=0-1023' } });
  expect(r206.status()).toBe(206);
  const h = r206.headers();
  expect(h['content-range']).toBe(`bytes 0-1023/${AUDIO_BYTES}`);
  expect(h['content-length']).toBe('1024');
  expect(h['accept-ranges']).toBe('bytes');
  expect(h['cache-control']).toBe('private, no-store');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['content-type']).toBe('audio/wav');
  expect(h['content-disposition']).toBe('inline');
  expect(h['cross-origin-resource-policy']).toBe('same-origin');
  const r200 = await page.request.get(url);
  expect(r200.status()).toBe(200);
  expect(r200.headers()['content-length']).toBe(String(AUDIO_BYTES));
  const suf = await page.request.get(url, { headers: { Range: 'bytes=-500' } });
  expect(suf.status()).toBe(206);
  expect(suf.headers()['content-length']).toBe('500');
  const r416 = await page.request.get(url, { headers: { Range: 'bytes=9999999-' } });
  expect(r416.status()).toBe(416);
  expect(r416.headers()['content-range']).toBe(`bytes */${AUDIO_BYTES}`);
  // tanpa sesi
  const anon = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  expect((await anon.get(url)).status()).toBe(401);
  await anon.dispose();
  // milik orang lain -> 404 (bukan 403)
  await page.context().clearCookies();
  await signIn(page.context(), other);
  expect((await page.request.get(url)).status()).toBe(404);
});

test('kirim ujian Listening: jawab 4 soal, hasil tampil, audio tidak dilayani lagi (409 ATTEMPT_NOT_ACTIVE)', async ({ page }) => {
  test.setTimeout(120_000);
  await openAttempt(page);
  const tabs = page.getByRole('tablist', { name: 'Section Soal' });
  await tabs.getByRole('tab', { name: 'Section 1' }).click();
  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId('question-counter')).toHaveText(`Soal ${i + 1} dari 4`);
    await answerVisible(page);
    if (i < 3) await page.getByRole('button', { name: 'Soal berikutnya' }).click();
  }
  await expect(page.getByText('Jawaban tersimpan')).toBeVisible();
  await confirmEnd(page);
  await expect(page).toHaveURL(new RegExp(`/ujian/${attemptId()}/hasil$`), { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Level dilewati' })).toBeVisible();
  await expect(page.getByText('4 dari 4 poin')).toBeVisible();
  const r = await page.request.get(`/api/v1/attempts/${attemptId()}/audio`);
  expect(r.status()).toBe(409);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('ATTEMPT_NOT_ACTIVE');
});

test('drill Listening (mode PRACTICE): pemutar dengan kontrol penuh (Putar/Jeda, Mundur 5 detik, kecepatan 0.75x) tampil di Active Drill', async ({ page }) => {
  unlockSafe(profile, '2');
  await learnComplete(page.request, '2.3.2');
  await page.goto('/belajar/2.3.2');
  await page.getByRole('tab', { name: /^Latihan/ }).click();
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  await expect(page.getByTestId('question-counter')).toBeVisible();
  const region = page.getByRole('region', { name: 'Pemutar Audio' });
  await expect(region, 'drill ber-listening_asset_code harus menampilkan pemutar audio (SPEC-011 mode PRACTICE)').toBeVisible({ timeout: 10_000 });
  await region.getByRole('button', { name: 'Putar' }).click();
  await expect.poll(async () => (await audioState(page)).t, { timeout: 8000 }).toBeGreaterThan(2);
  await region.getByRole('button', { name: 'Mundur 5 detik' }).click();
  await region.getByRole('button', { name: '0.75x' }).click();
  expect((await audioState(page)).rate).toBe(0.75);
  await expect(region.getByRole('slider', { name: 'Kemajuan audio' })).toBeVisible();
});
