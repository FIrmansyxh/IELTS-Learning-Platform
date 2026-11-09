/**
 * Helper khusus domain PLATFORM / PELACAKAN / LINTAS-FITUR (SPEC-016, SPEC-017, SPEC-025).
 * Tidak mengubah helpers/app.ts; hanya menambah. Konten uji dibaca dari berkas konten bawaan
 * (content/gt-modules/3.3.3) sehingga kunci jawaban tidak ditebak.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, request, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL, type TestProfile } from './app';

const CODES_DIR = process.cwd();

/** Jalankan CLI tanpa melempar pada kode keluar non-nol (untuk menguji pesan galat). */
export function cliRun(...args: string[]): { code: number; stdout: string; stderr: string } {
  const dbPath = process.env.E2E_DATABASE_PATH;
  if (!dbPath) throw new Error('E2E_DATABASE_PATH tidak diset: jalankan lewat tests/e2e/helpers/run-e2e.mjs');
  const r = spawnSync(process.execPath, [path.join(CODES_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/cli.ts', ...args], {
    cwd: CODES_DIR,
    env: { ...process.env, DATABASE_PATH: dbPath, LOG_LEVEL: 'error' },
    encoding: 'utf8',
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export interface ProfileRow {
  id: string;
  display_name: string;
  completed_sub_modules: number;
}

/** Daftar profil lewat API publik (satu permintaan; hemat kuota general_ip). */
export async function listProfiles(): Promise<ProfileRow[]> {
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const res = await getWarm(api, '/api/v1/profiles');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { data: { profiles: ProfileRow[] } };
  await api.dispose();
  return body.data.profiles;
}

/** Hapus SEMUA profil di DB E2E (lewat CLI resmi). Dipakai spec yang butuh DB tanpa profil lain. */
export async function wipeAllProfiles(): Promise<void> {
  for (const p of await listProfiles()) {
    const r = cliRun('profile', 'delete', p.id, '--yes');
    if (r.code !== 0) throw new Error(`gagal menghapus profil ${p.display_name}: ${r.stderr}`);
  }
}

/** Hapus profil (id atau nama) lewat CLI; tidak melempar. */
export function dropProfile(ref: string): void {
  cliRun('profile', 'delete', ref, '--yes');
}

/** Konteks API terautentikasi untuk profil (cookie sesi + Origin same-origin). */
export async function apiFor(profile: TestProfile): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
    storageState: { cookies: profile.cookies as never, origins: [] },
  });
}

export async function getJson<T>(api: APIRequestContext, url: string): Promise<{ status: number; body: T; headers: Record<string, string> }> {
  const res = await getWarm(api, url);
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as T, headers: res.headers() };
}

// ---------------------------------------------------------------- stats / ledger
export interface Stats {
  total_points: number;
  daily_streak_days: number;
  longest_daily_streak: number;
  best_speed_streak: number;
  gold_crowns: number;
  silver_crowns: number;
  last_active_date: string | null;
  streak_at_risk: boolean;
}
export interface LedgerRow {
  id: number;
  source: string;
  points: number;
  note: string | null;
  source_id: string | null;
}

export async function getStats(api: APIRequestContext): Promise<Stats> {
  const r = await getJson<{ data: Stats }>(api, '/api/v1/me/stats');
  expect(r.status).toBe(200);
  return r.body.data;
}

export async function getLedger(api: APIRequestContext): Promise<LedgerRow[]> {
  const r = await getJson<{ data: LedgerRow[] }>(api, '/api/v1/me/points?page_size=50');
  expect(r.status).toBe(200);
  return r.body.data;
}

export function sumBySource(rows: LedgerRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.source] = (out[r.source] ?? 0) + r.points;
  return out;
}

// ---------------------------------------------------------------- drill 3.3.3 via API
interface RawQuestion {
  question_id: string;
  question_type: string;
  options?: string[];
  correct_answers?: Array<string | number>;
  segments?: string[];
}

export function drillKeys(): RawQuestion[] {
  const p = JSON.parse(readFileSync(path.join(CODES_DIR, 'content', 'gt-modules', '3.3.3', 'content.json'), 'utf8')) as {
    sub_modules: Array<{ active_drill: { questions: RawQuestion[] } }>;
  };
  return p.sub_modules[0]!.active_drill.questions;
}

interface ServedQuestion {
  question_id: string;
  question_type: string;
  options: Array<{ option_id: string; text: string }> | null;
  segments: Array<{ segment_id: string; text: string }> | null;
  tokens: Array<{ index: number; text: string }> | null;
}

export interface DrillOutcome {
  attemptId: string;
  result: {
    attempt: { score_percent: number; passed: boolean | null; points_awarded: number; raw_score: number; max_score: number };
    progress: { mastery_crown: string } | null;
    gamification: null | {
      points: { drill: number; speed_streak: number; crown: number; boss: number; daily: number; total: number };
      crown: { previous: string; current: string; changed: boolean } | null;
      best_speed_streak: number;
      daily_streak_days: number;
    };
  };
}

/** Kode sub-modul 3.3.3 harus sudah dibuka (CLI progress unlock) dan jalur aktif PRACTICE_FIRST, atau materi selesai. */
export async function setActiveTrack(api: APIRequestContext, code: string): Promise<void> {
  const res = await putWarm(api, '/api/v1/me/active-track', { track_code: code });
  expect(res.status(), await res.text()).toBe(204);
}

export async function drillSetId(api: APIRequestContext): Promise<string> {
  const r = await getJson<{ data: { drill: { assessment_set_id: string } } }>(api, '/api/v1/sub-modules/3.3.3');
  expect(r.status).toBe(200);
  return r.body.data.drill.assessment_set_id;
}

/**
 * Kerjakan drill 3.3.3 lewat API publik: soal pada indeks `wrong` dijawab salah, lainnya benar. Urutan soal
 * disajikan server; kunci dicocokkan lewat question_id dengan berkas konten.
 */
export async function playDrill(api: APIRequestContext, wrong: ReadonlySet<number>): Promise<DrillOutcome> {
  const keys = new Map(drillKeys().map((k) => [k.question_id, k]));
  const setId = await drillSetId(api);
  const start = await postWarm(api, '/api/v1/attempts', { assessment_set_id: setId });
  expect(start.status(), await start.text()).toBeLessThan(300);
  const attempt = ((await start.json()) as { data: { id: string; questions: ServedQuestion[] } }).data;
  // Set 3.3.3 berisi 12 soal; tiap attempt menyajikan 10 (subset acak, urutan acak).
  expect(attempt.questions.length).toBe(10);

  for (let i = 0; i < attempt.questions.length; i++) {
    const q = attempt.questions[i]!;
    const key = keys.get(q.question_id);
    expect(key, `kunci untuk ${q.question_id}`).toBeTruthy();
    const bad = wrong.has(i);
    let response: Record<string, unknown>;
    switch (q.question_type) {
      case 'MCQ_SINGLE': {
        const correctText = String(key!.correct_answers![0]);
        const opt = q.options!.find((o) => (o.text === correctText) !== bad)!;
        response = { option_ids: [opt.option_id] };
        break;
      }
      case 'FILL_IN_BLANK':
        response = { text: bad ? 'zzz' : String(key!.correct_answers![0]) };
        break;
      case 'ERROR_RECOGNITION':
        response = { token_indexes: [bad ? 0 : Number(key!.correct_answers![0])] };
        break;
      case 'SENTENCE_REORDER': {
        const order = key!.segments!.map((t) => q.segments!.find((s) => s.text === t)!.segment_id);
        response = { segment_ids: bad ? [...order].reverse() : order };
        break;
      }
      default:
        throw new Error(`tipe soal tidak dikenal: ${q.question_type}`);
    }
    const res = await putWarm(api, `/api/v1/attempts/${attempt.id}/answers/${q.question_id}`, { response });
    expect(res.status(), `jawab soal ${i + 1}: ${await res.text()}`).toBe(200);
  }
  const sub = await postWarm(api, `/api/v1/attempts/${attempt.id}/submit`);
  expect(sub.status(), await sub.text()).toBe(200);
  const res = await api.get(`/api/v1/attempts/${attempt.id}/result`);
  expect(res.status(), await res.text()).toBe(200);
  const result = ((await res.json()) as { data: DrillOutcome['result'] }).data;
  return { attemptId: attempt.id, result };
}

/**
 * Kirim ulang bila `next dev` (Turbopack) menjawab HTML (404/500 halaman galat Next) karena rute API baru
 * dikompilasi atau dimuat ulang. Respons API aplikasi selalu JSON, jadi HTML = galat khusus mode dev.
 */
async function sendWarm(api: APIRequestContext, method: 'post' | 'put' | 'get', url: string, data?: unknown) {
  const opts = data === undefined ? {} : { data };
  let last = await api[method](url, opts);
  for (let i = 0; i < 40 && (last.headers()['content-type'] ?? '').includes('text/html'); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    last = await api[method](url, opts);
  }
  return last;
}
export const postWarm = (api: APIRequestContext, url: string, data?: unknown) => sendWarm(api, 'post', url, data);
export const putWarm = (api: APIRequestContext, url: string, data?: unknown) => sendWarm(api, 'put', url, data);
export const getWarm = (api: APIRequestContext, url: string) => sendWarm(api, 'get', url);


// ---------------------------------------------------------------- keep-warm (khusus `next dev --turbopack`)
const ZERO = '00000000-0000-4000-8000-000000000000';
const WARM_TARGETS: Array<[string, string]> = [
  ['GET', '/api/v1/profiles'],
  ['POST', '/api/v1/profiles/leave'],
  ['POST', `/api/v1/profiles/${ZERO}/select`],
  ['DELETE', `/api/v1/profiles/${ZERO}`],
  ['GET', '/api/v1/auth/me'],
  ['PATCH', '/api/v1/me/profile'],
  ['GET', '/api/v1/me/stats'],
  ['GET', '/api/v1/me/points'],
  ['GET', '/api/v1/me/skills/radar'],
  ['GET', '/api/v1/me/band-predictions'],
  ['GET', '/api/v1/me/exam-history'],
  ['GET', '/api/v1/me/last-learned'],
  ['GET', '/api/v1/placement'],
  ['GET', '/api/v1/curriculum/tree'],
  ['GET', '/api/v1/tracks'],
  ['PUT', '/api/v1/me/active-track'],
  ['GET', '/api/v1/banks'],
  ['GET', '/api/v1/simulations/options'],
  ['GET', '/api/v1/mix-sessions/active'],
  ['GET', '/api/v1/ai/status'],
  ['GET', '/api/health'],
];

/**
 * `next dev --turbopack` membuang entri rute yang menganggur >~1 menit dan kadang menjawab 404/500 HTML pada
 * permintaan pertama sesudahnya, sehingga fetch dari UI (yang tidak mengulang) gagal. Itu artefak mode dev,
 * bukan perilaku aplikasi (build produksi tidak punya masalah ini). `keepWarm` menyentuh rute inti secara berkala
 * tanpa sesi (jawaban 401/404 JSON) supaya modul tetap termuat selama spec berjalan.
 */
export async function keepWarm(): Promise<() => Promise<void>> {
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const touch = async () => {
    await Promise.all(
      WARM_TARGETS.map(async ([method, url]) => {
        try {
          for (let i = 0; i < 40; i++) {
            const r = await api.fetch(url, { method, data: method === 'GET' || method === 'POST' ? undefined : {} });
            if (!(r.headers()['content-type'] ?? '').includes('text/html')) return;
            await new Promise((res) => setTimeout(res, 800));
          }
        } catch {
          /* abaikan */
        }
      }),
    );
  };
  await touch();
  const timer = setInterval(() => void touch(), 15_000);
  return async () => {
    clearInterval(timer);
    await api.dispose().catch(() => undefined);
  };
}

// ---------------------------------------------------------------- konsol / DOM
export interface ConsoleWatch {
  /** pageerror + console.error (tanpa artefak kompilasi-pertama `next dev`). */
  readonly errors: string[];
}

/**
 * Kumpulkan pageerror dan console.error selama halaman dipakai.
 * Dikecualikan (bukan galat aplikasi): (1) favicon.ico 404, dicakup tes khusus di platform-sweep;
 * (2) permintaan /api/ yang dijawab HTML oleh `next dev` ketika rute baru dikompilasi (respons API aplikasi selalu JSON)
 * dan prefetch RSC (_rsc=) yang 404 pada saat itu.
 */
export function watchConsole(page: Page): ConsoleWatch {
  const raw: Array<{ text: string; url: string }> = [];
  const htmlApi = new Set<string>();
  page.on('pageerror', (e) => raw.push({ text: `pageerror: ${e.message}`, url: '' }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    raw.push({ text: `console.error: ${m.text()} @ ${m.location().url}`, url: m.location().url });
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    // /api/ yang dijawab HTML, atau prefetch RSC (_rsc=) yang 404 saat rute dev baru dikompilasi. Tautan internal yang
    // benar-benar rusak ditangkap tes "tautan internal" di platform-sweep.
    if (r.status() >= 400 && ((r.headers()['content-type'] ?? '').includes('text/html') && u.pathname.startsWith('/api/') || u.searchParams.has('_rsc'))) {
      htmlApi.add(r.url());
    }
  });
  return {
    get errors() {
      return raw.filter((e) => !(e.url.endsWith('/favicon.ico') || htmlApi.has(e.url))).map((e) => e.text);
    },
  };
}

/** Cookie sesi profil pada context. */
export async function sessionCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name.endsWith('session-token'));
}

export interface LayoutMetrics {
  scrollWidth: number;
  innerWidth: number;
  mainLeft: number;
  mainRight: number;
  contentBottom: number;
  bottomNavTop: number | null;
  h1Count: number;
  mainCount: number;
  unnamed: string[];
  badLandmarks: string[];
}

/** Ukuran tata letak dan pemeriksaan aksesibilitas dasar (dievaluasi di browser). */
export async function layoutMetrics(page: Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const nameOf = (el: Element): string => {
      const h = el as HTMLElement;
      const aria = h.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      const by = h.getAttribute('aria-labelledby');
      if (by) {
        const t = by.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? '').join(' ').trim();
        if (t) return t;
      }
      const text = (h.textContent ?? '').trim();
      if (text) return text;
      const img = h.querySelector('img[alt]');
      if (img && (img.getAttribute('alt') ?? '').trim()) return img.getAttribute('alt')!.trim();
      const title = h.getAttribute('title');
      if (title && title.trim()) return title.trim();
      if (h.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(h.id)}"]`);
        if (lab && (lab.textContent ?? '').trim()) return lab.textContent!.trim();
      }
      return h.closest('label')?.textContent?.trim() ?? '';
    };
    const main = document.querySelector('main');
    const mr = main?.getBoundingClientRect();
    const navs = Array.from(document.querySelectorAll('nav')).filter(visible);
    const bottom = navs.find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().top > window.innerHeight / 2);
    // Elemen interaktif tampak tanpa nama aksesibel.
    const interactive = Array.from(document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link]'))
      .filter(visible)
      .filter((el) => !el.closest('[aria-hidden="true"]'));
    const unnamed = interactive.filter((el) => nameOf(el) === '').map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').split(' ').slice(0, 3).join('.')}`);
    // Landmark tampak: tepat satu <main>; nav tampak dengan label ganda.
    const labels = navs.map((n) => n.getAttribute('aria-label') ?? '');
    const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
    const lastChild = main?.lastElementChild;
    const contentBottom = lastChild ? lastChild.getBoundingClientRect().bottom + window.scrollY : 0;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      mainLeft: mr?.left ?? 0,
      mainRight: mr?.right ?? 0,
      contentBottom,
      bottomNavTop: bottom ? bottom.getBoundingClientRect().top + window.scrollY : null,
      h1Count: Array.from(document.querySelectorAll('h1')).filter(visible).length,
      mainCount: Array.from(document.querySelectorAll('main')).filter(visible).length,
      unnamed,
      badLandmarks: dup.map((d) => `nav ganda berlabel sama: ${d}`),
    };
  });
}

/**
 * Tekan Tab sebanyak `steps` kali dan kembalikan elemen fokus yang TIDAK punya indikator fokus terlihat
 * (outline atau box-shadow ring).
 */
export async function focusIndicatorGaps(page: Page, steps: number): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const gaps: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // Overlay dev Next.js (nextjs-portal / tombol Dev Tools) bukan bagian aplikasi.
      if (el.tagName.toLowerCase() === 'nextjs-portal' || el.closest('nextjs-portal')) return null;
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const ring = cs.boxShadow !== 'none' && cs.boxShadow !== '';
      const border = false;
      const label = `${el.tagName.toLowerCase()}${el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : ''}${el.getAttribute('tabindex') ? '[tabindex=' + el.getAttribute('tabindex') + ']' : ''}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}]`;
      return { outline, ring, border, label, key: label + '#' + Array.from(document.querySelectorAll('*')).indexOf(el) };
    });
    if (!info || seen.has(info.key)) continue;
    seen.add(info.key);
    if (!info.outline && !info.ring) gaps.push(info.label);
  }
  return gaps;
}

/** Catat respons API >= 400 selama tes; cetak bila tes gagal (bukti triase). Panggil di test.beforeEach / afterEach. */
export function traceApiFailures(page: Page): { dump: (title: string) => void } {
  const rows: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) rows.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} [${r.headers()['content-type'] ?? ''}]`);
  });
  return { dump: (title) => rows.length && console.log(`[api>=400 selama "${title}"] ` + rows.join(' | ')) };
}
