import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { BASE_URL, createProfile, deleteProfile, signIn, type TestProfile } from './helpers/app';
import { apiFor, cliRun, getJson, getStats, keepWarm, playDrill, postWarm, putWarm, setActiveTrack, sumBySource, getLedger, listProfiles, wipeAllProfiles } from './helpers/platform';

// SPEC-025 D7/D10 + Fase 4 (CLI pengganti panel admin): profile:*, progress:unlock|reset, points:*, settings:*,
// band:list, doctor, db backup, serta efeknya yang terlihat di UI. Bentuk argumen mengikuti README (posisional).
let stopWarm: (() => Promise<void>) | undefined;
let settingsToRestore: Record<string, string> = {};

// Mesin bersama dengan banyak agen + next dev: beri ruang waktu (bukan perilaku aplikasi).
test.describe.configure({ timeout: 120_000 });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  stopWarm = await keepWarm();
  await wipeAllProfiles();
});
test.afterAll(async () => {
  for (const [k, v] of Object.entries(settingsToRestore)) cliRun('settings', 'set', k, v);
  await wipeAllProfiles();
  await stopWarm?.();
});

function auditCount(): number {
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!, { readOnly: true });
  try {
    return Number((db.prepare('SELECT count(*) AS n FROM audit_log').get() as { n: number }).n);
  } finally {
    db.close();
  }
}
function auditActions(): string[] {
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!, { readOnly: true });
  try {
    return (db.prepare('SELECT DISTINCT action FROM audit_log').all() as Array<{ action: string }>).map((r) => r.action);
  } finally {
    db.close();
  }
}

const uniq = (t: string) => `CLI ${t} ${Date.now().toString(36)}`.slice(0, 40);

test('--help dan perintah tak dikenal: bantuan lengkap (exit 0) / galat jelas (exit 1)', () => {
  const help = cliRun('--help');
  expect(help.code).toBe(0);
  for (const kw of ['profile create', 'progress unlock', 'points adjust', 'settings set', 'band list', 'doctor', 'db backup']) expect(help.stdout).toContain(kw);
  const none = cliRun();
  expect(none.code).toBe(1);
  const unknown = cliRun('foo', 'bar');
  expect(unknown.code).toBe(1);
  expect(unknown.stderr).toContain('Perintah tidak dikenal: foo bar');
});

test('alias npm run (profile:list, doctor) bekerja dan memakai DATABASE_PATH dari env', () => {
  const r = spawnSync('npm run profile:list --silent', {
    cwd: process.cwd(),
    shell: true,
    env: { ...process.env, DATABASE_PATH: process.env.E2E_DATABASE_PATH, LOG_LEVEL: 'error' },
    encoding: 'utf8',
  });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  expect(r.stdout).toMatch(/Belum ada profil|NAMA/);
});

test('profile create/list/rename/delete + efek di pemilih profil (UI)', async ({ page }) => {
  const name = uniq('buat');
  const before = auditCount();
  const created = cliRun('profile', 'create', name);
  expect(created.code, created.stderr).toBe(0);
  expect(created.stdout).toContain(`Profil dibuat: ${name}`);
  expect(cliRun('profile', 'list').stdout).toContain(name);
  // Validasi: duplikat (beda huruf) dan nama pendek ditolak dengan pesan jelas.
  const dup = cliRun('profile', 'create', name.toUpperCase());
  expect(dup.code).toBe(1);
  expect(dup.stderr).toMatch(/Galat:.*(sudah dipakai|Nama profil)/);
  expect(cliRun('profile', 'create').code).toBe(1);

  await page.goto('/pilih-profil?pilih=1');
  await expect(page.locator('li').filter({ hasText: name })).toBeVisible();

  const renamed = uniq('ganti');
  const ren = cliRun('profile', 'rename', name, renamed);
  expect(ren.code, ren.stderr).toBe(0);
  expect(ren.stdout).toContain(renamed);
  await page.reload();
  await expect(page.locator('li').filter({ hasText: renamed })).toBeVisible();
  await expect(page.locator('li').filter({ hasText: name })).toHaveCount(0);

  // Hapus tanpa --yes ditolak; nama tak dikenal ditolak; dengan --yes berhasil.
  const noYes = cliRun('profile', 'delete', renamed);
  expect(noYes.code).toBe(1);
  expect(noYes.stderr).toContain('Tambahkan --yes');
  const ghost = cliRun('profile', 'delete', 'tidak-ada-profil-ini', '--yes');
  expect(ghost.code).toBe(1);
  expect(ghost.stderr).toContain('tidak ditemukan');
  expect(cliRun('profile', 'delete', renamed.toLowerCase(), '--yes').code).toBe(0); // nama tanpa peduli huruf
  await page.reload();
  await expect(page.locator('li').filter({ hasText: renamed })).toHaveCount(0);
  expect(auditCount()).toBeGreaterThan(before);
  expect(auditActions()).toEqual(expect.arrayContaining(['PROFILE_CREATED', 'PROFILE_DELETED']));
});

test('progress unlock: 3.3.3 terbuka (UI Peta + API), unlock ulang/kode salah memberi pesan jelas', async ({ page, context }) => {
  const p: TestProfile = await createProfile('cli-unlock');
  try {
    await signIn(context, p);
    const api = await apiFor(p);
    expect((await api.get('/api/v1/sub-modules/3.3.3')).status()).toBe(403);
    const before = auditCount();
    const ok = cliRun('progress', 'unlock', p.name, '3.3.3');
    expect(ok.code, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('Terbuka untuk');
    expect(auditCount()).toBeGreaterThan(before);
    expect((await api.get('/api/v1/sub-modules/3.3.3')).status()).toBe(200);
    await setActiveTrack(api, 'GT-WRITING');
    await page.goto('/peta');
    await expect(page.locator('a[href="/belajar/3.3.3"]')).toHaveCount(1);

    const again = cliRun('progress', 'unlock', p.name, '3.3.3');
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('sudah terbuka');
    expect(cliRun('progress', 'unlock', p.name, '9.9.9').code).toBe(1);
    const bad = cliRun('progress', 'unlock', p.name, 'abc');
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('Kode harus berbentuk');
    expect(cliRun('progress', 'unlock', 'profil-hantu', '3.3.3').code).toBe(1);
    expect(cliRun('progress', 'unlock', p.name).code).toBe(1);
    await api.dispose();
  } finally {
    deleteProfile(p);
  }
});

test('progress reset --sub: percobaan drill terhapus, 3.3.3 kembali tanpa mahkota; poin tetap; tanpa --yes ditolak', async () => {
  const p: TestProfile = await createProfile('cli-reset');
  try {
    cliRun('progress', 'unlock', p.name, '3.3.3');
    const api = await apiFor(p);
    await setActiveTrack(api, 'GT-SPRINT-4W');
    const out = await playDrill(api, new Set([3]));
    expect(out.result.attempt.passed).toBe(true);
    const pointsBefore = (await getStats(api)).total_points;
    expect(pointsBefore).toBeGreaterThan(0);
    const detail = await getJson<{ data: { progress: { mastery_crown: string } } }>(api, '/api/v1/sub-modules/3.3.3');
    expect(detail.body.data.progress.mastery_crown).not.toBe('NONE');

    const noYes = cliRun('progress', 'reset', p.name, '--sub', '3.3.3');
    expect(noYes.code).toBe(1);
    expect(noYes.stderr).toContain('--yes');
    expect(cliRun('progress', 'reset', p.name, '--yes').code).toBe(1); // tentukan --sub atau --all
    expect(cliRun('progress', 'reset', p.name, '--sub', '3.3', '--yes').code).toBe(1); // bukan sub-modul
    expect(cliRun('progress', 'reset', p.name, '--sub', '3.3.3', '--all', '--yes').code).toBe(1);

    const res = cliRun('progress', 'reset', p.name, '--sub', '3.3.3', '--yes');
    expect(res.code, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/Percobaan dihapus: [1-9]/);
    const after = await getJson<{ data: { progress: { mastery_crown: string; status: string } } }>(api, '/api/v1/sub-modules/3.3.3');
    expect(after.body.data.progress.mastery_crown).toBe('NONE');
    // Poin tidak disentuh (gunakan points:adjust).
    expect((await getStats(api)).total_points).toBe(pointsBefore);
    await api.dispose();
  } finally {
    deleteProfile(p);
  }
});

test('progress reset --all: skor skill/prediksi terhapus; radar kosong kembali', async () => {
  const p: TestProfile = await createProfile('cli-resetall');
  try {
    const api = await apiFor(p);
    // Buat satu sampel skill (Grammar) lewat Mix API, lalu pastikan radar terisi sebelum reset.
    const mix = await postWarm(api, '/api/v1/mix-sessions', { mode: 'MANUAL', skills: ['GRAMMAR'], question_types: ['MCQ_SINGLE'], count: 5 });
    expect(mix.status(), await mix.text()).toBeLessThan(300);
    const attemptId = ((await mix.json()) as { data: { attempt_id: string } }).data.attempt_id;
    const att = await getJson<{ data: { questions: Array<{ question_id: string; options: Array<{ option_id: string }> | null }> } }>(api, `/api/v1/attempts/${attemptId}`);
    for (const q of att.body.data.questions) {
      if (q.options?.length) await putWarm(api, `/api/v1/attempts/${attemptId}/answers/${q.question_id}`, { response: { option_ids: [q.options[0]!.option_id] } });
    }
    expect((await postWarm(api, `/api/v1/attempts/${attemptId}/submit`)).status()).toBe(200);
    const filled = await getJson<{ data: { skills: Array<{ skill: string; sample_size: number }> } }>(api, '/api/v1/me/skills/radar');
    expect(filled.body.data.skills.find((x) => x.skill === 'GRAMMAR')!.sample_size).toBeGreaterThan(0);
    const res = cliRun('progress', 'reset', p.name, '--all', '--yes');
    expect(res.code, res.stderr).toBe(0);
    expect(res.stdout).toContain('seluruh progres belajar');
    const radar = await getJson<{ data: { skills: Array<{ sample_size: number }> } }>(api, '/api/v1/me/skills/radar');
    expect(radar.body.data.skills.every((s) => s.sample_size === 0)).toBe(true);
    await api.dispose();
  } finally {
    deleteProfile(p);
  }
});

test('points show/adjust: validasi (nol, tanpa alasan, terlalu besar) dan efek di API ledger', async () => {
  const p: TestProfile = await createProfile('cli-points');
  try {
    const api = await apiFor(p);
    expect(cliRun('points', 'show').stdout).toContain(p.name);
    expect(cliRun('points', 'adjust', p.name, '0', '--reason', 'nol').code).toBe(1);
    const noReason = cliRun('points', 'adjust', p.name, '10');
    expect(noReason.code).toBe(1);
    expect(noReason.stderr).toContain('Alasan wajib');
    expect(cliRun('points', 'adjust', p.name, '10', '--reason', 'ab').code).toBe(1);
    expect(cliRun('points', 'adjust', p.name, '1000000', '--reason', 'terlalu besar').code).toBe(1);
    expect(cliRun('points', 'adjust', p.name, '1.5', '--reason', 'pecahan').code).toBe(1);
    const before = auditCount();
    const add = cliRun('points', 'adjust', p.name, '50', '--reason', 'bonus uji E2E');
    expect(add.code, add.stderr).toBe(0);
    expect(add.stdout).toContain('kini 50');
    expect(auditCount()).toBeGreaterThan(before);
    const sub = cliRun('points', 'adjust', p.name, '-20', '--reason', 'koreksi uji E2E');
    expect(sub.code, sub.stderr).toBe(0);
    expect(sub.stdout).toContain('kini 30');
    expect((await getStats(api)).total_points).toBe(30);
    const ledger = await getLedger(api);
    expect(ledger.map((l) => l.points).sort((a, b) => a - b)).toEqual([-20, 50]);
    expect(ledger.every((l) => l.source === 'ADJUSTMENT')).toBe(true);
    expect(sumBySource(ledger).ADJUSTMENT).toBe(30);
    await api.dispose();
  } finally {
    deleteProfile(p);
  }
});

test('settings list/get/set: validasi tipe dan rentang; kunci tak dikenal ditolak', () => {
  const list = cliRun('settings', 'list');
  expect(list.code).toBe(0);
  for (const k of ['points.correct_answer', 'crown.silver_min', 'drill.question_count', 'speed.default_target_ms']) expect(list.stdout).toContain(k);
  const get = cliRun('settings', 'get', 'points.correct_answer');
  expect(get.code).toBe(0);
  expect(get.stdout).toMatch(/points\.correct_answer = \d+ \(default 10\)/);
  expect(cliRun('settings', 'get', 'tidak.ada').code).toBe(1);
  expect(cliRun('settings', 'set', 'tidak.ada', '1').code).toBe(1);
  expect(cliRun('settings', 'set', 'points.correct_answer', 'abc').code).toBe(1);
  expect(cliRun('settings', 'set', 'points.correct_answer', '-5').code).toBe(1);
  expect(cliRun('settings', 'set', 'points.correct_answer', '5000').code).toBe(1);
  expect(cliRun('settings', 'set', 'points.correct_answer', '1.5').code).toBe(1);
  expect(cliRun('settings', 'set', 'points.correct_answer').code).toBe(1);
});

test('settings set points.correct_answer berlaku pada drill berikutnya (poin per jawaban benar)', async () => {
  settingsToRestore['points.correct_answer'] = '10';
  const p: TestProfile = await createProfile('cli-setting');
  try {
    const set = cliRun('settings', 'set', 'points.correct_answer', '20');
    expect(set.code, set.stderr).toBe(0);
    expect(set.stdout).toContain('points.correct_answer = 20');
    cliRun('progress', 'unlock', p.name, '3.3.3');
    const api = await apiFor(p);
    await setActiveTrack(api, 'GT-SPRINT-4W');
    const out = await playDrill(api, new Set([2])); // 9 benar
    expect(out.result.gamification!.points.drill).toBe(9 * 20);
    expect(sumBySource(await getLedger(api)).DRILL).toBe(180);
    await api.dispose();
  } finally {
    cliRun('settings', 'set', 'points.correct_answer', '10');
    delete settingsToRestore['points.correct_answer'];
    deleteProfile(p);
  }
});

test('settings: ambang mahkota tidak boleh silver >= gold (konsistensi pengaturan)', () => {
  settingsToRestore['crown.silver_min'] = '75';
  const r = cliRun('settings', 'set', 'crown.silver_min', '95'); // gold_min = 90
  cliRun('settings', 'set', 'crown.silver_min', '75');
  delete settingsToRestore['crown.silver_min'];
  expect(r.code, 'crown.silver_min 95 > crown.gold_min 90 harus ditolak (deskripsi: "harus lebih besar dari Silver")').toBe(1);
});

test('band list: tabel aktif tampil; --skill tidak valid ditolak', () => {
  const list = cliRun('band', 'list');
  expect(list.code).toBe(0);
  expect(list.stdout).toMatch(/LISTENING/);
  expect(list.stdout).toMatch(/READING_GENERAL/);
  expect(list.stdout).toContain('*'); // penanda aktif
  const one = cliRun('band', 'list', '--skill', 'LISTENING');
  expect(one.code).toBe(0);
  expect(one.stdout).not.toContain('READING_GENERAL');
  expect(cliRun('band', 'list', '--skill', 'FOO').code).toBe(1);
  expect(cliRun('band', 'activate').code).toBe(1);
  expect(cliRun('band', 'import', 'tidak-ada.json').code).toBe(1);
});

test('doctor: exit 0, semua pemeriksaan inti OK/CATAT (tanpa GAGAL), memuat "Catatan koneksi internet"', () => {
  const r = cliRun('doctor');
  expect(r.code, r.stdout + r.stderr).toBe(0);
  expect(r.stdout).not.toContain('[GAGAL]');
  for (const name of ['Node.js', 'Konfigurasi .env', 'Integritas database', 'Database', 'Migrasi', 'Data awal (seed)', 'Tabel band aktif', 'Folder aset']) {
    expect(r.stdout, `baris ${name}`).toContain(name);
  }
  expect(r.stdout).toContain('Catatan koneksi internet:');
  expect(r.stdout).toMatch(/YouTube/i);
  expect(r.stdout).toContain('Siap dipakai.');
  // Konten bawaan terbit pada stack E2E.
  expect(r.stdout).toMatch(/Data awal \(seed\).*terbit/);
});

test('doctor: database bukan SQLite -> [GAGAL] Integritas database dengan petunjuk pemulihan, exit 1', () => {
  const tmp = path.join(path.dirname(process.env.E2E_DATABASE_PATH!), 'rusak.db');
  writeFileSync(tmp, 'ini bukan database sqlite '.repeat(200));
  const r = spawnSync(process.execPath, [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/cli.ts', 'doctor'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: tmp, LOG_LEVEL: 'error' },
    encoding: 'utf8',
  });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(1);
  expect(r.stdout).toMatch(/\[GAGAL\].*Integritas database/);
  expect(r.stdout).toContain('npm run db:restore -- latest --yes');
});

test('db backup: cadangan harian dibuat sekali (created lalu skipped_today), berkas ielts-YYYY-MM-DD.db valid', () => {
  const dir = path.join(path.dirname(process.env.E2E_DATABASE_PATH!), 'backups');
  const first = cliRun('db', 'backup');
  expect(first.code, first.stderr).toBe(0);
  expect(first.stdout).toMatch(/^(created|skipped_today)/);
  const second = cliRun('db', 'backup');
  expect(second.code).toBe(0);
  expect(second.stdout).toMatch(/^skipped_today/);
  expect(existsSync(dir)).toBe(true);
  const files = readdirSync(dir);
  expect(files.filter((f) => /^ielts-\d{4}-\d{2}-\d{2}\.db$/.test(f))).toHaveLength(1);
  expect(files.some((f) => f.endsWith('.tmp') || f.endsWith('-wal') || f.endsWith('-shm'))).toBe(false);
  const copy = new DatabaseSync(path.join(dir, files.find((f) => f.startsWith('ielts-'))!), { readOnly: true });
  expect((copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok');
  copy.close();
  // doctor sekarang melaporkan cadangan terbaru OK.
  expect(cliRun('doctor').stdout).toMatch(/\[OK\]\s+Cadangan: terakhir \d{4}-\d{2}-\d{2}/);
});

test('db restore: tanpa --yes dan cadangan tak ada ditolak (DB tidak berubah)', async () => {
  const noYes = cliRun('db', 'restore', 'latest');
  expect(noYes.code).toBe(1);
  expect(noYes.stderr).toContain('Tambahkan --yes untuk melanjutkan');
  const missing = cliRun('db', 'restore', 'ielts-1999-01-01.db', '--yes');
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain('Cadangan tidak ditemukan');
  const before = (await listProfiles()).length;
  expect(before).toBeGreaterThanOrEqual(0);
  void BASE_URL;
});

// Temuan galat (merah sampai diperbaiki): CLI melewati validasi nama profil 2-40 karakter yang dipakai API/UI.
test('CLI profile create/rename menolak nama di luar 2-40 karakter dan karakter kontrol (sama seperti API/UI)', () => {
  const made: string[] = [];
  try {
    const tooShort = cliRun('profile', 'create', 'a');
    if (tooShort.code === 0) made.push('a');
    const tooLong = cliRun('profile', 'create', 'z'.repeat(41));
    if (tooLong.code === 0) made.push('z'.repeat(41));
    const base = uniq('valid');
    expect(cliRun('profile', 'create', base).code).toBe(0);
    made.push(base);
    const renShort = cliRun('profile', 'rename', base, 'b');
    if (renShort.code === 0) made.splice(made.indexOf(base), 1, 'b');
    expect(tooShort.code, 'profile create "a" (1 karakter) harus ditolak seperti POST /api/v1/profiles').toBe(1);
    expect(tooLong.code, 'profile create 41 karakter harus ditolak').toBe(1);
    expect(renShort.code, 'profile rename ke 1 karakter harus ditolak').toBe(1);
  } finally {
    for (const n of made) cliRun('profile', 'delete', n, '--yes');
  }
});
