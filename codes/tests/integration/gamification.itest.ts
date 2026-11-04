/**
 * Integrasi SPEC-016 (TASK-016): poin, mahkota, speed streak, streak harian, ledger append-only, anti-abuse.
 * Route handler nyata + Postgres. Jam server dikendalikan (`setClockForTest`) agar waktu jawaban dan hari lokal deterministik.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { AttemptResultResponseSchema } from '@/contracts/attempts';
import { PointsResponseSchema, StatsResponseSchema } from '@/contracts/gamification';
import { attemptCompletedHooks } from '@/server/attempts/hooks';
import { setClockForTest } from '@/server/clock';
import { closeDb, getDb } from '@/server/db';
import { insertUser } from '@/server/auth/service';
import { hashPassword } from '@/server/auth/password';
import { recordActivity } from '@/server/gamification/service';
import { resetRateLimits } from '@/server/http/rate-limit';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as resultRoute } from '@/app/api/v1/attempts/[attempt_id]/result/route';
import { GET as statsRoute } from '@/app/api/v1/me/stats/route';
import { GET as pointsRoute } from '@/app/api/v1/me/points/route';
import { POST as postComplete } from '@/app/api/v1/sub-modules/[sub_module]/learn-complete/route';
import { POST as postMini } from '@/app/api/v1/sub-modules/[sub_module]/mini-task/complete/route';
import { call, learnerSession, makeUser, uniqueEmail, STRONG_PASSWORD } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial } from './learning-fixtures';
import { makeBoss, playBoss, readyTier1 } from './boss-fixtures';
import { Q } from '../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
type L = Awaited<ReturnType<typeof learnerSession>>;
const db = getDb();

const T0 = Date.parse('2026-11-03T03:00:00.000Z'); // 10:00 WIB
const DAY = 86_400_000;
let clock = T0;
const at = (ms: number) => {
  clock = ms;
  setClockForTest(() => clock);
};

const start = (u: L, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
const put = (u: L, id: string, qid: string, response: unknown, extra: Record<string, unknown> = {}) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response, ...extra } });
const submit = (u: L, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
const result = (u: L, id: string) => call(resultRoute, 'GET', `/api/v1/attempts/${id}/result`, { cookie: u.cookie, params: { attempt_id: id } });
const stats = (u: L) => call(statsRoute, 'GET', '/api/v1/me/stats', { cookie: u.cookie });
const points = (u: L, q = '') => call(pointsRoute, 'GET', `/api/v1/me/points${q}`, { cookie: u.cookie });

const mcqs = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => Q.mcq({ question_id: `Q-D${i + 1}`, prompt: `P${i + 1}`, options: [`right-${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-${i + 1}`], explanation_id: `Pembahasan ${i + 1}`, ...over }));
const optionFor = (q: any, text: string) => q.options.find((o: any) => o.text === text).option_id as string;
const rightOf = (q: any) => ({ option_ids: [optionFor(q, `right-${q.prompt.slice(1)}`)] });
const wrongOf = (q: any) => ({ option_ids: [optionFor(q, 'x')] });

const FAST = 3000;
const SLOW = 15_000; // > target_time_ms 10 dtk
type Step = { right: boolean; ms: number };
const R = (ms = FAST): Step => ({ right: true, ms });
const W = (ms = FAST): Step => ({ right: false, ms });

/** Mulai attempt Drill, jawab sesuai rencana (jam maju `ms` sebelum tiap jawaban), lalu submit. */
async function runDrill(u: L, setId: string, plan: Step[], opts: { submit?: boolean } = {}) {
  const s = await start(u, setId);
  expect(s.status, JSON.stringify(s.json)).toBeLessThan(300);
  const dto = s.json.data;
  for (const [i, step] of plan.entries()) {
    clock += step.ms;
    setClockForTest(() => clock);
    const q = dto.questions[i];
    const r = await put(u, dto.id, q.question_id, step.right ? rightOf(q) : wrongOf(q));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
  }
  if (opts.submit === false) return { id: dto.id as string, res: null as any };
  const res = await submit(u, dto.id);
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  return { id: dto.id as string, res: res.json.data };
}

async function setup(questions: unknown[] = mcqs(10, { target_time_ms: 10_000 })) {
  await seedMaterial('1.1.1');
  await seedMaterial('1.1.2');
  const set = await addDrill('1.1.1', questions);
  const u = await learnerSession();
  await markLearnDone(u.user.id, '1.1.1');
  return { u, set };
}

const ledger = async (userId: string) =>
  (await db.execute(sql`SELECT id, source, points, source_id, note FROM point_ledger WHERE user_id = ${userId}::uuid ORDER BY id`)).rows as any[];
const sumBy = (rows: any[], source: string) => rows.filter((r) => r.source === source).reduce((a, r) => a + r.points, 0);
const statRow = async (userId: string) => (await db.execute(sql`SELECT * FROM user_stats WHERE user_id = ${userId}::uuid`)).rows[0] as any;
const crownOf = async (userId: string, code: string) =>
  ((await db.execute(sql`SELECT p.mastery_crown FROM user_sub_module_progress p JOIN sub_modules s ON s.id = p.sub_module_id WHERE p.user_id = ${userId}::uuid AND s.sub_module_code = ${code}`)).rows[0] as any).mastery_crown as string;

beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
  at(T0);
});
afterEach(() => {
  setClockForTest(null);
  delete process.env.APP_TIMEZONE;
});
afterAll(async () => {
  await resetLearning();
  await db.execute(sql`DELETE FROM content_assets`);
  await closeDb();
});

// =============================================================================== poin Drill, speed streak, mahkota
describe('hook attempt selesai: Drill (G1-G4, G8)', () => {
  it('AC1: 8/10 benar dengan streak [1,2,3,4,0,1,2,3,0,1] -> DRILL +80, SPEED_STREAK +15, CROWN SILVER +50, DAILY +5, total 150', async () => {
    const { u, set } = await setup();
    const { id, res } = await runDrill(u, set.id, [R(), R(), R(), R(), W(), R(), R(), R(), W(), R()]);
    expect(AttemptResultResponseSchema.safeParse({ data: res }).success).toBe(true);
    const streaks = (await db.execute(sql`SELECT speed_streak_len AS s FROM attempt_answers WHERE attempt_id = ${id}::uuid ORDER BY answered_at`)).rows.map((r: any) => r.s);
    expect(streaks).toEqual([1, 2, 3, 4, 0, 1, 2, 3, 0, 1]);

    expect(res.attempt).toMatchObject({ passed: true, score_percent: 80, points_awarded: 145 });
    expect(res.gamification).toEqual({
      points: { drill: 80, speed_streak: 15, crown: 50, boss: 0, daily: 5, total: 150 },
      crown: { previous: 'NONE', current: 'SILVER', changed: true },
      best_speed_streak: 4,
      daily_streak_days: 1,
    });
    expect(res.progress.mastery_crown).toBe('SILVER');

    const rows = await ledger(u.user.id);
    expect(rows.map((r) => [r.source, r.points])).toEqual([['DRILL', 80], ['SPEED_STREAK', 15], ['CROWN', 50], ['DAILY', 5]]);
    expect(rows.filter((r) => r.source !== 'DAILY').every((r) => r.source_id === id)).toBe(true);
    expect(rows.find((r) => r.source === 'DAILY').source_id).toBeNull();
    expect(rows[0].note).toBe('Latihan 1.1.1: 8 benar');
    expect(rows[1].note).toBe('Speed streak 3x');
    expect(rows[2].note).toBe('Mahkota Perak 1.1.1');

    expect(await crownOf(u.user.id, '1.1.1')).toBe('SILVER');
    const st = await statRow(u.user.id);
    expect(st).toMatchObject({ total_points: 150, daily_streak_days: 1, longest_daily_streak: 1, best_speed_streak: 4, silver_crowns: 1, gold_crowns: 0 });
    expect((await db.execute(sql`SELECT points_awarded FROM attempts WHERE id = ${id}::uuid`)).rows[0]).toEqual({ points_awarded: 145 });

    const s = await stats(u);
    expect(StatsResponseSchema.safeParse(s.json).success).toBe(true);
    expect(s.json.data).toEqual({ total_points: 150, daily_streak_days: 1, longest_daily_streak: 1, best_speed_streak: 4, gold_crowns: 0, silver_crowns: 1, last_active_date: '2026-11-03', streak_at_risk: false });
    // hasil dapat dibaca ulang (GET result) dengan blok gamifikasi yang sama
    expect((await result(u, id)).json.data.gamification).toEqual(res.gamification);
  });

  it('AC2: attempt kedua 9 benar (streak 4x) -> hanya selisih: DRILL +10, SPEED +5, GOLD +50; attempt ketiga lebih rendah tidak menambah', async () => {
    const { u, set } = await setup();
    await runDrill(u, set.id, [R(), R(), R(), R(), W(), R(), R(), R(), W(), R()]); // 80 / 15 / SILVER
    const b = await runDrill(u, set.id, [R(), R(), R(), R(), R(SLOW), R(), R(), R(), R(), W()]); // 9 benar, speed 4
    expect(b.res.attempt).toMatchObject({ passed: true, score_percent: 90, points_awarded: 65 });
    expect(b.res.gamification).toMatchObject({
      points: { drill: 10, speed_streak: 5, crown: 50, boss: 0, daily: 0, total: 65 },
      crown: { previous: 'SILVER', current: 'GOLD', changed: true },
    });
    expect(await crownOf(u.user.id, '1.1.1')).toBe('GOLD');
    expect(await statRow(u.user.id)).toMatchObject({ total_points: 215, gold_crowns: 1, silver_crowns: 0, best_speed_streak: 4 });

    const c = await runDrill(u, set.id, [R(), R(), R(), R(), R(SLOW), R(), R(), W(), W(), W()]); // 7 benar (speed 2x), tidak lulus
    expect(c.res.attempt).toMatchObject({ passed: false, points_awarded: 0 });
    expect(c.res.gamification.points).toMatchObject({ drill: 0, speed_streak: 0, crown: 0, daily: 0, total: 0 });
    expect(c.res.gamification.crown).toEqual({ previous: 'GOLD', current: 'GOLD', changed: false });

    const d = await runDrill(u, set.id, [R(), R(), R(), R(), R(SLOW), R(), R(), R(), W(), W()]); // 8 benar (speed 3x): lulus tetapi di bawah GOLD
    expect(d.res.attempt).toMatchObject({ passed: true, points_awarded: 0 });
    expect(await crownOf(u.user.id, '1.1.1')).toBe('GOLD'); // tidak turun
    const rows = await ledger(u.user.id);
    expect(rows.filter((r) => r.source_id === c.id || r.source_id === d.id)).toHaveLength(0);
    expect(sumBy(rows, 'DRILL')).toBe(90);
    expect(sumBy(rows, 'SPEED_STREAK')).toBe(20);
    expect(sumBy(rows, 'CROWN')).toBe(100);
    expect((await stats(u)).json.data.total_points).toBe(215);
  });

  it('gagal lulus (60%): poin DRILL tetap diberikan tetapi mahkota NONE dan tanpa baris CROWN', async () => {
    const { u, set } = await setup();
    const { res } = await runDrill(u, set.id, [R(), R(), R(), R(), R(), R(), W(), W(), W(), W()]);
    expect(res.attempt).toMatchObject({ passed: false, score_percent: 60, points_awarded: 60 + 20 }); // speed 4x (streak 3..6)
    expect(res.gamification.crown).toEqual({ previous: 'NONE', current: 'NONE', changed: false });
    expect(await crownOf(u.user.id, '1.1.1')).toBe('NONE');
    expect(sumBy(await ledger(u.user.id), 'CROWN')).toBe(0);
  });

  it('lulus tepat 75 -> SILVER (inklusif); 100% langsung -> GOLD +100 (bukan +50)', async () => {
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', mcqs(4, { target_time_ms: 10_000 }));
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    const a = await runDrill(u, set.id, [R(), R(), R(), W()]); // 3/4 = 75
    expect(a.res.gamification.crown).toEqual({ previous: 'NONE', current: 'SILVER', changed: true });
    const u2 = await learnerSession();
    await markLearnDone(u2.user.id, '1.1.1');
    const b = await runDrill(u2, set.id, [R(), R(), R(), R()]);
    expect(b.res.gamification.crown).toEqual({ previous: 'NONE', current: 'GOLD', changed: true });
    expect(b.res.gamification.points.crown).toBe(100);
  });

  it('set tanpa jawaban benar: tidak ada baris DRILL/SPEED, mahkota tetap, aktivitas harian tetap tercatat', async () => {
    const { u, set } = await setup();
    const { res } = await runDrill(u, set.id, [W(), W(), W(), W(), W(), W(), W(), W(), W(), W()]);
    expect(res.attempt.points_awarded).toBe(0);
    expect(res.gamification.points).toEqual({ drill: 0, speed_streak: 0, crown: 0, boss: 0, daily: 5, total: 5 });
    expect((await ledger(u.user.id)).map((r) => r.source)).toEqual(['DAILY']);
  });

  it('pengaturan poin bernilai 0: tidak ada baris ledger untuk sumber itu', async () => {
    const { u, set } = await setup();
    await db.execute(sql`UPDATE app_settings SET value = to_jsonb(0) WHERE key IN ('points.speed_streak_bonus','points.crown_silver','points.daily_activity')`);
    try {
      const { res } = await runDrill(u, set.id, [R(), R(), R(), R(), W(), R(), R(), R(), W(), R()]);
      expect(res.gamification.points).toMatchObject({ drill: 80, speed_streak: 0, crown: 0, daily: 0, total: 80 });
      expect((await ledger(u.user.id)).map((r) => r.source)).toEqual(['DRILL']);
      expect(res.gamification.crown.current).toBe('SILVER'); // mahkota tetap diberikan walau bernilai 0 poin
    } finally {
      await db.execute(sql`UPDATE app_settings SET value = to_jsonb(5) WHERE key = 'points.speed_streak_bonus'`);
      await db.execute(sql`UPDATE app_settings SET value = to_jsonb(50) WHERE key = 'points.crown_silver'`);
      await db.execute(sql`UPDATE app_settings SET value = to_jsonb(5) WHERE key = 'points.daily_activity'`);
    }
  });

  it('target_time_ms null memakai speed.default_target_ms (20 dtk): jawaban 15 dtk masih "dalam target"', async () => {
    const { u, set } = await setup(mcqs(5)); // tanpa target_time_ms
    const { res } = await runDrill(u, set.id, [R(15_000), R(15_000), R(15_000), R(15_000), R(15_000)]);
    expect(res.gamification.points.speed_streak).toBe(3 * 5); // streak 3,4,5
  });

  it('perubahan crown.silver_min berlaku untuk attempt berikutnya; mahkota lama tidak turun', async () => {
    const { u, set } = await setup();
    await runDrill(u, set.id, [R(), R(), R(), R(), R(), R(), R(), R(), W(), W()]); // 80 -> SILVER
    await db.execute(sql`UPDATE app_settings SET value = to_jsonb(85) WHERE key = 'crown.silver_min'`);
    try {
      const b = await runDrill(u, set.id, [R(), R(), R(), R(), R(), R(), R(), R(), W(), W()]); // 80 < 85 -> NONE dihitung
      expect(b.res.gamification.crown).toEqual({ previous: 'SILVER', current: 'SILVER', changed: false });
      expect(await crownOf(u.user.id, '1.1.1')).toBe('SILVER');
    } finally {
      await db.execute(sql`UPDATE app_settings SET value = to_jsonb(75) WHERE key = 'crown.silver_min'`);
    }
  });
});

// =============================================================================== idempotensi dan anti-abuse
describe('anti-abuse: klaim ganda, race, farming', () => {
  it('submit dua kali berurutan -> hasil identik, ledger dan total_points tidak bertambah', async () => {
    const { u, set } = await setup();
    const { id, res } = await runDrill(u, set.id, [R(), R(), R(), R(), W(), R(), R(), R(), W(), R()]);
    const before = await ledger(u.user.id);
    const again = await submit(u, id);
    expect(again.status).toBe(200);
    expect(again.json.data.gamification).toEqual(res.gamification);
    expect(again.json.data.attempt.points_awarded).toBe(145);
    expect(await ledger(u.user.id)).toEqual(before);
    expect((await statRow(u.user.id)).total_points).toBe(150);
  });

  it('submit serentak (3x Promise.all) -> tepat satu set baris ledger dan total hanya naik sekali', async () => {
    const { u, set } = await setup();
    const { id } = await runDrill(u, set.id, [R(), R(), R(), R(), W(), R(), R(), R(), W(), R()], { submit: false });
    const rs = await Promise.all([submit(u, id), submit(u, id), submit(u, id)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(new Set(rs.map((r) => JSON.stringify(r.json.data.gamification))).size).toBe(1);
    const rows = await ledger(u.user.id);
    expect(rows.map((r) => [r.source, r.points])).toEqual([['DRILL', 80], ['SPEED_STREAK', 15], ['CROWN', 50], ['DAILY', 5]]);
    expect((await statRow(u.user.id)).total_points).toBe(150);
  });

  it('indeks unik point_ledger_once_uq menolak klaim ganda (DRILL/CROWN/MINI_TASK/BOSS/SPEED) tetapi DAILY boleh berulang', async () => {
    const u = await makeUser();
    const sid = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
    const ins = (source: string, sourceId: string | null) =>
      db.execute(sql`INSERT INTO point_ledger (user_id, source, source_id, points) VALUES (${u.user.id}::uuid, ${source}::point_source, ${sourceId}::uuid, 10)`);
    for (const source of ['DRILL', 'SPEED_STREAK', 'CROWN', 'MINI_TASK', 'BOSS']) {
      await ins(source, sid);
      const err: any = await ins(source, sid).then(() => null, (e) => e);
      expect(err, source).not.toBeNull();
      expect(err.cause?.code ?? err.code, source).toBe('23505');
      expect(String(err.cause?.constraint ?? err.constraint), source).toBe('point_ledger_once_uq');
    }
    await ins('DAILY', null);
    await ins('DAILY', null);
    await ins('DAILY', sid);
    await ins('DAILY', sid);
  });

  it('dua sub-modul diserahkan serentak oleh pengguna sama -> tidak deadlock, total = jumlah masing-masing', async () => {
    await seedMaterial('1.1.1');
    await seedMaterial('1.1.2');
    const d1 = await addDrill('1.1.1', mcqs(10, { target_time_ms: 10_000 }));
    const d2 = await addDrill('1.1.2', mcqs(10, { target_time_ms: 10_000 }));
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    await runDrill(u, d1.id, [R(), R(), R(), R(), R(), R(), R(), R(), R(), R()]); // 100% -> membuka 1.1.2
    await markLearnDone(u.user.id, '1.1.2');
    const a = await runDrill(u, d1.id, [R(), R(), R(), R(), R(), R(), R(), R(), R(), R()], { submit: false });
    const b = await runDrill(u, d2.id, [R(), R(), R(), R(), R(), R(), R(), R(), R(), R()], { submit: false });
    const rs = await Promise.all([submit(u, a.id), submit(u, b.id)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    const rows = await ledger(u.user.id);
    // 1.1.1: DRILL100 + SPEED(8x5=40) + GOLD100 ; 1.1.2: sama; DAILY sekali
    expect(sumBy(rows, 'DRILL')).toBe(200);
    expect(sumBy(rows, 'CROWN')).toBe(200);
    expect(sumBy(rows, 'DAILY')).toBe(5);
    expect((await statRow(u.user.id)).total_points).toBe(rows.reduce((a2, r) => a2 + r.points, 0));
    expect(await statRow(u.user.id)).toMatchObject({ gold_crowns: 2 });
  });

  it('tidak ada farming PRACTICE: 6 attempt ulang dengan skor sama tidak menambah poin apa pun', async () => {
    const { u, set } = await setup();
    await runDrill(u, set.id, [R(), R(), R(), R(), R(), R(), R(), R(), R(), W()]);
    const base = await ledger(u.user.id);
    const total = (await statRow(u.user.id)).total_points;
    for (let i = 0; i < 6; i++) {
      resetRateLimits(); // 60 PUT/menit per pengguna
      await runDrill(u, set.id, [R(), R(), R(), R(), R(), R(), R(), R(), R(), W()]);
    }
    expect(await ledger(u.user.id)).toEqual(base);
    expect((await statRow(u.user.id)).total_points).toBe(total);
  });

  it('body klien dengan points/crown/total_points ditolak (unrecognized_key) pada PUT answers dan POST /attempts', async () => {
    const { u, set } = await setup();
    const s = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: set.id, points: 999, crown: 'GOLD' } });
    expect(s.status).toBe(400);
    expect(s.json.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(s.json.error.details)).toContain('unrecognized_key');
    const ok = await start(u, set.id);
    const q = ok.json.data.questions[0];
    const p = await put(u, ok.json.data.id, q.question_id, rightOf(q), { points: 999, crown: 'GOLD', total_points: 1 });
    expect(p.status).toBe(400);
    expect(JSON.stringify(p.json.error.details)).toContain('unrecognized_key');
    expect(await ledger(u.user.id)).toHaveLength(0);
  });

  it('hook sesudah gamifikasi gagal: seluruh submit dibatalkan (attempt tetap IN_PROGRESS, tanpa poin/mahkota/streak parsial)', async () => {
    const { u, set } = await setup();
    const { id } = await runDrill(u, set.id, [R(), R(), R(), R(), W(), R(), R(), R(), W(), R()], { submit: false });
    const boom = async () => {
      throw new Error('hook gagal (uji)');
    };
    attemptCompletedHooks.push(boom);
    try {
      const r = await submit(u, id);
      expect(r.status).toBe(500);
    } finally {
      attemptCompletedHooks.splice(attemptCompletedHooks.indexOf(boom), 1);
    }
    expect((await db.execute(sql`SELECT status, points_awarded FROM attempts WHERE id = ${id}::uuid`)).rows[0]).toEqual({ status: 'IN_PROGRESS', points_awarded: 0 });
    expect(await ledger(u.user.id)).toHaveLength(0);
    expect(await crownOf(u.user.id, '1.1.1')).toBe('NONE');
    expect(await statRow(u.user.id)).toBeUndefined();
    // sesudah hook dipulihkan, submit yang sama berhasil dan memberi poin tepat sekali
    const ok = await submit(u, id);
    expect(ok.status).toBe(200);
    expect(ok.json.data.gamification.points.total).toBe(150);
    expect((await statRow(u.user.id)).total_points).toBe(150);
  });

  it('ledger append-only untuk app_rw: UPDATE dan DELETE ditolak (bila role ada)', async () => {
    const pool = (await import('pg')).default;
    const c = new pool.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    try {
      const role = await c.query(`SELECT 1 FROM pg_roles WHERE rolname='app_rw'`);
      if (!role.rowCount) return;
      await c.query('SET ROLE app_rw');
      await expect(c.query(`UPDATE point_ledger SET points = 999`)).rejects.toThrow(/permission denied/);
      await expect(c.query('DELETE FROM point_ledger')).rejects.toThrow(/permission denied/);
    } finally {
      await c.query('RESET ROLE').catch(() => undefined);
      await c.end();
    }
  });
});

// =============================================================================== F-08-06 dan F-14-06
describe('prasyarat QA: F-08-06 (basis waktu) dan F-14-06 (Boss)', () => {
  it('F-08-06: resume tepat sebelum menjawab tidak mereset basis bonus kecepatan (jawaban tidak dikreditkan)', async () => {
    const { u, set } = await setup();
    const s = await start(u, set.id);
    const dto = s.json.data;
    clock += 2000;
    setClockForTest(() => clock);
    await put(u, dto.id, dto.questions[0].question_id, rightOf(dto.questions[0])); // jujur: 2 dtk -> streak 1
    clock += 5 * 60_000; // berpikir 5 menit lalu "resume" untuk mereset basis
    setClockForTest(() => clock);
    expect((await start(u, set.id)).status).toBe(200);
    clock += 1000;
    setClockForTest(() => clock);
    await put(u, dto.id, dto.questions[1].question_id, rightOf(dto.questions[1]));
    const rows = (await db.execute(sql`SELECT time_spent_ms AS ms, within_target_time AS w, speed_streak_len AS s FROM attempt_answers WHERE attempt_id = ${dto.id}::uuid ORDER BY answered_at`)).rows;
    expect(rows).toEqual([{ ms: 2000, w: true, s: 1 }, { ms: 1000, w: false, s: 0 }]);
  });

  it('F-08-06: tanpa resume, berpikir lama juga tidak dikreditkan (jam server murni)', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    clock += 2000;
    setClockForTest(() => clock);
    await put(u, dto.id, dto.questions[0].question_id, rightOf(dto.questions[0]));
    clock += 5 * 60_000;
    setClockForTest(() => clock);
    await put(u, dto.id, dto.questions[1].question_id, rightOf(dto.questions[1]));
    const rows = (await db.execute(sql`SELECT time_spent_ms AS ms, within_target_time AS w FROM attempt_answers WHERE attempt_id = ${dto.id}::uuid ORDER BY answered_at`)).rows;
    expect(rows).toEqual([{ ms: 2000, w: true }, { ms: 300_000, w: false }]);
  });

  it('F-14-06: finalisasi Boss tidak menimpa time_spent_ms/within_target_time/speed_streak_len jawaban; Boss lulus -> BOSS +200 sekali, tanpa speed bonus', async () => {
    const u = await learnerSession();
    await readyTier1(u.user.id);
    const b = await makeBoss();
    const ck = { now: clock };
    const id = await playBoss(u, b, () => true, ck);
    const timing = async () => (await db.execute(sql`SELECT question_id, time_spent_ms, within_target_time, speed_streak_len FROM attempt_answers WHERE attempt_id = ${id}::uuid ORDER BY question_id`)).rows;
    const before = await timing();
    expect(before).toHaveLength(8);
    expect(before.every((r: any) => r.time_spent_ms === 2000)).toBe(true);
    const sub = await submit(u, id);
    expect(sub.status, JSON.stringify(sub.json)).toBe(200);
    expect(await timing()).toEqual(before);

    const g = sub.json.data.gamification;
    expect(g).toMatchObject({ crown: null, points: { drill: 0, speed_streak: 0, crown: 0, boss: 200, daily: 5, total: 205 } });
    const rows = await ledger(u.user.id);
    expect(rows.filter((r) => r.source === 'BOSS')).toHaveLength(1);
    expect(rows.find((r) => r.source === 'BOSS')).toMatchObject({ points: 200, source_id: id });
    expect(sumBy(rows, 'SPEED_STREAK')).toBe(0);
    expect(sub.json.data.attempt.points_awarded).toBe(0);
    expect((await statRow(u.user.id)).total_points).toBe(205);
    // idempoten
    const again = await submit(u, id);
    expect(again.json.data.gamification).toEqual(g);
    expect(await ledger(u.user.id)).toHaveLength(rows.length);
  });

  it('Boss gagal -> tidak ada poin Boss (hanya aktivitas harian)', async () => {
    const u = await learnerSession();
    await readyTier1(u.user.id);
    const b = await makeBoss();
    const id = await playBoss(u, b, () => false);
    const sub = await submit(u, id);
    expect(sub.json.data.attempt.passed).toBe(false);
    expect(sub.json.data.gamification.points).toMatchObject({ boss: 0, daily: 5, total: 5 });
    expect((await ledger(u.user.id)).map((r) => r.source)).toEqual(['DAILY']);
  });
});

// =============================================================================== Mini-Task, learn-complete, Skip
describe('Mini-Task (G6) dan aktivitas learn-complete (G7)', () => {
  it('Mini-Task SELF_CHECK: +20 sekali per sub-modul + DAILY; menyelesaikan lagi tidak menambah', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { miniTask: 'SELF_CHECK' });
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    const mini = () => call(postMini, 'POST', `/api/v1/sub-modules/${id}/mini-task/complete`, { cookie: u.cookie, params: { sub_module: id } });
    expect((await mini()).status).toBe(200);
    expect((await mini()).status).toBe(200);
    const rows = await ledger(u.user.id);
    expect(rows.map((r) => [r.source, r.points])).toEqual([['MINI_TASK', 20], ['DAILY', 5]]);
    expect(rows[0].source_id).toBe(id);
    expect(rows[0].note).toBe('Mini-Task 1.1.1');
    expect((await statRow(u.user.id)).total_points).toBe(25);
  });

  it('learn-complete mencatat aktivitas harian (+5) sekali; ulang di hari sama tidak menambah', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await call((await import('@/app/api/v1/sub-modules/[sub_module]/route')).GET, 'GET', `/api/v1/sub-modules/1.1.1`, { cookie: u.cookie, params: { sub_module: '1.1.1' } });
    await db.execute(sql`UPDATE user_sub_module_progress SET learn_active_seconds = 600, learn_visited_subtabs = ARRAY['ARTICLE'] WHERE user_id = ${u.user.id}::uuid AND sub_module_id = ${id}::uuid`);
    const done = () => call(postComplete, 'POST', `/api/v1/sub-modules/${id}/learn-complete`, { cookie: u.cookie, params: { sub_module: id } });
    const r = await done();
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect((await done()).status).toBe(200);
    expect((await ledger(u.user.id)).map((x) => [x.source, x.points])).toEqual([['DAILY', 5]]);
    expect(await statRow(u.user.id)).toMatchObject({ total_points: 5, daily_streak_days: 1 });
  });
});

describe('streak harian (G7/G9) lewat recordActivity dan GET /me/stats', () => {
  const act = (userId: string, ms: number) => db.transaction((tx) => recordActivity(tx, userId, new Date(ms)));
  const WIB = (d: string, hhmm: string) => Date.parse(`${d}T${hhmm}:00+07:00`);

  it('AC: 3 Nov 10:00, 4 Nov 09:00, 6 Nov -> streak 1, 2, 1; longest 2; dua aktivitas di hari sama -> DAILY sekali', async () => {
    const { user } = await makeUser();
    const out = [];
    out.push((await act(user.id, WIB('2026-11-03', '10:00'))).dailyStreakDays);
    await act(user.id, WIB('2026-11-03', '18:00')); // hari sama
    out.push((await act(user.id, WIB('2026-11-04', '09:00'))).dailyStreakDays);
    out.push((await act(user.id, WIB('2026-11-06', '09:00'))).dailyStreakDays);
    expect(out).toEqual([1, 2, 1]);
    expect(await statRow(user.id)).toMatchObject({ daily_streak_days: 1, longest_daily_streak: 2, total_points: 15 });
    expect(sumBy(await ledger(user.id), 'DAILY')).toBe(15);
    expect((await ledger(user.id)).filter((r) => r.source === 'DAILY')).toHaveLength(3);
  });

  it('23:59 WIB lalu 00:01 WIB = dua hari berbeda; dengan APP_TIMEZONE=UTC 16:59 dan 17:01 UTC hari yang sama', async () => {
    const a = await makeUser();
    await act(a.user.id, Date.parse('2026-11-03T16:59:00Z'));
    expect((await act(a.user.id, Date.parse('2026-11-03T17:01:00Z'))).dailyStreakDays).toBe(2);
    process.env.APP_TIMEZONE = 'UTC';
    const b = await makeUser();
    await act(b.user.id, Date.parse('2026-11-03T16:59:00Z'));
    expect((await act(b.user.id, Date.parse('2026-11-03T17:01:00Z'))).dailyStreakDays).toBe(1);
    expect(sumBy(await ledger(b.user.id), 'DAILY')).toBe(5);
  });

  it('klien tidak dapat memanipulasi streak: header zona/waktu diabaikan; hanya jam server + APP_TIMEZONE', async () => {
    const { u, set } = await setup();
    at(Date.parse('2026-11-03T16:59:00Z'));
    const first = await start(u, set.id);
    clock += 1000;
    setClockForTest(() => clock);
    await put(u, first.json.data.id, first.json.data.questions[0].question_id, rightOf(first.json.data.questions[0]));
    const res = await call(statsRoute, 'GET', '/api/v1/me/stats', { cookie: u.cookie, headers: { 'time-zone': 'Pacific/Kiritimati', 'x-timezone': 'Pacific/Kiritimati', date: 'Tue, 01 Jan 2030 00:00:00 GMT' } });
    expect(res.status).toBe(200);
    expect(res.json.data.last_active_date).toBeNull(); // belum ada aktivitas selesai; tidak terpengaruh header
  });

  it('GET /me/stats: last_active 3 hari lalu -> streak 0 & tidak berisiko; kemarin -> berisiko; pengguna baru -> semua 0', async () => {
    const u = await learnerSession();
    expect((await stats(u)).json.data).toEqual({ total_points: 0, daily_streak_days: 0, longest_daily_streak: 0, best_speed_streak: 0, gold_crowns: 0, silver_crowns: 0, last_active_date: null, streak_at_risk: false });
    await db.execute(sql`INSERT INTO user_stats (user_id, total_points, daily_streak_days, longest_daily_streak, last_active_date) VALUES (${u.user.id}::uuid, 365, 5, 7, ${new Date(T0 - 3 * DAY).toISOString()}::timestamptz) ON CONFLICT (user_id) DO UPDATE SET total_points = 365, daily_streak_days = 5, longest_daily_streak = 7, last_active_date = ${new Date(T0 - 3 * DAY).toISOString()}::timestamptz`);
    expect((await stats(u)).json.data).toMatchObject({ total_points: 365, daily_streak_days: 0, longest_daily_streak: 7, last_active_date: '2026-10-31', streak_at_risk: false });
    await db.execute(sql`UPDATE user_stats SET last_active_date = ${new Date(T0 - DAY).toISOString()}::timestamptz WHERE user_id = ${u.user.id}::uuid`);
    expect((await stats(u)).json.data).toMatchObject({ daily_streak_days: 5, last_active_date: '2026-11-02', streak_at_risk: true });
    await db.execute(sql`UPDATE user_stats SET last_active_date = ${new Date(T0).toISOString()}::timestamptz WHERE user_id = ${u.user.id}::uuid`);
    expect((await stats(u)).json.data).toMatchObject({ daily_streak_days: 5, last_active_date: '2026-11-03', streak_at_risk: false });
  });

  it('pengguna baru lewat insertUser mendapat baris user_stats (userCreatedHooks)', async () => {
    const email = uniqueEmail('stats');
    const row = await db.transaction(async (tx) => insertUser(tx, { email, displayName: 'Baru', passwordHash: await hashPassword(STRONG_PASSWORD), role: 'learner', mustChangePassword: false }));
    expect(await statRow(row.id)).toMatchObject({ total_points: 0, daily_streak_days: 0, last_active_date: null });
  });
});

describe('GET /me/points', () => {
  it('urut id DESC, hanya milik sendiri, paginasi, page_size 51 -> 400', async () => {
    const a = await learnerSession();
    const b = await learnerSession();
    const sid = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
    for (let i = 0; i < 25; i++) {
      await db.execute(sql`INSERT INTO point_ledger (user_id, source, source_id, points, note) VALUES (${a.user.id}::uuid, 'DAILY', NULL, 5, ${`n${i}`})`);
    }
    await db.execute(sql`INSERT INTO point_ledger (user_id, source, source_id, points, note) VALUES (${b.user.id}::uuid, 'CROWN', ${sid}::uuid, 50, 'milik B')`);
    const p1 = await points(a);
    expect(p1.status).toBe(200);
    expect(PointsResponseSchema.safeParse(p1.json).success).toBe(true);
    expect(p1.json.meta).toEqual({ page: 1, page_size: 20, total: 25 });
    expect(p1.json.data).toHaveLength(20);
    const ids = p1.json.data.map((r: any) => r.id);
    expect([...ids].sort((x: number, y: number) => y - x)).toEqual(ids);
    expect(JSON.stringify(p1.json)).not.toContain('milik B');
    const p2 = await points(a, '?page=2&page_size=20');
    expect(p2.json.data).toHaveLength(5);
    expect(p2.json.data[0].id).toBeLessThan(ids[19]);
    const pb = await points(b);
    expect(pb.json.data).toHaveLength(1);
    expect(pb.json.data[0]).toMatchObject({ source: 'CROWN', points: 50, source_id: sid, note: 'milik B' });
    const bad = await points(a, '?page_size=51');
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe('VALIDATION_ERROR');
    expect((await points(a, '?page=0')).status).toBe(400);
  });
});

describe('Skip Test: tanpa poin, hanya aktivitas harian', () => {
  it('hook pada tipe Skip memanggil recordActivity saja (DAILY +5, tanpa DRILL/CROWN) dan blok gamifikasi null', async () => {
    const { gamificationHook } = await import('@/server/gamification/service');
    const u = await makeUser();
    await db.transaction((tx) =>
      gamificationHook({
        tx,
        userId: u.user.id,
        attempt: { id: '00000000-0000-4000-8000-000000000001', resultJson: {} } as any,
        set: { assessmentType: 'SKIP_MODULE_TEST', id: '00000000-0000-4000-8000-000000000002', subModuleId: null } as any,
        result: { passed: true, rawH: 100, maxH: 100 } as any,
      }),
    );
    expect((await ledger(u.user.id)).map((r) => [r.source, r.points])).toEqual([['DAILY', 5]]);
    // Placement tidak dicatat sebagai aktivitas
    const p = await makeUser();
    await db.transaction((tx) =>
      gamificationHook({ tx, userId: p.user.id, attempt: { id: '00000000-0000-4000-8000-000000000003', resultJson: {} } as any, set: { assessmentType: 'PLACEMENT_TEST', id: '00000000-0000-4000-8000-000000000004', subModuleId: null } as any, result: { passed: null, rawH: 0, maxH: 0 } as any }),
    );
    expect(await ledger(p.user.id)).toHaveLength(0);
  });
});

describe('QA W8: F-16-01 batas manusia untuk speed streak', () => {
  it('jawaban benar beruntun berselang 50 ms: time_spent jujur, tanpa kredit within_target, speed streak 0 dan tanpa bonus SPEED_STREAK', async () => {
    const { u, set } = await setup();
    const { id, res } = await runDrill(u, set.id, Array.from({ length: 10 }, () => R(50)));
    const rows = (await db.execute(sql`SELECT time_spent_ms AS ms, within_target_time AS w, speed_streak_len AS s FROM attempt_answers WHERE attempt_id = ${id}::uuid ORDER BY answered_at`)).rows as any[];
    expect(rows.map((r) => r.ms)).toEqual(Array(10).fill(50));
    expect(rows.every((r) => r.w === false && r.s === 0)).toBe(true);
    expect(res.gamification.points).toMatchObject({ drill: 100, speed_streak: 0 });
    expect(res.gamification.best_speed_streak).toBe(0);
    expect(await statRow(u.user.id)).toMatchObject({ best_speed_streak: 0 });
  });

  it('tepat 2000 ms dikreditkan; 1999 ms tidak', async () => {
    const { u, set } = await setup();
    const { id } = await runDrill(u, set.id, [R(2000), R(2000), R(1999), R(2000)], { submit: false });
    const rows = (await db.execute(sql`SELECT within_target_time AS w, speed_streak_len AS s FROM attempt_answers WHERE attempt_id = ${id}::uuid ORDER BY answered_at`)).rows as any[];
    expect(rows.map((r) => [r.w, r.s])).toEqual([[true, 1], [true, 2], [false, 0], [true, 1]]);
  });
});

describe('QA W8: F-16-04 riwayat poin menyaring ADJUSTMENT', () => {
  it('baris ADJUSTMENT tidak muncul di /me/points dan tidak dihitung di meta.total; sumber lain tetap', async () => {
    const u = await learnerSession();
    await db.execute(sql`INSERT INTO point_ledger (user_id, source, points, note) VALUES (${u.user.id}::uuid, 'ADJUSTMENT', 25, 'koreksi admin')`);
    await db.execute(sql`INSERT INTO point_ledger (user_id, source, points, note) VALUES (${u.user.id}::uuid, 'DAILY', 5, NULL)`);
    const r = await points(u);
    expect(r.status).toBe(200);
    expect(PointsResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data.map((x: any) => x.source)).toEqual(['DAILY']);
    expect(r.json.meta.total).toBe(1);
  });
});
