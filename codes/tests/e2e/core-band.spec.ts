import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { cli } from './helpers/app';
import {
  RIGHT_PREFIX,
  WRONG_PREFIX,
  apiGet,
  apiPost,
  apiPut,
  completeSub,
  createCoreProfile,
  deleteCoreProfile,
  ensureCoreContent,
  warmUpRoutes,
  getTree,
  noHorizontalOverflow,
  setLearnMin,
  shot,
  unlockCode,
  type CoreProfile,
} from './helpers/core';

// SPEC-009 Band Converter, sisi yang tampak di UI/CLI (domain Inti Belajar). Boss Tier 4 sintetis: Listening 4 soal
// (audio gt-listening) + Reading 4 soal; skala ke 40 membuat tiap soal benar = 10 poin: 0/10/20/30/40.
//   Listening (tabel v1-umum): 0 -> 0.0 | 10 -> 4.0 | 20 -> 5.5 | 30 -> 7.0 | 40 -> 9.0
//   Reading General Training (v1-gt): 0 -> 0.0 | 10 -> 2.5 | 20 -> 4.5 | 30 -> 6.0 | 40 -> 9.0
//   Band Boss = pembulatan setengah-band dari rata-rata Listening + Reading; gerbang Tier 4 = band 7.0.
test.describe.configure({ timeout: 180_000 });
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
  setLearnMin(10);
});
test.afterAll(() => {
  test.setTimeout(300_000);
  for (const p of profiles) deleteCoreProfile(p);
});

interface ActiveTables {
  data: {
    listening: { table_id: string; version_label: string; rows: Array<{ raw_min: number; raw_max: number; band: number }> };
    reading_academic: { table_id: string; rows: unknown[] };
    reading_general: { table_id: string; version_label: string; rows: Array<{ raw_min: number; raw_max: number; band: number }> };
    disclaimer: string;
  };
}
interface Section {
  assessment_set_id: string;
  skill: string;
}

/** Siapkan profil dengan Boss Tier 4 tersedia (Tier dibuka lewat CLI, dua sub-modul diselesaikan lewat API). */
async function bossReady(page: Page, p: CoreProfile): Promise<string> {
  unlockCode(p, '4');
  await completeSub(page, '4.2.1');
  await completeSub(page, '4.3.1');
  const t4 = (await getTree(page)).find((t) => t.tier_number === 4)!;
  expect(t4.boss.available).toBe(true);
  return t4.boss.assessment_set_id!;
}

/** Kerjakan Boss lewat API: Listening `l` benar dari 4, Reading `r` benar dari 4. Mengembalikan id attempt. */
async function sitBoss(page: Page, bossSetId: string, l: number, r: number): Promise<string> {
  const start = await apiPost<{ data: { id: string; sections: Section[] } }>(page, '/api/v1/attempts', { assessment_set_id: bossSetId });
  expect(start.status, JSON.stringify(start.body)).toBe(201);
  const attemptId = start.body.data.id;
  const sections = start.body.data.sections;
  expect(sections.map((s) => s.skill)).toEqual(['LISTENING', 'READING']);
  for (const sec of sections) {
    const correct = sec.skill === 'LISTENING' ? l : r;
    const s = await apiPost<{ data: { questions: Array<{ question_id: string; options: Array<{ option_id: string; text: string }> }> } }>(
      page,
      `/api/v1/attempts/${attemptId}/sections/${sec.assessment_set_id}/start`,
    );
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const qs = s.body.data.questions;
    expect(qs).toHaveLength(4);
    for (let i = 0; i < qs.length; i++) {
      const prefix = i < correct ? RIGHT_PREFIX : WRONG_PREFIX;
      const opt = qs[i]!.options.find((o) => o.text.startsWith(prefix))!;
      const put = await apiPut(page, `/api/v1/attempts/${attemptId}/answers/${qs[i]!.question_id}`, { response: { option_ids: [opt.option_id] } });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
    }
    const done = await apiPost(page, `/api/v1/attempts/${attemptId}/sections/${sec.assessment_set_id}/submit`);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
  }
  const fin = await apiPost(page, `/api/v1/attempts/${attemptId}/submit`);
  expect(fin.status, JSON.stringify(fin.body)).toBe(200);
  return attemptId;
}

const PERKIRAAN = 'Perkiraan latihan, bukan skor resmi IELTS.';

test('tabel band aktif untuk learner: Listening dan Reading General masing-masing 17 baris menutup 0..40 dengan label dan disclaimer', async ({ page, context }) => {
  const p = await mk('bnd-t');
  await context.addCookies(p.cookies);
  const r = await apiGet<ActiveTables>(page, '/api/v1/band-tables/active');
  expect(r.status).toBe(200);
  expect(r.res.headers()['cache-control'] ?? '').toBeDefined();
  const d = r.body.data;
  expect(d.disclaimer).toBe(PERKIRAAN);
  for (const t of [d.listening, d.reading_general]) {
    expect(t.rows).toHaveLength(17);
    const sorted = [...t.rows].sort((a, b) => a.raw_min - b.raw_min);
    expect(sorted[0]!.raw_min).toBe(0);
    expect(sorted.at(-1)!.raw_max).toBe(40);
    sorted.slice(1).forEach((row, i) => expect(row.raw_min, 'tanpa celah/tumpang tindih').toBe(sorted[i]!.raw_max + 1));
    sorted.forEach((row, i) => i && expect(row.band).toBeGreaterThanOrEqual(sorted[i - 1]!.band));
  }
  const band = (t: ActiveTables['data']['listening'], raw: number) => t.rows.find((x) => raw >= x.raw_min && raw <= x.raw_max)!.band;
  // Listening (v1-umum): 25/26/29/30/0/40 = 6.0/6.5/6.5/7.0/0.0/9.0
  expect([25, 26, 29, 30, 0, 40].map((n) => band(d.listening, n))).toEqual([6.0, 6.5, 6.5, 7.0, 0.0, 9.0]);
  // Reading General (v1-gt): jangkar 30 = 6.0, 34 = 7.0, 40 = 9.0
  expect([30, 34, 40, 0].map((n) => band(d.reading_general, n))).toEqual([6.0, 7.0, 9.0, 0.0]);
  expect(d.listening.version_label).toBe('v1-umum-2026-11');
  expect(d.reading_general.version_label).toBe('v1-gt-2026-11');
  // Tanpa sesi: 401 (tidak ada akses anonim).
  const anon = await page.context().browser()!.newContext({ baseURL: process.env.E2E_BASE_URL });
  const noSession = await anon.request.get('/api/v1/band-tables/active');
  expect(noSession.status()).toBe(401);
  await anon.close();
});

test('hasil Boss Tier 4 lulus: skor mentah -> setara /40 -> Band per skill, Band Boss dibulatkan setengah, EstimasiNotice, Tier selesai', async ({ page, context }) => {
  const p = await mk('bnd-a');
  await context.addCookies(p.cookies);
  const setId = await bossReady(page, p);
  const tables = (await apiGet<ActiveTables>(page, '/api/v1/band-tables/active')).body.data;
  const attemptId = await sitBoss(page, setId, 4, 3); // L 40 -> 9.0 ; R 30 -> 6.0 ; (9.0 + 6.0) / 2 = 7.5

  await page.goto(`/ujian/${attemptId}/hasil`);
  const view = page.getByTestId('boss-result-view');
  await expect(view).toBeVisible();
  await expect(view.getByRole('heading', { level: 1 })).toHaveText('Hasil Boss Stage - Tier 4');
  await expect(view).toContainText('Target Band 7.0, hasil Anda 7.5');
  await expect(view.getByRole('status')).toContainText('Lulus');
  await expect(view).toContainText('Band Listening + Reading');
  // Kartu per skill: skor mentah, setara 40, band hasil konversi tabel aktif.
  const lis = page.getByTestId('skill-card-listening');
  await expect(lis).toContainText('Skor mentah: 4/4');
  await expect(lis).toContainText('Setara: 40/40');
  await expect(lis.getByText('9,0', { exact: true })).toBeVisible();
  const rea = page.getByTestId('skill-card-reading');
  await expect(rea).toContainText('Skor mentah: 3/4');
  await expect(rea).toContainText('Setara: 30/40');
  await expect(rea.getByText('6,0', { exact: true })).toBeVisible();
  // Band besar Boss + disclaimer selalu terlihat bersama band.
  await expect(view.getByText('7,5', { exact: true }).first()).toBeVisible();
  await expect(view.getByText(PERKIRAAN)).toBeVisible();
  // Overall 4 skill hanya muncul bila keempat skill terisi: Boss ini hanya L+R, jadi tidak ada kartu Overall.
  await expect(view.getByText('Perkiraan Overall Band')).toHaveCount(0);
  await expect(view).toContainText('Selamat! Anda berhasil melampaui ambang batas Tier 4.');
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
  await shot(page, `band-boss-pass-${test.info().project.name}`);

  const res = await apiGet<{ data: { attempt: { band_score: number | null; passed: boolean }; boss: { boss_band: number; passed: boolean; overall_band_estimate: number | null; band_table_ids: { listening: string; reading_academic: string }; sections: Array<{ skill: string; raw_40: number; band: number }> } } }>(
    page,
    `/api/v1/attempts/${attemptId}/result`,
  );
  const boss = res.body.data.boss;
  expect(boss).toMatchObject({ boss_band: 7.5, passed: true, overall_band_estimate: null });
  expect(res.body.data.attempt).toMatchObject({ band_score: 7.5, passed: true });
  expect(boss.sections.map((s) => [s.skill, s.raw_40, s.band])).toEqual([['LISTENING', 40, 9.0], ['READING', 30, 6.0]]);
  expect(boss.band_table_ids.listening).toBe(tables.listening.table_id);
  const t4 = (await getTree(page)).find((t) => t.tier_number === 4)!;
  expect(t4.status).toBe('COMPLETED');
  expect(t4.boss.best_band).toBe(7.5);
  expect(t4.boss.passed_at).toBeTruthy();

  // Hasil lama tidak berubah ketika tabel band baru diaktifkan lewat CLI (SPEC-009 AC "hasil lama tidak berubah").
  const dir = mkdtempSync(path.join(tmpdir(), 'ielts-core-band-'));
  const file = path.join(dir, 'listening-v2.json');
  try {
    writeFileSync(file, JSON.stringify({ skill: 'LISTENING', version_label: `e2e-core-${Date.now().toString(36)}`, source_note: 'Uji E2E', rows: [{ raw_min: 0, raw_max: 14, band: 4.0 }, { raw_min: 15, raw_max: 29, band: 6.0 }, { raw_min: 30, raw_max: 40, band: 7.5 }] }));
    const out = cli('band', 'import', file, '--activate');
    expect(out).toContain('Tabel diaktifkan.');
    const after = (await apiGet<ActiveTables>(page, '/api/v1/band-tables/active')).body.data;
    expect(after.listening.table_id).not.toBe(tables.listening.table_id);
    expect(after.listening.rows).toHaveLength(3);
    await page.reload();
    await expect(page.getByTestId('skill-card-listening').getByText('9,0', { exact: true })).toBeVisible();
    await expect(page.getByTestId('skill-card-listening')).toContainText('Setara: 40/40');
    const same = (await apiGet<{ data: { boss: { boss_band: number; band_table_ids: { listening: string } } } }>(page, `/api/v1/attempts/${attemptId}/result`)).body.data.boss;
    expect(same.boss_band).toBe(7.5);
    expect(same.band_table_ids.listening, 'attempt lama tetap merujuk tabel lamanya').toBe(tables.listening.table_id);
  } finally {
    try {
      cli('band', 'activate', tables.listening.table_id); // pulihkan tabel semula
    } catch {
      /* sudah aktif */
    }
    rmSync(dir, { recursive: true, force: true });
  }
  const restored = (await apiGet<ActiveTables>(page, '/api/v1/band-tables/active')).body.data;
  expect(restored.listening.table_id).toBe(tables.listening.table_id);
});

test('hasil Boss gagal: rata-rata 4.25 dibulatkan ke 4.5, tidak lulus gerbang 7.0, Tier tetap belum selesai dan ada jam coba lagi', async ({ page, context }) => {
  const p = await mk('bnd-b');
  await context.addCookies(p.cookies);
  const setId = await bossReady(page, p);
  const attemptId = await sitBoss(page, setId, 1, 2); // L 10 -> 4.0 ; R 20 -> 4.5 ; 4.25 -> 4.5
  await page.goto(`/ujian/${attemptId}/hasil`);
  const view = page.getByTestId('boss-result-view');
  await expect(view).toContainText('Target Band 7.0, hasil Anda 4.5');
  await expect(view.getByRole('status')).toContainText('Belum lulus');
  await expect(page.getByTestId('skill-card-listening')).toContainText('Setara: 10/40');
  await expect(page.getByTestId('skill-card-listening').getByText('4,0', { exact: true })).toBeVisible();
  await expect(page.getByTestId('skill-card-reading')).toContainText('Setara: 20/40');
  await expect(page.getByTestId('skill-card-reading').getByText('4,5', { exact: true })).toBeVisible();
  await expect(view.getByText(PERKIRAAN)).toBeVisible();
  await expect(view).toContainText('Tetap semangat! Anda belum mencapai target kelulusan.');
  await expect(view).toContainText(/Coba lagi setelah \d{2}[.:]\d{2}/);
  await expect(view).toContainText('Sisa percobaan hari ini: 2');
  const t4 = (await getTree(page)).find((t) => t.tier_number === 4)!;
  expect(t4.status).not.toBe('COMPLETED');
  expect(t4.boss.passed_at).toBeNull();
  expect(t4.boss.best_band).toBe(4.5);
  await shot(page, `band-boss-fail-${test.info().project.name}`);
});

test('0 benar dari 40 menghasilkan Band 0.0 (bukan galat) dan tetap menampilkan EstimasiNotice', async ({ page, context }) => {
  const p = await mk('bnd-c');
  await context.addCookies(p.cookies);
  const setId = await bossReady(page, p);
  const attemptId = await sitBoss(page, setId, 0, 0);
  await page.goto(`/ujian/${attemptId}/hasil`);
  const view = page.getByTestId('boss-result-view');
  await expect(view).toContainText('Target Band 7.0, hasil Anda 0.0');
  await expect(page.getByTestId('skill-card-listening')).toContainText('Setara: 0/40');
  await expect(page.getByTestId('skill-card-listening').getByText('0,0', { exact: true })).toBeVisible();
  await expect(page.getByTestId('skill-card-reading').getByText('0,0', { exact: true })).toBeVisible();
  await expect(view.getByText(PERKIRAAN)).toBeVisible();
  await expect(view.getByRole('status')).toContainText('Belum lulus');
});
