/**
 * Helper E2E domain Ujian dan Penilaian (exam-*.spec.ts). Tidak mengubah helpers/app.ts.
 *
 * - `ensureExamContent()` mengimpor paket SINTETIS tests/fixtures/e2e-content/exams lewat CLI resmi
 *   (`content-import.ts import --publish`) ke DB E2E (idempoten: impor ulang = NOOP).
 * - `examIds()` membaca id set (Skip Reading/Listening, Boss Tier 1/2, Placement) dari API publik.
 * - `solve()` menjawab soal berdasarkan teks prompt (urutan opsi diacak server), kunci dibaca dari fixture.
 * - `completeSubModule()` menyelesaikan sub-modul lewat API (materi + drill) agar Tier terbuka untuk Boss.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { BASE_URL, cli, type TestProfile } from './app';

const CODES_DIR = process.cwd();
export const FIXTURE_DIR = path.join(CODES_DIR, 'tests', 'fixtures', 'e2e-content', 'exams');

let imported = false;
/** Impor paket sintetis ke DB E2E (sekali per proses worker), turunkan batas waktu belajar minimal, dan panaskan rute dev. */
export async function ensureExamContent(): Promise<void> {
  if (imported) return;
  const dbPath = process.env.E2E_DATABASE_PATH;
  if (!dbPath) throw new Error('E2E_DATABASE_PATH tidak diset: jalankan lewat tests/e2e/helpers/run-e2e*.mjs');
  execFileSync(process.execPath, [path.join(CODES_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/content-import.ts', 'import', '--dir', FIXTURE_DIR, '--publish'], {
    cwd: CODES_DIR,
    env: { ...process.env, DATABASE_PATH: dbPath, LOG_LEVEL: 'error' },
    encoding: 'utf8',
  });
  // Batas minimal belajar aktif diturunkan ke 10 detik (nilai terendah yang sah) agar "Selesai Belajar" dapat dicapai di E2E.
  cli('settings', 'set', 'learn.min_active_seconds', '10');
  imported = true;
  await warmUp();
}

/** Panaskan halaman dev (kompilasi sesuai-permintaan) agar klik pertama tidak hilang sebelum hidrasi. */
async function warmUp(): Promise<void> {
  const z = '00000000-0000-4000-8000-000000000000';
  const paths = ['/', '/peta', '/placement', '/riwayat', '/simulasi', '/belajar/3.3.3', `/ujian/mulai/${z}`, `/ujian/${z}`, `/ujian/${z}/hasil`];
  for (const p of paths) {
    try {
      await fetch(BASE_URL + p, { redirect: 'manual' });
    } catch {
      /* abaikan */
    }
  }
}

interface FixtureQuestion {
  question_id: string;
  question_type: string;
  prompt: string;
  options?: string[];
  correct_answers?: string[];
}
interface FixtureContent {
  sub_modules: Array<{ active_drill: { questions: FixtureQuestion[] } }>;
  assessment_sets: Array<{ questions: FixtureQuestion[] }>;
}

let keyMap: Map<string, FixtureQuestion> | undefined;
function keys(): Map<string, FixtureQuestion> {
  if (keyMap) return keyMap;
  const c = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'content.json'), 'utf8')) as FixtureContent;
  const all = [...c.sub_modules.flatMap((s) => s.active_drill.questions), ...c.assessment_sets.flatMap((s) => s.questions)];
  keyMap = new Map(all.map((q) => [q.prompt, q]));
  return keyMap;
}

/** Kunci fixture untuk sebuah prompt (teks jawaban benar dan daftar opsi). */
export function keyFor(prompt: string): FixtureQuestion {
  const k = keys().get(prompt);
  if (!k) throw new Error(`prompt tidak dikenal di fixture: ${prompt}`);
  return k;
}

export interface ApiQuestion {
  question_id: string;
  question_type: string;
  prompt: string;
  options: Array<{ option_id: string; text: string }> | null;
}

/** Bentuk `response` API untuk satu soal; `wrong=true` memberi jawaban salah. */
export function solve(q: ApiQuestion, wrong = false): Record<string, unknown> {
  const key = keyFor(q.prompt);
  const right = key.correct_answers![0]!;
  switch (q.question_type) {
    case 'MCQ_SINGLE': {
      const opt = q.options!.find((o) => (wrong ? o.text !== right : o.text === right));
      return { option_ids: [opt!.option_id] };
    }
    case 'TFNG':
      return { choice: wrong ? (right === 'True' ? 'False' : 'True') : right };
    case 'FILL_IN_BLANK':
      return { text: wrong ? 'zzzz' : right };
    default:
      throw new Error(`tipe tidak didukung: ${q.question_type}`);
  }
}

/** Jawab soal yang sedang tampil di UI (radio / isian) berdasarkan teks prompt. Mengembalikan prompt-nya. */
export async function answerVisible(page: Page, wrong = false): Promise<string> {
  const legend = page.locator('main fieldset legend').first();
  await expect(legend).toBeVisible();
  const prompt = (await legend.innerText()).trim();
  const key = keyFor(prompt);
  const right = key.correct_answers![0]!;
  // textContent label = huruf opsi (span aria-hidden) + teks opsi tanpa spasi, mis. "AEvery day".
  const endsWith = (t: string) => new RegExp('^[A-H]?' + escapeRe(t) + '\\s*$');
  const labels = page.locator('main fieldset label').filter({ has: page.locator('input[type="radio"]') });
  if (key.question_type === 'MCQ_SINGLE') {
    const target = wrong ? labels.filter({ hasNotText: endsWith(right) }).first() : labels.filter({ hasText: endsWith(right) }).first();
    await target.click();
  } else if (key.question_type === 'TFNG') {
    const choice = wrong ? (right === 'True' ? 'False' : 'True') : right;
    await labels.filter({ hasText: endsWith(choice) }).first().click();
  } else {
    await page.locator('main fieldset').getByRole('textbox').first().fill(wrong ? 'zzzz' : right);
  }
  return prompt;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ExamIds {
  skipReading: string;
  skipListening: string;
  bossT1: string;
  bossT2: string;
  placement: string;
}

/** Ambil id set dari pohon kurikulum dan /placement (sesi `request` harus milik sebuah profil). */
export async function examIds(request: APIRequestContext): Promise<ExamIds> {
  const t = await request.get('/api/v1/curriculum/tree');
  expect(t.ok(), await t.text()).toBe(true);
  const tree = (await t.json()) as {
    data: {
      tiers: Array<{
        tier_number: number;
        boss: { assessment_set_id: string | null };
        modules: Array<{ module_code: string; skip_test: { assessment_set_id: string | null } }>;
      }>;
    };
  };
  const tier = (n: number) => tree.data.tiers.find((x) => x.tier_number === n)!;
  const skip = (tn: number, code: string) => tier(tn).modules.find((m) => m.module_code === code)!.skip_test.assessment_set_id!;
  const p = await request.get('/api/v1/placement');
  const pl = (await p.json()) as { data: { assessment_set_id: string | null } };
  return {
    skipReading: skip(1, '1.5'),
    skipListening: skip(2, '2.3'),
    bossT1: tier(1).boss.assessment_set_id!,
    bossT2: tier(2).boss.assessment_set_id!,
    placement: pl.data.assessment_set_id!,
  };
}

const orig = { headers: { Origin: BASE_URL } };

/** Tandai materi sub-modul selesai (endpoint memakai UUID sub-modul, bukan kode). Mengembalikan detail sub-modul. */
export async function learnComplete(request: APIRequestContext, code: string): Promise<{ data: { sub_module: { id: string }; drill: { assessment_set_id: string } } }> {
  const d = await request.get(`/api/v1/sub-modules/${code}`);
  expect(d.ok(), await d.text()).toBe(true);
  const detail = (await d.json()) as { data: { sub_module: { id: string }; drill: { assessment_set_id: string } } };
  const sid = detail.data.sub_module.id;
  // Anti-farming server: ping pertama maks 5 dtk, berikutnya dibatasi waktu nyata. min_active_seconds=10 -> dua ping berjeda.
  await request.post(`/api/v1/sub-modules/${sid}/learn-progress`, { ...orig, data: { subtab: 'ARTICLE', active_seconds: 5 } });
  await new Promise((r) => setTimeout(r, 6500));
  await request.post(`/api/v1/sub-modules/${sid}/learn-progress`, { ...orig, data: { subtab: 'ARTICLE', active_seconds: 10 } });
  const lc = await request.post(`/api/v1/sub-modules/${sid}/learn-complete`, orig);
  expect(lc.ok(), await lc.text()).toBe(true);
  return detail;
}

/** Selesaikan sub-modul sintetis lewat API: tandai materi selesai lalu lulus drill (semua benar). */
export async function completeSubModule(request: APIRequestContext, code: string): Promise<void> {
  const detail = await learnComplete(request, code);
  const st = await request.post('/api/v1/attempts', { ...orig, data: { assessment_set_id: detail.data.drill.assessment_set_id } });
  expect(st.ok(), await st.text()).toBe(true);
  const at = ((await st.json()) as { data: { id: string; questions: ApiQuestion[] } }).data;
  for (const q of at.questions) {
    const r = await request.put(`/api/v1/attempts/${at.id}/answers/${q.question_id}`, { ...orig, data: { response: solve(q) } });
    expect(r.ok(), await r.text()).toBe(true);
  }
  const sub = await request.post(`/api/v1/attempts/${at.id}/submit`, orig);
  expect(sub.ok(), await sub.text()).toBe(true);
}

/** Buka kunci Tier/Modul/Sub-modul lewat CLI resmi; toleran bila sudah terbuka. */
export function unlockSafe(profile: TestProfile, code: string): void {
  try {
    cli('progress', 'unlock', profile.name, code);
  } catch (e) {
    if (!/sudah terbuka/i.test(String((e as { stderr?: string; message?: string }).stderr ?? (e as Error).message))) throw e;
  }
}

/** Tidak ada scroll horizontal pada halaman (dipakai pada viewport mobile 375px). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(m.sw, `scrollWidth ${m.sw} > innerWidth ${m.w}`).toBeLessThanOrEqual(m.w);
}

/** Tekan tombol akhiri (mis. "Akhiri" / "Selesai Section") lalu setujui Dialog konfirmasi (tombol "Ya, ..."). */
export async function confirmEnd(page: Page, label: string | RegExp = 'Akhiri'): Promise<void> {
  await page.getByRole('button', { name: label, exact: typeof label === 'string' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: /^Ya/ }).click();
}
