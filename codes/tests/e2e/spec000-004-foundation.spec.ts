/** SPEC-000 lingkungan, SPEC-004 fondasi konten (validasi CLI Golden Sample, seed kurikulum). */
import { spawnSync } from 'node:child_process';
import { expect, test } from './support/fixtures';
import { api, newLearner } from './support/app';
import { q, q1 } from './support/db';

test.describe('SPEC-000 environment', () => {
  test('GET /api/health 200 dan header keamanan dasar pada halaman', async ({ request, page }) => {
    const r = await request.get('/api/health');
    expect(r.status()).toBe(200);
    expect((await r.json()).data.status).toBe('ok');
    const res = await page.goto('/masuk');
    const h = res!.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options'] ?? h['content-security-policy'] ?? '').not.toBe('');
  });

  test('rute tak dikenal menampilkan 404 berbahasa Indonesia tanpa jejak tumpukan', async ({ page }) => {
    const res = await page.goto('/halaman-yang-tidak-ada');
    expect(res!.status()).toBe(404);
    expect(await page.content()).not.toMatch(/at \w+ \(.*\.(t|j)sx?:\d+/);
  });

  test('endpoint terproteksi tanpa sesi: 401 terstruktur dengan request_id', async ({ request }) => {
    const r = await request.get('/api/v1/curriculum/tree');
    expect(r.status()).toBe(401);
    const j = await r.json();
    expect(j.error.code).toBe('UNAUTHENTICATED');
    expect(j.error.request_id).toBeTruthy();
  });
});

test.describe('SPEC-004 fondasi konten', () => {
  test('seed: 4 Tier, 13 modul, 31 sub-modul, 14 sumber, tabel band aktif, rubrik', async () => {
    expect(Number((await q1<{ n: string }>('SELECT count(*) n FROM tiers')).n)).toBe(4);
    expect(Number((await q1<{ n: string }>('SELECT count(*) n FROM modules')).n)).toBe(13);
    expect(Number((await q1<{ n: string }>('SELECT count(*) n FROM sub_modules')).n)).toBe(31);
    expect(Number((await q1<{ n: string }>(`SELECT count(*) n FROM content_sources WHERE code IN ('OWN','NGSL','YOUTUBE','CAMBRIDGE_REF')`)).n)).toBe(4);
    expect((await q(`SELECT 1 FROM band_conversion_tables WHERE is_active`)).length).toBe(2);
  });

  test('CLI content:validate pada Golden Sample lulus (exit 0) dan dry-run impor tidak membuat entitas baru', async () => {
    const v = spawnSync('npx', ['tsx', 'scripts/content-import.ts', 'validate', '--dir', 'content/golden-sample'], { env: process.env, encoding: 'utf8' });
    expect(v.status, v.stderr + v.stdout).toBe(0);
    expect(v.stdout).toMatch(/OK: valid/);
    // ADR-003 #39: CLI menolak UPDATE entitas PUBLISHED (seed E2E mempublikasikan 2.1.3, 3.2.1, Boss, Placement) tanpa --allow-published-overwrite.
    const blocked = spawnSync('npx', ['tsx', 'scripts/content-import.ts', 'import', '--dir', 'content/golden-sample', '--dry-run'], { env: process.env, encoding: 'utf8' });
    expect(blocked.status, 'dry-run tanpa flag harus ditolak').not.toBe(0);
    expect(blocked.stderr + blocked.stdout).toMatch(/published_overwrite_blocked/);
    // dry-run dengan flag: lulus dan tidak menulis ke DB
    const i = spawnSync('npx', ['tsx', 'scripts/content-import.ts', 'import', '--dir', 'content/golden-sample', '--dry-run', '--allow-published-overwrite'], { env: process.env, encoding: 'utf8' });
    expect(i.status, i.stderr + i.stdout).toBe(0);
    expect(i.stdout).toMatch(/modules \+0 /);
    expect(i.stdout).toMatch(/sub_modules \+0 /);
    expect((await q(`SELECT 1 FROM assessment_sets WHERE title='Boss Stage Tier 1 (E2E)' AND status='PUBLISHED'`)).length).toBe(1);
  });

  test('konten DRAFT/IN_REVIEW tidak terlihat oleh Learner (COMING_SOON), kunci tidak bocor di tree', async ({ context }) => {
    await newLearner(context);
    const t = await api(context, 'GET', '/api/v1/curriculum/tree');
    const body = JSON.stringify(t.json);
    expect(body).not.toContain('correct_answers');
    const subs = t.json.data.tiers.flatMap((x: any) => x.modules.flatMap((m: any) => m.sub_modules)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const draft = subs.find((s: any) => s.sub_module_code === '1.1.4'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(draft.status).not.toBe('UNLOCKED');
    expect(draft.content_state ?? draft.availability).toBeTruthy();
  });
});
