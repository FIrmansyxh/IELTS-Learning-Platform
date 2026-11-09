import { expect, test, type Page } from '@playwright/test';
import {
  SKIP_MODULE_TITLE,
  SKIP_TIER_TITLE,
  SUB_TITLES,
  apiGet,
  apiPost,
  apiPut,
  createCoreProfile,
  deleteCoreProfile,
  ensureCoreContent,
  warmUpRoutes,
  getTree,
  noHorizontalOverflow,
  setSetting,
  shot,
  solveAttempt,
  startAttempt,
  subOf,
  uiRunExam,
  unlockCode,
  type CoreProfile,
} from './helpers/core';

// SPEC-008 Skip Test / Uji Kompetensi (domain Inti Belajar). Set Skip Modul 2.1 = 6 soal / 120 detik / ambang 85%
// (5 dari 6 = 83,33% gagal; 6 dari 6 lulus). Set Skip Tier 3 = 4 soal / 30 detik.
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
  setSetting('attempt.cooldown_minutes', 60);
  setSetting('attempt.max_per_set_per_day', 3);
});
test.afterAll(() => {
  test.setTimeout(300_000);
  setSetting('attempt.cooldown_minutes', 60);
  for (const p of profiles) deleteCoreProfile(p);
});

interface Intro {
  data: {
    assessment_set_id: string;
    title: string;
    scope: { kind: string; label: string };
    time_limit_seconds: number;
    question_count: number;
    threshold: { kind: string; value: number };
    available: boolean;
    blocked_reason: string | null;
    cooldown: { next_allowed_at: string | null; attempts_in_window: number; max_attempts: number };
    active_attempt_id: string | null;
  };
}
async function moduleSkipSetId(page: Page): Promise<string> {
  const t2 = (await getTree(page)).find((t) => t.tier_number === 2)!;
  const set = t2.modules.find((m) => m.module_code === '2.1')!.skip_test.assessment_set_id;
  expect(set, 'set Skip Modul 2.1 terbit').toBeTruthy();
  return set!;
}
async function tierSkipSetId(page: Page): Promise<string> {
  const set = (await getTree(page)).find((t) => t.tier_number === 3)!.skip_test.assessment_set_id;
  expect(set, 'set Skip Tier 3 terbit').toBeTruthy();
  return set!;
}

/** Kumpulkan badan respons /api/v1/attempts* selama ujian untuk pemeriksaan kebocoran kunci. */
function captureAttemptBodies(page: Page): string[] {
  const bodies: string[] = [];
  page.on('response', (r) => {
    const u = r.url();
    if (/\/api\/v1\/attempts(\/|$)/.test(u) && r.request().method() !== 'OPTIONS') void r.text().then((t) => bodies.push(`${r.request().method()} ${u} ${t}`)).catch(() => undefined);
  });
  return bodies;
}

test('alur gagal: peta -> dialog -> intro -> ujian tanpa umpan balik -> Belum lulus 83,33% -> cooldown memblokir percobaan ulang', async ({ page, context }) => {
  const p = await mk('skp-f');
  await context.addCookies(p.cookies);
  const bodies = captureAttemptBodies(page);
  const setId = await moduleSkipSetId(page);

  // Peta: tombol Uji Kompetensi pada kartu Modul 2.1 -> Dialog konfirmasi -> layar pra-ujian.
  await page.goto('/peta');
  const mod = page.locator('li').filter({ has: page.getByText('Modul 2.1', { exact: true }) }).first();
  await mod.getByRole('button', { name: 'Uji Kompetensi' }).click();
  await page.getByRole('link', { name: 'Lanjut ke Halaman Ujian' }).click();
  await expect(page).toHaveURL(new RegExp(`/ujian/mulai/${setId}$`));

  // Intro
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SKIP_MODULE_TITLE);
  await expect(page.getByText('Modul 2.1 Complex Grammar & Sentence Combining')).toBeVisible();
  await expect(page.getByText('Skor >= 85% membuka level berikutnya tanpa materi')).toBeVisible();
  await expect(page.getByText('6 soal - 2 menit')).toBeVisible();
  await expect(page.getByText('Aturan ujian')).toBeVisible();
  await expect(page.getByText('Skor minimal 85% membuka level berikutnya tanpa membuka materi.')).toBeVisible();
  await expect(page.getByText('Tidak ada pembahasan selama ujian.')).toBeVisible();
  await expect(page.getByText('Percobaan 24 jam terakhir: 0 dari 3')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kembali ke Peta' })).toHaveAttribute('href', '/peta');
  const intro = (await apiGet<Intro>(page, `/api/v1/exams/${setId}/intro`)).body.data;
  expect(intro).toMatchObject({ available: true, blocked_reason: null, question_count: 6, time_limit_seconds: 120, scope: { kind: 'MODULE' }, threshold: { kind: 'PERCENT', value: 85 } });
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
  await shot(page, `skip-intro-${test.info().project.name}`);

  // Ujian berjalan: kerangka tenang (tanpa chip gamifikasi, tanpa tombol Periksa), timer hitung mundur, tanpa umpan balik.
  await page.getByRole('button', { name: 'Mulai Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/);
  const attemptId = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SKIP_MODULE_TITLE);
  await expect(page.getByRole('timer', { name: 'Sisa waktu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Periksa', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('header-chips')).toHaveCount(0);
  await uiRunExam(page, 6, (i) => (i === 5 ? 'wrong' : 'right'));

  // Hasil
  await expect(page).toHaveURL(new RegExp(`/ujian/${attemptId}/hasil$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Belum lulus');
  await expect(page.getByTestId('score-percent')).toHaveText('83,33%');
  await expect(page.getByText('Ambang lulus 85%')).toBeVisible();
  await expect(page.getByText('5 dari 6 poin')).toBeVisible();
  await expect(page.getByText('Tidak ada penalti. Pelajari materinya lalu coba lagi.')).toBeVisible();
  await expect(page.getByText(/^Coba lagi setelah \d{2}[.:]\d{2}/)).toBeVisible();
  await expect(page.getByText('Sisa percobaan hari ini: 2')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mulai Belajar dari Awal Modul' })).toHaveAttribute('href', '/belajar/2.1.1');
  await expect(page.getByRole('link', { name: 'Buka Peta Belajar' })).toBeVisible();
  // Rincian per keterampilan ada; tidak ada hasil benar/salah per soal, kunci, atau pembahasan (amandemen D10).
  await expect(page.getByText('Rincian per keterampilan')).toBeVisible();
  await expect(page.getByText('Hasil per soal')).toHaveCount(0);
  await expect(page.getByText('Pembahasan')).toHaveCount(0);
  await expect(page.getByText('Jawaban benar')).toHaveCount(0);
  await shot(page, `skip-fail-${test.info().project.name}`);

  // Jaringan: tidak ada kunci/is_correct/pembahasan di respons mana pun selama ujian; umpan balik jawaban = null.
  const joined = bodies.join('\n');
  expect(joined.length).toBeGreaterThan(0);
  expect(joined).not.toMatch(/"(correct_answers|explanation_id|correct_answer|is_correct)"\s*:\s*(?!null)/);
  const answerBodies = bodies.filter((b) => b.startsWith('PUT '));
  expect(answerBodies.length).toBeGreaterThanOrEqual(6);
  for (const b of answerBodies) expect(b).toMatch(/"feedback":null/);
  const result = (await apiGet<{ data: { review: unknown; skip: { passed: boolean; retry: { next_allowed_at: string; attempts_remaining_today: number }; unlocked: unknown[]; skipped_sub_module_count: number } } }>(page, `/api/v1/attempts/${attemptId}/result`)).body.data;
  expect(result.review).toBeNull();
  expect(result.skip).toMatchObject({ passed: false, unlocked: [], skipped_sub_module_count: 0 });
  expect(result.skip.retry.attempts_remaining_today).toBe(2);

  // Cooldown: intro menonaktifkan tombol dengan alasan; API 429 COOLDOWN_ACTIVE + Retry-After.
  await page.goto(`/ujian/mulai/${setId}`);
  await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
  await expect(page.getByText(/^Coba lagi pukul \d{2}[.:]\d{2}/)).toBeVisible();
  const intro2 = (await apiGet<Intro>(page, `/api/v1/exams/${setId}/intro`)).body.data;
  expect(intro2).toMatchObject({ available: false, blocked_reason: 'COOLDOWN_ACTIVE' });
  expect(intro2.cooldown.next_allowed_at).toBeTruthy();
  const blocked = await apiPost<{ error: { code: string; details: Array<{ code: string; message: string }> } }>(page, '/api/v1/attempts', { assessment_set_id: setId });
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe('COOLDOWN_ACTIVE');
  expect(blocked.body.error.details[0]).toMatchObject({ path: 'next_allowed_at', code: 'cooldown_active' });
  const retryAfter = Number(blocked.res.headers()['retry-after']);
  expect(retryAfter).toBeGreaterThan(3500);
  expect(retryAfter).toBeLessThanOrEqual(3600);
  expect(Date.parse(blocked.body.error.details[0]!.message)).toBeGreaterThan(Date.now());
  // Tidak ada perubahan progres akibat gagal (modul belum diproses).
  expect((await subOf(page, '2.1.1')).status).toBe('LOCKED');
  // Dasbor tidak memuat ujian pada kartu Lanjutkan Belajar.
  await page.goto('/');
  await expect(page.getByTestId('resume-card')).not.toContainText('Uji Kompetensi');
});

test('alur lulus (6 dari 6): Level dilewati, sub-modul "Dilewati", modul berikutnya terbuka; Skip tidak lagi tersedia', async ({ page, context }) => {
  const p = await mk('skp-p');
  await context.addCookies(p.cookies);
  const setId = await moduleSkipSetId(page);
  await page.goto(`/ujian/mulai/${setId}`);
  await page.getByRole('button', { name: 'Mulai Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/);
  await uiRunExam(page, 6, () => 'right');
  const attemptId = page.url().split('/')[4]!;

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Level dilewati');
  // Bukti API: AC SPEC-008 "sub-modul pertama modul berikutnya UNLOCKED" dan skip.unlocked memuatnya.
  const api = await apiGet<{ data: { skip: { unlocked: Array<{ kind: string; label: string }>; skipped_sub_module_count: number } } }>(page, `/api/v1/attempts/${attemptId}/result`);
  expect.soft(api.body.data.skip.unlocked.map((u) => u.label), 'skip.unlocked harus memuat sub-modul pertama modul berikutnya (2.2.1)').toContain(SUB_TITLES['2.2.1']);
  await expect(page.getByTestId('score-percent')).toHaveText('100%');
  await expect(page.getByText('6 dari 6 poin')).toBeVisible();
  await expect(page.getByText('1 sub-modul ditandai Dilewati')).toBeVisible();
  await expect(page.getByText(/^Terbuka: /)).toContainText(SUB_TITLES['2.2.1']!);
  await expect(page.getByText('Modul 2.1 Complex Grammar & Sentence Combining')).toBeVisible();
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
  await shot(page, `skip-pass-${test.info().project.name}`);

  await page.getByRole('link', { name: 'Buka Peta Belajar' }).click();
  await expect(page).toHaveURL(/\/peta$/);
  const n211 = page.locator('li[data-node-id]').filter({ hasText: SUB_TITLES['2.1.1']! }).first();
  await expect(n211).toContainText('Dilewati');
  const n221 = page.locator('li[data-node-id]').filter({ hasText: SUB_TITLES['2.2.1']! }).first();
  await expect(n221).toContainText('Sedang dipelajari');
  await expect(n221.getByRole('link')).toHaveAttribute('href', '/belajar/2.2.1');
  const mod = page.locator('li').filter({ has: page.getByText('Modul 2.1', { exact: true }) }).first();
  await expect(mod).toContainText('Dilewati');
  await expect(mod.getByRole('button', { name: 'Uji Kompetensi' })).toHaveCount(0);

  const t2 = (await getTree(page)).find((t) => t.tier_number === 2)!;
  expect(t2.status).not.toBe('LOCKED');
  const m21 = t2.modules.find((x) => x.module_code === '2.1')!;
  expect(m21.status).toBe('SKIPPED');
  expect(m21.skip_test.available).toBe(false);
  expect(m21.progress_percent).toBe(100);
  // Skip ulang pada modul yang sudah dilewati ditolak.
  const intro = (await apiGet<Intro>(page, `/api/v1/exams/${setId}/intro`)).body.data;
  expect(intro).toMatchObject({ available: false, blocked_reason: 'SKIP_NOT_AVAILABLE' });
  const again = await apiPost<{ error: { code: string } }>(page, '/api/v1/attempts', { assessment_set_id: setId });
  expect(again.status).toBe(409);
  expect(again.body.error.code).toBe('SKIP_NOT_AVAILABLE');
});

test('Skip tidak tersedia setelah level dimulai: tombol hilang dari peta, intro dinonaktifkan, POST /attempts 409', async ({ page, context }) => {
  const p = await mk('skp-s');
  await context.addCookies(p.cookies);
  const setId = await moduleSkipSetId(page);
  unlockCode(p, '2.1.1');
  expect((await apiGet(page, '/api/v1/sub-modules/2.1.1')).status).toBe(200); // markStarted -> IN_PROGRESS
  expect((await subOf(page, '2.1.1')).status).toBe('IN_PROGRESS');

  await page.goto('/peta');
  const mod = page.locator('li').filter({ has: page.getByText('Modul 2.1', { exact: true }) }).first();
  await expect(mod).toBeVisible();
  await expect(mod.getByRole('button', { name: 'Uji Kompetensi' })).toHaveCount(0);
  await page.goto(`/ujian/mulai/${setId}`);
  await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
  await expect(page.getByText('Level ini sudah dimulai')).toBeVisible();
  const intro = (await apiGet<Intro>(page, `/api/v1/exams/${setId}/intro`)).body.data;
  expect(intro).toMatchObject({ available: false, blocked_reason: 'SKIP_NOT_AVAILABLE' });
  const r = await apiPost<{ error: { code: string; message: string } }>(page, '/api/v1/attempts', { assessment_set_id: setId });
  expect(r.status).toBe(409);
  expect(r.body.error.code).toBe('SKIP_NOT_AVAILABLE');
  expect(r.body.error.message).toBe('Uji Kompetensi tidak tersedia karena level ini sudah dimulai atau diselesaikan.');
});

test('batas harian: cooldown 0 mengizinkan ulang langsung; percobaan ke-4 ditolak DAILY_ATTEMPT_LIMIT (UI + API)', async ({ page, context }) => {
  const p = await mk('skp-d');
  await context.addCookies(p.cookies);
  const setId = await moduleSkipSetId(page);
  setSetting('attempt.cooldown_minutes', 0);
  try {
    for (let i = 1; i <= 3; i++) {
      const at = await startAttempt(page, setId);
      expect(at.status, `percobaan ${i} langsung setelah gagal`).toBe(201);
      const res = await solveAttempt(page, at, () => 'wrong');
      expect(res.skip.passed).toBe(false);
      expect(res.skip.retry.next_allowed_at, 'cooldown 0: tidak ada jam tunggu').toBeNull();
      expect(res.skip.retry.attempts_remaining_today).toBe(3 - i);
    }
    const fourth = await apiPost<{ error: { code: string; message: string } }>(page, '/api/v1/attempts', { assessment_set_id: setId });
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe('DAILY_ATTEMPT_LIMIT');
    expect(fourth.body.error.message).toBe('Batas percobaan harian untuk ujian ini sudah tercapai.');
    await page.goto(`/ujian/mulai/${setId}`);
    await expect(page.getByText('Percobaan 24 jam terakhir: 3 dari 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
    await expect(page.getByText('Batas percobaan hari ini tercapai')).toBeVisible();
    const intro = (await apiGet<Intro>(page, `/api/v1/exams/${setId}/intro`)).body.data;
    expect(intro).toMatchObject({ available: false, blocked_reason: 'DAILY_ATTEMPT_LIMIT' });
  } finally {
    setSetting('attempt.cooldown_minutes', 60);
  }
});

test('Skip Tier 3 lulus: Tier "Dilewati", sub-modul Tier "Dilewati", Tier 4 terbuka dengan sub pertama', async ({ page, context }) => {
  const p = await mk('skp-t');
  await context.addCookies(p.cookies);
  const setId = await tierSkipSetId(page);
  await page.goto('/peta');
  const t3 = page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: /^Tier 3:/ }) });
  await t3.getByRole('button', { name: 'Uji Kompetensi' }).first().click();
  await page.getByRole('link', { name: 'Lanjut ke Halaman Ujian' }).click();
  await expect(page).toHaveURL(new RegExp(`/ujian/mulai/${setId}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SKIP_TIER_TITLE);
  await expect(page.getByText('4 soal - 1 menit')).toBeVisible();
  await page.getByRole('button', { name: 'Mulai Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/);
  await uiRunExam(page, 4, () => 'right');
  const tierAttemptId = page.url().split('/')[4]!;

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Level dilewati');
  const tierApi = await apiGet<{ data: { skip: { unlocked: Array<{ kind: string; label: string }> } } }>(page, `/api/v1/attempts/${tierAttemptId}/result`);
  expect.soft(tierApi.body.data.skip.unlocked.map((u) => `${u.kind}:${u.label}`), 'skip.unlocked harus memuat Tier 4 / sub-modul pertamanya').not.toEqual([]);
  await expect(page.getByText(/^\d+ sub-modul ditandai Dilewati$/)).toBeVisible();
  await expect(page.getByText(/^Terbuka: /)).toContainText(SUB_TITLES['4.2.1']!);

  const tiers = await getTree(page);
  const tier3 = tiers.find((t) => t.tier_number === 3)!;
  expect(tier3.status).toBe('SKIPPED');
  expect(tier3.unlock_source).toBe('SKIP_TEST');
  for (const mod of tier3.modules) for (const s of mod.sub_modules.filter((x) => x.content_state === 'AVAILABLE')) expect(s.status, s.sub_module_code).toBe('SKIPPED');
  const tier4 = tiers.find((t) => t.tier_number === 4)!;
  expect(tier4.status).not.toBe('LOCKED');
  expect((await subOf(page, '4.2.1')).status).toBe('UNLOCKED');

  await page.goto('/peta');
  await expect(t3.locator('header').getByText('Dilewati').first()).toBeVisible();
  const n421 = page.locator('li[data-node-id]').filter({ hasText: SUB_TITLES['4.2.1']! }).first();
  await expect(n421).toContainText('Sedang dipelajari');
  await expect(t3.getByRole('button', { name: 'Uji Kompetensi' })).toHaveCount(0);
});

test('kedaluwarsa nyata (30 detik): jawaban sebelum deadline dinilai, PUT sesudahnya 409 ATTEMPT_EXPIRED, hasil gagal dan cooldown berlaku', async ({ page, context }) => {
  test.setTimeout(75_000);
  const p = await mk('skp-x');
  await context.addCookies(p.cookies);
  const setId = await tierSkipSetId(page);
  const at = await startAttempt(page, setId);
  expect(at.status).toBe(201);
  const raw = at.raw.body.data as { mode: string; deadline_at: string; started_at: string; time_limit_seconds: number };
  expect(raw.mode).toBe('EXAM');
  expect(Date.parse(raw.deadline_at) - Date.parse(raw.started_at)).toBe(raw.time_limit_seconds * 1000);
  // Satu jawaban benar sebelum deadline.
  const q0 = at.questions[0]!;
  const right = q0.options!.find((o) => o.text.startsWith('Jawaban benar'))!;
  const first = await apiPut<{ data: { feedback: unknown } }>(page, `/api/v1/attempts/${at.id}/answers/${q0.question_id}`, { response: { option_ids: [right.option_id] } });
  expect(first.status).toBe(200);
  expect(first.body.data.feedback).toBeNull();
  const raceKeys = await apiPut<{ error: { details: Array<{ code: string }> } }>(page, `/api/v1/attempts/${at.id}/answers/${at.questions[1]!.question_id}`, { response: { option_ids: [right.option_id] }, passed: true });
  expect(raceKeys.status).toBe(400);
  expect(raceKeys.body.error.details.map((d) => d.code)).toContain('unrecognized_key');

  await page.waitForTimeout(37_000); // deadline + toleransi 5 detik
  const late = await apiPut<{ error: { code: string } }>(page, `/api/v1/attempts/${at.id}/answers/${at.questions[1]!.question_id}`, { response: { option_ids: [right.option_id] } });
  expect(late.status).toBe(409);
  expect(late.body.error.code).toBe('ATTEMPT_EXPIRED');
  const res = await apiGet<{ data: { attempt: { status: string; passed: boolean; raw_score: number; max_score: number; score_percent: number }; skip: { passed: boolean; retry: { next_allowed_at: string | null } } } }>(page, `/api/v1/attempts/${at.id}/result`);
  expect(res.status).toBe(200);
  expect(res.body.data.attempt).toMatchObject({ status: 'EXPIRED', passed: false, raw_score: 1, max_score: 4, score_percent: 25 });
  expect(res.body.data.skip.retry.next_allowed_at).toBeTruthy();
  // Layar berjalan mengalihkan ke hasil; hasil menampilkan kegagalan dan skor jawaban tersimpan.
  await page.goto(`/ujian/${at.id}`);
  await expect(page).toHaveURL(new RegExp(`/ujian/${at.id}/hasil$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Belum lulus');
  await expect(page.getByTestId('score-percent')).toHaveText('25%');
  await expect(page.getByText('1 dari 4 poin')).toBeVisible();
  await page.goto(`/ujian/mulai/${setId}`);
  await expect(page.getByRole('button', { name: 'Mulai Ujian' })).toBeDisabled();
});

test('attempt berjalan dipulihkan: "Lanjutkan Ujian", jawaban tersimpan, tanpa hitungan batas baru; tidak muncul di kartu Lanjutkan Belajar', async ({ page, context }) => {
  const p = await mk('skp-r');
  await context.addCookies(p.cookies);
  const setId = await moduleSkipSetId(page);
  await page.goto(`/ujian/mulai/${setId}`);
  await page.getByRole('button', { name: 'Mulai Ujian' }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/);
  const attemptUrl = page.url();
  const attemptId = attemptUrl.split('/').pop()!;
  await expect(page.getByTestId('question-counter')).toHaveText('Soal 1 dari 6');
  await page.locator('main label').filter({ has: page.locator('span[lang="en"]', { hasText: /^Jawaban benar/ }) }).first().locator('input').check();
  await expect(page.getByText('Jawaban tersimpan')).toBeVisible();
  page.on('dialog', (d) => void d.accept());

  // Keluar ke beranda: kartu Lanjutkan Belajar tidak memuat ujian.
  await page.goto('/');
  await expect(page.getByTestId('resume-card')).not.toContainText('Uji Kompetensi');
  await page.goto(`/ujian/mulai/${setId}`);
  const resumeBtn = page.getByRole('button', { name: 'Lanjutkan Ujian' });
  await expect(resumeBtn).toBeVisible();
  await expect(resumeBtn).toBeEnabled();
  const again = await apiPost<{ data: { id: string; resumed: boolean } }>(page, '/api/v1/attempts', { assessment_set_id: setId });
  expect(again.status).toBe(200);
  expect(again.body.data).toMatchObject({ id: attemptId, resumed: true });
  await resumeBtn.click();
  await expect(page).toHaveURL(attemptUrl);
  const att = await apiGet<{ data: { answered_count: number } }>(page, `/api/v1/attempts/${attemptId}`);
  expect(att.body.data.answered_count).toBe(1);
});
