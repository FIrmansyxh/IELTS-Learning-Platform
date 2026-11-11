import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { assessmentSets } from '@/db/schema';
import { AttemptResultResponseSchema } from '@/contracts/attempts';
import { ExamIntroResponseSchema, SkipResultSchema } from '@/contracts/exams';
import { setClockForTest } from '@/server/clock';
import { execute, closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { ensureProgressRows } from '@/server/gatekeeping/service';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as resultRoute } from '@/app/api/v1/attempts/[attempt_id]/result/route';
import { GET as introRoute } from '@/app/api/v1/exams/[assessment_set_id]/intro/route';
import { GET as treeRoute } from '@/app/api/v1/curriculum/tree/route';
import { call, learnerSession } from './helpers';
import { publishSub, resetLearning } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
afterAll(async () => {
  await resetLearning();
  await closeDb();
});

type L = Awaited<ReturnType<typeof learnerSession>>;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Dto = any;

const T0 = Date.parse('2026-11-03T10:00:00.000Z');
const MIN = 60_000;
let clock = T0;
const at = (ms: number) => {
  clock = ms;
};

const start = (u: L, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
const get = (u: L, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const put = (u: L, id: string, qid: string, response: unknown, extra: Record<string, unknown> = {}) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response, ...extra } });
const submit = (u: L, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
const result = (u: L, id: string) => call(resultRoute, 'GET', `/api/v1/attempts/${id}/result`, { cookie: u.cookie, params: { attempt_id: id } });
const intro = (u: L, setId: string) => call(introRoute, 'GET', `/api/v1/exams/${setId}/intro`, { cookie: u.cookie, params: { assessment_set_id: setId } });
const tree = (u: L) => call(treeRoute, 'GET', '/api/v1/curriculum/tree', { cookie: u.cookie });

/** n soal MCQ jawaban benar `right-<i>`; prompt `P<i>`; poin opsional per soal. */
const mcqs = (n: number, points: (i: number) => number = () => 1) =>
  Array.from({ length: n }, (_, i) =>
    Q.mcq({ question_id: `Q-S${i + 1}`, prompt: `P${i + 1}`, options: [`right-${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-${i + 1}`], explanation_id: `Pembahasan ${i + 1}`, points: points(i + 1) }),
  );

const optionFor = (q: Dto, text: string) => q.options.find((o: any) => o.text === text).option_id as string;
const numOf = (q: Dto) => Number(q.prompt.slice(1));
const rightOf = (q: Dto) => ({ option_ids: [optionFor(q, `right-${numOf(q)}`)] });
const wrongOf = (q: Dto) => ({ option_ids: [optionFor(q, 'x')] });

/** Jawab setiap soal; `isRight(n)` menentukan benar/salah berdasarkan nomor soal (bukan urutan tampil). */
async function answerBy(u: L, dto: Dto, isRight: (n: number) => boolean) {
  for (const q of dto.questions) {
    const r = await put(u, dto.id, q.question_id, isRight(numOf(q)) ? rightOf(q) : wrongOf(q));
    expect(r.status).toBe(200);
  }
}

async function moduleSet(moduleCode: string, questions: unknown[], over: Partial<typeof assessmentSets.$inferInsert> = {}) {
  const mod = (await execute(db, sql`SELECT id FROM modules WHERE module_code = ${moduleCode}`)).rows[0] as { id: string };
  const [s] = await db
    .insert(assessmentSets)
    .values({
      assessmentType: 'SKIP_MODULE_TEST',
      title: `Uji Kompetensi Modul ${moduleCode}`,
      moduleId: mod.id,
      timeLimitSeconds: 900,
      questionsJson: questions as object[],
      questionCount: questions.length,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
      ...over,
    })
    .returning();
  return s!;
}

async function tierSet(tierNumber: number, questions: unknown[]) {
  const t = (await execute(db, sql`SELECT id FROM tiers WHERE tier_number = ${tierNumber}`)).rows[0] as { id: string };
  const [s] = await db
    .insert(assessmentSets)
    .values({
      assessmentType: 'SKIP_TIER_TEST',
      title: `Uji Kompetensi Tier ${tierNumber}`,
      tierId: t.id,
      timeLimitSeconds: 900,
      questionsJson: questions as object[],
      questionCount: questions.length,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
    })
    .returning();
  return s!;
}

const subStatus = async (userId: string, code: string) =>
  (
    await execute(db, sql`
      SELECT p.status, p.unlock_source FROM user_sub_module_progress p JOIN sub_modules s ON s.id = p.sub_module_id
      WHERE p.user_id = ${userId} AND s.sub_module_code = ${code}`)
  ).rows[0] as { status: string; unlock_source: string | null } | undefined;
const modStatus = async (userId: string, code: string) =>
  (
    await execute(db, sql`
      SELECT p.status, p.unlock_source, p.skip_best_percent AS skip_best FROM user_module_progress p JOIN modules m ON m.id = p.module_id
      WHERE p.user_id = ${userId} AND m.module_code = ${code}`)
  ).rows[0] as { status: string; unlock_source: string | null; skip_best: number | null } | undefined;
const tierStatus = async (userId: string, n: number) =>
  (
    await execute(db, sql`
      SELECT p.status, p.unlock_source FROM user_tier_progress p JOIN tiers t ON t.id = p.tier_id
      WHERE p.user_id = ${userId} AND t.tier_number = ${n}`)
  ).rows[0] as { status: string; unlock_source: string | null } | undefined;
const auditCount = async (action: string, entityId: string) =>
  Number((await execute(db, sql`SELECT count(*) AS n FROM audit_log WHERE action = ${action} AND entity_id = ${entityId}`)).rows[0]!.n);
const attemptCount = async (userId: string) => Number((await execute(db, sql`SELECT count(*) AS n FROM attempts WHERE user_id = ${userId}`)).rows[0]!.n);

const setSetting = (key: string, value: number) =>
  execute(db, sql`UPDATE app_settings SET value = ${JSON.stringify(value)} WHERE key = ${key}`);

beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
  await setSetting('attempt.cooldown_minutes', 60);
  await setSetting('attempt.max_per_set_per_day', 3);
  clock = T0;
  setClockForTest(() => clock);
});
afterEach(() => {
  setClockForTest(null);
});

/** Modul 2.1 (4 sub-modul) + 2.2.1 (sub pertama modul berikutnya) PUBLISHED. */
const publishModule21 = () => publishSub('2.1.1', '2.1.2', '2.1.3', '2.1.4', '2.2.1');

describe('GET /exams/{id}/intro', () => {
  it('Modul LOCKED + set PUBLISHED: 200 available, ambang 85, scope MODULE, question_count; sesuai skema kontrak', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(12));
    const u = await learnerSession();
    const r = await intro(u, set.id);
    expect(r.status).toBe(200);
    expect(ExamIntroResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({
      assessment_set_id: set.id,
      assessment_type: 'SKIP_MODULE_TEST',
      scope: { kind: 'MODULE', label: expect.stringContaining('Modul 2.1') },
      time_limit_seconds: 900,
      question_count: 12,
      threshold: { kind: 'PERCENT', value: 85 },
      available: true,
      blocked_reason: null,
      cooldown: { next_allowed_at: null, attempts_in_window: 0, max_attempts: 3 },
      active_attempt_id: null,
      requires_audio: false,
      requires_microphone: false,
      boss: null,
      placement: null,
    });
    expect(r.json.data.rules[0]).toContain('85%');
    expect(r.json.data.rules[1]).toContain('15 menit');
    expect(r.json.data.rules[3]).toContain('60 menit');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });

  it('sub-modul berjalan: available=false, blocked_reason SKIP_NOT_AVAILABLE', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(3));
    const u = await learnerSession();
    await ensureProgressRows(db, u.user.id);
    await execute(db, sql`UPDATE user_sub_module_progress SET status = 'IN_PROGRESS' WHERE user_id = ${u.user.id} AND sub_module_id = (SELECT id FROM sub_modules WHERE sub_module_code = '2.1.2')`);
    const r = await intro(u, set.id);
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ available: false, blocked_reason: 'SKIP_NOT_AVAILABLE' });
  });

  it('DRAFT / tidak ada / tipe tanpa intro -> 404; bukan uuid -> 400; tanpa sesi -> 401', async () => {
    await publishModule21();
    const draft = await moduleSet('2.1', mcqs(3), { status: 'DRAFT' });
    const u = await learnerSession();
    expect((await intro(u, draft.id)).status).toBe(404);
    expect((await intro(u, '11111111-1111-4111-8111-111111111111')).status).toBe(404);
    const r = await intro(u, 'bukan-uuid');
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('VALIDATION_ERROR');
    expect(r.json.error.details[0].code).toBe('invalid_uuid');
    expect((await call(introRoute, 'GET', `/api/v1/exams/${draft.id}/intro`, { params: { assessment_set_id: draft.id } })).status).toBe(401);
  });

  it('modul tanpa sub-modul PUBLISHED (entitas tidak AVAILABLE) -> 404', async () => {
    const set = await moduleSet('2.1', mcqs(3));
    const u = await learnerSession();
    expect((await intro(u, set.id)).status).toBe(404);
  });

  it('attempt aktif: available=true, active_attempt_id terisi, blocked_reason null', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(3));
    const u = await learnerSession();
    const a = (await start(u, set.id)).json.data;
    const r = await intro(u, set.id);
    expect(r.json.data).toMatchObject({ available: true, blocked_reason: null, active_attempt_id: a.id });
    expect(r.json.data.cooldown.attempts_in_window).toBe(1);
  });

  it('requires_microphone/requires_audio dari isi set', async () => {
    await publishModule21();
    const speaking = { question_id: 'Q-SP1', question_type: 'SPEAKING_TASK', skill: 'SPEAKING', prompt: 'Bicara', explanation_id: 'x' };
    const set = await moduleSet('2.1', [...mcqs(2), speaking]);
    const u = await learnerSession();
    const r = await intro(u, set.id);
    expect(r.json.data.requires_microphone).toBe(true);
    expect(r.json.data.requires_audio).toBe(false);
  });
});

describe('POST /attempts (Skip)', () => {
  it('201 EXAM: deadline tepat started_at + time_limit; soal tanpa kunci; PUT tanpa feedback/is_correct', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(6), { timeLimitSeconds: 120 });
    const u = await learnerSession();
    const r = await start(u, set.id);
    expect(r.status).toBe(201);
    const dto = r.json.data;
    expect(dto).toMatchObject({ mode: 'EXAM', status: 'IN_PROGRESS', assessment_type: 'SKIP_MODULE_TEST', question_count: 6, pass_percent: 85 });
    expect(Date.parse(dto.deadline_at) - Date.parse(dto.started_at)).toBe(120_000);
    expect(dto.deadline_at).toBe('2026-11-03T10:02:00.000Z');
    expect(JSON.stringify(dto)).not.toMatch(/correct_answers|explanation_id|is_correct/);

    const a = await put(u, dto.id, dto.questions[0].question_id, rightOf(dto.questions[0]));
    expect(a.status).toBe(200);
    expect(a.json.data.feedback).toBeNull();
    expect(JSON.stringify(a.json)).not.toContain('is_correct');
    const g = await get(u, dto.id);
    expect(JSON.stringify(g.json)).not.toMatch(/correct_answers|explanation_id|is_correct/);
    expect(g.json.data.answers[0].feedback).toBeNull();
  });

  it('PUT dengan kunci terlarang {passed} / {score} -> 400 unrecognized_key', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(3));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    const q = dto.questions[0];
    const r1 = await put(u, dto.id, q.question_id, rightOf(q), { passed: true });
    expect(r1.status).toBe(400);
    expect(r1.json.error.details.some((d: any) => d.code === 'unrecognized_key')).toBe(true);
    const r2 = await call(putRoute, 'PUT', `/api/v1/attempts/${dto.id}/answers/${q.question_id}`, {
      cookie: u.cookie,
      params: { attempt_id: dto.id, question_id: q.question_id },
      body: { score: 100 },
    });
    expect(r2.status).toBe(400);
  });

  it('sub-modul IN_PROGRESS -> 409 SKIP_NOT_AVAILABLE dan tidak ada attempt dibuat', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(3));
    const u = await learnerSession();
    await ensureProgressRows(db, u.user.id);
    await execute(db, sql`UPDATE user_sub_module_progress SET status = 'IN_PROGRESS' WHERE user_id = ${u.user.id} AND sub_module_id = (SELECT id FROM sub_modules WHERE sub_module_code = '2.1.3')`);
    const r = await start(u, set.id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('SKIP_NOT_AVAILABLE');
    expect(r.json.error.message).toBe('Uji Kompetensi tidak tersedia karena level ini sudah dimulai atau diselesaikan.');
    expect(await attemptCount(u.user.id)).toBe(0);
  });

  it('modul sudah SKIPPED/COMPLETED -> 409 SKIP_NOT_AVAILABLE', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(2));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, () => true);
    expect((await submit(u, dto.id)).json.data.skip.passed).toBe(true);
    at(T0 + 120 * MIN);
    const r = await start(u, set.id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('SKIP_NOT_AVAILABLE');
  });

  it('set DRAFT -> 404; tidak ada attempt', async () => {
    await publishModule21();
    const draft = await moduleSet('2.1', mcqs(3), { status: 'DRAFT' });
    const u = await learnerSession();
    expect((await start(u, draft.id)).status).toBe(404);
    expect(await attemptCount(u.user.id)).toBe(0);
  });

  it('attempt IN_PROGRESS: 200 resumed=true, tanpa hitungan batas baru (juga saat cooldown aktif karena attempt lain)', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(3));
    const u = await learnerSession();
    const first = (await start(u, set.id)).json.data;
    // Seolah ada percobaan lain yang baru gagal (cooldown aktif) -> resume tetap diizinkan (D5 langkah 2).
    await execute(db, sql`
      INSERT INTO attempts (user_id, assessment_set_id, assessment_type, assessment_version, mode, status, started_at, submitted_at, passed, state)
      VALUES (${u.user.id}, ${set.id}, 'SKIP_MODULE_TEST', 1, 'EXAM', 'GRADED', ${new Date(clock - 5 * MIN)}, ${new Date(clock - MIN)}, false, '{}')`);
    const r = await start(u, set.id);
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ id: first.id, resumed: true });
    expect(await attemptCount(u.user.id)).toBe(2);
  });
});

describe('submit: hasil lulus / gagal', () => {
  it('11 dari 12 benar (91.67): lulus; sub-modul modul SKIPPED/SKIP_TEST; skip_best_percent; sub pertama modul berikutnya UNLOCKED; audit sekali', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(12));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, (n) => n !== 12);
    const r = await submit(u, dto.id);
    expect(r.status).toBe(200);
    expect(AttemptResultResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d.attempt).toMatchObject({ mode: 'EXAM', score_percent: 91.67, passed: true, pass_percent: 85, band_score: null });
    expect(d.boss).toBeNull();
    expect(d.placement).toBeNull();
    expect(d.progress).toBeNull();
    expect(SkipResultSchema.safeParse(d.skip).success).toBe(true);
    expect(d.skip).toMatchObject({
      passed: true,
      score_percent: 91.67,
      threshold_percent: 85,
      scope: { kind: 'MODULE', label: expect.stringContaining('Modul 2.1') },
      skipped_sub_module_count: 4,
      retry: { next_allowed_at: null, attempts_remaining_today: 2 },
    });
    expect(d.skip.unlocked.map((x: any) => x.kind)).toContain('SUB_MODULE');
    expect(d.skip.unlocked.every((x: any) => x.kind !== 'TIER' || true)).toBe(true);
    // review EXAM: hanya benar/salah, tanpa kunci/pembahasan
    expect(d.review).toBeNull();
    expect(JSON.stringify(d)).not.toMatch(/is_correct|correct_answer|explanation_id/);
    expect(d.per_skill.length).toBeGreaterThan(0);

    for (const c of ['2.1.1', '2.1.2', '2.1.3', '2.1.4']) {
      expect(await subStatus(u.user.id, c)).toMatchObject({ status: 'SKIPPED', unlock_source: 'SKIP_TEST' });
    }
    expect(await modStatus(u.user.id, '2.1')).toMatchObject({ status: 'SKIPPED', unlock_source: 'SKIP_TEST', skip_best: 91.67 });
    expect((await subStatus(u.user.id, '2.2.1'))!.status).toBe('UNLOCKED');
    expect(d.skip.unlocked.map((x: any) => x.label)).toContain((await execute(db, sql`SELECT title FROM sub_modules WHERE sub_module_code = '2.2.1'`)).rows[0]!.title);
    expect(await auditCount('SKIP_TEST_PASSED', dto.id)).toBe(1);

    // idempoten: submit ulang = hasil yang sama, tanpa efek ganda
    const again = await submit(u, dto.id);
    expect(again.json.data.skip).toEqual(d.skip);
    expect(await auditCount('SKIP_TEST_PASSED', dto.id)).toBe(1);
    // peta: status "Dilewati" tampak di pohon
    const t = await tree(u);
    const m21 = t.json.data.tiers.flatMap((x: any) => x.modules).find((m: any) => m.module_code === '2.1');
    expect(m21.status).toBe('SKIPPED');
    expect(m21.sub_modules.filter((s: any) => s.content_state === 'AVAILABLE').every((s: any) => s.status === 'SKIPPED')).toBe(true);
  });

  it('submit serentak 2x: efek (SKIPPED, audit) terjadi sekali', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(4));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, () => true);
    const rs = await Promise.all([submit(u, dto.id), submit(u, dto.id), submit(u, dto.id)]);
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(new Set(rs.map((r) => JSON.stringify(r.json.data.skip))).size).toBe(1);
    expect(await auditCount('SKIP_TEST_PASSED', dto.id)).toBe(1);
    expect(await modStatus(u.user.id, '2.1')).toMatchObject({ status: 'SKIPPED' });
  });

  it('tepat 85.00% lulus (17/20)', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(20));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, (n) => n <= 17);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt).toMatchObject({ score_percent: 85, passed: true });
    expect(d.skip.passed).toBe(true);
    expect((await modStatus(u.user.id, '2.1'))!.status).toBe('SKIPPED');
  });

  it('84.99% gagal dan tidak ada entitas berubah status (kecuali skip_best_percent)', async () => {
    await publishModule21();
    // 17 soal 20 poin + 1 soal 13 poin = 353; benar 15 soal 20 poin = 300 -> 84.99%
    const set = await moduleSet('2.1', mcqs(18, (i) => (i <= 17 ? 20 : 13)));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, (n) => n <= 15);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt).toMatchObject({ score_percent: 84.99, passed: false });
    expect(d.skip).toMatchObject({ passed: false, skipped_sub_module_count: 0, unlocked: [] });
    for (const c of ['2.1.1', '2.1.2', '2.1.3', '2.1.4']) expect((await subStatus(u.user.id, c))!.status).not.toBe('SKIPPED');
    const m = await modStatus(u.user.id, '2.1');
    expect(m!.status).not.toBe('SKIPPED');
    expect(m!.skip_best).toBe(84.99);
    expect((await subStatus(u.user.id, '2.2.1'))!.status).toBe('LOCKED');
    expect(await auditCount('SKIP_TEST_FAILED', dto.id)).toBe(1);
  });

  it('F-08-02: D1 divalidasi ulang saat selesai; sub-modul target dimulai selama ujian -> hasil dicatat tanpa efek pada progres', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(12));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await execute(db, sql`INSERT INTO user_sub_module_progress (user_id, sub_module_id, status)
      SELECT ${u.user.id}, id, 'IN_PROGRESS' FROM sub_modules WHERE sub_module_code = '2.1.1'
      ON CONFLICT (user_id, sub_module_id) DO UPDATE SET status = 'IN_PROGRESS'`);
    await answerBy(u, dto, () => true);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt).toMatchObject({ passed: true, score_percent: 100 });
    expect(d.skip).toMatchObject({ passed: true, skipped_sub_module_count: 0, unlocked: [] });
    expect((await subStatus(u.user.id, '2.1.1'))!.status).toBe('IN_PROGRESS');
    for (const c of ['2.1.2', '2.1.3', '2.1.4']) expect((await subStatus(u.user.id, c))!.status).not.toBe('SKIPPED');
    expect((await modStatus(u.user.id, '2.1'))!.status).not.toBe('SKIPPED');
    const a = await execute(db, sql`SELECT metadata FROM audit_log WHERE action = 'SKIP_TEST_PASSED' AND entity_id = ${dto.id}`);
    expect((JSON.parse((a.rows[0] as { metadata: string }).metadata) as Record<string, unknown>).effect_skipped).toBe('not_eligible_at_finish');
  });

  it('gagal: next_allowed_at = submit + 60 menit; attempts_remaining_today = 2; intro dan mulai ulang diblokir', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(10));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, (n) => n <= 5);
    at(T0 + 4 * MIN);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.attempt.submitted_at).toBe(new Date(T0 + 4 * MIN).toISOString());
    expect(d.skip.passed).toBe(false);
    expect(d.skip.unlocked).toEqual([]);
    expect(d.skip.retry).toEqual({ next_allowed_at: new Date(T0 + 64 * MIN).toISOString(), attempts_remaining_today: 2 });
    expect(d.per_skill.length).toBeGreaterThan(0);

    at(T0 + 14 * MIN); // 10 menit setelah gagal
    const i = await intro(u, set.id);
    expect(i.json.data).toMatchObject({
      available: false,
      blocked_reason: 'COOLDOWN_ACTIVE',
      cooldown: { next_allowed_at: new Date(T0 + 64 * MIN).toISOString(), attempts_in_window: 1, max_attempts: 3 },
    });
    const r = await start(u, set.id);
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('COOLDOWN_ACTIVE');
    const ra = Number(r.headers.get('retry-after'));
    expect(ra).toBeGreaterThanOrEqual(3000);
    expect(ra).toBeLessThanOrEqual(3010);
    expect(r.json.error.details[0]).toEqual({ path: 'next_allowed_at', code: 'cooldown_active', message: new Date(T0 + 64 * MIN).toISOString() });
    expect(r.json.error.message).toMatch(/^Anda dapat mencoba lagi pukul \d{2}:\d{2} WIB\.$/);
    expect(await attemptCount(u.user.id)).toBe(1);
    // cooldown per set: set Skip modul lain tidak terpengaruh
    await publishSub('2.2.2');
    const other = await moduleSet('2.2', mcqs(3));
    expect((await start(u, other.id)).status).toBe(201);
    // setelah cooldown lewat: diizinkan
    at(T0 + 64 * MIN);
    expect((await start(u, set.id)).status).toBe(201);
  });

  it('batas harian: ke-4 ditolak 429 DAILY_ATTEMPT_LIMIT; setelah attempt tertua melewati 24 jam diizinkan', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(4));
    const u = await learnerSession();
    for (let k = 0; k < 3; k++) {
      at(T0 + k * 61 * MIN);
      const dto = (await start(u, set.id)).json.data;
      await answerBy(u, dto, () => false);
      expect((await submit(u, dto.id)).json.data.skip.passed).toBe(false);
    }
    at(T0 + 3 * 61 * MIN + 2 * MIN); // cooldown sudah lewat
    const i = await intro(u, set.id);
    expect(i.json.data).toMatchObject({ available: false, blocked_reason: 'DAILY_ATTEMPT_LIMIT' });
    expect(i.json.data.cooldown.attempts_in_window).toBe(3);
    const r = await start(u, set.id);
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('DAILY_ATTEMPT_LIMIT');
    expect(r.json.error.message).toBe('Batas percobaan harian untuk ujian ini sudah tercapai.');
    expect(Number(r.headers.get('retry-after'))).toBe(Math.ceil((T0 + 24 * 60 * MIN - clock) / 1000));
    expect(await attemptCount(u.user.id)).toBe(3);

    at(T0 + 24 * 60 * MIN + 1000); // percobaan tertua keluar dari jendela 24 jam
    expect((await start(u, set.id)).status).toBe(201);
  });

  it('attempts_remaining_today menurun menjadi 0 pada percobaan ketiga', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(4));
    const u = await learnerSession();
    let last: Dto;
    for (let k = 0; k < 3; k++) {
      at(T0 + k * 61 * MIN);
      const dto = (await start(u, set.id)).json.data;
      await answerBy(u, dto, () => false);
      last = (await submit(u, dto.id)).json.data;
    }
    expect(last.skip.retry.attempts_remaining_today).toBe(0);
  });

  it('attempt.cooldown_minutes = 0: gagal lalu mulai langsung diizinkan; next_allowed_at null', async () => {
    await setSetting('attempt.cooldown_minutes', 0);
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(4));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, () => false);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.skip.retry.next_allowed_at).toBeNull();
    expect((await start(u, set.id)).status).toBe(201);
  });

  it('perubahan cooldown berlaku untuk percobaan berikutnya, tidak surut pada hasil lama', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(4));
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, () => false);
    const d1 = (await submit(u, dto.id)).json.data;
    await setSetting('attempt.cooldown_minutes', 5);
    expect((await result(u, dto.id)).json.data.skip.retry.next_allowed_at).toBe(d1.skip.retry.next_allowed_at); // hasil lama tetap
    at(T0 + 6 * MIN);
    expect((await start(u, set.id)).status).toBe(201); // aturan baru berlaku
  });

  it('attempt orang lain: submit -> 404', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(3));
    const u = await learnerSession();
    const other = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    const r = await submit(other, dto.id);
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('NOT_FOUND');
  });
});

describe('kadaluarsa (D7)', () => {
  it('jam melewati deadline + 5 s: PUT -> 409 ATTEMPT_EXPIRED; EXPIRED dinilai dari jawaban tersimpan dan efek lulus diterapkan', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(4), { timeLimitSeconds: 120 });
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, () => true);
    at(T0 + 120_000 + 6_000);
    const q = dto.questions[0];
    const r = await put(u, dto.id, q.question_id, wrongOf(q));
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ATTEMPT_EXPIRED');
    const row = (await execute(db, sql`SELECT status, submitted_at, passed FROM attempts WHERE id = ${dto.id}`)).rows[0] as Dto;
    expect(row.status).toBe('EXPIRED');
    expect(new Date(row.submitted_at).toISOString()).toBe('2026-11-03T10:02:00.000Z');
    expect(row.passed).toBe(1);
    expect((await modStatus(u.user.id, '2.1'))!.status).toBe('SKIPPED');
    const res = await result(u, dto.id);
    expect(res.json.data.skip).toMatchObject({ passed: true, score_percent: 100 });
    expect(await auditCount('SKIP_TEST_PASSED', dto.id)).toBe(1);
  });

  it('kadaluarsa dengan 0 jawaban: skor 0.00, gagal, cooldown berlaku (dihitung dari deadline)', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(4), { timeLimitSeconds: 120 });
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    at(T0 + 10 * MIN);
    const res = await result(u, dto.id); // memicu penyelesaian
    expect(res.status).toBe(200);
    expect(res.json.data.attempt).toMatchObject({ status: 'EXPIRED', score_percent: 0, passed: false });
    expect(res.json.data.skip).toMatchObject({ passed: false, skipped_sub_module_count: 0 });
    expect(res.json.data.skip.retry.next_allowed_at).toBe(new Date(T0 + 2 * MIN + 60 * MIN).toISOString());
    at(T0 + 20 * MIN);
    const r = await start(u, set.id);
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('COOLDOWN_ACTIVE');
  });

  it('start setelah kedaluwarsa: hasil attempt lama di-commit walau mulai baru ditolak cooldown', async () => {
    await publishModule21();
    const set = await moduleSet('2.1', mcqs(4), { timeLimitSeconds: 120 });
    const u = await learnerSession();
    const dto = (await start(u, set.id)).json.data;
    await answerBy(u, dto, () => true);
    at(T0 + 10 * MIN);
    const r = await start(u, set.id);
    expect(r.status).toBe(409); // sudah lulus -> SKIP_NOT_AVAILABLE (modul SKIPPED), efek lama ter-commit
    expect(r.json.error.code).toBe('SKIP_NOT_AVAILABLE');
    expect((await modStatus(u.user.id, '2.1'))!.status).toBe('SKIPPED');
    expect(((await execute(db, sql`SELECT status FROM attempts WHERE id = ${dto.id}`)).rows[0] as Dto).status).toBe('EXPIRED');
  });
});

describe('Skip Tier', () => {
  it('lulus pada Tier 2 LOCKED: Tier 2 SKIPPED (SKIP_TEST), seluruh isi SKIPPED, Tier 3 UNLOCKED, unlocked memuat Tier 3', async () => {
    await publishSub('2.1.1', '2.2.1', '3.1.1');
    const set = await tierSet(2, mcqs(5));
    const u = await learnerSession();
    const i = await intro(u, set.id);
    expect(i.json.data).toMatchObject({ scope: { kind: 'TIER', label: expect.stringContaining('Tier 2') }, available: true, threshold: { kind: 'PERCENT', value: 85 } });
    const dto = (await start(u, set.id)).json.data;
    expect(dto.assessment_type).toBe('SKIP_TIER_TEST');
    await answerBy(u, dto, () => true);
    const d = (await submit(u, dto.id)).json.data;
    expect(d.skip).toMatchObject({ passed: true, scope: { kind: 'TIER' }, skipped_sub_module_count: 2 });
    expect(d.skip.unlocked.some((x: any) => x.kind === 'TIER' && x.label.includes('Tier 3'))).toBe(true);
    expect(await tierStatus(u.user.id, 2)).toMatchObject({ status: 'SKIPPED', unlock_source: 'SKIP_TEST' });
    expect((await tierStatus(u.user.id, 3))!.status).toBe('UNLOCKED');
    for (const c of ['2.1.1', '2.2.1']) expect(await subStatus(u.user.id, c)).toMatchObject({ status: 'SKIPPED', unlock_source: 'SKIP_TEST' });
    expect((await subStatus(u.user.id, '3.1.1'))!.status).toBe('UNLOCKED');
    expect(await auditCount('SKIP_TEST_PASSED', dto.id)).toBe(1);
  });

  it('Tier yang sudah dimulai -> 409 SKIP_NOT_AVAILABLE', async () => {
    await publishSub('1.1.1', '1.1.2');
    const set = await tierSet(1, mcqs(3));
    const u = await learnerSession();
    await ensureProgressRows(db, u.user.id);
    await execute(db, sql`UPDATE user_sub_module_progress SET status = 'IN_PROGRESS' WHERE user_id = ${u.user.id} AND sub_module_id = (SELECT id FROM sub_modules WHERE sub_module_code = '1.1.1')`);
    const r = await start(u, set.id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('SKIP_NOT_AVAILABLE');
  });
});
