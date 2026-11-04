/**
 * Integrasi SPEC-015 (TASK-015): Placement Test adaptif 25 soal, GET /placement, POST /placement/apply.
 * Soal bank bernama `Q-PL-<difficulty>-<nn>` agar tingkat kesulitan dapat dibaca dari id (hanya di tes; tidak pernah dikirim ke klien).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, attempts, users } from '@/db/schema';
import { AttemptResponseSchema, AttemptResultResponseSchema } from '@/contracts/attempts';
import { ExamIntroFullSchema } from '@/contracts/exams';
import { ApplyPlacementResponseSchema, PlacementResultSchema, PlacementStatusResponseSchema } from '@/contracts/placement';
import { setClockForTest } from '@/server/clock';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { recomputeStatuses, applyDrillResult } from '@/server/gatekeeping/service';
import { attemptCompletedHooks } from '@/server/attempts/hooks';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as resultRoute } from '@/app/api/v1/attempts/[attempt_id]/result/route';
import { GET as introRoute } from '@/app/api/v1/exams/[assessment_set_id]/intro/route';
import { GET as statusRoute } from '@/app/api/v1/placement/route';
import { POST as applyRoute } from '@/app/api/v1/placement/apply/route';
import { call, learnerSession } from './helpers';
import { addDrill, publishSub, resetLearning } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
type L = Awaited<ReturnType<typeof learnerSession>>;
const db = getDb();

let clock = Date.now();
const at = (ms: number) => {
  clock = ms;
  setClockForTest(() => clock);
};
const SEC = 1000;

const start = (u: L, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
const get = (u: L, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const put = (u: L, id: string, qid: string, response: unknown) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response } });
const submit = (u: L, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
const result = (u: L, id: string) => call(resultRoute, 'GET', `/api/v1/attempts/${id}/result`, { cookie: u.cookie, params: { attempt_id: id } });
const intro = (u: L, setId: string) => call(introRoute, 'GET', `/api/v1/exams/${setId}/intro`, { cookie: u.cookie, params: { assessment_set_id: setId } });
const status = (u: L) => call(statusRoute, 'GET', '/api/v1/placement', { cookie: u.cookie });
const apply = (u: L, body: unknown) => call(applyRoute, 'POST', '/api/v1/placement/apply', { cookie: u.cookie, body });

const optionFor = (q: any, text: string) => q.options.find((o: any) => o.text === text).option_id as string;
const right = (q: any) => ({ option_ids: [optionFor(q, `right-${q.question_id}`)] });
const wrong = (q: any) => ({ option_ids: [optionFor(q, 'x')] });
const levelOf = (qid: string) => Number(qid.split('-')[2]);

/** Bank sintetis: `perLevel` soal per tingkat 1-5. */
async function placementSet(perLevel = 30, over: Partial<typeof assessmentSets.$inferInsert> = {}) {
  const questions = [1, 2, 3, 4, 5].flatMap((d) =>
    Array.from({ length: perLevel }, (_, i) => {
      const id = `Q-PL-${d}-${String(i + 1).padStart(2, '0')}`;
      return Q.mcq({ question_id: id, skill: 'GRAMMAR', prompt: id, options: [`right-${id}`, 'x', 'y', 'z'], correct_answers: [`right-${id}`], explanation_id: 'Pembahasan', difficulty: d });
    }),
  );
  const [s] = await db
    .insert(assessmentSets)
    .values({ assessmentType: 'PLACEMENT_TEST', title: 'Placement Test', timeLimitSeconds: 1500, questionsJson: questions as object[], questionCount: questions.length, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED', ...over })
    .returning();
  return s!;
}

/** Jalankan tes sampai selesai; `ok(i, difficulty)` menentukan benar/salah. Mengembalikan urutan kesulitan dan hasil submit. */
async function runTest(u: L, setId: string, ok: (i: number, difficulty: number) => boolean, limit = Infinity) {
  const a = await start(u, setId);
  expect(a.status, JSON.stringify(a.json)).toBe(201);
  const aid = a.json.data.id as string;
  let q: any = a.json.data.questions[0];
  const difficulties: number[] = [];
  for (let i = 0; q && i < limit; i++) {
    const d = levelOf(q.question_id);
    difficulties.push(d);
    const r = await put(u, aid, q.question_id, ok(i, d) ? right(q) : wrong(q));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.feedback).toBeNull();
    q = r.json.data.next_question;
  }
  return { aid, difficulties, last: q };
}

const freshUser = () => learnerSession();

beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
  await db.execute(sql`UPDATE users SET placement_completed_at = NULL`);
  at(Date.now());
});
afterEach(() => {
  setClockForTest(null);
  attemptCompletedHooks.length = 0;
});
afterAll(async () => {
  await resetLearning();
  await db.execute(sql`UPDATE users SET placement_completed_at = NULL`);
  await closeDb();
});

// =============================================================================== GET /placement dan intro
describe('GET /placement dan GET /exams/{id}/intro', () => {
  it('pengguna baru + set PUBLISHED -> available, question_count 25, assessment_set_id terisi; sesuai skema', async () => {
    const set = await placementSet(10);
    const u = await learnerSession();
    const r = await status(u);
    expect(r.status).toBe(200);
    expect(PlacementStatusResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toEqual({ available: true, blocked_reason: null, assessment_set_id: set.id, question_count: 25, time_limit_seconds: 1500, completed_at: null, active_attempt_id: null, pending_result: null });
  });

  it('tanpa set PUBLISHED -> NO_PLACEMENT_PUBLISHED; versi tertinggi dipilih bila lebih dari satu', async () => {
    const u = await learnerSession();
    expect((await status(u)).json.data).toMatchObject({ available: false, blocked_reason: 'NO_PLACEMENT_PUBLISHED', assessment_set_id: null });
    await placementSet(10, { title: 'v1', version: 1 });
    const v2 = await placementSet(10, { title: 'v2', version: 2 });
    expect((await status(u)).json.data.assessment_set_id).toBe(v2.id);
  });

  it('progres ada (sub-modul COMPLETED) -> PROGRESS_EXISTS dan POST /attempts -> 409 PLACEMENT_NOT_AVAILABLE; ALREADY_COMPLETED lebih diprioritaskan', async () => {
    const set = await placementSet(10);
    await publishSub('1.1.1', '1.1.2');
    const u = await learnerSession();
    await recomputeStatuses(db, u.user.id);
    const sid = ((await db.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = '1.1.1'`)).rows[0] as any).id as string;
    await db.transaction((tx) => applyDrillResult(tx, u.user.id, { subModuleId: sid, scorePercent: 100 }));
    expect((await status(u)).json.data).toMatchObject({ available: false, blocked_reason: 'PROGRESS_EXISTS' });
    const r = await start(u, set.id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('PLACEMENT_NOT_AVAILABLE');
    expect(r.json.error.details[0].code).toBe('PROGRESS_EXISTS');
    expect((await intro(u, set.id)).json.data).toMatchObject({ available: false, blocked_reason: 'PROGRESS_EXISTS' });
    await db.update(users).set({ placementCompletedAt: new Date() }).where(eq(users.id, u.user.id));
    const done = await status(u);
    expect(done.json.data).toMatchObject({ blocked_reason: 'ALREADY_COMPLETED' });
    expect(done.json.data.completed_at).not.toBeNull();
    expect((await start(u, set.id)).json.error.details[0].code).toBe('ALREADY_COMPLETED');
  });

  it('intro: placement {adaptive, question_count}, scope TIER_PLACEMENT, threshold null, empat aturan; set tidak PUBLISHED -> 404', async () => {
    const set = await placementSet(10);
    const u = await learnerSession();
    const r = await intro(u, set.id);
    expect(r.status).toBe(200);
    expect(ExamIntroFullSchema.safeParse(r.json.data).success).toBe(true);
    expect(r.json.data).toMatchObject({
      assessment_type: 'PLACEMENT_TEST',
      available: true,
      blocked_reason: null,
      threshold: null,
      scope: { kind: 'TIER_PLACEMENT', id: null, label: 'Penentuan Tier awal' },
      placement: { adaptive: true, question_count: 25 },
      boss: null,
      question_count: 25,
    });
    expect(r.json.data.rules).toEqual([
      'Soal menyesuaikan jawaban Anda.',
      'Waktu 25 menit, berjalan terus walau Anda keluar halaman.',
      'Tidak ada pembahasan dan Anda tidak dapat kembali ke soal sebelumnya.',
      'Hasilnya adalah rekomendasi; Anda memilih Tier awal.',
    ]);
    const draft = await placementSet(10, { status: 'DRAFT' });
    expect((await intro(u, draft.id)).status).toBe(404);
  });
});

// =============================================================================== mulai dan jawab
describe('POST /attempts dan PUT answers (adaptif)', () => {
  it('201: satu soal, question_count 25, current_index 0, EXAM + deadline, soal pertama kesulitan 3 (server), tanpa difficulty/kunci', async () => {
    const set = await placementSet(10);
    const u = await freshUser();
    const t0 = clock;
    const r = await start(u, set.id);
    expect(r.status).toBe(201);
    expect(AttemptResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d).toMatchObject({ assessment_type: 'PLACEMENT_TEST', mode: 'EXAM', status: 'IN_PROGRESS', question_count: 25, answered_count: 0, current_index: 0, pass_percent: null, sections: null });
    expect(d.questions).toHaveLength(1);
    expect(levelOf(d.questions[0].question_id)).toBe(3);
    expect(Date.parse(d.deadline_at) - t0).toBe(1500 * SEC);
    expect(JSON.stringify(d)).not.toMatch(/difficulty|correct_answers|explanation_id|is_correct|correct_answer/);
    const st = ((await db.select().from(attempts).where(eq(attempts.id, d.id)))[0]!.state as any).placement;
    expect(st).toMatchObject({ d: 3, n: 25, served: [d.questions[0].question_id], pending: d.questions[0].question_id, history: [] });
  });

  it('benar pada kesulitan 3 -> berikutnya 4 (belum pernah tersaji), feedback null; salah -> 2; GET hanya memuat soal tersaji', async () => {
    const set = await placementSet(10);
    const u = await freshUser();
    const a = (await start(u, set.id)).json.data;
    const q1 = a.questions[0];
    const r1 = await put(u, a.id, q1.question_id, right(q1));
    expect(r1.status).toBe(200);
    expect(r1.json.data).toMatchObject({ question_id: q1.question_id, saved: true, answered_count: 1, feedback: null });
    const q2 = r1.json.data.next_question;
    expect(levelOf(q2.question_id)).toBe(4);
    expect(q2.question_id).not.toBe(q1.question_id);
    expect(JSON.stringify(q2)).not.toMatch(/difficulty|correct|explanation/);
    const r2 = await put(u, a.id, q2.question_id, wrong(q2));
    expect(levelOf(r2.json.data.next_question.question_id)).toBe(3);
    const g = (await get(u, a.id)).json.data;
    expect(g.questions.map((q: any) => q.question_id)).toEqual([q1.question_id, q2.question_id, r2.json.data.next_question.question_id]);
    expect(g.answered_count).toBe(2);
    expect(g.current_index).toBe(2);
    expect(g.question_count).toBe(25);
    // jalur salah dari awal
    const u2 = await freshUser();
    const b = (await start(u2, set.id)).json.data;
    const w = await put(u2, b.id, b.questions[0].question_id, wrong(b.questions[0]));
    expect(levelOf(w.json.data.next_question.question_id)).toBe(2);
  });

  it('tingkat 5 habis -> kesulitan terdekat dengan ofset -1 (4) dipakai', async () => {
    const set = await placementSet(10);
    // sisakan hanya dua soal tingkat 5
    const qs = (set.questionsJson as any[]).filter((q) => q.difficulty !== 5 || q.question_id.endsWith('-01') || q.question_id.endsWith('-02'));
    await db.update(assessmentSets).set({ questionsJson: qs, questionCount: qs.length }).where(eq(assessmentSets.id, set.id));
    const u = await freshUser();
    const run = await runTest(u, set.id, () => true, 6);
    const hist = (((await db.select().from(attempts).where(eq(attempts.id, run.aid)))[0]!.state as any).placement.history as any[]).map((h) => h.difficulty);
    expect(hist).toEqual([3, 4, 5, 5, 4, 4]);
  });

  it('jawaban ulang -> 409 QUESTION_ALREADY_ANSWERED (sama/beda); soal belum tersaji -> 404; tersaji bukan pending -> 409 QUESTION_NOT_CURRENT', async () => {
    const set = await placementSet(10);
    const u = await freshUser();
    const a = (await start(u, set.id)).json.data;
    const q1 = a.questions[0];
    expect((await put(u, a.id, q1.question_id, right(q1))).status).toBe(200);
    const same = await put(u, a.id, q1.question_id, right(q1));
    expect(same.status).toBe(409);
    expect(same.json.error.code).toBe('QUESTION_ALREADY_ANSWERED');
    expect((await put(u, a.id, q1.question_id, wrong(q1))).json.error.code).toBe('QUESTION_ALREADY_ANSWERED');
    expect((await put(u, a.id, 'Q-PL-1-05', { option_ids: ['x'] })).status).toBe(404); // ada di bank, belum tersaji
    expect((await put(u, a.id, 'Q-TIDAK-ADA', { option_ids: ['x'] })).status).toBe(404);
    // keadaan korup: soal tersaji tetapi bukan pending
    await db.execute(sql`UPDATE attempts SET state = jsonb_set(state, '{placement,served}', (state->'placement'->'served') || '["Q-PL-1-05"]'::jsonb) WHERE id = ${a.id}::uuid`);
    const nc = await put(u, a.id, 'Q-PL-1-05', { option_ids: ['x'] });
    expect(nc.status).toBe(409);
    expect(nc.json.error.code).toBe('QUESTION_NOT_CURRENT');
  });

  it('dua perangkat menjawab soal pending serentak: satu 200 dan satu 409 QUESTION_ALREADY_ANSWERED, tanpa soal ganda tersaji', async () => {
    const set = await placementSet(10);
    const u = await freshUser();
    const a = (await start(u, set.id)).json.data;
    const q1 = a.questions[0];
    const [x, y] = await Promise.all([put(u, a.id, q1.question_id, right(q1)), put(u, a.id, q1.question_id, right(q1))]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const bad = x.status === 409 ? x : y;
    expect(bad.json.error.code).toBe('QUESTION_ALREADY_ANSWERED');
    const st = ((await db.select().from(attempts).where(eq(attempts.id, a.id)))[0]!.state as any).placement;
    expect(st.served).toHaveLength(2);
    expect(st.history).toHaveLength(1);
  });

  it('bentuk jawaban salah -> 400 VALIDATION_ERROR dan soal tidak maju', async () => {
    const set = await placementSet(10);
    const u = await freshUser();
    const a = (await start(u, set.id)).json.data;
    const q1 = a.questions[0];
    const bad = await put(u, a.id, q1.question_id, { option_ids: ['zzzzzz'] });
    expect(bad.status).toBe(400);
    expect((await put(u, a.id, q1.question_id, right(q1))).status).toBe(200);
  });

  it('attempt IN_PROGRESS di-resume (200) dengan soal tersaji yang sama; attempt milik user lain -> 404', async () => {
    const set = await placementSet(10);
    const u = await freshUser();
    const a = (await start(u, set.id)).json.data;
    const q1 = a.questions[0];
    const n = await put(u, a.id, q1.question_id, right(q1));
    const again = await start(u, set.id);
    expect(again.status).toBe(200);
    expect(again.json.data.resumed).toBe(true);
    expect(again.json.data.questions.map((q: any) => q.question_id)).toEqual([q1.question_id, n.json.data.next_question.question_id]);
    expect((await status(u)).json.data).toMatchObject({ available: true, blocked_reason: null, active_attempt_id: a.id });
    const other = await freshUser();
    expect((await get(other, a.id)).status).toBe(404);
    expect((await put(other, a.id, q1.question_id, right(q1))).status).toBe(404);
  });
});

// =============================================================================== rekomendasi (vektor uji D4)
describe('submit: vektor uji rekomendasi (bank sintetis 150 soal, N=25)', () => {
  const cases: Array<[string, (i: number) => boolean, number, number, number]> = [
    ['semua benar', () => true, 4, 5.0, 25],
    ['semua salah', () => false, 1, 1.0, 0],
    ['mulai benar lalu bergantian salah-benar', (i) => i % 2 === 0, 3, 3.5, 13],
    ['mulai salah lalu bergantian', (i) => i % 2 === 1, 2, 2.5, 12],
  ];
  it.each(cases)('%s', async (_name, ok, tier, ability, correct) => {
    const set = await placementSet(30);
    const u = await freshUser();
    const hooks: any[] = [];
    attemptCompletedHooks.push(async (ctx) => void hooks.push(ctx));
    const { aid, last, difficulties } = await runTest(u, set.id, (i) => ok(i));
    expect(last).toBeNull(); // jawaban ke-25 -> next_question null
    expect(difficulties).toHaveLength(25);
    const r = await submit(u, aid);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(AttemptResultResponseSchema.safeParse(r.json).success).toBe(true);
    const p = r.json.data.placement;
    expect(PlacementResultSchema.safeParse(p).success).toBe(true);
    expect(p).toMatchObject({ recommended_tier: tier, ability, correct_count: correct, served_count: 25, applied: false });
    expect(p.tier_options.map((t: any) => t.tier_number)).toEqual(Array.from({ length: tier }, (_, i) => i + 1));
    expect(p.tier_options[0]).toMatchObject({ tier_number: 1, title: 'Foundation', cefr_level: 'A1-A2', target_band_min: 3, target_band_max: 4 });
    expect(r.json.data.attempt).toMatchObject({ status: 'GRADED', passed: null, band_score: null, score_percent: correct * 4 });
    expect(r.json.data.review).toBeNull();
    expect(r.json.data.skip).toBeNull();
    expect(r.json.data.boss).toBeNull();
    expect(JSON.stringify(r.json)).not.toMatch(/difficulty|correct_answer|explanation_id/);
    expect(hooks).toHaveLength(1);
    expect(hooks[0].set.assessmentType).toBe('PLACEMENT_TEST');
    const stored = (await db.select().from(attempts).where(eq(attempts.id, aid)))[0]!.resultJson as any;
    expect(stored).toMatchObject({ recommended_tier: tier, ability, correct_count: correct, served_count: 25, applied: null });
    // idempoten
    expect((await submit(u, aid)).json.data).toEqual(r.json.data);
    expect(hooks).toHaveLength(1);
    expect((await result(u, aid)).json.data.placement).toEqual(p);
  });

  it('7 benar dari 25 -> safeguard < 32% -> Tier 1', async () => {
    const set = await placementSet(30);
    const u = await freshUser();
    const { aid } = await runTest(u, set.id, (i) => i < 7);
    const p = (await submit(u, aid)).json.data.placement;
    expect(p).toMatchObject({ recommended_tier: 1, correct_count: 7, served_count: 25 });
  });

  it('bank 12 soal (< N): tes berakhir lebih awal; question_count tetap 25 pada DTO awal, served_count sebenarnya', async () => {
    const set = await placementSet(4);
    const qs = (set.questionsJson as any[]).slice(0, 12);
    await db.update(assessmentSets).set({ questionsJson: qs, questionCount: 12 }).where(eq(assessmentSets.id, set.id));
    const u = await freshUser();
    const { aid, difficulties } = await runTest(u, set.id, () => true);
    expect(difficulties.length).toBeLessThanOrEqual(12);
    const r = await submit(u, aid);
    expect(r.json.data.placement.served_count).toBe(difficulties.length);
    expect((await get(u, aid)).json.data.question_count).toBe(25);
  });

  it('kadaluarsa setelah 6 jawaban: hasil dari jawaban yang ada, dapat diterapkan; tanpa jawaban -> Tier 1', async () => {
    const set = await placementSet(30);
    const u = await freshUser();
    const { aid } = await runTest(u, set.id, () => true, 6);
    at(clock + 1500 * SEC + 6 * SEC);
    const late = await get(u, aid);
    expect(late.json.data.status).toBe('EXPIRED');
    const res = await result(u, aid);
    expect(res.json.data.attempt.status).toBe('EXPIRED');
    // F-15-01: 6 jawaban benar semua tetap Tier 1 (batas bukti 1 + floor(3*6/25) = 1).
    expect(res.json.data.placement).toMatchObject({ served_count: 6, correct_count: 6, recommended_tier: 1, applied: false });
    expect((await status(u)).json.data).toMatchObject({ blocked_reason: 'RESULT_PENDING_APPLY', pending_result: { attempt_id: aid, recommended_tier: 1 } });
    expect((await apply(u, { attempt_id: aid, tier_number: 4 })).json.error.code).toBe('TIER_ABOVE_RECOMMENDATION');
    const ap = await apply(u, { attempt_id: aid, tier_number: 1 });
    expect(ap.status).toBe(200);

    const u2 = await freshUser();
    const a2 = (await start(u2, set.id)).json.data;
    at(clock + 1500 * SEC + 6 * SEC);
    const noAns = await put(u2, a2.id, a2.questions[0].question_id, right(a2.questions[0]));
    expect(noAns.status).toBe(409);
    expect(noAns.json.error.code).toBe('ATTEMPT_EXPIRED');
    const r2 = await result(u2, a2.id);
    expect(r2.json.data.placement).toMatchObject({ recommended_tier: 1, served_count: 0, correct_count: 0, ability: 0 });
  });

  it('RESULT_PENDING_APPLY: hasil selesai tetapi belum apply -> progres tidak berubah, POST /attempts 409', async () => {
    const set = await placementSet(30);
    await publishSub('1.1.1', '2.1.1');
    const u = await learnerSession();
    const { aid } = await runTest(u, set.id, (i) => i % 2 === 0);
    await submit(u, aid);
    expect((await status(u)).json.data).toMatchObject({ available: false, blocked_reason: 'RESULT_PENDING_APPLY', pending_result: { attempt_id: aid, recommended_tier: 3 } });
    const r = await start(u, set.id);
    expect(r.status).toBe(409);
    expect(r.json.error.details[0].code).toBe('RESULT_PENDING_APPLY');
    const skipped = await db.execute(sql`SELECT count(*)::int AS n FROM user_sub_module_progress WHERE user_id = ${u.user.id}::uuid AND status IN ('SKIPPED','COMPLETED')`);
    expect(skipped.rows[0]).toEqual({ n: 0 });
    expect((await db.execute(sql`SELECT placement_completed_at FROM users WHERE id = ${u.user.id}::uuid`)).rows[0]).toEqual({ placement_completed_at: null });
  });
});

// =============================================================================== apply
describe('POST /placement/apply', () => {
  async function finished(rec: 'tier3' | 'tier1' = 'tier3') {
    const set = await placementSet(30);
    await publishSub('1.1.1', '2.1.1', '3.1.1', '4.1.1');
    const u = await learnerSession();
    const { aid } = await runTest(u, set.id, rec === 'tier3' ? (i) => i % 2 === 0 : () => false);
    const res = await submit(u, aid);
    return { u, set, aid, rec: res.json.data.placement.recommended_tier as number };
  }
  const tierStatus = async (userId: string, n: number) =>
    (await db.execute(sql`SELECT p.status, p.unlock_source FROM user_tier_progress p JOIN tiers t ON t.id = p.tier_id WHERE p.user_id = ${userId}::uuid AND t.tier_number = ${n}`)).rows[0] as any;
  const subStatus = async (userId: string, code: string) =>
    (await db.execute(sql`SELECT p.status, p.unlock_source FROM user_sub_module_progress p JOIN sub_modules s ON s.id = p.sub_module_id WHERE p.user_id = ${userId}::uuid AND s.sub_module_code = ${code}`)).rows[0] as any;

  it('rekomendasi Tier 3, apply 3: Tier 1-2 SKIPPED (PLACEMENT), Tier 3 dan sub pertamanya UNLOCKED, placement_completed_at, result_json.applied, audit', async () => {
    const { u, aid, rec } = await finished();
    expect(rec).toBe(3);
    const r = await apply(u, { attempt_id: aid, tier_number: 3 });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(ApplyPlacementResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ applied: true, tier_number: 3, skipped_tiers: [1, 2] });
    expect(r.json.data.unlocked.map((x: any) => x.kind)).toEqual(['TIER', 'MODULE', 'SUB_MODULE']);
    expect(await tierStatus(u.user.id, 1)).toEqual({ status: 'SKIPPED', unlock_source: 'PLACEMENT' });
    expect(await tierStatus(u.user.id, 2)).toEqual({ status: 'SKIPPED', unlock_source: 'PLACEMENT' });
    expect(await tierStatus(u.user.id, 3)).toMatchObject({ status: 'UNLOCKED', unlock_source: 'PLACEMENT' });
    expect(await subStatus(u.user.id, '1.1.1')).toEqual({ status: 'SKIPPED', unlock_source: 'PLACEMENT' });
    expect(await subStatus(u.user.id, '2.1.1')).toEqual({ status: 'SKIPPED', unlock_source: 'PLACEMENT' });
    expect(await subStatus(u.user.id, '3.1.1')).toMatchObject({ status: 'UNLOCKED' });
    expect(await tierStatus(u.user.id, 4)).toMatchObject({ status: 'LOCKED' });
    const done = (await db.execute(sql`SELECT placement_completed_at FROM users WHERE id = ${u.user.id}::uuid`)).rows[0] as any;
    expect(done.placement_completed_at).not.toBeNull();
    const rj = (await db.select().from(attempts).where(eq(attempts.id, aid)))[0]!.resultJson as any;
    expect(rj.applied).toMatchObject({ tier_number: 3 });
    expect(rj.placement.applied).toBe(true);
    const audit = (await db.execute(sql`SELECT metadata FROM audit_log WHERE action = 'PLACEMENT_APPLIED' AND entity_id = ${aid}`)).rows as any[];
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ tier_number: 3, recommended_tier: 3, ability: 3.5 });
    // hasil kini menunjukkan applied=true, GET /placement ALREADY_COMPLETED, start ditolak
    expect((await result(u, aid)).json.data.placement.applied).toBe(true);
    expect((await status(u)).json.data).toMatchObject({ available: false, blocked_reason: 'ALREADY_COMPLETED', pending_result: null });
    const again = await apply(u, { attempt_id: aid, tier_number: 3 });
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe('PLACEMENT_ALREADY_APPLIED');
    const st = await start(u, (await placementSetId()) as string);
    expect(st.json.error.code).toBe('PLACEMENT_NOT_AVAILABLE');
    expect(st.json.error.details[0].code).toBe('ALREADY_COMPLETED');
  });
  const placementSetId = async () => ((await db.execute(sql`SELECT id FROM assessment_sets WHERE assessment_type = 'PLACEMENT_TEST' LIMIT 1`)).rows[0] as any)?.id;

  it('apply 2 dari rekomendasi 3: hanya Tier 1 SKIPPED dan Tier 2 UNLOCKED; apply 4 -> 409 TIER_ABOVE_RECOMMENDATION (tanpa efek)', async () => {
    const { u, aid } = await finished();
    const above = await apply(u, { attempt_id: aid, tier_number: 4 });
    expect(above.status).toBe(409);
    expect(above.json.error.code).toBe('TIER_ABOVE_RECOMMENDATION');
    expect((await tierStatus(u.user.id, 1))?.status).not.toBe('SKIPPED');
    const r = await apply(u, { attempt_id: aid, tier_number: 2 });
    expect(r.status).toBe(200);
    expect(r.json.data.skipped_tiers).toEqual([1]);
    expect(await tierStatus(u.user.id, 1)).toMatchObject({ status: 'SKIPPED' });
    expect(await tierStatus(u.user.id, 2)).toMatchObject({ status: 'UNLOCKED' });
    expect(await tierStatus(u.user.id, 3)).toMatchObject({ status: 'LOCKED' });
  });

  it('apply Tier 1: menandai placement_completed_at tanpa melewati Tier mana pun', async () => {
    const { u, aid } = await finished();
    const r = await apply(u, { attempt_id: aid, tier_number: 1 });
    expect(r.status).toBe(200);
    expect(r.json.data.skipped_tiers).toEqual([]);
    expect(await tierStatus(u.user.id, 1)).toMatchObject({ status: 'UNLOCKED' });
    expect(await subStatus(u.user.id, '1.1.1')).toMatchObject({ status: 'UNLOCKED' });
    expect((await db.execute(sql`SELECT placement_completed_at FROM users WHERE id = ${u.user.id}::uuid`)).rows[0]).not.toEqual({ placement_completed_at: null });
  });

  it('rekomendasi Tier 1 (safeguard): apply 2 ditolak', async () => {
    const { u, aid, rec } = await finished('tier1');
    expect(rec).toBe(1);
    expect((await apply(u, { attempt_id: aid, tier_number: 2 })).json.error.code).toBe('TIER_ABOVE_RECOMMENDATION');
  });

  it('attempt IN_PROGRESS -> 409 ATTEMPT_NOT_FINISHED; milik user lain / bukan Placement -> 404; body tidak valid -> 400', async () => {
    const set = await placementSet(30);
    await publishSub('1.1.1', '2.1.1');
    const u = await learnerSession();
    const a = (await start(u, set.id)).json.data;
    const inprog = await apply(u, { attempt_id: a.id, tier_number: 1 });
    expect(inprog.status).toBe(409);
    expect(inprog.json.error.code).toBe('ATTEMPT_NOT_FINISHED');
    const other = await learnerSession();
    expect((await apply(other, { attempt_id: a.id, tier_number: 1 })).status).toBe(404);
    expect((await apply(u, { attempt_id: randomUUID(), tier_number: 1 })).status).toBe(404);
    const drill = await addDrill('1.1.1', [Q.mcq()]);
    expect(drill.assessmentType).toBe('ACTIVE_DRILL');
    for (const tier_number of [0, 5, 2.5, '3', null]) {
      const bad = await apply(u, { attempt_id: a.id, tier_number });
      expect(bad.status, String(tier_number)).toBe(400);
      expect(bad.json.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await apply(u, { attempt_id: 'bukan-uuid', tier_number: 1 })).status).toBe(400);
    expect((await apply(u, { attempt_id: a.id, tier_number: 1, extra: true })).status).toBe(400);
  });

  it('progres sudah ada saat apply -> 409 PLACEMENT_NOT_AVAILABLE (PROGRESS_EXISTS)', async () => {
    const { u, aid } = await finished();
    await recomputeStatuses(db, u.user.id);
    await db.execute(sql`
      UPDATE user_sub_module_progress SET status = 'COMPLETED', completed_at = now()
      WHERE user_id = ${u.user.id}::uuid AND sub_module_id = (SELECT id FROM sub_modules WHERE sub_module_code = '1.1.1')`);
    const r = await apply(u, { attempt_id: aid, tier_number: 3 });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('PLACEMENT_NOT_AVAILABLE');
    expect(r.json.error.details[0].code).toBe('PROGRESS_EXISTS');
  });

  it('F-15-04: drill selesai (belum commit) saat apply berjalan -> apply menunggu kunci progres lalu 409 PROGRESS_EXISTS (tanpa status campuran)', async () => {
    const { u, aid } = await finished();
    await recomputeStatuses(db, u.user.id);
    const sid = ((await db.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = '1.1.1'`)).rows[0] as any).id as string;
    let pending: ReturnType<typeof apply> | null = null;
    await db.transaction(async (tx) => {
      await applyDrillResult(tx, u.user.id, { subModuleId: sid, scorePercent: 100 }); // memegang kunci progres, belum commit
      pending = apply(u, { attempt_id: aid, tier_number: 3 });
      await new Promise((r) => setTimeout(r, 400));
    });
    const r = await pending!;
    expect(r.status, JSON.stringify(r.json)).toBe(409);
    expect(r.json.error.details[0].code).toBe('PROGRESS_EXISTS');
    expect(await tierStatus(u.user.id, 1)).not.toMatchObject({ status: 'SKIPPED' });
    expect((await db.execute(sql`SELECT placement_completed_at FROM users WHERE id = ${u.user.id}::uuid`)).rows[0]).toEqual({ placement_completed_at: null });
  });

  it('apply serentak dua kali: satu 200 dan satu 409 PLACEMENT_ALREADY_APPLIED (audit sekali)', async () => {
    const { u, aid } = await finished();
    const [x, y] = await Promise.all([apply(u, { attempt_id: aid, tier_number: 3 }), apply(u, { attempt_id: aid, tier_number: 3 })]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const audit = await db.execute(sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'PLACEMENT_APPLIED' AND entity_id = ${aid}`);
    expect(audit.rows[0]).toEqual({ n: 1 });
  });
});

// =============================================================================== perbaikan QA W7 (TASK-015)
describe('QA W7: bukti minimum rekomendasi, set terpilih D1, per_skill', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 1],
    [8, 1],
    [9, 2],
    [16, 2],
    [17, 3],
    [24, 3],
  ])('F-15-01: %i jawaban benar semua lalu Akhiri -> Tier %i (batas bukti 1 + floor(3*dijawab/25))', async (answered, tier) => {
    const set = await placementSet(30);
    const u = await freshUser();
    const { aid } = await runTest(u, set.id, () => true, answered);
    const r = await submit(u, aid);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.placement).toMatchObject({ served_count: answered, correct_count: answered, recommended_tier: tier });
    expect(r.json.data.placement.tier_options.map((t: any) => t.tier_number)).toEqual(Array.from({ length: tier }, (_, i) => i + 1));
    // Tier di atas batas tidak dapat diterapkan
    const over = await apply(u, { attempt_id: aid, tier_number: tier + 1 });
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe('TIER_ABOVE_RECOMMENDATION');
  });

  it('F-15-01: 25 jawaban semua benar tetap Tier 4 (vektor spec tidak berubah); N kustom 10: 10 jawaban -> Tier 4', async () => {
    const set = await placementSet(30);
    const u = await freshUser();
    const { aid } = await runTest(u, set.id, () => true);
    expect((await submit(u, aid)).json.data.placement).toMatchObject({ recommended_tier: 4, served_count: 25 });

    await db.execute(sql`UPDATE app_settings SET value = to_jsonb(10::int) WHERE key = 'placement.question_count'`);
    try {
      const u2 = await freshUser();
      const run = await runTest(u2, set.id, () => true);
      expect((await submit(u2, run.aid)).json.data.placement).toMatchObject({ recommended_tier: 4, served_count: 10 });
    } finally {
      await db.execute(sql`UPDATE app_settings SET value = to_jsonb(25::int) WHERE key = 'placement.question_count'`);
    }
  });

  it('F-15-03: dua set PUBLISHED -> hanya set D1 (version tertinggi) dapat dimulai; set lain 404', async () => {
    const v1 = await placementSet(10, { title: 'v1', version: 1 });
    const v2 = await placementSet(10, { title: 'v2', version: 2 });
    const u = await freshUser();
    expect((await start(u, v1.id)).status).toBe(404);
    expect((await start(u, v2.id)).status).toBe(201);
  });

  it('F-15-03: attempt Placement berjalan pada set lain memblokir mulai set D1 (409 ATTEMPT_IN_PROGRESS), resume set lama tetap 200; tidak ada dua attempt aktif', async () => {
    const v1 = await placementSet(10, { title: 'v1', version: 1 });
    const u = await freshUser();
    const first = await start(u, v1.id);
    expect(first.status).toBe(201);
    const v2 = await placementSet(10, { title: 'v2', version: 2 });
    const blocked = await start(u, v2.id);
    expect(blocked.status, JSON.stringify(blocked.json)).toBe(409);
    expect(blocked.json.error.code).toBe('PLACEMENT_NOT_AVAILABLE');
    expect(blocked.json.error.details[0].code).toBe('ATTEMPT_IN_PROGRESS');
    const resumed = await start(u, v1.id);
    expect(resumed.status).toBe(200);
    expect(resumed.json.data.id).toBe(first.json.data.id);
    const n = await db.execute(sql`SELECT count(*)::int AS n FROM attempts WHERE user_id = ${u.user.id}::uuid AND status = 'IN_PROGRESS'`);
    expect(n.rows[0]).toEqual({ n: 1 });
  });

  it('F-15-03: start serentak pada dua set (v1 berjalan tidak ada) -> hanya set D1 yang berhasil; tepat satu attempt aktif', async () => {
    const v1 = await placementSet(10, { title: 'v1', version: 1 });
    const v2 = await placementSet(10, { title: 'v2', version: 2 });
    const u = await freshUser();
    const [a, b] = await Promise.all([start(u, v1.id), start(u, v2.id)]);
    expect([a.status, b.status].sort()).toEqual([201, 404]);
    const n = await db.execute(sql`SELECT count(*)::int AS n FROM attempts WHERE user_id = ${u.user.id}::uuid AND status = 'IN_PROGRESS'`);
    expect(n.rows[0]).toEqual({ n: 1 });
  });

  it('F-15-05: per_skill tidak menghitung soal pending; jumlah per_skill sama dengan raw/max attempt', async () => {
    const set = await placementSet(30);
    const u = await freshUser();
    const { aid, last } = await runTest(u, set.id, (i) => i !== 1, 3); // 3 dijawab, soal ke-4 masih pending
    expect(last).not.toBeNull();
    const r = await submit(u, aid);
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.attempt).toMatchObject({ raw_score: 2, max_score: 3 });
    const sumMax = d.per_skill.reduce((a: number, s: any) => a + s.max_score, 0);
    const sumRaw = d.per_skill.reduce((a: number, s: any) => a + s.raw_score, 0);
    expect(sumMax).toBe(d.attempt.max_score);
    expect(sumRaw).toBe(d.attempt.raw_score);
    expect(d.placement.served_count).toBe(3);
  });
});
