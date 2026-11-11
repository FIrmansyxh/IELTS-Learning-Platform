/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SPEC-021 (Jalur Belajar): tes yang membuktikan AC yang sebelumnya tidak dirujuk tes mana pun.
 * AC-6, AC-8, AC-9, AC-13, AC-15, AC-19 (AC-14 dan bagian murni AC-6 ada di tests/unit/learning-tracks-ac.test.ts).
 * Fixture sintetis; DB integrasi sementara dari global-setup (migrasi + seed). Nama tiap tes diawali "AC-N:".
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, learningMaterials, tiers } from '@/db/schema';
import { execute, getDb, openRaw } from '@/server/db';
import { runMigrations } from '@/server/db-migrate';
import { applyBossResult, applyLearnCompleted, ensureProgressRows, recomputeStatuses } from '@/server/gatekeeping/service';
import { applyTracks } from '@/server/content/tracks-import';
import { POST as startAttemptRoute } from '@/app/api/v1/attempts/route';
import { PUT as putAnswerRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitAttemptRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as lastLearnedGet, PUT as lastLearnedPut } from '@/app/api/v1/me/last-learned/route';
import { call, learnerSession } from './helpers';
import { addDrill, markLearnDone, progressOf, resetLearning, seedMaterial, subId } from './learning-fixtures';
import { getSubModule, getTracks, getTree, setActiveTrack, setSubModuleStyle, startCheckpoint, type L } from './tracks-helpers';
import { Q } from '../fixtures/content/builders';

const db = getDb();
const ALL_TRACKS = ['GT-STRUCT', 'GT-WRITING', 'GT-READING', 'GT-SPRINT-4W'] as const;

const tmpDirs: string[] = [];
const tmp = (p: string) => {
  const d = mkdtempSync(path.join(tmpdir(), p));
  tmpDirs.push(d);
  return d;
};
afterAll(() =>
  tmpDirs.forEach((d) => {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* sisa folder temp di Windows tidak memengaruhi hasil */
    }
  }),
);

const treeSub = (json: any, code: string) =>
  json.data.tiers.flatMap((t: any) => t.modules).flatMap((m: any) => m.sub_modules).find((s: any) => s.sub_module_code === code);
const trackSub = (json: any, code: string) => json.data.track.items.find((it: any) => it.sub_module?.sub_module_code === code)?.sub_module;
const storedStatus = async (userId: string, code: string): Promise<string> => (await progressOf(userId, code)).status;

async function addSet(type: 'TIER_BOSS_EXAM' | 'SKIP_TIER_TEST' | 'SKIP_MODULE_TEST', scope: number | string) {
  const base = { assessmentType: type, title: `Set ${type}`, timeLimitSeconds: 900, origin: 'ORIGINAL_AUTHORED' as const, status: 'PUBLISHED' as const, questionCount: 12 };
  if (type === 'SKIP_MODULE_TEST') {
    const r = await execute(db, sql`SELECT id FROM modules WHERE module_code = ${scope as string}`);
    const [s] = await db.insert(assessmentSets).values({ ...base, moduleId: (r.rows[0] as { id: string }).id }).returning();
    return s!;
  }
  const [t] = await db.select().from(tiers).where(eq(tiers.tierNumber, scope as number));
  const [s] = await db.insert(assessmentSets).values({ ...base, tierId: t!.id }).returning();
  return s!;
}

/** Kondisi AC-7: Tier 2 LOCKED, 1.1.1, 1.3.1, 1.3.2, 1.3.4 COMPLETED, 2.1.1 (dan 2.3.1) PUBLISHED. */
async function tier2LockedState(): Promise<L> {
  const u = await learnerSession();
  for (const s of ['1.1.1', '1.3.1', '1.3.2', '1.3.4', '2.1.1', '2.3.1']) await seedMaterial(s);
  await ensureProgressRows(db, u.user.id);
  for (const s of ['1.1.1', '1.3.1', '1.3.2', '1.3.4']) {
    await execute(
      db,
      sql`UPDATE user_sub_module_progress SET status = 'COMPLETED', learn_completed_at = CURRENT_TIMESTAMP
          WHERE user_id = ${u.user.id} AND sub_module_id = (SELECT id FROM sub_modules WHERE sub_module_code = ${s})`,
    );
  }
  await db.transaction((tx) => recomputeStatuses(tx, u.user.id));
  return u;
}

const passBossTier1 = async (userId: string) => {
  const [t1] = await db.select().from(tiers).where(eq(tiers.tierNumber, 1));
  return db.transaction((tx) => applyBossResult(tx, userId, { tierId: t1!.id, percent: 85, band: null, passed: true }));
};

beforeEach(async () => {
  await resetLearning();
  await execute(db, sql`DELETE FROM user_sub_module_styles`);
});

describe('AC-6: endpoint, migrasi 0003, seed, progres bersama', () => {
  it('AC-6: kelima rute baru menolak tanpa cookie dengan 401', async () => {
    const anon = null;
    expect((await getTracks(anon)).status).toBe(401);
    expect((await setActiveTrack(anon, 'GT-WRITING')).status).toBe(401);
    expect((await setSubModuleStyle(anon, '1.1.1', 'CASE_BASED')).status).toBe(401);
    expect((await startCheckpoint(anon, 'GT-WRITING', '00000000-0000-0000-0000-000000000000')).status).toBe(401);
    expect((await getTree(anon, { track: 'GT-WRITING' })).status).toBe(401);
    expect((await getSubModule(anon, '1.1.1', { style: 'PRACTICE_FIRST' })).status).toBe(401);
  });

  it('AC-6: migrasi 0003 aditif: data 0002 utuh, kolom/tabel baru ada, style=BASE, unik (sub_module, style)', () => {
    const REAL = path.resolve('drizzle');
    const old = tmp('mig3-old-');
    cpSync(REAL, old, { recursive: true });
    const jp = path.join(old, 'meta', '_journal.json');
    const j = JSON.parse(readFileSync(jp, 'utf8'));
    expect(j.entries.map((e: any) => e.tag)).toContain('0003_spec_021_learning_tracks');
    j.entries = j.entries.slice(0, 3); // 0000..0002
    writeFileSync(jp, JSON.stringify(j));

    const file = path.join(tmp('mig3-db-'), 'test.db');
    const raw = openRaw(file);
    expect(runMigrations(raw, old).applied).toHaveLength(3);
    raw.exec(`
      INSERT INTO users (id, display_name) VALUES ('u1', 'Budi');
      INSERT INTO tiers (id, tier_number, title, cefr_level, target_band_min, target_band_max, boss_gate_type, boss_gate_value) VALUES ('t1', 1, 'Tier 1', 'A2', 3, 4, 'PERCENT', 80);
      INSERT INTO modules (id, tier_id, module_code, skill_category, title, order_index) VALUES ('m1', 't1', '1.1', 'GRAMMAR', 'Modul', 1);
      INSERT INTO sub_modules (id, module_id, sub_module_code, title, order_index) VALUES ('s1', 'm1', '1.1.1', 'Sub', 1);
      INSERT INTO learning_materials (id, sub_module_id, article_markdown, origin) VALUES ('lm1', 's1', '# Bawaan', 'ORIGINAL_AUTHORED');
      INSERT INTO user_sub_module_progress (user_id, sub_module_id, status, best_score_percent) VALUES ('u1', 's1', 'COMPLETED', 90);
    `);
    const all = (q: string): any[] => raw.prepare(q).all() as any[];
    const before = {
      users: all('SELECT * FROM users'),
      progress: all('SELECT * FROM user_sub_module_progress'),
      materials: all('SELECT * FROM learning_materials'),
    };

    const report = runMigrations(raw, REAL);
    // Migrasi setelah 0003 (mis. 0004, SPEC-026) ikut terpasang; yang diuji di sini hanya 0003 yang berurutan pertama.
    expect(report.applied[0]).toBe('0003_spec_021_learning_tracks');

    // data lama utuh (kolom baru dikecualikan)
    const strip = (rows: any[], drop: string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))));
    expect(strip(all('SELECT * FROM users'), ['active_track_id'])).toEqual(before.users);
    expect(all('SELECT * FROM user_sub_module_progress')).toEqual(before.progress);
    expect(strip(all('SELECT * FROM learning_materials'), ['style'])).toEqual(before.materials);
    expect(all(`SELECT active_track_id FROM users WHERE id = 'u1'`)[0].active_track_id).toBeNull();
    expect(all(`SELECT style FROM learning_materials WHERE id = 'lm1'`)[0].style).toBe('BASE');

    // tabel baru ada dan kosong; FK utuh
    for (const t of ['learning_tracks', 'learning_track_items', 'user_sub_module_styles']) expect(all(`SELECT count(*) AS n FROM ${t}`)[0].n).toBe(0);
    expect(all('PRAGMA foreign_key_check')).toEqual([]);

    // unik (sub_module_id, style): varian boleh, duplikat gaya ditolak, BASE ganda ditolak
    raw.exec(`INSERT INTO learning_materials (sub_module_id, article_markdown, origin, style) VALUES ('s1', '# Latihan dulu', 'ORIGINAL_AUTHORED', 'PRACTICE_FIRST')`);
    expect(() => raw.exec(`INSERT INTO learning_materials (sub_module_id, article_markdown, origin, style) VALUES ('s1', '# Lagi', 'ORIGINAL_AUTHORED', 'PRACTICE_FIRST')`)).toThrow(/UNIQUE/);
    expect(() => raw.exec(`INSERT INTO learning_materials (sub_module_id, article_markdown, origin) VALUES ('s1', '# BASE ganda', 'ORIGINAL_AUTHORED')`)).toThrow(/UNIQUE/);
    const idx = new Set(all(`SELECT name FROM sqlite_master WHERE type = 'index'`).map((r) => r.name));
    expect(idx.has('learning_materials_sub_style_uq')).toBe(true);
    expect(idx.has('learning_materials_sub_module_id_unique')).toBe(false);
    raw.close();
  });

  it('AC-3: seed + progres bersama (juga bukti progres bersama pada AC-6): menyelesaikan 2.2.2 saat GT-WRITING aktif tampil COMPLETED di GT-STRUCT dan menaikkan completed_sub_modules di kedua jalur', async () => {
    const u = await learnerSession();
    await ensureProgressRows(db, u.user.id);
    await seedMaterial('2.2.2');
    const before = (await getTracks(u)).json.data;
    const done = (rows: any[], code: string) => rows.find((t) => t.code === code).completed_sub_modules;
    await setActiveTrack(u, 'GT-WRITING');
    await execute(
      db,
      sql`UPDATE user_sub_module_progress SET status = 'COMPLETED', learn_completed_at = CURRENT_TIMESTAMP
          WHERE user_id = ${u.user.id} AND sub_module_id = (SELECT id FROM sub_modules WHERE sub_module_code = '2.2.2')`,
    );
    const after = (await getTracks(u)).json.data;
    expect(done(after, 'GT-WRITING')).toBe(done(before, 'GT-WRITING') + 1);
    expect(done(after, 'GT-STRUCT')).toBe(done(before, 'GT-STRUCT') + 1);
    const struct = await getTree(u, { track: 'GT-STRUCT' });
    expect(trackSub(struct.json, '2.2.2').status).toBe('COMPLETED');
  });
});

describe('AC-8: Boss Tier 1 lulus membuka 2.1.1; jalur tidak membuka Tier terkunci', () => {
  it.each(ALL_TRACKS)('AC-8: jalur aktif %s: 2.1.1 LOCKED (TIER_LOCKED) sebelum Boss, UNLOCKED sesudah Boss lulus + recomputeStatuses', async (track) => {
    const u = await tier2LockedState();
    await setActiveTrack(u, track);

    // sebelum Boss: terkunci di jalur apa pun, baik di pohon Tier maupun di item jalur
    let tree = await getTree(u, { track });
    expect(treeSub(tree.json, '2.1.1')).toMatchObject({ status: 'LOCKED', lock_reason: { code: 'TIER_LOCKED' } });
    const inTrack = trackSub(tree.json, '2.1.1');
    if (inTrack) expect(inTrack).toMatchObject({ status: 'LOCKED', lock_reason: { code: 'TIER_LOCKED' } });
    expect(await storedStatus(u.user.id, '2.1.1')).toBe('LOCKED');

    await passBossTier1(u.user.id);
    await db.transaction((tx) => recomputeStatuses(tx, u.user.id));

    // sesudah Boss: UNLOCKED di jalur apa pun
    tree = await getTree(u, { track });
    expect(tree.json.data.tiers.find((t: any) => t.tier_number === 2).status).toBe('UNLOCKED');
    expect(treeSub(tree.json, '2.1.1').status).toBe('UNLOCKED');
    const after = trackSub(tree.json, '2.1.1');
    if (after) expect(after.status).toBe('UNLOCKED');
    expect(await storedStatus(u.user.id, '2.1.1')).toBe('UNLOCKED');
    // dibaca lewat jalur lain pun sama (status tersimpan monoton, bukan milik jalur)
    for (const other of ALL_TRACKS) {
      const t = await getTree(u, { track: other });
      expect(treeSub(t.json, '2.1.1').status).toBe('UNLOCKED');
    }
  });

  it('AC-8: GT-SPRINT-4W dan GT-READING: item pertama yang berada di Tier terkunci tetap LOCKED (TIER_LOCKED)', async () => {
    const u = await tier2LockedState();

    await setActiveTrack(u, 'GT-SPRINT-4W');
    const sprint = await getTree(u, { track: 'GT-SPRINT-4W' });
    const firstLockedTierSprint = sprint.json.data.track.items
      .filter((it: any) => it.sub_module)
      .find((it: any) => Number(it.sub_module.sub_module_code.split('.')[0]) >= 2).sub_module;
    expect(firstLockedTierSprint.sub_module_code).toBe('2.1.1');
    expect(firstLockedTierSprint).toMatchObject({ status: 'LOCKED', lock_reason: { code: 'TIER_LOCKED' } });

    await setActiveTrack(u, 'GT-READING');
    const reading = await getTree(u, { track: 'GT-READING' });
    const firstLockedTierReading = reading.json.data.track.items
      .filter((it: any) => it.sub_module)
      .find((it: any) => Number(it.sub_module.sub_module_code.split('.')[0]) >= 2).sub_module;
    expect(firstLockedTierReading.sub_module_code).toBe('2.3.1');
    expect(firstLockedTierReading).toMatchObject({ status: 'LOCKED', lock_reason: { code: 'TIER_LOCKED' } });
    expect(await storedStatus(u.user.id, '2.3.1')).toBe('LOCKED');
    expect(await storedStatus(u.user.id, '2.1.1')).toBe('LOCKED');
  });
});

describe('AC-9: Boss/Skip Test tidak bergantung jalur', () => {
  const gates = (json: any) => ({
    tiers: json.data.tiers.map((t: any) => ({
      n: t.tier_number,
      boss: t.boss,
      skip_test: t.skip_test,
      modules: t.modules.map((m: any) => ({ code: m.module_code, skip_test: m.skip_test })),
    })),
  });

  it('AC-9: boss.* dan skip_test.* pada data.tiers identik untuk setiap jalur aktif; track.items tanpa Boss/Skip', async () => {
    const boss = await addSet('TIER_BOSS_EXAM', 1);
    const skipTier = await addSet('SKIP_TIER_TEST', 2);
    await addSet('SKIP_MODULE_TEST', '1.1');
    const u = await tier2LockedState();

    const snapshots: Array<ReturnType<typeof gates>> = [];
    for (const track of [...ALL_TRACKS, 'GT-WRITING', 'GT-STRUCT'] as const) {
      await setActiveTrack(u, track);
      const tree = await getTree(u); // tanpa ?track: mengikuti jalur aktif
      expect(tree.json.data.track.code).toBe(track);
      snapshots.push(gates(tree.json));
      for (const it of tree.json.data.track.items) {
        expect(['SUB_MODULE', 'CHECKPOINT']).toContain(it.kind);
        expect(it).not.toHaveProperty('boss');
        expect(it).not.toHaveProperty('skip_test');
      }
      expect(JSON.stringify(tree.json.data.track)).not.toMatch(/TIER_BOSS_EXAM|SKIP_TIER_TEST|SKIP_MODULE_TEST|"boss"|"skip_test"/);
    }
    for (const s of snapshots.slice(1)) expect(s).toEqual(snapshots[0]);

    // bukan kebetulan kosong: nilai Boss/Skip nyata ikut dibandingkan
    const t1 = snapshots[0]!.tiers.find((t: any) => t.n === 1)!;
    const t2 = snapshots[0]!.tiers.find((t: any) => t.n === 2)!;
    expect(t1.boss.assessment_set_id).toBe(boss.id);
    expect(t2.skip_test).toBeTruthy();
    expect(JSON.stringify(snapshots[0])).toContain(skipTier.id);

    // parameter ?track=<kode> tidak mengubah gerbang pula
    for (const track of ALL_TRACKS) expect(gates((await getTree(u, { track })).json)).toEqual(snapshots[0]);
  });

  it('AC-9: setelah Boss Tier 1 lulus, boss.* tetap identik di semua jalur', async () => {
    await addSet('TIER_BOSS_EXAM', 1);
    const u = await tier2LockedState();
    await passBossTier1(u.user.id);
    const snaps = [];
    for (const track of ALL_TRACKS) {
      await setActiveTrack(u, track);
      snaps.push(gates((await getTree(u)).json));
    }
    for (const s of snaps.slice(1)) expect(s).toEqual(snaps[0]);
    const t1 = snaps[0]!.tiers.find((t: any) => t.n === 1)!;
    expect(t1.boss).toMatchObject({ available: false, blocked_reason: 'ALREADY_PASSED', best_percent: 85 });
    expect(t1.boss.passed_at).not.toBeNull();
  });
});

describe('AC-13: GT-SPRINT-4W', () => {
  it('AC-13: layout SPRINT, 20 SUB_MODULE dengan week_no/day_no unik menaik, 4 CHECKPOINT tepat setelah hari ke-5 tiap minggu', async () => {
    const u = await learnerSession();
    await ensureProgressRows(db, u.user.id);
    const res = await getTree(u, { track: 'GT-SPRINT-4W' });
    expect(res.status).toBe(200);
    const track = res.json.data.track;
    expect(track.layout).toBe('SPRINT');
    const items: any[] = track.items;
    expect(items).toHaveLength(24);

    const subs = items.filter((i) => i.kind === 'SUB_MODULE');
    const cps = items.filter((i) => i.kind === 'CHECKPOINT');
    expect(subs).toHaveLength(20);
    expect(cps).toHaveLength(4);

    // pasangan (minggu, hari) unik dan menaik: minggu 1 hari 1 ... minggu 4 hari 5
    const slots = subs.map((s) => [s.week_no, s.day_no]);
    expect(slots).toEqual(Array.from({ length: 20 }, (_, i) => [Math.floor(i / 5) + 1, (i % 5) + 1]));
    expect(new Set(slots.map((s) => s.join('-'))).size).toBe(20);

    // setiap CHECKPOINT berada tepat sesudah hari ke-5 sebuah minggu (dan hanya di situ)
    items.forEach((it, idx) => {
      if (it.kind !== 'CHECKPOINT') return;
      const prev = items[idx - 1];
      expect(prev.kind).toBe('SUB_MODULE');
      expect(prev.day_no).toBe(5);
      const next = items[idx + 1];
      if (next) expect(next.week_no).toBe(prev.week_no + 1);
    });
    expect(cps.map((c) => items[items.indexOf(c) - 1].week_no)).toEqual([1, 2, 3, 4]);
    expect(items[items.length - 1].kind).toBe('CHECKPOINT');
    // setiap checkpoint adalah item bertanda id (dapat dimulai lewat endpoint checkpoint)
    for (const c of cps) expect(typeof c.item_id).toBe('string');
  });
});

describe('AC-15: gaya PRACTICE_FIRST melewati syarat LEARN_NOT_COMPLETED saat memulai drill', () => {
  const start = (u: L, setId: string) => call(startAttemptRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
  const put = (u: L, id: string, qid: string, response: unknown) =>
    call(putAnswerRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response } });
  const submit = (u: L, id: string) => call(submitAttemptRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });

  async function setup(withVariant: boolean) {
    await seedMaterial('1.1.1');
    if (withVariant) {
      await db.insert(learningMaterials).values({
        subModuleId: await subId('1.1.1'),
        style: 'PRACTICE_FIRST',
        articleMarkdown: '## Varian latihan dulu',
        origin: 'ORIGINAL_AUTHORED',
      });
    }
    const set = await addDrill('1.1.1', [Q.mcq(), Q.mcq(), Q.mcq(), Q.mcq()]);
    const u = await learnerSession(); // learn_completed_at NULL
    await ensureProgressRows(db, u.user.id);
    await recomputeStatuses(db, u.user.id);
    expect((await progressOf(u.user.id, '1.1.1')).learn_completed_at).toBeNull();
    return { u, set };
  }

  it('AC-15: gaya terterap PRACTICE_FIRST (override profil) + learn_completed_at NULL -> attempt dibuat (201), bukan LEARN_NOT_COMPLETED', async () => {
    const { u, set } = await setup(true);
    expect((await setSubModuleStyle(u, '1.1.1', 'PRACTICE_FIRST')).status).toBe(204);
    expect((await getSubModule(u, '1.1.1')).json.data.delivery.applied_style).toBe('PRACTICE_FIRST');
    const r = await start(u, set.id);
    expect(r.status).toBe(201);
    expect(r.json.data.assessment_type).toBe('ACTIVE_DRILL');
  });

  it('AC-15: gaya terterap PRACTICE_FIRST lewat default jalur aktif GT-READING juga melewati syarat', async () => {
    const { u, set } = await setup(true);
    await setActiveTrack(u, 'GT-READING');
    expect((await getSubModule(u, '1.1.1')).json.data.delivery).toMatchObject({ applied_style: 'PRACTICE_FIRST', source: 'TRACK_DEFAULT' });
    expect((await start(u, set.id)).status).toBe(201);
  });

  it('AC-15: gaya LEARN_FIRST dengan learn_completed_at NULL tetap 409 LEARN_NOT_COMPLETED', async () => {
    const { u, set } = await setup(true);
    const r = await start(u, set.id); // jalur GT-STRUCT: LEARN_FIRST
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('LEARN_NOT_COMPLETED');
    const rows = await execute(db, sql`SELECT count(*) AS n FROM attempts WHERE user_id = ${u.user.id}`);
    expect((rows.rows[0] as { n: number }).n).toBe(0);
  });

  it('AC-15: PRACTICE_FIRST diminta tetapi varian tidak ada -> gaya terterap LEARN_FIRST -> tetap 409', async () => {
    const { u, set } = await setup(false);
    await setSubModuleStyle(u, '1.1.1', 'PRACTICE_FIRST');
    expect((await getSubModule(u, '1.1.1')).json.data.delivery).toMatchObject({ requested_style: 'PRACTICE_FIRST', applied_style: 'LEARN_FIRST' });
    const r = await start(u, set.id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('LEARN_NOT_COMPLETED');
  });

  it('AC-15: sub-modul tidak menjadi COMPLETED selama belajar belum selesai, walau drill lulus 100% pada gaya PRACTICE_FIRST', async () => {
    const { u, set } = await setup(true);
    await setSubModuleStyle(u, '1.1.1', 'PRACTICE_FIRST');
    const s = await start(u, set.id);
    expect(s.status).toBe(201);
    for (const q of s.json.data.questions) {
      const opt = q.options.find((o: any) => o.text === 'is');
      expect((await put(u, s.json.data.id, q.question_id, { option_ids: [opt.option_id] })).status).toBe(200);
    }
    const done = await submit(u, s.json.data.id);
    expect(done.status).toBe(200);
    const p = await progressOf(u.user.id, '1.1.1');
    expect(p.learn_completed_at).toBeNull();
    expect(p.status).not.toBe('COMPLETED');
    expect(p.completed_at).toBeNull();

    // belajar selesai sesudah drill lulus -> sub-modul baru COMPLETED (belajar tetap wajib, urutan bebas)
    await markLearnDone(u.user.id, '1.1.1');
    const sid = await subId('1.1.1');
    await db.transaction((tx) => applyLearnCompleted(tx, u.user.id, sid));
    expect((await progressOf(u.user.id, '1.1.1')).status).toBe('COMPLETED');
  });
});

describe('AC-19: content:import / db:seed idempoten untuk jalur', () => {
  const tracksJson = () => JSON.parse(readFileSync(path.resolve('content', 'gt-tracks', 'tracks.json'), 'utf8'));
  const counts = (file: string) => {
    const d = new DatabaseSync(file, { readOnly: true });
    try {
      const n = (q: string) => Number(Object.values(d.prepare(q).get() as object)[0]);
      return {
        tracks: n('SELECT count(*) FROM learning_tracks'),
        items: n('SELECT count(*) FROM learning_track_items'),
        perTrack: Object.fromEntries(
          (d.prepare('SELECT t.code AS code, count(i.id) AS n FROM learning_tracks t LEFT JOIN learning_track_items i ON i.track_id = t.id GROUP BY t.code').all() as any[]).map((r) => [r.code, Number(r.n)]),
        ),
        hashes: d.prepare('SELECT code, content_hash FROM learning_tracks ORDER BY code').all(),
      };
    } finally {
      d.close();
    }
  };
  const tsx = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');
  const run = (script: string, args: string[], dbPath: string) => {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_PATH: dbPath };
    delete env.DATABASE_URL;
    return spawnSync(process.execPath, [tsx, script, ...args], { env, encoding: 'utf8', timeout: 120_000 });
  };
  const EXPECT = { tracks: 5, items: 69, perTrack: { 'GT-STRUCT': 0, 'GT-WRITING': 18, 'GT-READING': 9, 'GT-SPRINT-4W': 24, 'GT-GRAMMAR': 18 } };

  it('AC-19: applyTracks pada DB seed: run kedua NOOP (5 jalur sama hash), baris 5 jalur / 69 item', async () => {
    const pkg = tracksJson();
    const before = counts(process.env.DATABASE_PATH!);
    expect(before).toMatchObject(EXPECT);
    const r = await db.transaction((tx) => applyTracks(tx, pkg.learning_tracks, 'PUBLISHED'));
    expect(r).toEqual({ created: 0, updated: 0, noop: 5 });
    expect(counts(process.env.DATABASE_PATH!)).toEqual(before);
  });

  it('AC-19: proses db:seed dua kali dan content:import --dir content/gt-tracks dua kali pada DB baru: jumlah baris 5/69 dan hash tidak berubah', () => {
    const dbPath = path.join(tmp('ielts-ac19-'), 'ielts.db');
    const mig = run('scripts/migrate.ts', [], dbPath);
    expect(mig.status, `${mig.stdout}\n${mig.stderr}`).toBe(0);

    const s1 = run('scripts/seed.ts', [], dbPath);
    expect(s1.status, `${s1.stdout}\n${s1.stderr}`).toBe(0);
    const afterFirst = counts(dbPath);
    expect(afterFirst).toMatchObject(EXPECT);

    const s2 = run('scripts/seed.ts', [], dbPath);
    expect(s2.status, `${s2.stdout}\n${s2.stderr}`).toBe(0);
    expect(counts(dbPath)).toEqual(afterFirst);

    for (let i = 0; i < 2; i++) {
      const imp = run('scripts/content-import.ts', ['import', '--dir', path.resolve('content', 'gt-tracks'), '--publish'], dbPath);
      expect(imp.status, `${imp.stdout}\n${imp.stderr}`).toBe(0);
      expect(counts(dbPath)).toEqual(afterFirst);
    }
  });
});

describe('AC-5, AC-7, AC-18 (pelengkap: sebelumnya hanya terbukti sebagian)', () => {
  it('AC-5: ?style=PRACTICE_FIRST dengan varian -> applied PRACTICE_FIRST, source QUERY, artikel varian, slides mewarisi bawaan', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { article: 'ARTIKEL BAWAAN', slides: 2 });
    await db.insert(learningMaterials).values({ subModuleId: id, style: 'PRACTICE_FIRST', articleMarkdown: 'ARTIKEL VARIAN', origin: 'ORIGINAL_AUTHORED' });
    const u = await learnerSession();
    const base = await getSubModule(u, '1.1.1');
    expect(base.json.data.material.article_markdown).toBe('ARTIKEL BAWAAN');
    const r = await getSubModule(u, '1.1.1', { style: 'PRACTICE_FIRST' });
    expect(r.status).toBe(200);
    expect(r.json.data.delivery).toMatchObject({ applied_style: 'PRACTICE_FIRST', source: 'QUERY' });
    expect(r.json.data.material.article_markdown).toBe('ARTIKEL VARIAN');
    expect(r.json.data.material.slides).toHaveLength(2);
    expect(r.json.data.material.slides).toEqual(base.json.data.material.slides);
  });

  it('AC-5: gaya diminta tanpa varian -> 200, applied LEARN_FIRST, materi bawaan', async () => {
    await seedMaterial('1.1.1', { article: 'ARTIKEL BAWAAN' });
    const u = await learnerSession();
    const r = await getSubModule(u, '1.1.1', { style: 'CASE_BASED' });
    expect(r.status).toBe(200);
    expect(r.json.data.delivery).toMatchObject({ requested_style: 'CASE_BASED', applied_style: 'LEARN_FIRST', source: 'QUERY' });
    expect(r.json.data.material.article_markdown).toBe('ARTIKEL BAWAAN');
  });

  it('AC-7: Tier 2 LOCKED di GT-WRITING: pohon TIER_LOCKED, GET /sub-modules/2.1.1 -> 403 LOCKED_CONTENT (details[0].code=TIER_LOCKED), status tersimpan tetap LOCKED', async () => {
    const u = await tier2LockedState();
    await setActiveTrack(u, 'GT-WRITING');
    const tree = await getTree(u, { track: 'GT-WRITING' });
    expect(trackSub(tree.json, '2.1.1')).toMatchObject({ status: 'LOCKED', lock_reason: { code: 'TIER_LOCKED' } });
    const r = await getSubModule(u, '2.1.1');
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('LOCKED_CONTENT');
    expect(r.json.error.details[0].code).toBe('TIER_LOCKED');
    expect(await storedStatus(u.user.id, '2.1.1')).toBe('LOCKED');
  });

  it('AC-18: kartu resume memuat active_track = jalur aktif (data bukan null) dan posisi terakhir tidak berubah saat jalur diganti', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    const put = await call(lastLearnedPut, 'PUT', '/api/v1/me/last-learned', {
      cookie: u.cookie,
      body: { sub_module_id: id, active_tab: 'LEARN', active_learn_subtab: 'ARTICLE' },
    });
    expect(put.status).toBe(200);
    const card = () => call(lastLearnedGet, 'GET', '/api/v1/me/last-learned', { cookie: u.cookie });
    const first = await card();
    expect(first.json.data).toBeTruthy();
    expect(first.json.data.active_track.code).toBe('GT-STRUCT');
    await setActiveTrack(u, 'GT-READING');
    const second = await card();
    expect(second.json.data.active_track).toMatchObject({ code: 'GT-READING' });
    expect(typeof second.json.data.active_track.title).toBe('string');
    expect(second.json.data.sub_module).toEqual(first.json.data.sub_module);
    expect(second.json.data.resume_path).toBe(first.json.data.resume_path);
  });
});

describe('AC-2 (setara tingkat API dari E2E "ganti jalur, progres tetap" pada AC-6)', () => {
  it('AC-2: PUT /me/active-track tidak mengubah baris progres sub-modul profil itu', async () => {
    const u = await learnerSession();
    await ensureProgressRows(db, u.user.id);
    await seedMaterial('1.1.1');
    await markLearnDone(u.user.id, '1.1.1');
    const snap = async () =>
      (await execute(db, sql`SELECT sub_module_id, status, unlock_source, learn_completed_at, best_score_percent FROM user_sub_module_progress WHERE user_id = ${u.user.id} ORDER BY sub_module_id`)).rows;
    const mod = async () => (await execute(db, sql`SELECT module_id, status FROM user_module_progress WHERE user_id = ${u.user.id} ORDER BY module_id`)).rows;
    const tier = async () => (await execute(db, sql`SELECT tier_id, status FROM user_tier_progress WHERE user_id = ${u.user.id} ORDER BY tier_id`)).rows;
    await db.transaction((tx) => recomputeStatuses(tx, u.user.id));
    // GT-WRITING menurut D5.6 menjalankan recompute dan boleh membuka item pertama; baseline diambil sesudah
    // peralihan pertama, lalu peralihan bolak-balik tidak boleh mengubah apa pun.
    await setActiveTrack(u, 'GT-WRITING');
    const [a, b, c] = [await snap(), await mod(), await tier()];
    for (const t of ['GT-STRUCT', 'GT-SPRINT-4W', 'GT-READING', 'GT-WRITING']) {
      expect((await setActiveTrack(u, t)).status).toBe(204);
      expect(await snap()).toEqual(a);
      expect(await mod()).toEqual(b);
      expect(await tier()).toEqual(c);
    }
  });
});
