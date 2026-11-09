import { expect, test } from '@playwright/test';
import { createProfile, deleteProfile, signIn, unlock, type TestProfile } from './helpers/app';
import { apiFor, cliRun, getJson, getWarm, postWarm, putWarm, getLedger, getStats, playDrill, setActiveTrack, sumBySource, watchConsole } from './helpers/platform';
import { keepWarm } from './helpers/platform';
import type { APIRequestContext } from '@playwright/test';
import type { DrillOutcome } from './helpers/platform';

let stopWarm: (() => Promise<void>) | undefined;
// Mesin bersama dengan banyak agen + next dev: beri ruang waktu (bukan perilaku aplikasi).
test.describe.configure({ timeout: 120_000 });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  stopWarm = await keepWarm();
});
test.afterAll(async () => {
  await stopWarm?.();
});

// SPEC-016 Gamifikasi: poin, mahkota Silver/Gold, speed streak, streak harian; tampil di chip header, StatsCard
// dan riwayat poin. Drill nyata 3.3.3 (10 soal disajikan dari 12, ambang 75) dikerjakan lewat API publik dengan kunci dari
// berkas konten; hasilnya diverifikasi di API DAN di UI. Jam server tidak dapat dimajukan di E2E, sehingga
// streak lintas hari / zona waktu hanya terjangkau tes integrasi (lihat matrix_platform.md).
test.describe.configure({ mode: 'serial' });

let profile: TestProfile;
let api: APIRequestContext;
const attempts: string[] = [];
let firstDto: DrillOutcome['result']['gamification'] = null;

test.beforeAll(async () => {
  profile = await createProfile('gam');
  unlock(profile, '3.3.3');
  api = await apiFor(profile);
  await setActiveTrack(api, 'GT-SPRINT-4W'); // PRACTICE_FIRST: drill boleh dimulai sebelum materi selesai
});
test.afterAll(async () => {
  await api?.dispose();
  deleteProfile(profile);
});
test.beforeEach(async ({ context }) => {
  await signIn(context, profile);
});

test('profil baru: statistik nol, chip header 0/0, kartu statistik dan riwayat poin kosong', async ({ page }) => {
  const s = await getStats(api);
  expect(s).toMatchObject({
    total_points: 0,
    daily_streak_days: 0,
    longest_daily_streak: 0,
    best_speed_streak: 0,
    gold_crowns: 0,
    silver_crowns: 0,
    last_active_date: null,
    streak_at_risk: false,
  });
  const watch = watchConsole(page);
  await page.goto('/');
  const chips = page.getByTestId('header-chips');
  await expect(chips).toBeVisible();
  await expect(chips).toHaveAttribute('aria-label', 'Streak belajar 0 hari, 0 poin');
  await expect(page.getByTestId('chip-streak')).toContainText('0');
  await expect(page.getByTestId('chip-points')).toContainText('0');
  await expect(page.getByTestId('stats-card')).toBeVisible();
  await expect(page.getByTestId('stats-total-points')).toHaveText('0');
  await expect(page.getByTestId('stats-gold-crowns')).toHaveText('0');
  await page.getByTestId('chip-points').click();
  await expect(page.getByTestId('points-history-dialog')).toContainText('Belum ada poin');
  expect(watch.errors).toEqual([]);
});

test('GET /me/points: page_size > 50 ditolak 400 VALIDATION_ERROR', async () => {
  const r = await getWarm(api, '/api/v1/me/points?page_size=51');
  expect(r.status()).toBe(400);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  expect((await getWarm(api, '/api/v1/me/points?page=0')).status()).toBe(400);
});

test('klien tidak dapat menyuntikkan poin/mahkota: field tak dikenal ditolak', async () => {
  const sm = await getJson<{ data: { drill: { assessment_set_id: string } } }>(api, '/api/v1/sub-modules/3.3.3');
  const setId = sm.body.data.drill.assessment_set_id;
  const bad = await postWarm(api, '/api/v1/attempts', { assessment_set_id: setId, points: 999, crown: 'GOLD' });
  expect(bad.status()).toBe(400);
  expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  const start = await postWarm(api, '/api/v1/attempts', { assessment_set_id: setId });
  const att = ((await start.json()) as { data: { id: string; questions: Array<{ question_id: string }> } }).data;
  const put = await putWarm(api, `/api/v1/attempts/${att.id}/answers/${att.questions[0]!.question_id}`, {
    response: { option_ids: ['x'] },
    is_correct: true,
    points: 50,
  });
  expect(put.status()).toBe(400);
  expect(((await put.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  expect((await getStats(api)).total_points).toBe(0);
  // attempt yang dibiarkan berjalan dipakai ulang oleh drill berikutnya (startAttempt idempoten); tidak ada poin.
});

test('drill #1 (8/10 benar, skor 80): poin Drill, Speed Streak, mahkota Silver, Harian + streak 1', async () => {
  // Salah pada indeks 3 dan 7 -> streak per jawaban 1,2,3,0,1,2,3,0,1,2 -> 2 jawaban >= 3.
  const out = await playDrill(api, new Set([3, 7]));
  attempts.push(out.attemptId);
  expect(out.result.attempt.score_percent).toBe(80);
  expect(out.result.attempt.passed).toBe(true);
  const g = out.result.gamification!;
  expect(g, 'blok gamification pada AttemptResultDTO').toBeTruthy();
  firstDto = g;
  expect(g.points).toMatchObject({ drill: 80, speed_streak: 10, crown: 50, boss: 0 });
  expect(g.crown).toEqual({ previous: 'NONE', current: 'SILVER', changed: true });
  expect(g.best_speed_streak).toBe(3);
  expect(g.daily_streak_days).toBe(1);
  // attempts.points_awarded = drill + speed + crown (tanpa boss dan daily)
  expect(out.result.attempt.points_awarded).toBe(140);

  const s = await getStats(api);
  expect(s).toMatchObject({ total_points: 145, daily_streak_days: 1, longest_daily_streak: 1, best_speed_streak: 3, silver_crowns: 1, gold_crowns: 0 });
  expect(s.last_active_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(s.streak_at_risk).toBe(false);
  expect(sumBySource(await getLedger(api))).toEqual({ DRILL: 80, SPEED_STREAK: 10, CROWN: 50, DAILY: 5 });
});

test('UI: chip header, kartu statistik, hasil drill (mahkota Perak berlabel teks) dan peta mencerminkan drill #1', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/');
  await expect(page.getByTestId('header-chips')).toHaveAttribute('aria-label', 'Streak belajar 1 hari, 145 poin');
  await expect(page.getByTestId('chip-points')).toContainText('145');
  await expect(page.getByTestId('chip-streak')).toContainText('1');
  await expect(page.getByTestId('stats-total-points')).toHaveText('145');
  await expect(page.getByTestId('stats-daily-streak')).toHaveText('1');
  await expect(page.getByTestId('stats-silver-crowns')).toHaveText('1');
  await expect(page.getByTestId('stats-gold-crowns')).toHaveText('0');
  await expect(page.getByTestId('stats-speed-streak')).toHaveText('3x');

  // Hasil drill dibuka kembali dari attempt yang sudah GRADED.
  await page.goto(`/belajar/3.3.3?tab=latihan&attempt=${attempts[0]}`);
  const box = page.getByTestId('drill-gamification');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Perak');
  await expect(box).toContainText('Streak Belajar: 1 hari');
  expect(watch.errors).toEqual([]);
});

test('riwayat poin (Dialog dari chip) menampilkan baris Drill, Speed Streak, Mahkota dan Aktivitas Harian', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('chip-points').click();
  const dlg = page.getByTestId('points-history-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('+80');
  await expect(dlg).toContainText('+10');
  await expect(dlg).toContainText('+50');
  await expect(dlg).toContainText('+5');
  await expect(dlg).toContainText(/Aktivitas harian/i);
  const ledger = await getLedger(api);
  expect(ledger.length).toBe(4);
  expect(new Set(ledger.map((l) => l.source))).toEqual(new Set(['DRILL', 'SPEED_STREAK', 'CROWN', 'DAILY']));
  for (const l of ledger.filter((x) => x.source !== 'DAILY')) expect(l.source_id).toBe(attempts[0]);
});

test('drill #2 (9/10, skor 90): hanya selisih poin; mahkota naik ke Emas; streak harian tidak berlipat', async () => {
  // Satu salah di indeks 4 -> streak 1,2,3,4,0,1,2,3,4,5 -> 5 jawaban >= 3 (25 poin speed; sudah 10).
  const out = await playDrill(api, new Set([4]));
  attempts.push(out.attemptId);
  const g = out.result.gamification!;
  expect(g.points).toMatchObject({ drill: 10, speed_streak: 15, crown: 50, daily: 0, total: 75 });
  expect(g.crown).toEqual({ previous: 'SILVER', current: 'GOLD', changed: true });
  expect(g.best_speed_streak).toBe(5);
  expect(out.result.attempt.points_awarded).toBe(75);
  const s = await getStats(api);
  expect(s).toMatchObject({ total_points: 220, daily_streak_days: 1, best_speed_streak: 5, gold_crowns: 1, silver_crowns: 0 });
  expect(sumBySource(await getLedger(api))).toEqual({ DRILL: 90, SPEED_STREAK: 25, CROWN: 100, DAILY: 5 });
});

test('drill #3 (4/10, gagal): tidak ada poin baru, mahkota Emas tidak turun, tidak ada baris ledger baru', async () => {
  const before = (await getLedger(api)).length;
  const out = await playDrill(api, new Set([0, 1, 2, 3, 4, 5]));
  attempts.push(out.attemptId);
  expect(out.result.attempt.passed).toBe(false);
  expect(out.result.attempt.points_awarded).toBe(0);
  expect(out.result.gamification!.crown?.changed ?? false).toBe(false);
  expect(out.result.gamification!.points.total).toBe(0);
  const s = await getStats(api);
  expect(s).toMatchObject({ total_points: 220, gold_crowns: 1, silver_crowns: 0, best_speed_streak: 5 });
  expect((await getLedger(api)).length).toBe(before);
});

test('submit ulang attempt yang sudah GRADED tidak menambah poin (idempoten)', async () => {
  const r = await postWarm(api, `/api/v1/attempts/${attempts[1]}/submit`);
  // Boleh 200 (hasil yang sama) atau 409 (sudah tidak aktif); yang wajib: total poin tetap.
  expect([200, 409]).toContain(r.status());
  const s = await getStats(api);
  expect(s.total_points).toBe(220);
  expect((await getLedger(api)).length).toBe(7); // DRILL x2, SPEED x2, CROWN x2, DAILY x1
});

test('UI setelah 3 drill: chip 220 poin, 1 mahkota Emas, speed streak 5x; peta menampilkan mahkota Emas di 3.3.3', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/');
  await expect(page.getByTestId('chip-points')).toContainText('220');
  await expect(page.getByTestId('stats-gold-crowns')).toHaveText('1');
  await expect(page.getByTestId('stats-silver-crowns')).toHaveText('0');
  await expect(page.getByTestId('stats-speed-streak')).toHaveText('5x');
  await page.goto('/peta');
  const item = page.getByTestId('sub-module-item-3.3.3');
  await expect(item).toBeVisible();
  // Mahkota selalu berlabel teks / aria-label (bukan hanya warna). Tampilan jalur curated memakai teks "Gold".
  await expect(item).toContainText(/Emas|Gold/);
  // Pohon kurikulum (jalur terstruktur) memakai CrownBadge berlabel "Emas".
  await setActiveTrack(api, 'GT-STRUCT');
  await page.goto('/peta');
  const node = page.locator('li[data-node-id]').filter({ hasText: 'Menulis Surat Formal' }).first();
  await expect(node).toBeVisible();
  await expect(node).toContainText(/Emas/);
  expect(watch.errors).toEqual([]);
});

test('CLI points adjust mengubah chip dan riwayat poin; alasan tercatat', async ({ page }) => {
  const r = cliRun('points', 'adjust', profile.name, '40', '--reason', 'Koreksi E2E platform');
  expect(r.code, r.stderr).toBe(0);
  expect(r.stdout).toContain('260');
  await page.goto('/');
  await expect(page.getByTestId('chip-points')).toContainText('260');
  await page.getByTestId('chip-points').click();
  await expect(page.getByTestId('points-history-dialog')).toContainText('Koreksi E2E platform');
  // poin negatif
  const neg = cliRun('points', 'adjust', profile.name, '-40', '--reason', 'Balik koreksi E2E');
  expect(neg.code, neg.stderr).toBe(0);
  expect((await getStats(api)).total_points).toBe(220);
});

test('mobile/desktop: chip header tidak meluap dan punya nama aksesibel', async ({ page }) => {
  await page.goto('/');
  const chips = page.getByTestId('header-chips');
  await expect(chips).toBeVisible();
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  await expect(page.getByTestId('chip-streak')).toHaveAttribute('aria-label', /Streak/i);
  await expect(page.getByTestId('chip-points')).toHaveAttribute('aria-label', /poin/i);
});

// Diletakkan PALING AKHIR: temuan galat aplikasi (lihat report_platform.md) agar tidak memutus rantai tes serial di atas.
test('hasil attempt pertama melaporkan poin harian +5 dan total 145 (SPEC-016 AttemptResultDTO.gamification)', async ({ page }) => {
  // Stats/ledger sudah membuktikan DAILY +5 terkredit pada submit pertama; DTO hasil harus konsisten dengannya.
  expect(firstDto, 'DTO drill #1').toBeTruthy();
  expect(firstDto!.points.daily, 'points.daily pada hasil drill pertama hari ini').toBe(5);
  expect(firstDto!.points.total, 'points.total = drill + speed + crown + daily').toBe(145);
  await page.goto(`/belajar/3.3.3?tab=latihan&attempt=${attempts[0]}`);
  await expect(page.getByTestId('drill-gamification')).toContainText('+145 Poin');
  await expect(page.getByTestId('drill-gamification')).toContainText('Harian');
});
