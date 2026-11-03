import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, tiers } from '@/db/schema';
import { AttemptResponseSchema, AttemptResultResponseSchema, SubmitAnswerResponseSchema } from '@/contracts/attempts';
import { setClockForTest } from '@/server/clock';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { assessmentTypeHandlers } from '@/server/attempts/handlers';
import { attemptCompletedHooks } from '@/server/attempts/hooks';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as resultRoute } from '@/app/api/v1/attempts/[attempt_id]/result/route';
import { call, learnerSession } from './helpers';
import { addDrill, markLearnDone, progressOf, resetLearning, seedMaterial } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
/** Handler Skip nyata (SPEC-008) yang ditimpa sementara oleh handler uji mode EXAM generik di bawah. */
const realSkipHandler = assessmentTypeHandlers.SKIP_MODULE_TEST!;
afterAll(async () => {
  await resetLearning(); // jangan tinggalkan attempts (FK RESTRICT) yang mengganggu berkas integrasi lain
  await closeDb();
});

type L = Awaited<ReturnType<typeof learnerSession>>;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Dto = any;

const start = (u: L, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
const get = (u: L, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const put = (u: L, id: string, qid: string, response: unknown, extra: Record<string, unknown> = {}) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response, ...extra } });
const submit = (u: L, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
const result = (u: L, id: string) => call(resultRoute, 'GET', `/api/v1/attempts/${id}/result`, { cookie: u.cookie, params: { attempt_id: id } });

/** n soal MCQ dengan jawaban benar `right-<i>`; prompt unik `P<i>`. */
const mcqs = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => Q.mcq({ question_id: `Q-D${i + 1}`, prompt: `P${i + 1}`, options: [`right-${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-${i + 1}`], explanation_id: `Pembahasan ${i + 1}`, ...over }));

const optionFor = (q: Dto, text: string) => q.options.find((o: any) => o.text === text).option_id as string;
const rightOf = (q: Dto) => ({ option_ids: [optionFor(q, `right-${q.prompt.slice(1)}`)] });
const wrongOf = (q: Dto) => ({ option_ids: [optionFor(q, 'x')] });

/** Jawab n soal pertama (urutan tampil) benar dan sisanya salah. */
async function answerAll(u: L, dto: Dto, correct: number, skip = 0) {
  const out = [];
  for (const [i, q] of dto.questions.entries()) {
    if (i >= dto.questions.length - skip) break;
    if (!q.options) continue; // soal AI
    out.push(await put(u, dto.id, q.question_id, i < correct ? rightOf(q) : wrongOf(q)));
  }
  return out;
}

async function setup(opts: { questions?: unknown[]; passPercent?: number; withNext?: boolean; learnDone?: boolean } = {}) {
  await seedMaterial('1.1.1');
  if (opts.withNext !== false) await seedMaterial('1.1.2');
  const set = await addDrill('1.1.1', opts.questions ?? mcqs(10), opts.passPercent ? { passPercent: opts.passPercent } : {});
  const u = await learnerSession();
  if (opts.learnDone !== false) await markLearnDone(u.user.id, '1.1.1');
  return { u, set };
}

beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
});
afterEach(() => {
  setClockForTest(null);
  assessmentTypeHandlers.SKIP_MODULE_TEST = realSkipHandler;
  attemptCompletedHooks.length = 0;
});

describe('POST /attempts', () => {
  it('201 PRACTICE tanpa deadline, 10 soal, current_index 0, satu baris IN_PROGRESS; sesuai skema kontrak', async () => {
    const { u, set } = await setup();
    const r = await start(u, set.id);
    expect(r.status).toBe(201);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(AttemptResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d).toMatchObject({
      assessment_type: 'ACTIVE_DRILL', mode: 'PRACTICE', status: 'IN_PROGRESS', deadline_at: null, remaining_seconds: null,
      question_count: 10, answered_count: 0, current_index: 0, pass_percent: 75, time_limit_seconds: 300, resumed: false, sections: null,
      passage_markdown: null, listening: null,
    });
    expect(d.questions).toHaveLength(10);
    const rows = await db.execute(sql`SELECT mode, status, assessment_version FROM attempts WHERE user_id = ${u.user.id}::uuid`);
    expect(rows.rows).toEqual([{ mode: 'PRACTICE', status: 'IN_PROGRESS', assessment_version: 1 }]);
  });

  it('payload start dan GET tidak memuat kunci terlarang', async () => {
    const { u, set } = await setup({ questions: [Q.mcq(), Q.multi(), Q.tfng(), Q.ynng(), Q.fill(), Q.short(), Q.drop(), Q.drag(), Q.reorder(), Q.error(), Q.writing(), Q.speaking()] });
    const r = await start(u, set.id);
    expect(r.status).toBe(201);
    const check = (json: unknown) => {
      const text = JSON.stringify(json);
      for (const k of ['correct_answers', 'explanation_id', '"correct"', '"answer"', '"accepted"', 'correct_answer']) expect(text).not.toContain(k);
    };
    check(r.json);
    check((await get(u, r.json.data.id)).json);
    expect(r.json.data.questions).toHaveLength(10); // 12 soal -> subset drill.question_count
  });

  it('LEARN_NOT_COMPLETED -> 409 dan tidak ada baris attempts', async () => {
    const { u, set } = await setup({ learnDone: false });
    const r = await start(u, set.id);
    expect(r.status).toBe(409);
    expect(r.json.error).toMatchObject({ code: 'LEARN_NOT_COMPLETED', message: 'Selesaikan materi terlebih dahulu.' });
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM attempts`)).rows[0]).toEqual({ n: 0 });
  });

  it('attempt IN_PROGRESS yang sama -> 200 resumed=true, id, urutan, dan option_id identik', async () => {
    const { u, set } = await setup();
    const a = await start(u, set.id);
    const b = await start(u, set.id);
    expect(b.status).toBe(200);
    expect(b.json.data.resumed).toBe(true);
    expect(b.json.data.id).toBe(a.json.data.id);
    expect(b.json.data.questions).toEqual(a.json.data.questions);
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM attempts`)).rows[0]).toEqual({ n: 1 });
  });

  it('permintaan mulai serentak menghasilkan satu attempt aktif', async () => {
    const { u, set } = await setup();
    const rs = await Promise.all([1, 2, 3, 4].map(() => start(u, set.id)));
    expect(new Set(rs.map((r) => r.json.data.id)).size).toBe(1);
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it('tipe tanpa handler -> 409 ASSESSMENT_TYPE_NOT_ENABLED; BOSS_SECTION -> 409 SECTION_NOT_STARTABLE', async () => {
    const { u } = await setup();
    const [exam] = await db
      .insert(assessmentSets)
      .values({ assessmentType: 'PLACEMENT_TEST', title: 'Placement', timeLimitSeconds: 600, questionsJson: mcqs(2), questionCount: 2, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
      .returning();
    expect((await start(u, exam!.id)).json.error.code).toBe('ASSESSMENT_TYPE_NOT_ENABLED');
    const [t1] = await db.select().from(tiers).where(eq(tiers.tierNumber, 1));
    const [boss] = await db
      .insert(assessmentSets)
      .values({ assessmentType: 'TIER_BOSS_EXAM', title: 'Boss', tierId: t1!.id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
      .returning();
    const [section] = await db
      .insert(assessmentSets)
      .values({ assessmentType: 'BOSS_SECTION', title: 'Sec', parentSetId: boss!.id, skillCategory: 'READING', timeLimitSeconds: 600, questionsJson: mcqs(1), questionCount: 1, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
      .returning();
    const r = await start(u, section!.id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('SECTION_NOT_STARTABLE');
  });

  it('sub-modul LOCKED -> 403 LOCKED_CONTENT; set DRAFT / tidak ada -> 404; id bukan uuid -> 400', async () => {
    const { u } = await setup();
    await seedMaterial('1.1.3');
    const lockedSet = await addDrill('1.1.3', mcqs(3));
    expect((await start(u, lockedSet.id)).json.error.code).toBe('LOCKED_CONTENT');
    const draft = await addDrill('1.1.2', mcqs(3), { status: 'DRAFT' });
    expect((await start(u, draft.id)).status).toBe(404);
    expect((await start(u, randomUUID())).status).toBe(404);
    expect((await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: 'x' } })).status).toBe(400);
  });

  it('soal lebih banyak dari drill.question_count -> subset 10; urutan acak antar attempt (>= 15 dari 20 berbeda)', async () => {
    const { u, set } = await setup({ questions: mcqs(14) });
    const first = await start(u, set.id);
    expect(first.json.data.questions).toHaveLength(10);
    const orders = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const v = await learnerSession();
      await markLearnDone(v.user.id, '1.1.1');
      orders.add((await start(v, set.id)).json.data.questions.map((q: Dto) => q.question_id).join(','));
    }
    expect(orders.size).toBeGreaterThanOrEqual(15);
  });

  it('set dengan bacaan mempertahankan urutan asli; passage_markdown dikirim', async () => {
    const { u, set } = await setup({ questions: mcqs(6) });
    await db.update(assessmentSets).set({ readingPassageMarkdown: '# Passage' }).where(eq(assessmentSets.id, set.id));
    const r = await start(u, set.id);
    expect(r.json.data.passage_markdown).toBe('# Passage');
    expect(r.json.data.questions.map((q: Dto) => q.question_id)).toEqual(['Q-D1', 'Q-D2', 'Q-D3', 'Q-D4', 'Q-D5', 'Q-D6']);
  });

  it('attempt PRACTICE > 24 jam tanpa aktivitas menjadi ABANDONED dan attempt baru dibuat', async () => {
    const { u, set } = await setup();
    const a = await start(u, set.id);
    await db.execute(sql`UPDATE attempts SET updated_at = now() - interval '25 hours' WHERE id = ${a.json.data.id}::uuid`);
    const b = await start(u, set.id);
    expect(b.status).toBe(201);
    expect(b.json.data.id).not.toBe(a.json.data.id);
    expect((await db.execute(sql`SELECT status FROM attempts WHERE id = ${a.json.data.id}::uuid`)).rows[0]).toEqual({ status: 'ABANDONED' });
  });

  it('batas 30/jam: permintaan ke-31 -> 429', async () => {
    const { u, set } = await setup();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await start(u, set.id)).status;
    expect(last).toBe(429);
  });
});

describe('PUT answers', () => {
  it('jawaban benar -> feedback lengkap dan baris attempt_answers; sesuai skema kontrak', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    const q = dto.questions[0];
    const r = await put(u, dto.id, q.question_id, rightOf(q));
    expect(r.status).toBe(200);
    expect(SubmitAnswerResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ question_id: q.question_id, saved: true, answered_count: 1, next_question: null });
    expect(r.json.data.feedback).toMatchObject({ is_correct: true, score: 1, max_score: 1, correct_answer: { display: [`right-${q.prompt.slice(1)}`] }, explanation_id: `Pembahasan ${q.prompt.slice(1)}` });
    const row = (await db.execute(sql`SELECT is_correct, score::float AS score, speed_streak_len, within_target_time FROM attempt_answers WHERE attempt_id = ${dto.id}::uuid`)).rows[0];
    expect(row).toEqual({ is_correct: true, score: 1, speed_streak_len: 1, within_target_time: true });
  });

  it('kunci tak dikenal (is_correct, time_spent_ms) -> 400 unrecognized_key dan tidak ada baris', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    const q = dto.questions[0];
    const a = await put(u, dto.id, q.question_id, { option_ids: ['x'] }, { is_correct: true });
    expect(a.status).toBe(400);
    expect(a.json.error.details[0]).toMatchObject({ path: 'is_correct', code: 'unrecognized_key' });
    const b = await put(u, dto.id, q.question_id, rightOf(q), { time_spent_ms: 1 });
    expect(b.json.error.details[0]).toMatchObject({ path: 'time_spent_ms', code: 'unrecognized_key' });
    const c = await put(u, dto.id, q.question_id, { ...rightOf(q), score: 5 });
    expect(c.json.error.details[0]).toMatchObject({ path: 'response.score', code: 'unrecognized_key' });
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM attempt_answers`)).rows[0]).toEqual({ n: 0 });
  });

  it('bentuk salah: option_id tak dikenal / kosong / tipe salah -> 400 dengan kode details', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    const id = dto.questions[0].question_id;
    expect((await put(u, dto.id, id, { option_ids: ['ozzzzzz'] })).json.error.details[0].code).toBe('unknown_option_id');
    expect((await put(u, dto.id, id, { option_ids: [] })).json.error.details[0].code).toBe('response_shape_invalid');
    expect((await put(u, dto.id, id, { text: 'a' })).json.error.details[0].code).toBe('unrecognized_key');
    expect((await put(u, dto.id, id, 'bukan objek')).status).toBe(400);
  });

  it('PRACTICE: jawaban sama diulang -> 200 feedback sama; jawaban beda -> 409 dan baris tidak berubah', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    const q = dto.questions[0];
    const a = await put(u, dto.id, q.question_id, rightOf(q));
    const b = await put(u, dto.id, q.question_id, rightOf(q));
    expect(b.status).toBe(200);
    expect(b.json.data.feedback).toEqual(a.json.data.feedback);
    expect(b.json.data.answered_count).toBe(1);
    const c = await put(u, dto.id, q.question_id, wrongOf(q));
    expect(c.status).toBe(409);
    expect(c.json.error.code).toBe('QUESTION_ALREADY_ANSWERED');
    expect((await db.execute(sql`SELECT is_correct FROM attempt_answers WHERE attempt_id = ${dto.id}::uuid`)).rows).toEqual([{ is_correct: true }]);
  });

  it('question_id bukan bagian attempt -> 404; attempt milik pengguna lain -> 404 di semua endpoint', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    expect((await put(u, dto.id, 'Q-TIDAK-ADA', { option_ids: ['x'] })).status).toBe(404);
    const other = await learnerSession();
    const q = dto.questions[0];
    expect((await put(other, dto.id, q.question_id, rightOf(q))).status).toBe(404);
    expect((await get(other, dto.id)).status).toBe(404);
    expect((await submit(other, dto.id)).status).toBe(404);
    expect((await result(other, dto.id)).status).toBe(404);
    expect((await get(u, randomUUID())).status).toBe(404);
  });

  it('WRITING_TASK -> 409 QUESTION_REQUIRES_SUBMISSION', async () => {
    const { u, set } = await setup({ questions: [...mcqs(2), Q.writing({ question_id: 'Q-W1' })] });
    const dto = (await start(u, set.id)).json.data;
    const r = await put(u, dto.id, 'Q-W1', { text: 'esai' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('QUESTION_REQUIRES_SUBMISSION');
  });

  it('FILL_IN_BLANK dinormalisasi; MATCHING parsial; MCQ_MULTI himpunan persis (melalui API)', async () => {
    const qs = [
      Q.fill({ question_id: 'Q-F', correct_answers: ['are sorted'], max_words: 2 }),
      Q.fill({ question_id: 'Q-F2', correct_answers: ['are sorted'], max_words: 2 }),
      Q.fill({ question_id: 'Q-F3', correct_answers: ['are sorted'], max_words: 2 }),
      Q.drop({ question_id: 'Q-M', matching: { left: ['1', '2', '3', '4'], right: ['w', 'x', 'y', 'z'] }, correct_answers: [0, 1, 2, 3], points: 4 }),
      Q.multi({ question_id: 'Q-X', options: ['A', 'B', 'C', 'D'], correct_answers: ['A', 'C'], points: 2 }),
    ];
    const { u, set } = await setup({ questions: qs });
    const dto = (await start(u, set.id)).json.data;
    const byId = Object.fromEntries(dto.questions.map((q: Dto) => [q.question_id, q]));
    expect((await put(u, dto.id, 'Q-F', { text: '  Are   Sorted. ' })).json.data.feedback.is_correct).toBe(true);
    expect((await put(u, dto.id, 'Q-F2', { text: 'were sorted' })).json.data.feedback.is_correct).toBe(false);
    const quick = await put(u, dto.id, 'Q-F3', { text: 'are sorted quickly' });
    expect(quick.json.data.feedback.is_correct).toBe(false);
    expect(quick.json.data.feedback.correct_answer.display).toEqual(['are sorted']);

    const m = byId['Q-M'].matching;
    const choice = (t: string) => m.right.find((r: Dto) => r.text === t).choice_id;
    const pm = await put(u, dto.id, 'Q-M', { pairs: [{ item_id: 'i0', choice_id: choice('w') }, { item_id: 'i1', choice_id: choice('x') }, { item_id: 'i2', choice_id: choice('y') }] });
    expect(pm.json.data.feedback).toMatchObject({ is_correct: false, score: 3, max_score: 4 });
    expect(pm.json.data.feedback.correct_answer.display).toEqual(['1 -> w', '2 -> x', '3 -> y', '4 -> z']);

    const x = byId['Q-X'];
    const opt = (t: string) => x.options.find((o: Dto) => o.text === t).option_id;
    expect((await put(u, dto.id, 'Q-X', { option_ids: [opt('A'), opt('C'), opt('D')] })).json.data.feedback.score).toBe(0);
  });

  it('batas 60/menit: permintaan ke-61 -> 429', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    const q = dto.questions[0];
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await put(u, dto.id, q.question_id, rightOf(q))).status;
    expect(last).toBe(429);
  });

  it('streak kecepatan dengan jam server terkendali: benar-cepat 1 lalu 2, salah mereset, lambat mereset', async () => {
    const { u, set } = await setup({ questions: mcqs(5, { target_time_ms: 10000 }) });
    let t = Date.parse('2026-11-03T10:00:00.000Z');
    setClockForTest(() => t);
    const dto = (await start(u, set.id)).json.data;
    const qs = dto.questions;
    const step = async (ms: number, right: boolean, i: number) => {
      t += ms;
      return put(u, dto.id, qs[i].question_id, right ? rightOf(qs[i]) : wrongOf(qs[i]));
    };
    await step(4000, true, 0);
    await step(6000, true, 1);
    await step(2000, false, 2);
    await step(3000, true, 3); // benar & cepat, tetapi streak sebelumnya 0 -> 1
    await step(15000, true, 4); // lambat (> 10 dtk) -> 0
    const rows = (await db.execute(sql`SELECT speed_streak_len AS s, within_target_time AS w, time_spent_ms AS ms FROM attempt_answers WHERE attempt_id = ${dto.id}::uuid ORDER BY answered_at`)).rows;
    expect(rows).toEqual([
      { s: 1, w: true, ms: 4000 },
      { s: 2, w: true, ms: 6000 },
      { s: 0, w: true, ms: 2000 },
      { s: 1, w: true, ms: 3000 },
      { s: 0, w: false, ms: 15000 },
    ]);
  });
});

describe('GET /attempts/{id} (resume)', () => {
  it('memuat jawaban tersimpan, answered_count, current_index; feedback PRACTICE ada', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    await answerAll(u, dto, 3, 7);
    const g = await get(u, dto.id);
    expect(g.status).toBe(200);
    expect(g.json.data).toMatchObject({ resumed: true, answered_count: 3, current_index: 3, status: 'IN_PROGRESS' });
    expect(g.json.data.answers).toHaveLength(3);
    expect(g.json.data.answers[0].feedback).toMatchObject({ is_correct: true });
    expect(g.json.data.questions.map((q: Dto) => q.question_id)).toEqual(dto.questions.map((q: Dto) => q.question_id));
  });

  it('soal AI (Writing) tidak memblokir current_index', async () => {
    const { u, set } = await setup({ questions: [Q.writing({ question_id: 'Q-W1' }), ...mcqs(2)], passPercent: 50 });
    await db.update(assessmentSets).set({ readingPassageMarkdown: 'urutan asli dipertahankan' }).where(eq(assessmentSets.id, set.id));
    const dto = (await start(u, set.id)).json.data;
    expect(dto.questions[0].question_id).toBe('Q-W1');
    expect(dto.current_index).toBe(1);
  });
});

describe('POST submit dan GET result', () => {
  it('8 dari 10 benar -> GRADED, 80.0, lulus, sub-modul COMPLETED, sub-modul berikutnya terbuka; sesuai skema kontrak', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    await answerAll(u, dto, 8);
    const r = await submit(u, dto.id);
    expect(r.status).toBe(200);
    expect(AttemptResultResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d.attempt).toMatchObject({ status: 'GRADED', mode: 'PRACTICE', raw_score: 8, max_score: 10, score_percent: 80, pass_percent: 75, passed: true, points_awarded: 0, band_score: null });
    expect(d.per_skill).toEqual([{ skill: 'GRAMMAR', raw_score: 8, max_score: 10, score_percent: 80 }]);
    expect(d.progress).toMatchObject({ status: 'COMPLETED', mastery_crown: 'NONE', best_score_percent: 80, next_sub_module_code: '1.1.2' });
    expect(d.progress.unlocked.map((x: Dto) => x.kind)).toContain('SUB_MODULE');
    expect(d.review).toHaveLength(10);
    expect(d.review[0]).toHaveProperty('correct_answer');
    expect(d.review[0]).toHaveProperty('explanation_id');
    expect(d).toMatchObject({ skip: null, boss: null, placement: null, gamification: null });
    const p = await progressOf(u.user.id, '1.1.1');
    expect(p).toMatchObject({ status: 'COMPLETED', best_score_percent: 80, attempts_count: 1 });
    const next = await progressOf(u.user.id, '1.1.2');
    expect(next.status).toBe('UNLOCKED');
    const res = await result(u, dto.id);
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual(d);
  });

  it('7 dari 10 -> 70.0, tidak lulus, sub-modul tidak COMPLETED, best_score_percent diperbarui', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    await answerAll(u, dto, 7);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt).toMatchObject({ score_percent: 70, passed: false });
    expect(d.progress).toMatchObject({ status: 'IN_PROGRESS', best_score_percent: 70, unlocked: [] });
    expect((await progressOf(u.user.id, '1.1.2')).status).toBe('LOCKED');
  });

  it('batas 75.00 persis (3 dari 4 poin) lulus; ambang dari pass_percent set', async () => {
    const { u, set } = await setup({ questions: mcqs(4) });
    const dto = (await start(u, set.id)).json.data;
    await answerAll(u, dto, 3);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt).toMatchObject({ score_percent: 75, passed: true });
  });

  it('ambang set 90: 80% tidak lulus dan gerbang konsisten', async () => {
    const { u, set } = await setup({ passPercent: 90 });
    const dto = (await start(u, set.id)).json.data;
    expect(dto.pass_percent).toBe(90);
    await answerAll(u, dto, 8);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt).toMatchObject({ passed: false, pass_percent: 90 });
    expect((await progressOf(u.user.id, '1.1.1')).status).toBe('IN_PROGRESS');
  });

  it('soal tak terjawab dihitung salah; soal AI dikecualikan dari max_score dan raw_score', async () => {
    const qs = [...mcqs(9), Q.writing({ question_id: 'Q-W1', points: 5 })];
    const { u, set } = await setup({ questions: qs });
    const dto = (await start(u, set.id)).json.data;
    await answerAll(u, dto, 8, 1); // jawab 8 benar dan 1 salah; 1 soal terakhir (acak) dibiarkan
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt.max_score).toBe(9);
    expect(d.attempt.raw_score).toBeLessThanOrEqual(8);
    expect(d.review.every((x: Dto) => typeof x.is_correct === 'boolean')).toBe(true);
    expect(d.review.find((x: Dto) => x.question_id === 'Q-W1')).toBeUndefined();
    const unanswered = d.review.filter((x: Dto) => x.response === null);
    expect(unanswered.length).toBeGreaterThanOrEqual(0);
    for (const x of unanswered) expect(x).toMatchObject({ is_correct: false, score: 0 });
  });

  it('submit dua kali berurutan dan serentak: hasil identik, attempts_count +1, hook sekali', async () => {
    const calls: number[] = [];
    attemptCompletedHooks.push(async () => void calls.push(1));
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    await answerAll(u, dto, 8);
    const rs = await Promise.all([submit(u, dto.id), submit(u, dto.id), submit(u, dto.id)]);
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(new Set(rs.map((r) => JSON.stringify(r.json))).size).toBe(1);
    const again = await submit(u, dto.id);
    expect(JSON.stringify(again.json)).toBe(JSON.stringify(rs[0]!.json));
    expect(calls).toHaveLength(1);
    expect((await progressOf(u.user.id, '1.1.1')).attempts_count).toBe(1);
  });

  it('answer setelah GRADED -> 409 ATTEMPT_NOT_ACTIVE; result sebelum selesai -> 409 ATTEMPT_NOT_FINISHED', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    expect((await result(u, dto.id)).json.error.code).toBe('ATTEMPT_NOT_FINISHED');
    await submit(u, dto.id);
    const r = await put(u, dto.id, dto.questions[0].question_id, rightOf(dto.questions[0]));
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    const g = await get(u, dto.id);
    expect(g.json.data.status).toBe('GRADED');
    expect(g.json.data.questions).toEqual([]);
  });

  it('kegagalan hook membatalkan seluruh submit: attempt tetap IN_PROGRESS, progres tidak berubah, 500', async () => {
    attemptCompletedHooks.push(async () => {
      throw new Error('hook gagal');
    });
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    await answerAll(u, dto, 8);
    const r = await submit(u, dto.id);
    expect(r.status).toBe(500);
    expect(r.json.error.code).toBe('INTERNAL_ERROR');
    expect((await db.execute(sql`SELECT status FROM attempts WHERE id = ${dto.id}::uuid`)).rows[0]).toEqual({ status: 'IN_PROGRESS' });
    const p = await progressOf(u.user.id, '1.1.1');
    expect(p.attempts_count).toBe(0);
    expect(p.status).not.toBe('COMPLETED');
    attemptCompletedHooks.length = 0;
    expect((await submit(u, dto.id)).status).toBe(200); // pulih: submit ulang berhasil
  });

  it('ATTEMPT_ABANDONED tidak dapat disubmit', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    await db.execute(sql`UPDATE attempts SET status = 'ABANDONED' WHERE id = ${dto.id}::uuid`);
    expect((await submit(u, dto.id)).json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    expect((await result(u, dto.id)).json.error.code).toBe('ATTEMPT_NOT_FINISHED');
  });
});

describe('mode EXAM (mesin generik, handler uji)', () => {
  const examHandler = {
    async start() {
      return { mode: 'EXAM' as const, passPercent: 50, questionLimit: null, keepOrder: false };
    },
    async onFinish() {
      return { progress: null };
    },
  };
  async function examSet(n = 4) {
    const mod = (await db.execute(sql`SELECT id FROM modules WHERE module_code = '1.1'`)).rows[0] as { id: string };
    const [s] = await db
      .insert(assessmentSets)
      .values({ assessmentType: 'SKIP_MODULE_TEST', title: 'Ujian uji', moduleId: mod.id, timeLimitSeconds: 300, questionsJson: mcqs(n), questionCount: n, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
      .returning();
    return s!;
  }

  it('deadline = started_at + time_limit; PUT tanpa feedback; boleh diganti sebelum submit; review tanpa kunci', async () => {
    assessmentTypeHandlers.SKIP_MODULE_TEST = examHandler;
    const { u } = await setup();
    const set = await examSet(4);
    const t0 = Date.parse('2026-11-03T10:00:00.000Z');
    setClockForTest(() => t0);
    const dto = (await start(u, set.id)).json.data;
    expect(dto.mode).toBe('EXAM');
    expect(dto.deadline_at).toBe('2026-11-03T10:05:00.000Z');
    expect(dto.remaining_seconds).toBe(300);
    const q = dto.questions[0];
    const a = await put(u, dto.id, q.question_id, wrongOf(q));
    expect(a.json.data.feedback).toBeNull();
    const b = await put(u, dto.id, q.question_id, rightOf(q)); // jawab ulang diizinkan
    expect(b.status).toBe(200);
    expect(b.json.data.answered_count).toBe(1);
    expect((await result(u, dto.id)).json.error.code).toBe('ATTEMPT_NOT_FINISHED');
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt).toMatchObject({ mode: 'EXAM', raw_score: 1, max_score: 4, score_percent: 25, passed: false, pass_percent: 50 });
    // QA F-08-01: hasil EXAM untuk set Skip tidak memuat benar/salah per soal; hanya agregat + per_skill.
    expect(d.review).toBeNull();
    expect(JSON.stringify(d)).not.toContain('is_correct');
    expect(d.per_skill.length).toBeGreaterThan(0);
    const g = (await get(u, dto.id)).json.data;
    expect(g.answers[0].feedback).toBeNull();
  });

  it('jam +301 detik: PUT -> 409 ATTEMPT_EXPIRED, attempt EXPIRED, jawaban sebelum deadline tetap dinilai', async () => {
    assessmentTypeHandlers.SKIP_MODULE_TEST = examHandler;
    const { u } = await setup();
    const set = await examSet(4);
    let t = Date.parse('2026-11-03T10:00:00.000Z');
    setClockForTest(() => t);
    const dto = (await start(u, set.id)).json.data;
    await put(u, dto.id, dto.questions[0].question_id, rightOf(dto.questions[0]));
    await put(u, dto.id, dto.questions[1].question_id, rightOf(dto.questions[1]));
    t += 304_000; // dalam masa tenggang 5 detik setelah deadline (300 s): masih diterima
    expect((await put(u, dto.id, dto.questions[2].question_id, rightOf(dto.questions[2]))).status).toBe(200);
    t += 2_000; // 306 s > 300 + 5
    const r = await put(u, dto.id, dto.questions[3].question_id, rightOf(dto.questions[3]));
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ATTEMPT_EXPIRED');
    const row = (await db.execute(sql`SELECT status, submitted_at, raw_score::float AS raw, max_score::float AS max FROM attempts WHERE id = ${dto.id}::uuid`)).rows[0] as Dto;
    expect(row.status).toBe('EXPIRED');
    expect(new Date(row.submitted_at).toISOString()).toBe('2026-11-03T10:05:00.000Z');
    expect(row).toMatchObject({ raw: 3, max: 4 });
    const res = await result(u, dto.id);
    expect(res.status).toBe(200);
    expect(res.json.data.attempt).toMatchObject({ status: 'EXPIRED', raw_score: 3, max_score: 4, score_percent: 75 });
    expect((await put(u, dto.id, dto.questions[3].question_id, rightOf(dto.questions[3]))).json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
  });

  it('submit melewati deadline -> 409 ATTEMPT_EXPIRED; mulai ulang setelah kedaluwarsa membuat attempt baru', async () => {
    assessmentTypeHandlers.SKIP_MODULE_TEST = examHandler;
    const { u } = await setup();
    const set = await examSet(2);
    let t = Date.parse('2026-11-03T10:00:00.000Z');
    setClockForTest(() => t);
    const a = (await start(u, set.id)).json.data;
    t += 400_000;
    const s = await submit(u, a.id);
    expect(s.status).toBe(409);
    expect(s.json.error.code).toBe('ATTEMPT_EXPIRED');
    expect((await submit(u, a.id)).status).toBe(200); // idempoten setelah EXPIRED (hasil tersedia)
    const b = await start(u, set.id);
    expect(b.status).toBe(201);
    expect(b.json.data.id).not.toBe(a.id);
  });

  it('GET attempt melewati deadline memproses kedaluwarsa (status EXPIRED, soal kosong)', async () => {
    assessmentTypeHandlers.SKIP_MODULE_TEST = examHandler;
    const { u } = await setup();
    const set = await examSet(2);
    let t = Date.parse('2026-11-03T10:00:00.000Z');
    setClockForTest(() => t);
    const a = (await start(u, set.id)).json.data;
    t += 400_000;
    const g = (await get(u, a.id)).json.data;
    expect(g.status).toBe('EXPIRED');
    expect(g.questions).toEqual([]);
    expect(g.remaining_seconds).toBe(0);
  });
});

describe('gerbang hanya lewat GatekeepingService', () => {
  it('lulus drill tidak menulis kolom gerbang secara langsung: status berasal dari applyDrillResult (attempts_count tepat +1 per attempt)', async () => {
    const { u, set } = await setup();
    for (let i = 0; i < 2; i++) {
      const dto = (await start(u, set.id)).json.data;
      await answerAll(u, dto, i === 0 ? 5 : 9);
      await submit(u, dto.id);
    }
    const p = await progressOf(u.user.id, '1.1.1');
    expect(p).toMatchObject({ attempts_count: 2, best_score_percent: 90, status: 'COMPLETED' });
  });
});
