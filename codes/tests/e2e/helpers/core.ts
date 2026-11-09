/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Helper E2E domain Inti Belajar (core-*.spec.ts). Tidak mengubah helpers/app.ts maupun run-e2e.mjs; hanya memakainya.
 *
 * - `ensureCoreContent()` mengimpor paket SINTETIS tests/fixtures/e2e-content/core lewat CLI resmi
 *   (`content-import.ts import`). Video YouTube diimpor berhak `UNVERIFIED` dan CLI tidak punya perintah untuk
 *   memverifikasinya (celah alat, lihat laporan), jadi satu-satunya langkah di luar CLI adalah UPDATE rights_status
 *   pada baris aset video di DB E2E sementara, lalu impor ulang `--publish`.
 * - Penyelesaian belajar dipercepat lewat `learnFast()`: ambang `learn.min_active_seconds` diturunkan (pengaturan
 *   resmi lewat CLI `settings set`), sedangkan satu tes tetap memakai ambang bawaan 60 detik dengan jam nyata.
 * - Soal dijawab berdasarkan teks prompt (urutan/opsi diacak server) dengan kunci dari fixture.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, request as pwRequest, type APIResponse, type Locator, type Page } from '@playwright/test';
import { ANSWERS, RIGHT_PREFIX, WRONG_PREFIX, materializeCorePackage, type Answer } from '../../fixtures/e2e-content/core/package';
import { BASE_URL, cli, createProfile, deleteProfile, unlock, type TestProfile } from './app';

export * from '../../fixtures/e2e-content/core/package';
export { BASE_URL };

export type CoreProfile = TestProfile;
export const createCoreProfile = (tag: string): Promise<CoreProfile> => createProfile(tag);
export const deleteCoreProfile = (p: CoreProfile | undefined): void => deleteProfile(p);
/** Buka kunci Tier (4), Modul (4.2), atau Sub-modul (4.2.1) lewat CLI resmi `progress unlock`. */
export const unlockCode = (p: CoreProfile, code: string): void => unlock(p, code);

const CODES_DIR = process.cwd();
const TSX = path.join(CODES_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function importDir(dir: string, dbPath: string, publish: boolean): string {
  const args = [TSX, 'scripts/content-import.ts', 'import', '--dir', dir];
  if (publish) args.push('--publish');
  return execFileSync(process.execPath, args, {
    cwd: CODES_DIR,
    env: { ...process.env, DATABASE_PATH: dbPath, LOG_LEVEL: 'error' },
    encoding: 'utf8',
  });
}

let imported = false;
/** Impor paket sintetis ke DB E2E (sekali per proses worker; impor ulang = NOOP). */
export function ensureCoreContent(): void {
  if (imported) return;
  const dbPath = process.env.E2E_DATABASE_PATH;
  if (!dbPath) throw new Error('E2E_DATABASE_PATH tidak diset: jalankan lewat tests/e2e/helpers/run-e2e.mjs');
  // Worker Playwright dapat dimulai ulang setelah kegagalan: jangan impor ulang bila konten sudah terbit.
  try {
    const probe = new DatabaseSync(dbPath, { readOnly: true });
    const row = probe.prepare("SELECT status FROM sub_modules WHERE sub_module_code = '4.3.1'").get() as { status?: string } | undefined;
    probe.close();
    if (row?.status === 'PUBLISHED') {
      imported = true;
      return;
    }
  } catch {
    /* DB belum terbaca: lanjut impor */
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'ielts-core-pkg-'));
  try {
    materializeCorePackage(dir, CODES_DIR);
    importDir(dir, dbPath, false);
    // Celah alat: tidak ada CLI untuk memverifikasi hak video. Tanpa langkah ini sub-modul berisi video tidak dapat terbit.
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare("UPDATE content_assets SET rights_status = 'EMBED_ONLY' WHERE kind = 'VIDEO_EMBED' AND rights_status = 'UNVERIFIED'").run();
    } finally {
      db.close();
    }
    importDir(dir, dbPath, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  imported = true;
}

const FAKE = '00000000-0000-4000-8000-000000000001';
const WARM_PAGES = [
  '/', '/peta', '/profil', '/placement', '/belajar/1.2.1', '/belajar/1.2.1?tab=latihan', '/belajar/9.9.9',
  `/ujian/mulai/${FAKE}`, `/ujian/${FAKE}`, `/ujian/${FAKE}/hasil`,
];
const WARM_GET = [
  '/api/v1/curriculum/tree', '/api/v1/me/last-learned', '/api/v1/me/stats', '/api/v1/me/points', '/api/v1/band-tables/active', '/api/v1/placement',
  '/api/v1/sub-modules/1.2.1', `/api/v1/exams/${FAKE}/intro`, `/api/v1/attempts/${FAKE}`, `/api/v1/attempts/${FAKE}/result`, `/api/v1/assets/${FAKE}/file`, '/api/v1/me/active-track',
];
const WARM_POST = [
  '/api/v1/attempts', `/api/v1/attempts/${FAKE}/submit`, `/api/v1/attempts/${FAKE}/sections/${FAKE}/start`, `/api/v1/attempts/${FAKE}/sections/${FAKE}/submit`,
  `/api/v1/sub-modules/${FAKE}/learn-progress`, `/api/v1/sub-modules/${FAKE}/learn-complete`, `/api/v1/sub-modules/${FAKE}/mini-task/complete`,
];

let warmed = false;
const warmFlag = (): string => path.join(tmpdir(), `ielts-core-warm-${Buffer.from(process.env.E2E_DATABASE_PATH ?? 'x').toString('hex').slice(-24)}.flag`);
/**
 * Pemanasan rute dev: server `next dev` mengompilasi rute saat pertama diakses dan, di mesin yang sibuk, permintaan
 * pertama itu dapat dijawab 404 HTML (atau 5xx kosong) sebelum rute siap. Memanggil setiap rute yang dipakai spec core
 * sekali (dengan data palsu, jadi jawaban JSON 4xx wajar) sampai bukan 404 HTML. Bukan perilaku produk: `next start` tidak begitu.
 */
export async function warmUpRoutes(): Promise<void> {
  if (warmed) return;
  // Worker Playwright dimulai ulang setelah kegagalan: pemanasan cukup sekali per DB E2E (penanda berkas di TEMP).
  if (existsSync(warmFlag())) {
    warmed = true;
    return;
  }
  const prof = await createProfile('warm');
  const api = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  try {
    await api.dispose();
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL }, storageState: { cookies: prof.cookies as never, origins: [] } });
    const hit = async (method: 'GET' | 'POST' | 'PUT', url: string) => {
      for (let i = 0; i < 12; i++) {
        const res = method === 'GET' ? await ctx.get(url) : method === 'POST' ? await ctx.post(url, { data: {} }) : await ctx.put(url, { data: {} });
        const ct = res.headers()['content-type'] ?? '';
        const cold = (res.status() === 404 && ct.includes('text/html') && !url.startsWith('/belajar/9.9.9')) || (res.status() >= 500 && !ct.includes('application/json'));
        if (!cold) return;
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    for (const u of WARM_PAGES) await hit('GET', u);
    for (const u of WARM_GET) await hit('GET', u);
    for (const u of WARM_POST) await hit('POST', u);
    await hit('PUT', `/api/v1/attempts/${FAKE}/answers/Q-X`);
    await hit('PUT', '/api/v1/me/last-learned');
    await ctx.dispose();
  } finally {
    deleteProfile(prof);
  }
  warmed = true;
  writeFileSync(warmFlag(), 'ok');
}

/** Atur ambang waktu belajar aktif lewat CLI resmi (rentang 10-3600; bawaan 60). */
export function setLearnMin(seconds: number): void {
  cli('settings', 'set', 'learn.min_active_seconds', String(seconds));
}
export function setSetting(key: string, value: number): void {
  cli('settings', 'set', key, String(value));
}

// ---------------------------------------------------------------- API
const H = { Origin: BASE_URL };
function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const t = /<title>([^<]*)<\/title>/.exec(text)?.[1] ?? '';
    const body = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300);
    return { error: { code: 'NON_JSON_RESPONSE', message: `${t} | ${body}` } };
  }
}
/**
 * Server dev Next.js sesekali menjawab 404 HTML bawaan (atau 5xx tanpa JSON) pada permintaan PERTAMA ke rute yang lama
 * tidak dipakai (rute dev didaur ulang lalu dikompilasi ulang). Itu bukan perilaku aplikasi: ulangi beberapa kali.
 * Galat API sungguhan selalu berupa JSON `{ error: {...} }` dan TIDAK diulang.
 */
async function withTransientRetry(run: () => Promise<APIResponse>): Promise<{ res: APIResponse; text: string }> {
  for (let i = 0; ; i++) {
    const res = await run();
    const text = await res.text();
    const ct = res.headers()['content-type'] ?? '';
    // 404 HTML bawaan Next, atau 5xx tanpa badan JSON: rute dev sedang dikompilasi/didaur ulang (bukan galat API).
    const transient = (res.status() === 404 && ct.includes('text/html')) || (res.status() >= 500 && !ct.includes('application/json'));
    if (!transient || i >= 12) return { res, text };
    await new Promise((r) => setTimeout(r, 1000));
  }
}
type ApiOut<T> = { status: number; body: T; res: APIResponse };
export async function apiGet<T = unknown>(page: Page, url: string): Promise<ApiOut<T>> {
  const { res, text } = await withTransientRetry(() => page.request.get(url));
  return { status: res.status(), body: parseBody(text) as T, res };
}
export async function apiPost<T = unknown>(page: Page, url: string, data?: unknown): Promise<ApiOut<T>> {
  const { res, text } = await withTransientRetry(() => page.request.post(url, { headers: H, ...(data !== undefined ? { data } : {}) }));
  return { status: res.status(), body: parseBody(text) as T, res };
}
export async function apiPut<T = unknown>(page: Page, url: string, data: unknown): Promise<ApiOut<T>> {
  const { res, text } = await withTransientRetry(() => page.request.put(url, { headers: H, data }));
  return { status: res.status(), body: parseBody(text) as T, res };
}

export interface TreeSub {
  id: string;
  sub_module_code: string;
  title: string;
  status: string;
  content_state: string;
  progress_percent: number;
  mastery_crown: string;
  best_score_percent: number;
  has_mini_task: boolean;
  lock_reason: { code: string; message: string; blocking_sub_module_id: string | null } | null;
}
export interface TreeModule {
  id: string;
  module_code: string;
  title: string;
  status: string;
  content_state: string;
  progress_percent: number;
  skip_test: { available: boolean; assessment_set_id: string | null; threshold_percent: number };
  sub_modules: TreeSub[];
}
export interface TreeTier {
  id: string;
  tier_number: number;
  status: string;
  unlock_source: string | null;
  progress_percent: number;
  boss: { available: boolean; blocked_reason: string | null; assessment_set_id: string | null; best_percent: number | null; best_band: number | null; passed_at: string | null };
  skip_test: { available: boolean; assessment_set_id: string | null; threshold_percent: number };
  modules: TreeModule[];
}
export async function getTree(page: Page): Promise<TreeTier[]> {
  const r = await apiGet<{ data: { tiers: TreeTier[] } }>(page, '/api/v1/curriculum/tree');
  expect(r.status).toBe(200);
  return r.body.data.tiers;
}
export async function subOf(page: Page, code: string): Promise<TreeSub & { module: TreeModule; tier: TreeTier }> {
  for (const t of await getTree(page)) for (const m of t.modules) for (const s of m.sub_modules) if (s.sub_module_code === code) return { ...s, module: m, tier: t };
  throw new Error(`sub-modul ${code} tidak ada di pohon`);
}

interface QPublic {
  question_id: string;
  question_type: string;
  prompt: string;
  options: Array<{ option_id: string; text: string }> | null;
  matching: { left: Array<{ item_id: string; text: string }>; right: Array<{ choice_id: string; text: string }> } | null;
  segments: Array<{ segment_id: string; text: string }> | null;
  tokens: Array<{ index: number; text: string }> | null;
}

function responseFor(q: QPublic, a: Answer, mode: 'right' | 'wrong'): unknown {
  const ok = mode === 'right';
  switch (a.t) {
    case 'mcq':
      return { option_ids: [q.options!.find((o) => o.text === (ok ? a.right : a.wrong))!.option_id] };
    case 'multi':
      return { option_ids: (ok ? a.right : a.wrong).map((t) => q.options!.find((o) => o.text === t)!.option_id) };
    case 'choice':
      return { choice: ok ? a.right : a.wrong };
    case 'text':
      return { text: ok ? a.right : a.wrong };
    case 'match': {
      const m = q.matching!;
      const map = ok ? a.right : a.wrong;
      return { pairs: Object.entries(map).map(([l, r]) => ({ item_id: m.left.find((x) => x.text === l)!.item_id, choice_id: m.right.find((x) => x.text === r)!.choice_id })) };
    }
    case 'reorder':
      return { segment_ids: a.right.map((t) => q.segments!.find((s) => s.text === t)!.segment_id) };
    case 'error':
      return { token_indexes: (ok ? a.right : a.wrong).map((t) => q.tokens!.find((x) => x.text === t)!.index) };
  }
}

/** Respons API untuk soal gaya ujian ("Jawaban benar ..." / "Pengecoh ..."). */
function examResponse(q: QPublic, mode: 'right' | 'wrong'): unknown {
  const prefix = mode === 'right' ? RIGHT_PREFIX : WRONG_PREFIX;
  const opt = q.options!.find((o) => o.text.startsWith(prefix))!;
  return { option_ids: [opt.option_id] };
}

export interface AttemptStart {
  id: string;
  status: number;
  questions: QPublic[];
  raw: { status: number; body: any };
}
export async function startAttempt(page: Page, setId: string): Promise<AttemptStart> {
  const r = await apiPost<{ data: { id: string; questions: QPublic[] } }>(page, '/api/v1/attempts', { assessment_set_id: setId });
  return { id: r.body?.data?.id, status: r.status, questions: r.body?.data?.questions ?? [], raw: { status: r.status, body: r.body } };
}

/**
 * Jawab semua soal sebuah attempt lewat API lalu submit. `plan(prompt, index)` memilih 'right' | 'wrong' | 'skip'.
 * Soal fixture drill (ANSWERS) dijawab sesuai kunci; soal gaya ujian dijawab memakai awalan teks opsi.
 */
export async function solveAttempt(
  page: Page,
  attempt: AttemptStart,
  plan: (prompt: string, index: number) => 'right' | 'wrong' | 'skip' = () => 'right',
): Promise<any> {
  for (let i = 0; i < attempt.questions.length; i++) {
    const q = attempt.questions[i]!;
    const mode = plan(q.prompt, i);
    if (mode === 'skip') continue;
    const a = ANSWERS.get(q.prompt);
    const response = a ? responseFor(q, a, mode) : examResponse(q, mode);
    const r = await apiPut(page, `/api/v1/attempts/${attempt.id}/answers/${q.question_id}`, { response });
    expect(r.status, `${q.question_id} ${JSON.stringify(r.body).slice(0, 400)}`).toBe(200);
  }
  const sub = await apiPost<{ data: any }>(page, `/api/v1/attempts/${attempt.id}/submit`);
  expect(sub.status, JSON.stringify(sub.body)).toBe(200);
  return sub.body.data;
}

/** Buka sub-modul (markStarted), kumpulkan bukti belajar secepat mungkin, lalu tandai materi selesai. Butuh ambang kecil. */
export async function learnFast(page: Page, code: string): Promise<{ subModuleId: string; drillSetId: string | null }> {
  const d = await apiGet<{ data: any }>(page, `/api/v1/sub-modules/${code}`);
  expect(d.status, JSON.stringify(d.body)).toBe(200);
  const data = d.body.data;
  const sid = data.sub_module.id as string;
  if (!data.progress.learn_completed_at) {
    const min = data.progress.min_active_seconds as number;
    expect(min, 'ambang belajar harus diturunkan dulu (setLearnMin)').toBeLessThanOrEqual(15);
    const tabs: string[] = ['ARTICLE'];
    if (data.material.videos.length) tabs.push('VIDEO');
    if (data.material.slides.length) tabs.push('SLIDES');
    const first = await apiPost(page, `/api/v1/sub-modules/${sid}/learn-progress`, { subtab: 'ARTICLE', active_seconds: 30 });
    expect(first.status, `${sid} ${JSON.stringify(first.body).slice(0, 120)} ${first.res.url()}`).toBe(200);
    await page.waitForTimeout(6500);
    for (const t of tabs) {
      const r = await apiPost(page, `/api/v1/sub-modules/${sid}/learn-progress`, { subtab: t, active_seconds: 30 });
      expect(r.status, `${t} ${r.res.url()} ${JSON.stringify(r.body).slice(0, 400)}`).toBe(200);
    }
    const done = await apiPost(page, `/api/v1/sub-modules/${sid}/learn-complete`);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
  }
  return { subModuleId: sid, drillSetId: data.drill.assessment_set_id };
}

/** Selesaikan sub-modul sampai COMPLETED lewat API (belajar cepat + drill semua benar). */
export async function completeSub(page: Page, code: string): Promise<any> {
  const { drillSetId } = await learnFast(page, code);
  expect(drillSetId).toBeTruthy();
  const at = await startAttempt(page, drillSetId!);
  expect([200, 201]).toContain(at.status);
  return solveAttempt(page, at, () => 'right');
}

// ---------------------------------------------------------------- UI: Active Drill
export async function currentPrompt(page: Page): Promise<string> {
  const legend = page.locator('main fieldset > legend').first();
  await expect(legend).toBeVisible();
  return (await legend.innerText()).trim();
}

function labelOf(page: Page, text: string): Locator {
  return page.locator('main label').filter({ has: page.locator('span[lang="en"]', { hasText: new RegExp(`^${escapeRe(text)}$`) }) });
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Urutkan daftar SENTENCE_REORDER memakai tombol Naik/Turun (aman keyboard). */
async function reorderTo(page: Page, order: string[], viaKeyboard = false): Promise<void> {
  for (let target = 0; target < order.length; target++) {
    for (let guard = 0; guard < 12; guard++) {
      const texts = await page.locator('ol[aria-label="Urutan segmen kalimat"] > li span[lang="en"]').allInnerTexts();
      const idx = texts.indexOf(order[target]!);
      if (idx <= target) break;
      const btn = page.getByRole('button', { name: `Naikkan "${order[target]}"` });
      if (viaKeyboard) {
        await btn.focus();
        await page.keyboard.press('Enter');
      } else {
        await btn.click();
      }
    }
  }
}

/** Seret chip pilihan ke zona butir memakai mouse bertahap (ambang drag 8px). */
async function dragChipToZone(page: Page, chipText: string, itemText: string): Promise<void> {
  const chip = page.getByRole('button', { name: `Seret ${chipText}` });
  const zone = page.locator('main li').filter({ has: page.locator('span[lang="en"]', { hasText: new RegExp(`^${escapeRe(itemText)}$`) }) }).first();
  const a = await chip.boundingBox();
  const b = await zone.boundingBox();
  if (!a || !b) throw new Error('chip/zona seret tidak terlihat');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  // dnd-kit menelan klik pertama setelah drop; beri jeda seperti pengguna sungguhan sebelum menekan Periksa.
  await page.waitForTimeout(400);
}

export interface UiAnswerOpts {
  /** MATCHING_DRAG: 'drag' = seret dengan mouse; 'select' = pakai dropdown (default). */
  dragMode?: 'drag' | 'select';
  keyboardReorder?: boolean;
}

/** Jawab soal aktif di UI berdasarkan teks prompt-nya. Mengembalikan prompt yang dijawab. */
export async function uiAnswer(page: Page, mode: 'right' | 'wrong', opts: UiAnswerOpts = {}): Promise<string> {
  const prompt = await currentPrompt(page);
  const a = ANSWERS.get(prompt);
  if (!a) throw new Error(`prompt tidak dikenal: ${prompt}`);
  const ok = mode === 'right';
  switch (a.t) {
    case 'mcq':
      await labelOf(page, ok ? a.right : a.wrong).locator('input').check();
      break;
    case 'multi':
      for (const t of ok ? a.right : a.wrong) await labelOf(page, t).locator('input').check({ force: true });
      break;
    case 'choice':
      await page.locator('main label').filter({ has: page.locator('span[lang="en"]', { hasText: new RegExp(`^${escapeRe(ok ? a.right : a.wrong)}$`) }) }).click();
      break;
    case 'text':
      await page.getByLabel('Jawaban Anda').fill(ok ? a.right : a.wrong);
      break;
    case 'match': {
      const map = ok ? a.right : a.wrong;
      const toSelect = page.getByRole('button', { name: 'Gunakan pilihan daftar' });
      const toDrag = page.getByRole('button', { name: 'Gunakan seret & lepas' });
      const want = opts.dragMode ?? 'select';
      if (want === 'select' && (await toSelect.isVisible())) await toSelect.click();
      if (want === 'drag' && (await toDrag.isVisible())) await toDrag.click();
      if (want === 'drag') {
        for (const [l, r] of Object.entries(map)) await dragChipToZone(page, r, l);
      } else {
        for (const [l, r] of Object.entries(map)) await page.getByLabel(l, { exact: true }).selectOption({ label: r });
      }
      break;
    }
    case 'reorder':
      await reorderTo(page, a.right, opts.keyboardReorder);
      break;
    case 'error':
      for (const t of ok ? a.right : a.wrong) await page.locator('main ul[aria-label="Kalimat"] button').filter({ hasText: new RegExp(`^${escapeRe(t)}$`) }).click();
      break;
  }
  return prompt;
}

/** Tekan "Periksa" dan tunggu panel umpan balik. Mengembalikan `correct` menurut UI. */
export async function uiCheck(page: Page): Promise<{ correct: boolean; feedback: Locator }> {
  await page.getByRole('button', { name: 'Periksa', exact: true }).click();
  const fb = page.locator('[data-state="correct"], [data-state="wrong"]').first();
  await expect(fb).toBeVisible();
  return { correct: (await fb.getAttribute('data-state')) === 'correct', feedback: fb };
}

/** Lanjut ke soal berikut, atau "Lihat Hasil" pada soal terakhir. Mengembalikan true bila hasil dibuka. */
export async function uiNext(page: Page): Promise<boolean> {
  const last = page.getByRole('button', { name: 'Lihat Hasil' });
  const next = page.getByRole('button', { name: 'Lanjut', exact: true });
  await expect(last.or(next)).toBeVisible();
  if (await last.isVisible()) {
    await last.click();
    return true;
  }
  await next.click();
  return false;
}

/** Kerjakan drill di UI dari soal aktif sampai hasil. `plan(prompt, i)` -> right/wrong. */
export async function uiRunDrill(page: Page, plan: (prompt: string, i: number) => 'right' | 'wrong', opts: UiAnswerOpts = {}): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 60; i++) {
    const prompt = await currentPrompt(page);
    seen.push(prompt);
    await uiAnswer(page, plan(prompt, i), opts);
    await uiCheck(page);
    if (await uiNext(page)) return seen;
  }
  throw new Error('drill tidak selesai');
}

// ---------------------------------------------------------------- UI: Ujian (Skip/Boss)
/** Jawab soal gaya ujian di UI (pilih opsi berawalan benar/pengecoh). */
export async function uiExamPick(page: Page, mode: 'right' | 'wrong'): Promise<void> {
  const prefix = mode === 'right' ? RIGHT_PREFIX : WRONG_PREFIX;
  await page.locator('main label').filter({ has: page.locator('span[lang="en"]', { hasText: new RegExp(`^${prefix}`) }) }).first().locator('input').check();
}

/** Kerjakan seluruh soal ujian di UI lalu akhiri. `plan(i)` -> right/wrong; menunggu simpan otomatis tiap soal. */
export async function uiRunExam(page: Page, count: number, plan: (i: number) => 'right' | 'wrong', finishLabel = 'Akhiri'): Promise<void> {
  for (let i = 0; i < count; i++) {
    await expect(page.getByTestId('question-counter')).toHaveText(`Soal ${i + 1} dari ${count}`);
    await uiExamPick(page, plan(i));
    await expect(page.getByText('Jawaban tersimpan')).toBeVisible();
    if (i < count - 1) await page.getByRole('button', { name: 'Soal berikutnya' }).click();
  }
  await page.getByRole('button', { name: finishLabel, exact: true }).click();
  await page.getByRole('button', { name: 'Ya, akhiri' }).click();
}

// ---------------------------------------------------------------- stub YouTube IFrame API
const YT_STUB = `(function(){
  window.__yt = { players: [], time: 0, last: null };
  function Player(el, opts){
    this.opts = opts; window.__yt.players.push(opts); window.__yt.last = this;
    this.iframe = document.createElement('iframe'); this.iframe.setAttribute('data-stub', '1'); el.appendChild(this.iframe);
    setTimeout(function(){ if (opts.events && opts.events.onReady) opts.events.onReady(); }, 30);
  }
  Player.prototype.destroy = function(){ this.iframe.remove(); };
  Player.prototype.getCurrentTime = function(){ return window.__yt.time; };
  Player.prototype.getIframe = function(){ return this.iframe; };
  window.__ytState = function(s){ window.__yt.last.opts.events.onStateChange({ data: s }); };
  window.YT = { Player: Player };
  setTimeout(function(){ if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 0);
})();`;

/** Ganti skrip IFrame API YouTube dengan stub terkendali (jaringan luar tidak dipakai). */
export async function stubYouTube(page: Page): Promise<void> {
  await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: YT_STUB }));
}
/** Buat pemuatan IFrame API gagal (jaringan terputus). */
export async function breakYouTube(page: Page): Promise<void> {
  await page.route('https://www.youtube.com/iframe_api', (route) => route.abort());
}

export async function noHorizontalOverflow(page: Page): Promise<{ sw: number; w: number }> {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
}

/** Simpan screenshot bukti ke tests/screenshots/core/. */
export async function shot(page: Page, name: string): Promise<string> {
  const p = path.join('tests', 'screenshots', 'core', `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}
