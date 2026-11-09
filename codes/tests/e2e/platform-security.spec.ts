import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, unlock, type TestProfile } from './helpers/app';
import { apiFor, getWarm, postWarm, putWarm, setActiveTrack, wipeAllProfiles } from './helpers/platform';
import { keepWarm } from './helpers/platform';

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

// SPEC-025 D4/D5/D6 (keamanan loopback + jalur lama yang digantikan) dan SPEC-000 (health, header dasar).
// SPEC-001/002/018/019/020 DIGANTIKAN: yang diverifikasi adalah ketiadaan jalur lama dan pengganti profil lokal.

const PORT = new URL(BASE_URL).port;
let cleanup: TestProfile[] = [];
test.afterEach(() => {
  for (const p of cleanup) deleteProfile(p);
  cleanup = [];
});

// --------------------------------------------------------------------------- Host (anti DNS rebinding)
test('Host asing ditolak 403 HOST_NOT_ALLOWED pada GET dan POST; Host loopback diterima', async ({ request: req }) => {
  const evilHosts = ['evil.example', 'evil.example:' + PORT, '127.0.0.1.evil.test:' + PORT, 'localhost.evil.test:' + PORT, '192.168.1.5:' + PORT, '0.0.0.0:' + PORT];
  for (const host of evilHosts) {
    const res = await req.get('/api/v1/profiles', { headers: { Host: host } });
    expect(res.status(), `Host ${host}`).toBe(403);
    const body = (await res.json()) as { error: { code: string; request_id: string } };
    expect(body.error.code, `Host ${host}`).toBe('HOST_NOT_ALLOWED');
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/);
  }
  const post = await req.post('/api/v1/profiles', {
    headers: { Host: 'evil.example', Origin: 'http://evil.example', 'Content-Type': 'application/json' },
    data: { display_name: 'Tak Boleh Dibuat' },
  });
  expect(post.status()).toBe(403);
  for (const host of [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`, `LOCALHOST:${PORT}`]) {
    const ok = await req.get('/api/v1/profiles', { headers: { Host: host } });
    expect(ok.status(), `Host ${host}`).toBe(200);
  }
});

test('Host asing juga ditolak pada endpoint terautentikasi (sebelum cek sesi)', async () => {
  const p = await createProfile('sec-host');
  cleanup.push(p);
  const api = await apiFor(p);
  const ok = await getWarm(api, '/api/v1/me/stats');
  expect(ok.status()).toBe(200);
  const evil = await api.get('/api/v1/me/stats', { headers: { Host: 'evil.example' } });
  expect(evil.status()).toBe(403);
  expect(((await evil.json()) as { error: { code: string } }).error.code).toBe('HOST_NOT_ALLOWED');
  await api.dispose();
});

// --------------------------------------------------------------------------- CSRF / Origin
test('mutasi lintas-origin ditolak 403 CSRF_ORIGIN_MISMATCH; same-origin diterima', async () => {
  const bare = await request.newContext({ baseURL: BASE_URL });
  const post = (headers: Record<string, string>, name: string) =>
    bare.post('/api/v1/profiles', { headers: { 'Content-Type': 'application/json', ...headers }, data: { display_name: name } });

  const cases: Array<[string, Record<string, string>]> = [
    ['Origin asing', { Origin: 'http://evil.example' }],
    ['Origin null', { Origin: 'null' }],
    ['Origin loopback port lain', { Origin: 'http://127.0.0.1:' + (Number(PORT) + 1) }],
    ['Origin localhost port lain', { Origin: 'http://localhost:' + (Number(PORT) + 1) }],
    ['tanpa Origin dan tanpa Sec-Fetch-Site', {}],
    ['Sec-Fetch-Site cross-site', { 'Sec-Fetch-Site': 'cross-site' }],
    ['Sec-Fetch-Site same-site', { 'Sec-Fetch-Site': 'same-site' }],
  ];
  for (const [label, headers] of cases) {
    const res = await post(headers, 'CSRF ' + label.slice(0, 20));
    expect(res.status(), label).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code, label).toBe('CSRF_ORIGIN_MISMATCH');
  }
  await wipeAllProfiles(); // pastikan tidak ada profil lolos
  const ok = await post({ Origin: BASE_URL }, 'CSRF Sah Origin');
  expect(ok.status()).toBe(201);
  const ok2 = await post({ 'Sec-Fetch-Site': 'same-origin' }, 'CSRF Sah Fetch');
  expect(ok2.status()).toBe(201);
  await bare.dispose();
  await wipeAllProfiles();
});

test('PUT/PATCH/DELETE lintas-origin pada endpoint terautentikasi juga ditolak', async () => {
  const p = await createProfile('sec-csrf');
  cleanup.push(p);
  const evil = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: 'http://evil.example' },
    storageState: { cookies: p.cookies as never, origins: [] },
  });
  const put = await evil.put('/api/v1/me/active-track', { data: { track_code: 'GT-WRITING' } });
  expect(put.status()).toBe(403);
  const patch = await evil.patch('/api/v1/me/profile', { data: { display_name: 'Diretas' } });
  expect(patch.status()).toBe(403);
  const del = await evil.delete('/api/v1/profiles/00000000-0000-4000-8000-000000000000', { data: { confirm_name: 'x' } });
  expect(del.status()).toBe(403);
  await evil.dispose();
  // Nama tidak berubah.
  const api = await apiFor(p);
  const me = await getWarm(api, '/api/v1/auth/me');
  expect(((await me.json()) as { data: { user: { display_name: string } } }).data.user.display_name).toBe(p.name);
  await api.dispose();
});

// --------------------------------------------------------------------------- header respons
test('header respons API: Cache-Control no-store, X-Request-Id, JSON UTF-8, tanpa X-Powered-By', async () => {
  const api = await request.newContext({ baseURL: BASE_URL });
  const ok = await api.get('/api/v1/profiles');
  expect(ok.status()).toBe(200);
  const h = ok.headers();
  expect(h['cache-control']).toBe('private, no-store');
  expect(h['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  expect(h['content-type']).toContain('application/json');
  expect(h['x-powered-by']).toBeUndefined();
  expect(h['x-content-type-options']).toBe('nosniff');
  const err = await api.get('/api/v1/me/stats'); // tanpa sesi
  expect(err.status()).toBe(401);
  expect(err.headers()['cache-control']).toBe('private, no-store');
  expect(((await err.json()) as { error: { code: string; request_id: string } }).error.code).toBe('UNAUTHENTICATED');
  const health = await api.get('/api/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toBe('no-store');
  expect(((await health.json()) as { data: { status: string; time: string } }).data.status).toBe('ok');
  await api.dispose();
});

test('header keamanan halaman: nosniff, X-Frame-Options DENY, Referrer-Policy, COOP; bahasa id', async ({ request: req, page }) => {
  const res = await req.get('/pilih-profil');
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['cross-origin-opener-policy']).toBe('same-origin');
  expect(h['x-powered-by']).toBeUndefined();
  await page.goto('/pilih-profil');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
});

test('cookie sesi: HttpOnly, SameSite=Strict, Path=/, tanpa Secure (HTTP loopback)', async () => {
  const bare = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const res = await bare.post('/api/v1/profiles', { data: { display_name: 'Cookie Cek ' + Date.now().toString(36) } });
  expect(res.status()).toBe(201);
  const sc = res.headersArray().filter((x) => x.name.toLowerCase() === 'set-cookie').map((x) => x.value);
  expect(sc).toHaveLength(1);
  expect(sc[0]).toMatch(/HttpOnly/i);
  expect(sc[0]).toMatch(/SameSite=Strict/i);
  expect(sc[0]).toMatch(/Path=\//);
  expect(sc[0]).not.toMatch(/;\s*Secure/i);
  expect(sc[0]).toMatch(/Max-Age=\d+/);
  await bare.dispose();
  await wipeAllProfiles();
});

// --------------------------------------------------------------------------- tanpa sesi / isolasi antar profil
test('endpoint terautentikasi tanpa cookie: 401 UNAUTHENTICATED (UI menuju pemilih profil)', async () => {
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  for (const url of ['/api/v1/auth/me', '/api/v1/me/stats', '/api/v1/me/points', '/api/v1/me/skills/radar', '/api/v1/me/band-predictions', '/api/v1/me/exam-history', '/api/v1/curriculum/tree', '/api/v1/tracks', '/api/v1/banks']) {
    const res = await getWarm(api, url);
    expect(res.status(), url).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code, url).toBe('UNAUTHENTICATED');
  }
  const poor = await api.post('/api/v1/attempts', { data: { assessment_set_id: '00000000-0000-4000-8000-000000000000' } });
  expect(poor.status()).toBe(401);
  await api.dispose();
});

test('cookie sesi palsu/rusak diperlakukan sebagai tanpa sesi (401) dan cookie dibersihkan', async () => {
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL, Cookie: 'authjs.session-token=bukan.token.valid' } });
  const res = await getWarm(api, '/api/v1/me/stats');
  expect(res.status()).toBe(401);
  expect(res.headersArray().some((h) => h.name.toLowerCase() === 'set-cookie' && /Max-Age=0/i.test(h.value))).toBe(true);
  await api.dispose();
});

test('isolasi antar profil: attempt milik profil A tidak dapat dibaca profil B', async () => {
  const a = await createProfile('sec-A');
  const b = await createProfile('sec-B');
  cleanup.push(a, b);
  unlock(a, '3.3.3');
  const apiA = await apiFor(a);
  const apiB = await apiFor(b);
  await setActiveTrack(apiA, 'GT-SPRINT-4W');
  const sm = (await (await getWarm(apiA, '/api/v1/sub-modules/3.3.3')).json()) as { data: { drill: { assessment_set_id: string } } };
  const start = await postWarm(apiA, '/api/v1/attempts', { assessment_set_id: sm.data.drill.assessment_set_id });
  expect(start.status()).toBeLessThan(300);
  const attemptId = ((await start.json()) as { data: { id: string } }).data.id;
  expect((await getWarm(apiA, `/api/v1/attempts/${attemptId}`)).status()).toBe(200);
  for (const url of [`/api/v1/attempts/${attemptId}`, `/api/v1/attempts/${attemptId}/result`]) {
    const res = await getWarm(apiB, url);
    expect([403, 404], `B membaca ${url}`).toContain(res.status());
  }
  const tryAnswer = await putWarm(apiB, `/api/v1/attempts/${attemptId}/answers/Q-GT333-001`, { response: { option_ids: ['a'] } });
  expect([403, 404]).toContain(tryAnswer.status());
  const submit = await postWarm(apiB, `/api/v1/attempts/${attemptId}/submit`);
  expect([403, 404]).toContain(submit.status());
  // Statistik B tetap nol dan 3.3.3 tetap terkunci bagi B.
  const stats = (await (await getWarm(apiB, '/api/v1/me/stats')).json()) as { data: { total_points: number } };
  expect(stats.data.total_points).toBe(0);
  expect((await getWarm(apiB, '/api/v1/sub-modules/3.3.3')).status()).toBe(403);
  await apiA.dispose();
  await apiB.dispose();
});

// --------------------------------------------------------------------------- jalur lama (digantikan SPEC-025)
const GONE_PAGES = ['/masuk', '/daftar', '/ganti-password', '/admin', '/admin/users', '/admin/invites', '/admin/import', '/admin/content', '/admin/assets', '/admin/settings', '/admin/audit', '/admin/health', '/admin/band-tables', '/masuk?next=%2Fprofil'];
test('halaman lama (masuk, daftar, ganti-password, /admin*) tidak ada: 404', async ({ request: req }) => {
  for (const path of GONE_PAGES) {
    const res = await req.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
  }
});

test('halaman lama dibuka di browser: 404 dan tidak ada formulir login', async ({ page }) => {
  for (const path of ['/masuk', '/daftar', '/admin']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.locator('input[type="password"]'), path).toHaveCount(0);
    await expect(page.locator('input[type="email"]'), path).toHaveCount(0);
  }
});

const GONE_API: Array<[string, string]> = [
  ['POST', '/api/v1/auth/login'],
  ['POST', '/api/v1/auth/register'],
  ['POST', '/api/v1/auth/logout'],
  ['POST', '/api/v1/auth/change-password'],
  ['GET', '/api/v1/auth/signup-config'],
  ['GET', '/api/v1/admin/users'],
  ['POST', '/api/v1/admin/users'],
  ['GET', '/api/v1/admin/invites'],
  ['POST', '/api/v1/admin/invites'],
  ['GET', '/api/v1/admin/settings'],
  ['GET', '/api/v1/admin/audit-log'],
  ['GET', '/api/v1/admin/health'],
  ['GET', '/api/v1/admin/assets'],
  ['POST', '/api/v1/admin/imports'],
  ['GET', '/api/v1/admin/imports'],
  ['GET', '/api/v1/admin/curation/sub-modules'],
  ['GET', '/api/v1/admin/band-tables'],
  ['GET', '/api/v1/admin/content/sub-modules'],
  ['GET', '/api/v1/admin/license-summary'],
  ['POST', '/api/v1/admin/users/00000000-0000-4000-8000-000000000000/points'],
];
test('API lama (auth/login|register|change-password|signup-config, admin/*) tidak ada: 404 tanpa sesi maupun dengan sesi', async () => {
  const p = await createProfile('sec-gone');
  cleanup.push(p);
  const anon: APIRequestContext = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
  const authed = await apiFor(p);
  for (const [method, url] of GONE_API) {
    for (const [label, ctx] of [['anon', anon], ['sesi', authed]] as const) {
      const res = await ctx.fetch(url, { method, data: method === 'POST' ? {} : undefined });
      expect(res.status(), `${method} ${url} (${label})`).toBe(404);
    }
  }
  await anon.dispose();
  await authed.dispose();
});

test('kode sumber tidak lagi mendefinisikan auth: admin (SPEC-025 AC Fase 2: grep kosong)', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, ['-e', `
    const fs=require('fs'),path=require('path');
    let hits=[];
    (function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
      if(e.isDirectory())walk(p);else if(/\\.(ts|tsx)$/.test(e.name)&&!/\\.test\\./.test(e.name)){
        const t=fs.readFileSync(p,'utf8');if(/auth:\\s*['"]admin['"]/.test(t)||/requireAdmin/.test(t))hits.push(p);}}})('src');
    console.log(JSON.stringify(hits));`], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(out.trim())).toEqual([]);
});

// --------------------------------------------------------------------------- SPEC-000 (kesehatan, struktur)
test('SPEC-000: GET /api/health 200 {status:"ok"} tanpa sesi; waktu server ISO', async ({ request: req }) => {
  const res = await req.get('/api/health');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { data: { status: string; time: string } };
  expect(body.data.status).toBe('ok');
  expect(Number.isNaN(Date.parse(body.data.time))).toBe(false);
});

test('SPEC-000 Edge: env wajib kosong -> doctor GAGAL menyebut nama kunci (pengganti validasi env Docker)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const r = spawnSync(process.execPath, [join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/cli.ts', 'doctor'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: process.env.E2E_DATABASE_PATH, AUTH_SECRET: '', IP_HMAC_SECRET: '', LOG_LEVEL: 'error' },
    encoding: 'utf8',
  });
  const text = `${r.stdout}\n${r.stderr}`;
  expect(r.status, text).toBe(1);
  expect(text).toMatch(/\[GAGAL\].*Konfigurasi \.env: belum diisi: AUTH_SECRET, IP_HMAC_SECRET/);
});
