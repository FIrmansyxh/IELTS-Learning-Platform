/**
 * Integrasi SPEC-017 (TASK-017): radar 6 sumbu, prediksi band, riwayat. Data sumber diisi langsung ke DB agar vektor uji
 * deterministik; alur nyata diuji lewat Drill (route), Boss (route), dan penilaian AI Mini-Task (worker + LLM mock).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { aiEvaluations, assessmentSets, attemptAnswers, attempts, submissions } from '@/db/schema';
import { BandPredictionsResponseSchema, ExamHistoryResponseSchema, RadarResponseSchema } from '@/contracts/skills';
import { evaluationGradedHooks } from '@/server/ai/hooks';
import { attemptCompletedHooks } from '@/server/attempts/hooks';
import { setClockForTest } from '@/server/clock';
import { closeDb, getDb } from '@/server/db';
import { activateTable, createTable } from '@/server/band/service';
import { BAND_SEED_LABEL } from '@/server/band/seed-data';
import { gamificationHook } from '@/server/gamification/service';
import { resetRateLimits } from '@/server/http/rate-limit';
import { getRadar, recomputeAi, recomputeObjective, skillScoreEvaluationHook, skillScoreHook } from '@/server/skills/service';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as radarRoute } from '@/app/api/v1/me/skills/radar/route';
import { GET as predRoute } from '@/app/api/v1/me/band-predictions/route';
import { GET as historyRoute } from '@/app/api/v1/me/exam-history/route';
import { call, adminSession, learnerSession } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial } from './learning-fixtures';
import { makeBoss, playBoss, readyTier1 } from './boss-fixtures';
import { latestJobId, miniTaskUser, postWriting, resetAi, runJob, words } from './ai-helpers';
import { Q } from '../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = getDb();
type L = Awaited<ReturnType<typeof learnerSession>>;

const radar = (u: L) => call(radarRoute, 'GET', '/api/v1/me/skills/radar', { cookie: u.cookie });
const preds = (u: L, q = '') => call(predRoute, 'GET', `/api/v1/me/band-predictions${q}`, { cookie: u.cookie });
const history = (u: L, q = '') => call(historyRoute, 'GET', `/api/v1/me/exam-history${q}`, { cookie: u.cookie });
const skillOf = (r: any, s: string) => r.json.data.skills.find((x: any) => x.skill === s);

const T0 = Date.parse('2026-11-03T03:00:00.000Z');

let setId: string;
async function baseSet() {
  await seedMaterial('1.1.1');
  const q = Array.from({ length: 2 }, (_, i) => Q.mcq({ question_id: `Q-X${i + 1}` }));
  setId = (await addDrill('1.1.1', q)).id;
}

/** Sisipkan attempt + jawaban objektif langsung (pola benar/salah/null), waktu menurun dari `startMs`. */
let qSeq = 0;
async function addAnswers(userId: string, skill: string, pattern: Array<boolean | null>, opts: { status?: 'GRADED' | 'EXPIRED' | 'IN_PROGRESS' | 'ABANDONED'; startMs?: number; qprefix?: string } = {}) {
  const start = opts.startMs ?? T0;
  // F-17-01: sampel dideduplikasi per soal; secara default tiap pemanggilan memakai id soal baru (soal berbeda).
  const prefix = opts.qprefix ?? `u${++qSeq}`;
  const [a] = await db
    .insert(attempts)
    .values({ userId, assessmentSetId: setId, assessmentVersion: 1, mode: 'PRACTICE', status: opts.status ?? 'GRADED', startedAt: new Date(start), createdAt: new Date(start), updatedAt: new Date(start), state: {} })
    .returning();
  await db.insert(attemptAnswers).values(
    pattern.map((c, i) => ({
      attemptId: a!.id,
      assessmentSetId: setId,
      questionId: `Q-${skill}-${prefix}-${i}`,
      questionType: c === null ? 'WRITING_TASK' : 'MCQ_SINGLE',
      skill: skill as 'LISTENING',
      response: {},
      isCorrect: c,
      score: c ? '1.00' : '0.00',
      answeredAt: new Date(start + i * 1000),
    })),
  );
  return a!.id;
}
const bits = (correct: number, total: number): boolean[] => Array.from({ length: total }, (_, i) => i < correct);
const recompute = (userId: string, skill: 'LISTENING' | 'READING' | 'GRAMMAR' | 'VOCAB') => db.transaction((tx) => recomputeObjective(tx, userId, skill));
const scoreRows = async (userId: string) => (await db.execute(sql`SELECT skill, score_percent::float AS p, estimated_band::float AS b, sample_size AS n FROM user_skill_scores WHERE user_id = ${userId}::uuid ORDER BY skill`)).rows as any[];
const predRows = async (userId: string) => (await db.execute(sql`SELECT overall_band::float AS b, components, trigger, attempt_id FROM user_band_predictions WHERE user_id = ${userId}::uuid ORDER BY created_at, id`)).rows as any[];

let subSeq = 0;
/** Sisipkan submission + evaluasi; `created` menentukan "terbaru". */
async function addSub(userId: string, kind: string, createdMs: number, evals: Array<{ band: number | null; method?: 'AI_LOCAL' | 'SELF_ASSESSMENT'; injection?: boolean; run?: number; flags?: object }>) {
  const [s] = await db
    .insert(submissions)
    .values({ userId, kind: kind as 'WRITING_TASK2', promptSnapshot: `soal ${++subSeq}`, responseText: 'x', status: 'GRADED', createdAt: new Date(createdMs), updatedAt: new Date(createdMs) })
    .returning();
  for (const [i, e] of evals.entries()) {
    await db.insert(aiEvaluations).values({
      submissionId: s!.id,
      runNumber: e.run ?? i + 1,
      method: e.method ?? 'AI_LOCAL',
      overallBand: e.band === null ? null : e.band.toFixed(1),
      flags: e.flags ?? (e.injection === undefined ? {} : { injection_suspected: e.injection }),
    });
  }
  return s!;
}
const recomputeW = (userId: string) => db.transaction((tx) => recomputeAi(tx, userId, 'WRITING'));

beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
  await db.execute(sql`DELETE FROM submissions`);
  setClockForTest(null);
  await baseSet();
});
afterAll(async () => {
  await resetAi();
  await db.execute(sql`DELETE FROM content_assets`);
  await closeDb();
});

// =============================================================================== kontrak dasar dan pengguna kosong
describe('GET /me/skills/radar: bentuk dasar', () => {
  it('pengguna tanpa jawaban: 200, 6 elemen berurutan, semua null/0, prediksi kosong, target_band null, disclaimer', async () => {
    const u = await learnerSession();
    const r = await radar(u);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(RadarResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d.skills.map((s: any) => s.skill)).toEqual(['LISTENING', 'READING', 'WRITING', 'SPEAKING', 'GRAMMAR', 'VOCAB']);
    expect(d.skills.every((s: any) => s.score_percent === null && s.estimated_band === null && s.sample_size === 0 && s.updated_at === null)).toBe(true);
    expect(d.skills.map((s: any) => s.is_proxy)).toEqual([false, false, false, false, true, true]);
    expect(d.target_band).toBeNull();
    expect(d.prediction).toMatchObject({ overall_band: null, indicative_band: null, range_low: null, range_high: null, complete: false, components: { LISTENING: null, READING: null, WRITING: null, SPEAKING: null } });
    expect(d.disclaimer).toBe('Perkiraan latihan, bukan skor resmi IELTS.');
  });

  it('target_band pengguna disertakan', async () => {
    const u = await learnerSession({ targetBand: '6.5' });
    expect((await radar(u)).json.data.target_band).toBe(6.5);
  });

  it('endpoint memerlukan sesi (401) dan tidak menerima parameter user_id', async () => {
    expect((await call(radarRoute, 'GET', '/api/v1/me/skills/radar')).status).toBe(401);
    expect((await call(predRoute, 'GET', '/api/v1/me/band-predictions')).status).toBe(401);
    expect((await call(historyRoute, 'GET', '/api/v1/me/exam-history')).status).toBe(401);
    const u = await learnerSession();
    const other = await learnerSession();
    await db.transaction((tx) => tx.execute(sql`SELECT 1`));
    const r = await call(historyRoute, 'GET', `/api/v1/me/exam-history?user_id=${other.user.id}`, { cookie: u.cookie });
    expect(r.status).toBe(400); // strictObject: user_id tidak dikenal
  });
});

// =============================================================================== R1 skill objektif
describe('R1: skill objektif', () => {
  it('vektor uji: 50 jawaban LISTENING dengan 40 benar -> 80,00, raw_40 32, band 7.5, sample 50', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'LISTENING', bits(40, 50));
    await recompute(u.user.id, 'LISTENING');
    const r = skillOf(await radar(u), 'LISTENING');
    expect(r).toMatchObject({ score_percent: 80, estimated_band: 7.5, sample_size: 50, is_proxy: false });
    expect(typeof r.updated_at).toBe('string');
  });

  it('60 jawaban: hanya 50 TERBARU dipakai (10 tertua yang salah diabaikan)', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'LISTENING', Array(10).fill(false), { startMs: T0 - 3_600_000 }); // lebih lama
    await addAnswers(u.user.id, 'LISTENING', bits(40, 50), { startMs: T0 });
    await recompute(u.user.id, 'LISTENING');
    expect(skillOf(await radar(u), 'LISTENING')).toMatchObject({ score_percent: 80, estimated_band: 7.5, sample_size: 50 });
  });

  it('9 jawaban READING (6 benar) -> 66,67 dan band null; tepat 10 -> band dihitung (batas inklusif, F-17-02)', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'READING', bits(6, 9));
    await recompute(u.user.id, 'READING');
    expect(skillOf(await radar(u), 'READING')).toMatchObject({ score_percent: 66.67, estimated_band: null, sample_size: 9 });
    await addAnswers(u.user.id, 'READING', [true], { startMs: T0 + 100_000 });
    await recompute(u.user.id, 'READING');
    // 7 benar / 10 -> raw_40 = 28 -> tabel Reading 27-29 = 6.5
    expect(skillOf(await radar(u), 'READING')).toMatchObject({ score_percent: 70, estimated_band: 6.5, sample_size: 10 });
  });

  it('F-17-01: mengulang soal yang sama tidak menggelembungkan sampel; yang dihitung jawaban TERBARU per soal', async () => {
    const u = await learnerSession();
    // satu Drill 10 soal diulang 5 kali (attempt 1: 4 benar; attempt 2-5: semua benar dari hafalan)
    await addAnswers(u.user.id, 'READING', bits(4, 10), { qprefix: 'same', startMs: T0 });
    for (let k = 1; k <= 4; k++) await addAnswers(u.user.id, 'READING', Array(10).fill(true), { qprefix: 'same', startMs: T0 + k * 100_000 });
    await recompute(u.user.id, 'READING');
    // 10 soal unik (bukan 50 jawaban): sampel 10, semua benar menurut jawaban terbaru
    expect(skillOf(await radar(u), 'READING')).toMatchObject({ sample_size: 10, score_percent: 100, estimated_band: 9 });
    // jawaban terbaru yang SALAH menggantikan jawaban benar sebelumnya untuk soal itu
    await addAnswers(u.user.id, 'READING', [false], { qprefix: 'same', startMs: T0 + 900_000 });
    await recompute(u.user.id, 'READING');
    expect(skillOf(await radar(u), 'READING')).toMatchObject({ sample_size: 10, score_percent: 90 });
    // 5 pengulangan satu Drill 5 soal: sampel hanya 5 -> band null
    const v = await learnerSession();
    for (let k = 0; k < 5; k++) await addAnswers(v.user.id, 'LISTENING', Array(5).fill(true), { qprefix: 'five', startMs: T0 + k * 100_000 });
    await recompute(v.user.id, 'LISTENING');
    expect(skillOf(await radar(v), 'LISTENING')).toMatchObject({ sample_size: 5, estimated_band: null });
  });

  it('GRAMMAR 12/20 -> 60,00, band 6.0 (tabel Reading, raw_40 24), is_proxy=true; VOCAB tanpa sampel tetap null', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'GRAMMAR', bits(12, 20));
    await recompute(u.user.id, 'GRAMMAR');
    const r = await radar(u);
    expect(skillOf(r, 'GRAMMAR')).toMatchObject({ score_percent: 60, estimated_band: 6, sample_size: 20, is_proxy: true });
    expect(skillOf(r, 'VOCAB')).toMatchObject({ score_percent: null, estimated_band: null, sample_size: 0, is_proxy: true });
  });

  it('soal AI (is_correct null) tidak masuk sampel; attempt IN_PROGRESS dan ABANDONED tidak dihitung; EXPIRED dihitung', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'READING', [true, null, null, false], { status: 'GRADED' }); // 2 objektif (1 benar)
    await addAnswers(u.user.id, 'READING', Array(10).fill(true), { status: 'IN_PROGRESS', startMs: T0 + 50_000 });
    await addAnswers(u.user.id, 'READING', Array(10).fill(true), { status: 'ABANDONED', startMs: T0 + 60_000 });
    await recompute(u.user.id, 'READING');
    expect(skillOf(await radar(u), 'READING')).toMatchObject({ score_percent: 50, sample_size: 2, estimated_band: null });
    await addAnswers(u.user.id, 'READING', [true, true, true], { status: 'EXPIRED', startMs: T0 + 70_000 });
    await recompute(u.user.id, 'READING');
    expect(skillOf(await radar(u), 'READING')).toMatchObject({ sample_size: 5, score_percent: 80, estimated_band: null });
  });

  it('hitung ulang dua kali pada data sama: baris skor identik (kecuali updated_at) dan tidak ada baris ganda', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'LISTENING', bits(40, 50));
    await recompute(u.user.id, 'LISTENING');
    const a = await scoreRows(u.user.id);
    await recompute(u.user.id, 'LISTENING');
    expect(await scoreRows(u.user.id)).toEqual(a);
    expect(a).toHaveLength(1);
  });

  it('tabel band aktif berganti: memakai tabel baru pada pemicu berikutnya; nilai lama tidak berubah sebelum itu', async () => {
    const admin = await adminSession();
    const u = await learnerSession();
    await addAnswers(u.user.id, 'LISTENING', bits(40, 50));
    await recompute(u.user.id, 'LISTENING');
    expect(skillOf(await radar(u), 'LISTENING').estimated_band).toBe(7.5);
    const t = await createTable(admin.user.id, { skill: 'LISTENING', version_label: `uji-${Date.now()}`, rows: [{ raw_min: 0, raw_max: 19, band: 4 }, { raw_min: 20, raw_max: 40, band: 8.5 }] });
    await activateTable(admin.user.id, t.id);
    try {
      expect(skillOf(await radar(u), 'LISTENING').estimated_band).toBe(7.5); // belum ada pemicu
      await recompute(u.user.id, 'LISTENING');
      expect(skillOf(await radar(u), 'LISTENING').estimated_band).toBe(8.5);
    } finally {
      const seed = (await db.execute(sql`SELECT id FROM band_conversion_tables WHERE skill = 'LISTENING' AND version_label = ${BAND_SEED_LABEL}`)).rows[0] as any;
      await activateTable(admin.user.id, seed.id);
    }
  });

  it('tabel band tidak aktif (galat konfigurasi): score_percent tetap ditulis, estimated_band null, radar tidak gagal', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'LISTENING', bits(40, 50));
    await db.execute(sql`UPDATE band_conversion_tables SET is_active = false WHERE skill = 'LISTENING' AND version_label = ${BAND_SEED_LABEL}`);
    try {
      await recompute(u.user.id, 'LISTENING');
    } finally {
      await db.execute(sql`UPDATE band_conversion_tables SET is_active = true WHERE skill = 'LISTENING' AND version_label = ${BAND_SEED_LABEL}`);
    }
    const r = await radar(u);
    expect(r.status).toBe(200);
    expect(skillOf(r, 'LISTENING')).toMatchObject({ score_percent: 80, estimated_band: null, sample_size: 50 });
  });
});

// =============================================================================== R2 skill AI
describe('R2: Writing/Speaking dari evaluasi AI', () => {
  it('evaluasi AI_LOCAL [6.0, 6.5, 5.5] -> band 6.0, 66,67%, sample 3; submission ke-4 menggeser yang tertua', async () => {
    const u = await learnerSession();
    const base = T0;
    await addSub(u.user.id, 'WRITING_TASK2', base + 1000, [{ band: 6.0 }]);
    await addSub(u.user.id, 'WRITING_TASK2', base + 2000, [{ band: 6.5 }]);
    await addSub(u.user.id, 'MINI_TASK_WRITING', base + 3000, [{ band: 5.5 }]);
    await recomputeW(u.user.id);
    expect(skillOf(await radar(u), 'WRITING')).toMatchObject({ score_percent: 66.67, estimated_band: 6, sample_size: 3, is_proxy: false });
    await addSub(u.user.id, 'WRITING_TASK1', base + 4000, [{ band: 7.0 }]); // menggeser 6.0
    await recomputeW(u.user.id);
    // (6.5 + 5.5 + 7.0) / 3 = 6.333 -> 6.5
    expect(skillOf(await radar(u), 'WRITING')).toMatchObject({ estimated_band: 6.5, sample_size: 3, score_percent: 72.22 });
  });

  it('hanya SELF_ASSESSMENT atau injection_suspected=true -> WRITING tanpa baris skor; campuran: yang valid saja', async () => {
    const u = await learnerSession();
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 1000, [{ band: 8.0, method: 'SELF_ASSESSMENT' }]);
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 2000, [{ band: 8.5, injection: true }]);
    await recomputeW(u.user.id);
    const r = await radar(u);
    expect(skillOf(r, 'WRITING')).toMatchObject({ score_percent: null, estimated_band: null, sample_size: 0 });
    expect((await scoreRows(u.user.id)).filter((x) => x.skill === 'WRITING')).toHaveLength(0);
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 3000, [{ band: 6.0 }]);
    await recomputeW(u.user.id);
    expect(skillOf(await radar(u), 'WRITING')).toMatchObject({ estimated_band: 6, sample_size: 1 });
  });

  it('evaluasi tanpa flags (data lama) dianggap injection_suspected=false; overall_band null dilewati', async () => {
    const u = await learnerSession();
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 1000, [{ band: 7.0, flags: {} }]);
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 2000, [{ band: null }]);
    await recomputeW(u.user.id);
    expect(skillOf(await radar(u), 'WRITING')).toMatchObject({ estimated_band: 7, sample_size: 1 });
  });

  it('per submission dipakai evaluasi memenuhi syarat dengan run tertinggi (run 2 injeksi -> run 1)', async () => {
    const u = await learnerSession();
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 1000, [{ band: 6.0, run: 1 }, { band: 8.0, run: 2, injection: true }]);
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 2000, [{ band: 5.0, run: 1 }, { band: 7.0, run: 2 }]);
    await recomputeW(u.user.id);
    // (6.0 + 7.0) / 2 = 6.5
    expect(skillOf(await radar(u), 'WRITING')).toMatchObject({ estimated_band: 6.5, sample_size: 2 });
  });

  it('SPEAKING hanya menghitung kind Speaking; Writing tidak bocor ke Speaking', async () => {
    const u = await learnerSession();
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 1000, [{ band: 4.0 }]);
    await addSub(u.user.id, 'SPEAKING_PART2', T0 + 2000, [{ band: 7.0 }]);
    await addSub(u.user.id, 'MINI_TASK_SPEAKING', T0 + 3000, [{ band: 6.0 }]);
    await db.transaction((tx) => recomputeAi(tx, u.user.id, 'SPEAKING'));
    await recomputeW(u.user.id);
    const r = await radar(u);
    expect(skillOf(r, 'SPEAKING')).toMatchObject({ estimated_band: 6.5, sample_size: 2 });
    expect(skillOf(r, 'WRITING')).toMatchObject({ estimated_band: 4, sample_size: 1 });
  });
});

// =============================================================================== R4/R5 prediksi dan riwayat
describe('R4/R5: prediksi dan riwayat', () => {
  const evalCtx = (tx: any, userId: string, kind: string) => ({ tx, userId, submissionId: '00000000-0000-4000-8000-000000000001', kind, subModuleId: null, evaluationId: '00000000-0000-4000-8000-000000000002', method: 'AI_LOCAL' as const, overallBand: 6, flags: {} as any });

  it('prediksi lengkap (7.0, 6.0, 6.0, 6.5) -> overall 6.5, rentang 6.0-7.0; sebagian -> indikatif', async () => {
    const u = await learnerSession();
    await db.execute(sql`INSERT INTO user_skill_scores (user_id, skill, score_percent, estimated_band, sample_size) VALUES
      (${u.user.id}::uuid, 'LISTENING', 70, 7.0, 40), (${u.user.id}::uuid, 'READING', 60, 6.0, 35), (${u.user.id}::uuid, 'WRITING', 60, 6.0, 1)`);
    let p = (await radar(u)).json.data.prediction;
    expect(p).toMatchObject({ overall_band: null, indicative_band: 6.5, complete: false }); // (7+6+6)/3 = 6.33 -> 6.5
    await db.execute(sql`INSERT INTO user_skill_scores (user_id, skill, score_percent, estimated_band, sample_size) VALUES (${u.user.id}::uuid, 'SPEAKING', 70, 6.5, 1)`);
    p = (await radar(u)).json.data.prediction;
    expect(p).toMatchObject({ overall_band: 6.5, complete: true, range_low: 6, range_high: 7, sample_size: 35, low_sample: false, basis_note: 'Berdasarkan Listening, Reading, Writing, dan Speaking.' });
    // F-17-02: sampel objektif terkecil < 30 -> rentang +/-1,0 dan low_sample
    await db.execute(sql`UPDATE user_skill_scores SET sample_size = 12 WHERE user_id = ${u.user.id}::uuid AND skill = 'READING'`);
    p = (await radar(u)).json.data.prediction;
    expect(p).toMatchObject({ overall_band: 6.5, range_low: 5.5, range_high: 7.5, sample_size: 12, low_sample: true });
    expect(p.basis_note).toContain('Sampel masih kecil (12 soal)');
    expect(RadarResponseSchema.safeParse({ data: (await radar(u)).json.data }).success).toBe(true);
  });

  it('RECALC: ditulis hanya bila x berubah; hitung ulang pada data sama tidak menambah baris', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'LISTENING', bits(40, 50));
    const run = () => db.transaction(async (tx) => {
      await recomputeObjective(tx, u.user.id, 'LISTENING');
      await skillScoreEvaluationHook(evalCtx(tx, u.user.id, 'WRITING_TASK2') as any);
    });
    await run();
    let rows = await predRows(u.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ b: 7.5, trigger: 'RECALC', attempt_id: null, components: { LISTENING: 7.5, READING: null, WRITING: null, SPEAKING: null } });
    await run();
    expect(await predRows(u.user.id)).toHaveLength(1); // x sama
    await addSub(u.user.id, 'WRITING_TASK2', T0 + 9000, [{ band: 5.5 }]);
    await db.transaction((tx) => skillScoreEvaluationHook(evalCtx(tx, u.user.id, 'WRITING_TASK2') as any));
    rows = await predRows(u.user.id);
    expect(rows).toHaveLength(2); // (7.5 + 5.5) / 2 = 6.5
    expect(rows[1]).toMatchObject({ b: 6.5, trigger: 'RECALC' });
    // kind non-W/S diabaikan
    await db.transaction((tx) => skillScoreEvaluationHook(evalCtx(tx, u.user.id, 'LAINNYA') as any));
    expect(await predRows(u.user.id)).toHaveLength(2);
  });

  it('GET /me/band-predictions: urut created_at ASC, paginasi, tenant, page_size > 100 -> 400', async () => {
    const a = await learnerSession();
    const b = await learnerSession();
    for (let i = 0; i < 3; i++) {
      await db.execute(sql`INSERT INTO user_band_predictions (user_id, overall_band, components, trigger, created_at) VALUES (${a.user.id}::uuid, ${5 + i * 0.5}, '{"LISTENING":5.5,"READING":4.5,"WRITING":null,"SPEAKING":null}'::jsonb, 'RECALC', ${new Date(T0 + i * 1000).toISOString()}::timestamptz)`);
    }
    await db.execute(sql`INSERT INTO user_band_predictions (user_id, overall_band, components, trigger) VALUES (${b.user.id}::uuid, 9, '{"LISTENING":9,"READING":9,"WRITING":9,"SPEAKING":9}'::jsonb, 'RECALC')`);
    const r = await preds(a);
    expect(r.status).toBe(200);
    expect(BandPredictionsResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data.map((x: any) => x.overall_band)).toEqual([5, 5.5, 6]);
    expect(r.json.meta).toEqual({ page: 1, page_size: 20, total: 3 });
    expect(r.json.data[0]).toMatchObject({ trigger: 'RECALC', attempt_id: null, components: { LISTENING: 5.5, READING: 4.5, WRITING: null, SPEAKING: null } });
    const p2 = await preds(a, '?page=2&page_size=2');
    expect(p2.json.data.map((x: any) => x.overall_band)).toEqual([6]);
    expect((await preds(a, '?page_size=101')).status).toBe(400);
    expect((await preds(b)).json.data.map((x: any) => x.overall_band)).toEqual([9]);
  });
});

// =============================================================================== alur nyata
describe('alur nyata: Drill, Boss, penilaian AI', () => {
  it('Drill GRAMMAR lewat route: submit mengisi GRAMMAR (proksi) di radar; urutan hook = gamifikasi lalu skor skill', async () => {
    expect(attemptCompletedHooks.indexOf(gamificationHook)).toBeGreaterThanOrEqual(0);
    expect(attemptCompletedHooks.indexOf(gamificationHook)).toBeLessThan(attemptCompletedHooks.indexOf(skillScoreHook));
    expect(evaluationGradedHooks).toContain(skillScoreEvaluationHook);

    await resetLearning();
    await seedMaterial('1.1.1');
    await seedMaterial('1.1.2');
    const qs = Array.from({ length: 10 }, (_, i) => Q.mcq({ question_id: `Q-G${i + 1}`, prompt: `P${i + 1}`, options: [`right-${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-${i + 1}`], explanation_id: 'p' }));
    const set = await addDrill('1.1.1', qs);
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    const s = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: set.id } });
    const dto = s.json.data;
    for (const [i, q] of dto.questions.entries()) {
      const opt = (t: string) => q.options.find((o: any) => o.text === t).option_id;
      const r = await call(putRoute, 'PUT', `/api/v1/attempts/${dto.id}/answers/${q.question_id}`, { cookie: u.cookie, params: { attempt_id: dto.id, question_id: q.question_id }, body: { response: { option_ids: [opt(i < 7 ? `right-${q.prompt.slice(1)}` : 'x')] } } });
      expect(r.status).toBe(200);
    }
    const sub = await call(submitRoute, 'POST', `/api/v1/attempts/${dto.id}/submit`, { cookie: u.cookie, params: { attempt_id: dto.id } });
    expect(sub.status, JSON.stringify(sub.json)).toBe(200);
    const r = await radar(u);
    // 7/10 benar -> raw_40 = 28 -> tabel Reading 27-29 = 6.5
    expect(skillOf(r, 'GRAMMAR')).toMatchObject({ score_percent: 70, estimated_band: 6.5, sample_size: 10, is_proxy: true });
    expect(skillOf(r, 'LISTENING').sample_size).toBe(0);
    // Grammar tidak masuk rumus Overall/indikatif -> tidak ada riwayat prediksi
    expect(r.json.data.prediction).toMatchObject({ overall_band: null, indicative_band: null, complete: false });
    expect(await predRows(u.user.id)).toHaveLength(0);
    // submit ulang idempoten: tidak mengubah skor
    const before = await scoreRows(u.user.id);
    await call(submitRoute, 'POST', `/api/v1/attempts/${dto.id}/submit`, { cookie: u.cookie, params: { attempt_id: dto.id } });
    expect(await scoreRows(u.user.id)).toEqual(before);
  });

  it('Boss (L + R saja) selesai: satu baris trigger BOSS dengan attempt_id benar, overall = indikatif, W/S null; muncul di exam-history', async () => {
    const u = await learnerSession();
    await readyTier1(u.user.id);
    const b = await makeBoss({ L: Array(10).fill(10), R: Array(10).fill(10) }); // >= 10 soal unik per skill agar band dihitung
    const id = await playBoss(u, b, () => true);
    const sub = await call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
    expect(sub.status, JSON.stringify(sub.json)).toBe(200);

    const rows = await predRows(u.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ trigger: 'BOSS', attempt_id: id, components: { WRITING: null, SPEAKING: null } });
    const d = (await radar(u)).json.data;
    expect(d.prediction.complete).toBe(false);
    expect(rows[0].b).toBe(d.prediction.indicative_band);
    expect(d.prediction.components.LISTENING).not.toBeNull();
    expect(d.prediction.components.READING).not.toBeNull();
    // 10 soal unik masing-masing benar semua -> raw_40 = 40 -> band 9; sampel 10 < 30 -> rentang +/-1,0 dan low_sample
    expect(skillOf(await radar(u), 'LISTENING')).toMatchObject({ sample_size: 10, score_percent: 100, estimated_band: 9 });
    expect(d.prediction).toMatchObject({ indicative_band: 9, overall_band: null, range_low: 8, range_high: 9, sample_size: 10, low_sample: true });

    const bp = await preds(u);
    expect(BandPredictionsResponseSchema.safeParse(bp.json).success).toBe(true);
    expect(bp.json.data).toHaveLength(1);
    expect(bp.json.data[0]).toMatchObject({ trigger: 'BOSS', attempt_id: id });

    const h = await history(u);
    expect(h.status).toBe(200);
    expect(ExamHistoryResponseSchema.safeParse(h.json).success).toBe(true);
    expect(h.json.data).toHaveLength(1);
    expect(h.json.data[0]).toMatchObject({ attempt_id: id, assessment_type: 'TIER_BOSS_EXAM', title: 'Boss Tier 1', status: 'GRADED', passed: true, result_path: `/ujian/${id}/hasil` });
    // submit ulang idempoten: tidak ada baris prediksi baru
    await call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
    expect(await predRows(u.user.id)).toHaveLength(1);
  });

  it('penilaian AI Mini-Task selesai (worker + LLM mock): evaluationGradedHooks mengisi WRITING dan riwayat RECALC', async () => {
    await resetAi();
    await baseSet();
    const { u, subModuleId } = await miniTaskUser('AI_SHORT_WRITING');
    const r = await postWriting(u, { kind: 'MINI_TASK_WRITING', sub_module_id: subModuleId, response_text: words(12), duration_sec: 120 });
    expect(r.status, JSON.stringify(r.json)).toBe(202);
    const subId2 = r.json.data.submission.id as string;
    await runJob(await latestJobId(subId2));
    const ev = (await db.execute(sql`SELECT overall_band::float AS b, method FROM ai_evaluations WHERE submission_id = ${subId2}::uuid`)).rows[0] as any;
    expect(ev.method).toBe('AI_LOCAL');
    const w = skillOf(await radar(u), 'WRITING');
    expect(w).toMatchObject({ estimated_band: ev.b, sample_size: 1 });
    const rows = await predRows(u.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ trigger: 'RECALC', b: ev.b, components: { WRITING: ev.b } });
  });
});

describe('kegagalan hook skor', () => {
  it('hook skor gagal pada submit: transaksi pemicu dibatalkan (attempt tetap IN_PROGRESS, tanpa baris skor/riwayat)', async () => {
    await resetLearning();
    await seedMaterial('1.1.1');
    await seedMaterial('1.1.2');
    const set = await addDrill('1.1.1', Array.from({ length: 6 }, (_, i) => Q.mcq({ question_id: `Q-F${i + 1}`, prompt: `P${i + 1}`, options: [`right-${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-${i + 1}`], explanation_id: 'p' })));
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    const s = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: set.id } });
    const dto = s.json.data;
    for (const q of dto.questions) {
      const opt = q.options.find((o: any) => o.text === `right-${q.prompt.slice(1)}`).option_id;
      await call(putRoute, 'PUT', `/api/v1/attempts/${dto.id}/answers/${q.question_id}`, { cookie: u.cookie, params: { attempt_id: dto.id, question_id: q.question_id }, body: { response: { option_ids: [opt] } } });
    }
    const boom = async () => {
      throw new Error('hook skor gagal (uji)');
    };
    attemptCompletedHooks.push(boom);
    try {
      expect((await call(submitRoute, 'POST', `/api/v1/attempts/${dto.id}/submit`, { cookie: u.cookie, params: { attempt_id: dto.id } })).status).toBe(500);
    } finally {
      attemptCompletedHooks.splice(attemptCompletedHooks.indexOf(boom), 1);
    }
    expect((await db.execute(sql`SELECT status FROM attempts WHERE id = ${dto.id}::uuid`)).rows[0]).toEqual({ status: 'IN_PROGRESS' });
    expect(await scoreRows(u.user.id)).toHaveLength(0);
    expect(await predRows(u.user.id)).toHaveLength(0);
  });
});

// =============================================================================== riwayat ujian
describe('GET /me/exam-history', () => {
  async function exam(userId: string, type: 'SKIP_MODULE_TEST' | 'PLACEMENT_TEST', opts: { status?: string; mode?: string; submittedMs?: number; score?: string; passed?: boolean | null; band?: string | null } = {}) {
    const [set] = await db
      .insert(assessmentSets)
      .values(type === 'PLACEMENT_TEST'
        ? { assessmentType: type, title: 'Placement Test', timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' as const }
        : { assessmentType: type, title: 'Skip Modul 1.1', moduleId: ((await db.execute(sql`SELECT id FROM modules LIMIT 1`)).rows[0] as any).id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' as const })
      .returning();
    const [a] = await db
      .insert(attempts)
      .values({
        userId,
        assessmentSetId: set!.id,
        assessmentVersion: 1,
        mode: (opts.mode ?? 'EXAM') as 'EXAM',
        status: (opts.status ?? 'GRADED') as 'GRADED',
        startedAt: new Date((opts.submittedMs ?? T0) - 60_000),
        submittedAt: new Date(opts.submittedMs ?? T0),
        scorePercent: opts.score ?? '85.00',
        rawScore: ((Number(opts.score ?? '85.00') * 20) / 100).toFixed(2),
        maxScore: '20.00',
        passed: opts.passed === undefined ? true : opts.passed,
        bandScore: opts.band === undefined ? null : opts.band,
        state: { pass_percent: 85 },
      })
      .returning();
    return a!;
  }

  it('hanya attempt EXAM GRADED/EXPIRED milik user (tanpa Drill, IN_PROGRESS, ABANDONED); urut submitted_at DESC; Placement band/passed null', async () => {
    const u = await learnerSession();
    const other = await learnerSession();
    const e1 = await exam(u.user.id, 'SKIP_MODULE_TEST', { submittedMs: T0 + 1000, score: '90.00' });
    const e2 = await exam(u.user.id, 'PLACEMENT_TEST', { submittedMs: T0 + 3000, score: '40.00', passed: true, band: '5.5' });
    const e3 = await exam(u.user.id, 'SKIP_MODULE_TEST', { submittedMs: T0 + 2000, status: 'EXPIRED', passed: false, score: '50.00' });
    await exam(u.user.id, 'SKIP_MODULE_TEST', { status: 'IN_PROGRESS' });
    await exam(u.user.id, 'SKIP_MODULE_TEST', { status: 'ABANDONED' });
    await addAnswers(u.user.id, 'GRAMMAR', bits(5, 5)); // attempt PRACTICE (Drill)
    await exam(other.user.id, 'SKIP_MODULE_TEST');
    const r = await history(u);
    expect(r.status).toBe(200);
    expect(ExamHistoryResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data.map((x: any) => x.attempt_id)).toEqual([e2.id, e3.id, e1.id]);
    expect(r.json.meta).toEqual({ page: 1, page_size: 20, total: 3 });
    expect(r.json.data[0]).toMatchObject({ assessment_type: 'PLACEMENT_TEST', band_score: null, passed: null, status: 'GRADED', title: 'Placement Test', score_percent: 40 });
    expect(r.json.data[1]).toMatchObject({ status: 'EXPIRED', passed: false });
    expect(r.json.data[2]).toMatchObject({ assessment_type: 'SKIP_MODULE_TEST', passed: true, score_percent: 90, result_path: `/ujian/${e1.id}/hasil` });
  });

  it('filter assessment_type; nilai tidak valid (FOO, ACTIVE_DRILL, BOSS_SECTION) -> 400 VALIDATION_ERROR; paginasi', async () => {
    const u = await learnerSession();
    for (let i = 0; i < 3; i++) await exam(u.user.id, 'SKIP_MODULE_TEST', { submittedMs: T0 + i * 1000 });
    await exam(u.user.id, 'PLACEMENT_TEST', { submittedMs: T0 + 9000 });
    expect((await history(u, '?assessment_type=SKIP_MODULE_TEST')).json.meta.total).toBe(3);
    expect((await history(u, '?assessment_type=PLACEMENT_TEST')).json.data).toHaveLength(1);
    expect((await history(u, '?assessment_type=TIER_BOSS_EXAM')).json.data).toHaveLength(0);
    for (const bad of ['FOO', 'ACTIVE_DRILL', 'BOSS_SECTION']) {
      const r = await history(u, `?assessment_type=${bad}`);
      expect(r.status, bad).toBe(400);
      expect(r.json.error.code).toBe('VALIDATION_ERROR');
    }
    const p = await history(u, '?page=2&page_size=3');
    expect(p.json.data).toHaveLength(1);
    expect(p.json.meta).toEqual({ page: 2, page_size: 3, total: 4 });
    expect((await history(u, '?page_size=101')).status).toBe(400);
  });

  it('skor tampilan tidak mencapai ambang karena pembulatan bila belum lulus (84,996 -> 84,99)', async () => {
    const u = await learnerSession();
    await db.transaction(async (tx) => {
      const a = await exam(u.user.id, 'SKIP_MODULE_TEST', { score: '85.00', passed: false });
      await tx.execute(sql`UPDATE attempts SET raw_score = 16.99, max_score = 19.99 WHERE id = ${a.id}::uuid`);
    });
    const d = (await history(u)).json.data[0];
    expect(d.score_percent).toBeLessThan(85);
  });
});

// =============================================================================== tenant, kinerja, kueri
describe('tenant, jumlah query, dan kinerja', () => {
  it('pengguna A dan B hanya melihat data masing-masing di ketiga endpoint', async () => {
    const a = await learnerSession();
    const b = await learnerSession();
    await addAnswers(a.user.id, 'LISTENING', bits(40, 50));
    await recompute(a.user.id, 'LISTENING');
    await addAnswers(b.user.id, 'READING', bits(5, 5));
    await recompute(b.user.id, 'READING');
    const ra = await radar(a);
    const rb = await radar(b);
    expect(skillOf(ra, 'LISTENING').sample_size).toBe(50);
    expect(skillOf(ra, 'READING').sample_size).toBe(0);
    expect(skillOf(rb, 'READING').sample_size).toBe(5);
    expect(skillOf(rb, 'LISTENING').sample_size).toBe(0);
  });

  it('getRadar memakai <= 3 query SQL dan p95 < 100 ms (lokal)', async () => {
    const u = await learnerSession();
    await addAnswers(u.user.id, 'LISTENING', bits(40, 50));
    await recompute(u.user.id, 'LISTENING');
    const orig = pg.Client.prototype.query;
    let n = 0;
    (pg.Client.prototype as any).query = function (this: unknown, ...args: unknown[]) {
      n++;
      return (orig as any).apply(this, args);
    };
    try {
      await getRadar(db, u.user.id);
    } finally {
      pg.Client.prototype.query = orig;
    }
    expect(n).toBeLessThanOrEqual(3);
    const times: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t = performance.now();
      await getRadar(db, u.user.id);
      times.push(performance.now() - t);
    }
    times.sort((x, y) => x - y);
    expect(times[Math.floor(times.length * 0.95)]!).toBeLessThan(100);
  });
});
