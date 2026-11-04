/**
 * Integrasi SPEC-014 (TASK-014): Boss Stage bersegmen. Memakai route handler nyata + Postgres. Skor dibuat deterministik dengan
 * soal berbobot (poin 1-20) sehingga raw_40 Listening/Reading tepat sesuai vektor uji D6.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { aiEvaluations, assessmentSets, attemptAnswers, submissions, tiers } from '@/db/schema';
import { AttemptResponseSchema, AttemptResultResponseSchema } from '@/contracts/attempts';
import { BossResultSchema, ExamIntroFullSchema, SectionDTOSchema } from '@/contracts/exams';
import { setClockForTest } from '@/server/clock';
import { computeBlockers } from '@/server/content/publish';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { adminOverride, applyDrillResult, recomputeStatuses } from '@/server/gatekeeping/service';
import { attemptCompletedHooks } from '@/server/attempts/hooks';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as resultRoute } from '@/app/api/v1/attempts/[attempt_id]/result/route';
import { GET as audioRoute } from '@/app/api/v1/attempts/[attempt_id]/audio/route';
import { POST as secStartRoute } from '@/app/api/v1/attempts/[attempt_id]/sections/[section_set_id]/start/route';
import { POST as secSubmitRoute } from '@/app/api/v1/attempts/[attempt_id]/sections/[section_set_id]/submit/route';
import { GET as introRoute } from '@/app/api/v1/exams/[assessment_set_id]/intro/route';
import { POST as writingRoute } from '@/app/api/v1/submissions/writing/route';
import { call, freshIp, learnerSession, makeUser } from './helpers';
import { addFileAsset, publishSub } from './learning-fixtures';
import { resetAi, setAiEnv, words } from './ai-helpers';
import { Q } from '../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
type L = Awaited<ReturnType<typeof learnerSession>>;
const db = getDb();

let clock = Date.now();
const at = (ms: number) => {
  clock = ms;
  setClockForTest(() => clock);
};
const MIN = 60_000;
const SEC = 1000;

const intro = (u: L, setId: string) => call(introRoute, 'GET', `/api/v1/exams/${setId}/intro`, { cookie: u.cookie, params: { assessment_set_id: setId } });
const start = (u: L, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
const get = (u: L, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const put = (u: L, id: string, qid: string, response: unknown) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response } });
const submit = (u: L, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
const result = (u: L, id: string) => call(resultRoute, 'GET', `/api/v1/attempts/${id}/result`, { cookie: u.cookie, params: { attempt_id: id } });
const secStart = (u: L, id: string, sid: string) =>
  call(secStartRoute, 'POST', `/api/v1/attempts/${id}/sections/${sid}/start`, { cookie: u.cookie, params: { attempt_id: id, section_set_id: sid } });
const secSubmit = (u: L, id: string, sid: string) =>
  call(secSubmitRoute, 'POST', `/api/v1/attempts/${id}/sections/${sid}/submit`, { cookie: u.cookie, params: { attempt_id: id, section_set_id: sid } });
const postWriting = (u: L, body: unknown) => call(writingRoute, 'POST', '/api/v1/submissions/writing', { cookie: u.cookie, body });

async function rawAudio(id: string, u: L, query: string, range?: string) {
  const headers: Record<string, string> = { 'x-forwarded-for': freshIp(), cookie: u.cookie! };
  if (range) headers.range = range;
  const res = await audioRoute(new Request(`http://localhost:3000/api/v1/attempts/${id}/audio${query}`, { method: 'GET', headers }), { params: Promise.resolve({ attempt_id: id }) });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body, json: res.status >= 400 ? JSON.parse(body.toString('utf8')) : null };
}

const setSetting = (key: string, value: number) => db.execute(sql`UPDATE app_settings SET value = to_jsonb(${value}::int) WHERE key = ${key}`);

// ------------------------------------------------------------------ fabrik
const mcq = (id: string, skill: string, points: number, extra: Record<string, unknown> = {}) =>
  Q.mcq({ question_id: id, skill, prompt: id, options: [`right-${id}`, 'x', 'y', 'z'], correct_answers: [`right-${id}`], explanation_id: `Pembahasan ${id}`, points, ...extra });
/** Soal berbobot: ids `Q-<P><n>`; jumlah poin = sum(points). */
const weighted = (prefix: string, skill: string, points: number[]) => points.map((p, i) => mcq(`Q-${prefix}${i + 1}`, skill, p));

interface BossSpec {
  tier?: number;
  L?: number[];
  R?: number[];
  writing?: boolean;
  speaking?: boolean;
  limits?: Partial<Record<'L' | 'R' | 'W' | 'S', number>>;
  status?: 'PUBLISHED' | 'DRAFT';
}
async function makeBoss(spec: BossSpec = {}) {
  const tierNumber = spec.tier ?? 1;
  const [t] = await db.select().from(tiers).where(eq(tiers.tierNumber, tierNumber));
  const { asset } = await addFileAsset({ kind: 'AUDIO_LISTENING', mime: 'audio/mpeg', ext: 'mp3', data: Buffer.concat([Buffer.alloc(4088, 7), randomBytes(8)]) });
  // QA F-14-01: satu induk PUBLISHED per Tier (indeks unik); Boss sebelumnya pada Tier yang sama diarsipkan seperti alur publish nyata.
  if ((spec.status ?? 'PUBLISHED') === 'PUBLISHED') {
    await db.execute(sql`UPDATE assessment_sets SET status = 'ARCHIVED' WHERE assessment_type = 'TIER_BOSS_EXAM' AND tier_id = ${t!.id}::uuid AND status = 'PUBLISHED'`);
  }
  const [parent] = await db
    .insert(assessmentSets)
    .values({ assessmentType: 'TIER_BOSS_EXAM', title: `Boss Tier ${tierNumber}`, tierId: t!.id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: spec.status ?? 'PUBLISHED' })
    .returning();
  const kid = async (skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING', questions: unknown[], limit: number, over: Partial<typeof assessmentSets.$inferInsert> = {}) =>
    (
      await db
        .insert(assessmentSets)
        .values({
          assessmentType: 'BOSS_SECTION',
          title: `${skill} Tier ${tierNumber}`,
          parentSetId: parent!.id,
          skillCategory: skill,
          timeLimitSeconds: limit,
          questionsJson: questions as object[],
          questionCount: questions.length,
          origin: 'ORIGINAL_AUTHORED',
          status: spec.status ?? 'PUBLISHED',
          ...over,
        })
        .returning()
    )[0]!;
  const Ls = await kid('LISTENING', weighted('L', 'LISTENING', spec.L ?? [10, 10, 10, 10]), spec.limits?.L ?? 900, { listeningAssetId: asset.id });
  const Rs = await kid('READING', weighted('R', 'READING', spec.R ?? [10, 10, 10, 10]), spec.limits?.R ?? 900, { readingPassageMarkdown: '# Passage Boss' });
  const Ws = spec.writing === false ? null : await kid('WRITING', [Q.writing({ question_id: 'Q-BW1', skill: 'WRITING', prompt: 'Tulis esai tentang kota.', min_words: 250, task_kind: 'TASK2' })], spec.limits?.W ?? 1200);
  const Ss = spec.speaking === false ? null : await kid('SPEAKING', [Q.speaking({ question_id: 'Q-BS1', skill: 'SPEAKING', prompt: 'Describe a place.', part: 2 })], spec.limits?.S ?? 600);
  return { parent: parent!, L: Ls, R: Rs, W: Ws, S: Ss, tier: t! };
}

/** Siapkan Tier `n` agar semua modul selesai (dan Tier terbuka). */
async function readyTier(userId: string, n: number) {
  if (n === 1) {
    await publishSub('1.1.1', '2.1.1');
    await recomputeStatuses(db, userId);
    const sid = ((await db.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = '1.1.1'`)).rows[0] as any).id as string;
    await db.transaction((tx) => applyDrillResult(tx, userId, { subModuleId: sid, scorePercent: 100 }));
    return;
  }
  await publishSub('2.1.1', '3.1.1');
  const admin = await makeUser({ role: 'admin' });
  await recomputeStatuses(db, userId);
  const t2 = (await db.select().from(tiers).where(eq(tiers.tierNumber, 2)))[0]!;
  await db.transaction((tx) => adminOverride(tx, admin.user.id, userId, { level: 'TIER', targetId: t2.id }));
  const sid = ((await db.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = '2.1.1'`)).rows[0] as any).id as string;
  await db.transaction((tx) => applyDrillResult(tx, userId, { subModuleId: sid, scorePercent: 100 }));
}

const optionFor = (q: any, text: string) => q.options.find((o: any) => o.text === text).option_id as string;
const right = (q: any) => ({ option_ids: [optionFor(q, `right-${q.question_id}`)] });
const wrong = (q: any) => ({ option_ids: [optionFor(q, 'x')] });

/** Mulai section, jawab soal yang `pickRight(qid)` benar, lalu selesaikan section. */
async function playSection(u: L, aid: string, sid: string, pickRight: (qid: string) => boolean = () => true, finish = true) {
  const s = await secStart(u, aid, sid);
  expect(s.status, JSON.stringify(s.json)).toBe(200);
  for (const q of s.json.data.questions) {
    if (q.ai_task) continue;
    const r = await put(u, aid, q.question_id, pickRight(q.question_id) ? right(q) : wrong(q));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
  }
  if (finish) expect((await secSubmit(u, aid, sid)).status).toBe(200);
  return s;
}

const bossRow = async (userId: string, tierNumber: number) =>
  (await db.execute(sql`SELECT p.* FROM user_tier_progress p JOIN tiers t ON t.id = p.tier_id WHERE p.user_id = ${userId}::uuid AND t.tier_number = ${tierNumber}`)).rows[0] as any;
const auditOf = async (attemptId: string) => (await db.execute(sql`SELECT action, metadata FROM audit_log WHERE entity_id = ${attemptId} ORDER BY created_at`)).rows as any[];
const sectionRows = async (attemptId: string) =>
  (await db.execute(sql`SELECT a.skill, a.raw_score, a.max_score, a.band_score, a.status FROM attempt_sections a JOIN assessment_sets s ON s.id = a.assessment_set_id WHERE a.attempt_id = ${attemptId}::uuid ORDER BY a.skill`)).rows as any[];

async function freshUser(tier = 1) {
  const u = await learnerSession();
  await readyTier(u.user.id, tier);
  return u;
}

beforeEach(async () => {
  resetRateLimits();
  await resetAi();
  await setSetting('attempt.cooldown_minutes', 0);
  await setSetting('attempt.max_per_set_per_day', 20);
  at(Date.now());
});
afterEach(async () => {
  setClockForTest(null);
  attemptCompletedHooks.length = 0;
  setAiEnv();
  await setSetting('attempt.cooldown_minutes', 60);
  await setSetting('attempt.max_per_set_per_day', 3);
});
afterAll(async () => {
  await resetAi();
  await db.execute(sql`DELETE FROM content_assets`);
  await closeDb();
});

// =============================================================================== ketersediaan dan intro
describe('GET /exams/{id}/intro dan gerbang ketersediaan (D2)', () => {
  it('Tier 2 siap: available=true, section terurut L,R,W,S, gate BAND 5, scope TIER; sesuai skema', async () => {
    const u = await freshUser(2);
    const b = await makeBoss({ tier: 2 });
    const r = await intro(u, b.parent.id);
    expect(r.status).toBe(200);
    expect(ExamIntroFullSchema.safeParse(r.json.data).success).toBe(true);
    const d = r.json.data;
    expect(d).toMatchObject({ assessment_type: 'TIER_BOSS_EXAM', available: true, blocked_reason: null, threshold: { kind: 'BAND', value: 5 }, active_attempt_id: null, requires_audio: true, requires_microphone: true, placement: null });
    expect(d.scope).toMatchObject({ kind: 'TIER', id: b.tier.id });
    expect(d.boss.tier_number).toBe(2);
    expect(d.boss.gate).toEqual({ type: 'BAND', value: 5 });
    expect(d.boss.sections.map((s: any) => s.skill)).toEqual(['LISTENING', 'READING', 'WRITING', 'SPEAKING']);
    expect(d.boss.sections.map((s: any) => s.order)).toEqual([1, 2, 3, 4]);
    expect(d.boss.sections.every((s: any) => SectionDTOSchema.safeParse(s).success && s.phase === 'PENDING' && s.started_at === null && s.remaining_seconds === null)).toBe(true);
    expect(d.boss.sections.map((s: any) => s.counts_toward_gate)).toEqual([true, true, false, false]);
    expect(d.boss.total_time_limit_seconds).toBe(900 + 900 + 1200 + 600);
    expect(d.boss.last_result).toBeNull();
    expect(d.boss.advisory_note).toContain('Listening dan Reading');
    expect(JSON.stringify(d)).not.toMatch(/correct_answers|explanation_id/);
  });

  it('Tier 1 gate PERCENT 80; Boss tanpa W/S hanya memuat L dan R', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    const d = (await intro(u, b.parent.id)).json.data;
    expect(d.boss.gate).toEqual({ type: 'PERCENT', value: 80 });
    expect(d.threshold).toEqual({ kind: 'PERCENT', value: 80 });
    expect(d.boss.sections.map((s: any) => s.skill)).toEqual(['LISTENING', 'READING']);
    expect(d.requires_microphone).toBe(false);
  });

  it('blocked_reason berurutan: TIER_LOCKED, MODULES_INCOMPLETE; set DRAFT / tanpa L+R -> 404', async () => {
    await publishSub('1.1.1', '2.1.1');
    const u = await learnerSession();
    const b2 = await makeBoss({ tier: 2 });
    expect((await intro(u, b2.parent.id)).json.data).toMatchObject({ available: false, blocked_reason: 'TIER_LOCKED' });
    const b1 = await makeBoss({ tier: 1 });
    expect((await intro(u, b1.parent.id)).json.data).toMatchObject({ available: false, blocked_reason: 'MODULES_INCOMPLETE' });
    const draft = await makeBoss({ tier: 3, status: 'DRAFT' });
    expect((await intro(u, draft.parent.id)).status).toBe(404);
    const bare = (await db.insert(assessmentSets).values({ assessmentType: 'TIER_BOSS_EXAM', title: 'Tanpa anak', tierId: (await db.select().from(tiers).where(eq(tiers.tierNumber, 4)))[0]!.id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' }).returning())[0]!;
    expect((await intro(u, bare.id)).status).toBe(404);
  });

  it('modul belum selesai -> POST /attempts 409 BOSS_NOT_AVAILABLE (MODULES_INCOMPLETE) tanpa attempt; Tier terkunci -> TIER_LOCKED', async () => {
    await publishSub('1.1.1', '2.1.1');
    const u = await learnerSession();
    const b1 = await makeBoss({ tier: 1 });
    const r1 = await start(u, b1.parent.id);
    expect(r1.status).toBe(409);
    expect(r1.json.error.code).toBe('BOSS_NOT_AVAILABLE');
    expect(r1.json.error.details[0].code).toBe('MODULES_INCOMPLETE');
    expect(r1.json.error.message).toBe('Boss Stage belum tersedia. Selesaikan semua modul Tier ini terlebih dahulu.');
    const b2 = await makeBoss({ tier: 2 });
    const r2 = await start(u, b2.parent.id);
    expect(r2.json.error.code).toBe('BOSS_NOT_AVAILABLE');
    expect(r2.json.error.details[0].code).toBe('TIER_LOCKED');
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM attempts WHERE user_id = ${u.user.id}::uuid`)).rows[0]).toEqual({ n: 0 });
  });
});

// =============================================================================== mulai attempt
describe('POST /attempts (TIER_BOSS_EXAM)', () => {
  it('201: semua section PENDING, questions kosong, deadline = mulai + jumlah time_limit + 1800 s, satu baris attempt_sections per anak', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const t0 = clock;
    const r = await start(u, b.parent.id);
    expect(r.status).toBe(201);
    expect(AttemptResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d).toMatchObject({ assessment_type: 'TIER_BOSS_EXAM', mode: 'EXAM', status: 'IN_PROGRESS', questions: [], answers: [], resumed: false, pass_percent: 80, passage_markdown: null, listening: null });
    expect(d.sections).toHaveLength(4);
    expect(d.sections.every((s: any) => s.phase === 'PENDING')).toBe(true);
    expect(Date.parse(d.deadline_at) - t0).toBe((900 + 900 + 1200 + 600 + 1800) * SEC);
    const rows = await sectionRows(d.id);
    expect(rows).toHaveLength(4);
    expect(rows.every((x) => x.status === 'IN_PROGRESS' && x.raw_score === null)).toBe(true);
  });

  it('attempt IN_PROGRESS di-resume (200) tanpa terkena batas harian; section aktif ikut kembali', async () => {
    await setSetting('attempt.max_per_set_per_day', 1);
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const s = await secStart(u, a.id, b.L.id);
    expect(s.status).toBe(200);
    const again = await start(u, b.parent.id);
    expect(again.status).toBe(200);
    expect(again.json.data).toMatchObject({ id: a.id, resumed: true });
    expect(again.json.data.questions.map((q: any) => q.question_id).sort()).toEqual(s.json.data.questions.map((q: any) => q.question_id).sort());
    expect(again.json.data.sections[0].phase).toBe('ACTIVE');
  });

  it('cooldown 60 menit setelah percobaan gagal -> 429 COOLDOWN_ACTIVE; 3 percobaan/24 jam -> DAILY_ATTEMPT_LIMIT', async () => {
    await setSetting('attempt.cooldown_minutes', 60);
    await setSetting('attempt.max_per_set_per_day', 3);
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    const fail = async () => {
      const a = (await start(u, b.parent.id)).json.data;
      expect((await submit(u, a.id)).status).toBe(200); // semua section PENDING -> skor 0 -> gagal
      return a.id as string;
    };
    await fail();
    at(clock + 10 * MIN);
    const blocked = await start(u, b.parent.id);
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe('COOLDOWN_ACTIVE');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await intro(u, b.parent.id)).json.data).toMatchObject({ available: false, blocked_reason: 'COOLDOWN_ACTIVE' });
    at(clock + 61 * MIN);
    await fail();
    at(clock + 61 * MIN);
    await fail();
    at(clock + 61 * MIN);
    const limit = await start(u, b.parent.id);
    expect(limit.status).toBe(429);
    expect(limit.json.error.code).toBe('DAILY_ATTEMPT_LIMIT');
  });
});

// =============================================================================== alur section
describe('sections/{id}/start dan submit', () => {
  it('urutan ditegakkan, resume tidak mengubah waktu, ALREADY_DONE, section set lain 404; payload tanpa kunci', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;

    const early = await secStart(u, a.id, b.R.id);
    expect(early.status).toBe(409);
    expect(early.json.error.code).toBe('SECTION_ORDER_VIOLATION');
    expect((await secStart(u, a.id, randomUUID())).status).toBe(404);
    const other = await makeBoss({ tier: 2 });
    expect((await secStart(u, a.id, other.L.id)).status).toBe(404);

    const first = await secStart(u, a.id, b.L.id);
    expect(first.status).toBe(200);
    const sd = first.json.data;
    expect(sd.section).toMatchObject({ skill: 'LISTENING', phase: 'ACTIVE', remaining_seconds: 900, counts_toward_gate: true, requires_audio: true });
    expect(SectionDTOSchema.safeParse(sd.section).success).toBe(true);
    expect(sd.passage_markdown).toBeNull();
    expect(sd.listening).toMatchObject({ audio_url: `/api/v1/attempts/${a.id}/audio?section=${b.L.id}`, mime_type: 'audio/mpeg' });
    expect(sd.questions).toHaveLength(4);
    expect(sd.answers).toEqual([]);
    expect(Date.parse(sd.section.deadline_at) - Date.parse(sd.section.started_at)).toBe(900 * SEC);
    expect(JSON.stringify(first.json)).not.toMatch(/correct_answers|explanation_id|is_correct|correct_answer/);

    // jawab satu soal lalu start ulang: started/deadline tetap dan answers tersimpan ikut kembali
    at(clock + 30 * SEC);
    const q0 = sd.questions[0];
    expect((await put(u, a.id, q0.question_id, right(q0))).status).toBe(200);
    const resumed = await secStart(u, a.id, b.L.id);
    expect(resumed.status).toBe(200);
    expect(resumed.json.data.section.started_at).toBe(sd.section.started_at);
    expect(resumed.json.data.section.deadline_at).toBe(sd.section.deadline_at);
    expect(resumed.json.data.section.remaining_seconds).toBe(870);
    expect(resumed.json.data.answers.map((x: any) => x.question_id)).toEqual([q0.question_id]);
    expect(resumed.json.data.questions.map((q: any) => q.question_id)).toEqual(sd.questions.map((q: any) => q.question_id));

    // submit section; idempoten
    const done = await secSubmit(u, a.id, b.L.id);
    expect(done.status).toBe(200);
    expect(done.json.data.section.phase).toBe('DONE');
    expect(done.json.data.next_section).toMatchObject({ skill: 'READING', phase: 'PENDING' });
    expect(JSON.stringify(done.json)).not.toMatch(/raw_score|band/);
    const again = await secSubmit(u, a.id, b.L.id);
    expect(again.status).toBe(200);
    expect(again.json.data.section.phase).toBe('DONE');
    const redo = await secStart(u, a.id, b.L.id);
    expect(redo.status).toBe(409);
    expect(redo.json.error.code).toBe('SECTION_ALREADY_DONE');
  });

  it('GET /attempts/{id} hanya memuat soal section ACTIVE (section lain belum dikirim) dan tanpa kunci', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    expect((await get(u, a.id)).json.data.questions).toEqual([]);
    await secStart(u, a.id, b.L.id);
    const g = (await get(u, a.id)).json.data;
    expect(g.questions).toHaveLength(4);
    expect(g.questions.every((q: any) => q.skill === 'LISTENING')).toBe(true);
    expect(g.sections.map((s: any) => s.phase)).toEqual(['ACTIVE', 'PENDING', 'PENDING', 'PENDING']);
    expect(g.listening.audio_url).toContain(`?section=${b.L.id}`);
    expect(JSON.stringify(g)).not.toMatch(/correct_answers|explanation_id|is_correct|correct_answer/);
    await secSubmit(u, a.id, b.L.id);
    await secStart(u, a.id, b.R.id);
    const g2 = (await get(u, a.id)).json.data;
    expect(g2.questions.every((q: any) => q.skill === 'READING')).toBe(true);
    expect(g2.passage_markdown).toBe('# Passage Boss');
    expect(g2.listening).toBeNull();
  });

  it('PUT answers: section PENDING / DONE -> 409 SECTION_NOT_ACTIVE; soal tak dikenal -> 404', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const pending = await put(u, a.id, 'Q-R1', { option_ids: ['x'] });
    expect(pending.status).toBe(409);
    expect(pending.json.error.code).toBe('SECTION_NOT_ACTIVE');
    expect((await put(u, a.id, 'Q-NOPE', { option_ids: ['x'] })).status).toBe(404);
    const s = await secStart(u, a.id, b.L.id);
    const q = s.json.data.questions[0];
    await secSubmit(u, a.id, b.L.id);
    const done = await put(u, a.id, q.question_id, right(q));
    expect(done.status).toBe(409);
    expect(done.json.error.code).toBe('SECTION_NOT_ACTIVE');
  });

  it('section submit: PENDING -> 409 SECTION_NOT_ACTIVE; attempt selesai -> 409 ATTEMPT_NOT_ACTIVE; bukan milik -> 404', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const p = await secSubmit(u, a.id, b.L.id);
    expect(p.status).toBe(409);
    expect(p.json.error.code).toBe('SECTION_NOT_ACTIVE');
    const stranger = await learnerSession();
    expect((await secStart(stranger, a.id, b.L.id)).status).toBe(404);
    expect((await secSubmit(stranger, a.id, b.L.id)).status).toBe(404);
    expect((await result(stranger, a.id)).status).toBe(404);
    expect((await submit(stranger, a.id)).status).toBe(404);
    expect((await submit(u, a.id)).status).toBe(200);
    const after = await secStart(u, a.id, b.L.id);
    expect(after.status).toBe(409);
    expect(after.json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    expect((await secSubmit(u, a.id, b.R.id)).json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
  });
});

// =============================================================================== kedaluwarsa
describe('kedaluwarsa section dan attempt', () => {
  it('lewat deadline + 5 s: PUT -> 409 SECTION_EXPIRED, section DONE (EXPIRED), jawaban sebelumnya dinilai; batas toleransi 5 s', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, L: [10, 10], R: [10, 10] });
    const a = (await start(u, b.parent.id)).json.data;
    const s = await secStart(u, a.id, b.L.id);
    const [q1, q2] = s.json.data.questions as any[];
    expect((await put(u, a.id, q1.question_id, right(q1))).status).toBe(200);
    const deadline = Date.parse(s.json.data.section.deadline_at);
    at(deadline + 4 * SEC); // dalam toleransi
    expect((await put(u, a.id, q2.question_id, right(q2))).status).toBe(200);
    at(deadline + 6 * SEC);
    const late = await put(u, a.id, q2.question_id, wrong(q2));
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe('SECTION_EXPIRED');
    const rows = await sectionRows(a.id);
    expect(rows.find((x) => x.skill === 'LISTENING')).toMatchObject({ status: 'EXPIRED', raw_score: '20.00', max_score: '20.00' });
    const g = (await get(u, a.id)).json.data;
    expect(g.sections[0].phase).toBe('DONE');
    expect(g.status).toBe('IN_PROGRESS');
    const next = await secStart(u, a.id, b.R.id); // section berikutnya tetap dapat dimulai
    expect(next.status).toBe(200);
  });

  it('start section berikutnya saat section sebelumnya ACTIVE tetapi sudah lewat waktu: ditutup otomatis lalu lanjut', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const s = await secStart(u, a.id, b.L.id);
    at(Date.parse(s.json.data.section.deadline_at) + 10 * SEC);
    const r = await secStart(u, a.id, b.R.id);
    expect(r.status).toBe(200);
    expect((await sectionRows(a.id)).find((x) => x.skill === 'LISTENING')!.status).toBe('EXPIRED');
  });

  it('section submit setelah waktu habis menandai EXPIRED', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const s = await secStart(u, a.id, b.L.id);
    at(Date.parse(s.json.data.section.deadline_at) + 20 * SEC);
    expect((await secSubmit(u, a.id, b.L.id)).status).toBe(200);
    expect((await sectionRows(a.id)).find((x) => x.skill === 'LISTENING')!.status).toBe('EXPIRED');
  });

  it('attempt melewati deadline + 5 s: PUT -> 409 ATTEMPT_EXPIRED dan attempt EXPIRED dinilai dari jawaban tersimpan', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    const a = (await start(u, b.parent.id)).json.data;
    const s = await secStart(u, a.id, b.L.id);
    for (const q of s.json.data.questions) await put(u, a.id, q.question_id, right(q));
    at(Date.parse(a.deadline_at) + 6 * SEC);
    const late = await put(u, a.id, s.json.data.questions[0].question_id, wrong(s.json.data.questions[0]));
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe('ATTEMPT_EXPIRED');
    const row = (await db.execute(sql`SELECT status, raw_score, max_score, passed FROM attempts WHERE id = ${a.id}::uuid`)).rows[0] as any;
    expect(row).toMatchObject({ status: 'EXPIRED', raw_score: '40.00', max_score: '80.00', passed: false });
    const res = await result(u, a.id);
    expect(res.status).toBe(200);
    expect(res.json.data.boss.sections[0]).toMatchObject({ skill: 'LISTENING', raw_score: 40, status: 'EXPIRED' });
    expect((await auditOf(a.id)).map((x) => x.action)).toEqual(['BOSS_FAILED']);
  });
});

// =============================================================================== penilaian dan gerbang
describe('submit attempt: penilaian band dan gerbang Tier', () => {
  it('Tier 2: L raw40 16 + R 14 -> boss_band 5.0 LULUS; Tier 2 COMPLETED, Tier 3 UNLOCKED (BOSS_PASS); audit BOSS_PASSED; hasil sesuai kontrak', async () => {
    const u = await freshUser(2);
    const b = await makeBoss({ tier: 2, L: [16, 20, 4], R: [14, 20, 6] });
    const hooks: any[] = [];
    attemptCompletedHooks.push(async (ctx) => void hooks.push(ctx));
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id, (id) => id === 'Q-L1');
    await playSection(u, a.id, b.R.id, (id) => id === 'Q-R1');
    await secStart(u, a.id, b.W!.id);
    await secSubmit(u, a.id, b.W!.id);
    const r = await submit(u, a.id);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(AttemptResultResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d.attempt).toMatchObject({ assessment_type: 'TIER_BOSS_EXAM', status: 'GRADED', passed: true, band_score: 5, raw_score: 30, max_score: 80, pass_percent: null });
    expect(d.attempt.score_percent).toBe(37.5);
    expect(d.review).toBeNull();
    expect(d.skip).toBeNull();
    expect(d.placement).toBeNull();
    const boss = d.boss;
    expect(BossResultSchema.safeParse(boss).success, JSON.stringify(boss)).toBe(true);
    expect(boss).toMatchObject({ passed: true, gate: { type: 'BAND', value: 5 }, percent: 37.5, boss_band: 5, overall_band_estimate: null, pending_ai: 0, next_tier_unlocked: true, disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.' });
    expect(boss.tier).toMatchObject({ id: b.tier.id, tier_number: 2 });
    expect(boss.sections.map((s: any) => s.skill)).toEqual(['LISTENING', 'READING', 'WRITING', 'SPEAKING']);
    expect(boss.sections[0]).toMatchObject({ raw_score: 16, max_score: 40, raw_40: 16, band: 5, status: 'SUBMITTED', counts_toward_gate: true, submission_ids: [] });
    expect(boss.sections[1]).toMatchObject({ raw_score: 14, max_score: 40, raw_40: 14, band: 4.5, status: 'SUBMITTED' });
    expect(boss.sections[2]).toMatchObject({ raw_score: null, band: null, status: 'SUBMITTED', counts_toward_gate: false });
    expect(boss.sections[3]).toMatchObject({ raw_score: null, band: null, status: 'EXPIRED', counts_toward_gate: false }); // tidak pernah dimulai
    expect(boss.unlocked.some((x: any) => x.kind === 'TIER')).toBe(true);
    expect(boss.retry).toMatchObject({ next_allowed_at: null });
    const att = (await db.execute(sql`SELECT band_score, band_table_id, status, result_json FROM attempts WHERE id = ${a.id}::uuid`)).rows[0] as any;
    expect(att.band_table_id).toBeNull();
    expect(att.result_json.boss.band_table_ids).toMatchObject({ listening: expect.any(String), reading_academic: expect.any(String) });
    expect(att.result_json.boss).not.toHaveProperty('overall_band_estimate');
    expect(await bossRow(u.user.id, 2)).toMatchObject({ status: 'COMPLETED' });
    expect(await bossRow(u.user.id, 3)).toMatchObject({ status: 'UNLOCKED', unlock_source: 'BOSS_PASS' });
    expect(Number((await bossRow(u.user.id, 2)).boss_best_band)).toBe(5);
    const audit = await auditOf(a.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'BOSS_PASSED', metadata: { tier_number: 2, boss_band: 5, percent: 37.5 } });
    expect((await sectionRows(a.id)).filter((x) => x.skill === 'LISTENING' || x.skill === 'READING').every((x) => x.status === 'GRADED' && x.band_score !== null)).toBe(true);
    expect(hooks).toHaveLength(1);
    expect(hooks[0].set.assessmentType).toBe('TIER_BOSS_EXAM');
    expect(hooks[0].result).toMatchObject({ passed: true, rawH: 3000, maxH: 8000 });
    // sesudah lulus: mulai ulang -> BOSS_ALREADY_PASSED; intro menunjukkan alasan yang sama
    const again = await start(u, b.parent.id);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe('BOSS_ALREADY_PASSED');
    expect((await intro(u, b.parent.id)).json.data).toMatchObject({ available: false, blocked_reason: 'BOSS_ALREADY_PASSED' });
  });

  it('Tier 2: L 13 + R 13 (4.5, 4.5) -> GAGAL; Tier 3 tetap LOCKED; audit BOSS_FAILED; last_result di intro', async () => {
    const u = await freshUser(2);
    const b = await makeBoss({ tier: 2, L: [13, 20, 7], R: [13, 20, 7] });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id, (id) => id === 'Q-L1');
    await playSection(u, a.id, b.R.id, (id) => id === 'Q-R1');
    const r = await submit(u, a.id);
    expect(r.json.data.attempt).toMatchObject({ passed: false, band_score: 4.5 });
    expect(r.json.data.boss).toMatchObject({ passed: false, boss_band: 4.5, next_tier_unlocked: false, unlocked: [] });
    expect(r.json.data.boss.retry.attempts_remaining_today).toBe(19);
    expect(await bossRow(u.user.id, 3)).toMatchObject({ status: 'LOCKED' });
    expect(await bossRow(u.user.id, 2)).not.toMatchObject({ status: 'COMPLETED' });
    expect((await bossRow(u.user.id, 2)).boss_passed_at).toBeNull();
    expect((await auditOf(a.id))[0]).toMatchObject({ action: 'BOSS_FAILED', metadata: { tier_number: 2, boss_band: 4.5 } });
    const i = (await intro(u, b.parent.id)).json.data;
    expect(i.boss.last_result).toMatchObject({ passed: false, boss_band: 4.5 });
    expect(i.available).toBe(true); // boleh mencoba lagi (cooldown 0 pada tes ini)
  });

  it('Tier 1 PERCENT 80: L 9/10 + R 7/10 = 80% LULUS; L 8/10 + R 7/10 = 75% GAGAL (poin mentah)', async () => {
    const run = async (lOk: number, rOk: number) => {
      const u = await freshUser(1);
      const b = await makeBoss({ tier: 1, L: Array(10).fill(1), R: Array(10).fill(1), writing: false, speaking: false });
      const a = (await start(u, b.parent.id)).json.data;
      await playSection(u, a.id, b.L.id, (id) => Number(id.slice(3)) <= lOk);
      await playSection(u, a.id, b.R.id, (id) => Number(id.slice(3)) <= rOk);
      return { r: await submit(u, a.id), u, a };
    };
    const pass = await run(9, 7);
    expect(pass.r.json.data.boss).toMatchObject({ passed: true, percent: 80, gate: { type: 'PERCENT', value: 80 } });
    expect(pass.r.json.data.attempt).toMatchObject({ passed: true, score_percent: 80, pass_percent: 80 });
    expect(await bossRow(pass.u.user.id, 2)).toMatchObject({ status: 'UNLOCKED', unlock_source: 'BOSS_PASS' });
    const fail = await run(8, 7);
    expect(fail.r.json.data.boss).toMatchObject({ passed: false, percent: 75 });
    expect(await bossRow(fail.u.user.id, 2)).toMatchObject({ status: 'LOCKED' });
  });

  it('Listening 10 soal 1 poin, 9 benar -> raw_40 36 dan band 8.0 (tabel seed LISTENING)', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, L: Array(10).fill(1), R: Array(10).fill(1), writing: false, speaking: false });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id, (id) => id !== 'Q-L10');
    await playSection(u, a.id, b.R.id, () => true);
    const s = (await submit(u, a.id)).json.data.boss.sections;
    expect(s[0]).toMatchObject({ raw_score: 9, max_score: 10, raw_40: 36, band: 8 });
    expect(s[1]).toMatchObject({ raw_40: 40, band: 9 });
  });

  it('Writing/Speaking tidak dikerjakan tidak memengaruhi gerbang; Listening/Reading gagal tetap gagal walau AI Writing 9.0', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, L: Array(10).fill(1), R: Array(10).fill(1) });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id);
    await playSection(u, a.id, b.R.id);
    expect((await submit(u, a.id)).json.data.boss).toMatchObject({ passed: true, overall_band_estimate: null, pending_ai: 0 });

    const u2 = await freshUser(1);
    const a2 = (await start(u2, b.parent.id)).json.data;
    await playSection(u2, a2.id, b.L.id, () => false);
    await playSection(u2, a2.id, b.R.id, () => false);
    await secStart(u2, a2.id, b.W!.id);
    const sub = (await db.insert(submissions).values({ userId: u2.user.id, kind: 'WRITING_TASK2', attemptId: a2.id, questionId: 'Q-BW1', promptSnapshot: 'p', responseText: words(30), wordCount: 30, status: 'GRADED' }).returning())[0]!;
    await db.insert(aiEvaluations).values({ submissionId: sub.id, method: 'AI_LOCAL', overallBand: '9.0', criteriaScores: {}, flags: { injection_suspected: false } });
    await secSubmit(u2, a2.id, b.W!.id);
    const r2 = (await submit(u2, a2.id)).json.data;
    expect(r2.boss).toMatchObject({ passed: false });
    expect(r2.boss.sections[2]).toMatchObject({ skill: 'WRITING', band: 9, submission_ids: [sub.id], counts_toward_gate: false });
  });

  it('submit saat Listening ACTIVE dan lainnya PENDING: Listening dinilai dari jawaban tersimpan, Reading raw 0, attempt GRADED', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, L: Array(10).fill(2), R: Array(10).fill(2) });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id, (id) => Number(id.slice(3)) <= 5, false); // 5 benar x 2 = 10 poin, section tetap ACTIVE
    const r = await submit(u, a.id);
    expect(r.status).toBe(200);
    expect(r.json.data.attempt.status).toBe('GRADED');
    const s = r.json.data.boss.sections;
    expect(s[0]).toMatchObject({ skill: 'LISTENING', raw_score: 10, max_score: 20, raw_40: 20, status: 'SUBMITTED' });
    expect(s[1]).toMatchObject({ skill: 'READING', raw_score: 0, max_score: 20, raw_40: 0, band: 0, status: 'EXPIRED' });
    expect(s[2]).toMatchObject({ band: null, submission_ids: [], status: 'EXPIRED' });
    expect(r.json.data.boss.passed).toBe(false);
    // section yang tersisa ditutup (DONE) pada state
    const g = (await get(u, a.id)).json.data;
    expect(g.sections.every((x: any) => x.phase === 'DONE')).toBe(true);
    expect(g.questions).toEqual([]);
  });

  it('submit dua kali serentak: satu efek (audit, gerbang) dan kedua respons 200 identik', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, L: Array(10).fill(1), R: Array(10).fill(1), writing: false, speaking: false });
    const hooks: unknown[] = [];
    attemptCompletedHooks.push(async () => void hooks.push(1));
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id);
    await playSection(u, a.id, b.R.id);
    const [x, y] = await Promise.all([submit(u, a.id), submit(u, a.id)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect(x.json.data).toEqual(y.json.data);
    expect(await auditOf(a.id)).toHaveLength(1);
    expect(hooks).toHaveLength(1);
    expect((await result(u, a.id)).json.data.boss.passed).toBe(true);
  });

  it('kegagalan hook membatalkan seluruh submit: attempt tetap IN_PROGRESS, tanpa audit, Tier tidak terbuka', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, L: Array(10).fill(1), R: Array(10).fill(1), writing: false, speaking: false });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id);
    await playSection(u, a.id, b.R.id);
    attemptCompletedHooks.push(async () => {
      throw new Error('hook gagal');
    });
    expect((await submit(u, a.id)).status).toBe(500);
    attemptCompletedHooks.length = 0;
    expect((await db.execute(sql`SELECT status FROM attempts WHERE id = ${a.id}::uuid`)).rows[0]).toEqual({ status: 'IN_PROGRESS' });
    expect(await auditOf(a.id)).toEqual([]);
    expect((await bossRow(u.user.id, 1)).boss_passed_at).toBeNull();
    expect(await bossRow(u.user.id, 2)).toMatchObject({ status: 'LOCKED' });
    expect((await submit(u, a.id)).status).toBe(200); // dapat diulang
  });

  it('review tidak memuat kunci (SPEC-006 D10) dan GET result sebelum selesai -> 409 ATTEMPT_NOT_FINISHED', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const early = await result(u, a.id);
    expect(early.status).toBe(409);
    expect(early.json.error.code).toBe('ATTEMPT_NOT_FINISHED');
    await playSection(u, a.id, b.L.id);
    const r = await submit(u, a.id);
    expect(JSON.stringify(r.json)).not.toMatch(/correct_answer|explanation_id|is_correct/);
  });
});

// =============================================================================== AI Writing/Speaking dan D8
describe('estimasi Overall Band (D8) dan integrasi submission W/S', () => {
  async function finishedBoss(opts: { Wmethod?: 'AI_LOCAL' | 'SELF_ASSESSMENT'; Winj?: boolean; withS?: boolean } = {}) {
    const u = await freshUser(2);
    const b = await makeBoss({ tier: 2, L: [20, 20], R: [20, 20] }); // Gerbang BAND 5.0 (L+R penuh lulus)
    const a = (await start(u, b.parent.id)).json.data;
    // 20 dari 40 poin -> raw40 20 -> Listening 5.5 dan Reading 5.5 (lulus gerbang 5.0)
    await playSection(u, a.id, b.L.id, (id) => id === 'Q-L1');
    await playSection(u, a.id, b.R.id, (id) => id === 'Q-R1');
    await secStart(u, a.id, b.W!.id);
    const w = (await db.insert(submissions).values({ userId: u.user.id, kind: 'WRITING_TASK2', attemptId: a.id, questionId: 'Q-BW1', promptSnapshot: 'p', responseText: words(30), wordCount: 30, status: 'GRADED' }).returning())[0]!;
    await db.insert(aiEvaluations).values({ submissionId: w.id, method: opts.Wmethod ?? 'AI_LOCAL', overallBand: '6.0', criteriaScores: {}, flags: { injection_suspected: opts.Winj ?? false } });
    await secSubmit(u, a.id, b.W!.id);
    await secStart(u, a.id, b.S!.id);
    const sp = (await db.insert(submissions).values({ userId: u.user.id, kind: 'SPEAKING_PART2', attemptId: a.id, questionId: 'Q-BS1', promptSnapshot: 'p', responseText: 'transcript', status: opts.withS === false ? 'GRADING' : 'GRADED' }).returning())[0]!;
    if (opts.withS !== false) await db.insert(aiEvaluations).values({ submissionId: sp.id, method: 'AI_LOCAL', overallBand: '6.0', criteriaScores: {}, flags: {} });
    await secSubmit(u, a.id, b.S!.id);
    const r = await submit(u, a.id);
    return { u, b, a, r, w, sp };
  }

  it('keempat komponen tersedia: L 5.5, R 5.5, W 6.0, S 6.0 -> 5.75 -> 6.0 pada submit dan GET result', async () => {
    const { u, a, r, w, sp } = await finishedBoss();
    expect(r.json.data.boss.sections.map((s: any) => s.band)).toEqual([5.5, 5.5, 6, 6]);
    expect(r.json.data.boss.overall_band_estimate).toBe(6);
    expect(r.json.data.boss.sections[2].submission_ids).toEqual([w.id]);
    expect(r.json.data.boss.sections[3].submission_ids).toEqual([sp.id]);
    const g = await result(u, a.id);
    expect(g.json.data.boss.overall_band_estimate).toBe(6);
    expect(g.json.data.boss.passed).toBe(true);
  });

  it('SELF_ASSESSMENT atau evaluasi injection_suspected tidak dihitung -> overall_band_estimate null', async () => {
    const self = await finishedBoss({ Wmethod: 'SELF_ASSESSMENT' });
    expect(self.r.json.data.boss.overall_band_estimate).toBeNull();
    expect(self.r.json.data.boss.sections[2].band).toBeNull();
    const inj = await finishedBoss({ Winj: true });
    expect(inj.r.json.data.boss.overall_band_estimate).toBeNull();
  });

  it('evaluasi yang selesai setelah submit muncul pada GET berikutnya tanpa mengubah passed; pending_ai menghitung submission belum terminal', async () => {
    const { u, a, r, sp } = await finishedBoss({ withS: false });
    expect(r.json.data.boss).toMatchObject({ pending_ai: 1, overall_band_estimate: null, passed: true });
    expect((await result(u, a.id)).json.data.boss.pending_ai).toBe(1);
    await db.update(submissions).set({ status: 'GRADED' }).where(eq(submissions.id, sp.id));
    await db.insert(aiEvaluations).values({ submissionId: sp.id, method: 'AI_LOCAL', overallBand: '6.0', criteriaScores: {}, flags: {} });
    const later = (await result(u, a.id)).json.data.boss;
    expect(later).toMatchObject({ pending_ai: 0, overall_band_estimate: 6, passed: true });
    expect(later.sections[3].band).toBe(6);
  });

  it('POST /submissions/writing dengan attempt_id + question_id Boss: diterima saat section Writing ACTIVE; ditolak saat PENDING/DONE; soal section lain', async () => {
    setAiEnv({ AI_ENABLED: 'true', LLM_DRIVER: 'mock', STT_DRIVER: 'mock' });
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const body = { kind: 'WRITING_TASK2', attempt_id: a.id, question_id: 'Q-BW1', response_text: words(40) };
    const pending = await postWriting(u, body);
    expect(pending.status).toBe(409);
    expect(pending.json.error.code).toBe('SECTION_NOT_ACTIVE');
    await playSection(u, a.id, b.L.id);
    await playSection(u, a.id, b.R.id);
    await secStart(u, a.id, b.W!.id);
    const mismatch = await postWriting(u, { ...body, question_id: 'Q-L1' });
    expect(mismatch.status).toBe(409); // section Listening sudah DONE
    const ok = await postWriting(u, body);
    expect(ok.status, JSON.stringify(ok.json)).toBe(202);
    expect(ok.json.data.submission).toMatchObject({ attempt_id: a.id, question_id: 'Q-BW1', kind: 'WRITING_TASK2' });
    expect((await postWriting(u, body)).json.error.code).toBe('SUBMISSION_ALREADY_EXISTS');
    // jawaban objektif untuk soal Writing ditolak
    const q = (await secStart(u, a.id, b.W!.id)).json.data.questions[0];
    expect(q.ai_task.kind).toBe('WRITING');
    const viaAnswer = await put(u, a.id, 'Q-BW1', { text: 'x' });
    expect(viaAnswer.json.error.code).toBe('QUESTION_REQUIRES_SUBMISSION');
    await secSubmit(u, a.id, b.W!.id);
    const r = await submit(u, a.id);
    expect(r.json.data.boss.pending_ai).toBe(1);
    expect(r.json.data.boss.sections[2].submission_ids).toHaveLength(1);
  });
});

// =============================================================================== audio per section
describe('audio per section (SPEC-011 + SPEC-014)', () => {
  it('audio_url dari start section dapat dialirkan saat ACTIVE; tanpa section -> 404; PENDING/DONE -> 409 ATTEMPT_NOT_ACTIVE', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const pend = await rawAudio(a.id, u, `?section=${b.L.id}`);
    expect(pend.status).toBe(409);
    expect(pend.json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    const s = await secStart(u, a.id, b.L.id);
    const url = s.json.data.listening.audio_url as string;
    const ok = await rawAudio(a.id, u, url.slice(url.indexOf('?')), 'bytes=0-99');
    expect(ok.status).toBe(206);
    expect(ok.body.length).toBe(100);
    expect((await rawAudio(a.id, u, '')).status).toBe(404);
    await secSubmit(u, a.id, b.L.id);
    const done = await rawAudio(a.id, u, `?section=${b.L.id}`);
    expect(done.status).toBe(409);
  });
});

// =============================================================================== duplikasi question_id
describe('integritas data', () => {
  it('question_id yang sama di dua section (data korup) ditolak saat mulai dengan 500 tanpa membuat attempt', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    await db.update(assessmentSets).set({ questionsJson: [mcq('Q-L1', 'READING', 5)], questionCount: 1 }).where(eq(assessmentSets.id, b.R.id));
    const r = await start(u, b.parent.id);
    expect(r.status).toBe(500);
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM attempts WHERE user_id = ${u.user.id}::uuid`)).rows[0]).toEqual({ n: 0 });
  });

  it('jawaban Boss tersimpan dengan assessment_set_id set anak', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id);
    const rows = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, a.id));
    expect(rows).toHaveLength(4);
    expect(rows.every((x) => x.assessmentSetId === b.L.id)).toBe(true);
  });
});

// =============================================================================== perbaikan QA W7 (TASK-014)
describe('QA W7: integritas set, deadline section, jepit skor, rate limit, field hasil', () => {
  const dropIdx = (name: string) => db.execute(sql.raw(`DROP INDEX IF EXISTS "${name}"`));
  const CHILD_IDX = `CREATE UNIQUE INDEX "assessment_sets_boss_child_skill_uq" ON "assessment_sets" USING btree ("parent_set_id","skill_category") WHERE "assessment_sets"."assessment_type" = 'BOSS_SECTION' AND "assessment_sets"."status" = 'PUBLISHED'`;
  const TIER_IDX = `CREATE UNIQUE INDEX "assessment_sets_boss_tier_published_uq" ON "assessment_sets" USING btree ("tier_id") WHERE "assessment_sets"."assessment_type" = 'TIER_BOSS_EXAM' AND "assessment_sets"."status" = 'PUBLISHED'`;

  it('F-14-01: unique index menolak anak PUBLISHED kedua per skill dan induk PUBLISHED kedua per Tier (DRAFT/ARCHIVED boleh)', async () => {
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    const dupChild = db.insert(assessmentSets).values({ assessmentType: 'BOSS_SECTION', title: 'L dup', parentSetId: b.parent.id, skillCategory: 'LISTENING', timeLimitSeconds: 60, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' });
    await expect(dupChild).rejects.toThrow();
    const dupParent = db.insert(assessmentSets).values({ assessmentType: 'TIER_BOSS_EXAM', title: 'B dup', tierId: b.tier.id, timeLimitSeconds: 60, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' });
    await expect(dupParent).rejects.toThrow();
    await expect(db.insert(assessmentSets).values({ assessmentType: 'BOSS_SECTION', title: 'L draft', parentSetId: b.parent.id, skillCategory: 'LISTENING', timeLimitSeconds: 60, origin: 'ORIGINAL_AUTHORED', status: 'DRAFT' })).resolves.toBeDefined();
  });

  it('F-14-01: blocker publish BOSS_DUPLICATE_PUBLISHED untuk induk dan anak duplikat', async () => {
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    const draft = await makeBoss({ tier: 1, status: 'DRAFT', writing: false, speaking: false });
    const pb = await db.transaction((tx) => computeBlockers(tx, 'ASSESSMENT_SET', draft.parent.id));
    expect(pb.map((x) => x.code)).toContain('BOSS_DUPLICATE_PUBLISHED');
    const pk = await db.transaction((tx) => computeBlockers(tx, 'ASSESSMENT_SET', draft.L.id));
    expect(pk.map((x) => x.code)).not.toContain('BOSS_DUPLICATE_PUBLISHED'); // induk berbeda
    const [kidDraft] = await db.insert(assessmentSets).values({ assessmentType: 'BOSS_SECTION', title: 'L draft', parentSetId: b.parent.id, skillCategory: 'LISTENING', timeLimitSeconds: 60, origin: 'ORIGINAL_AUTHORED', status: 'DRAFT' }).returning();
    expect((await db.transaction((tx) => computeBlockers(tx, 'ASSESSMENT_SET', kidDraft!.id))).map((x) => x.code)).toContain('BOSS_DUPLICATE_PUBLISHED');
  });

  it('F-14-01: guard start/intro menolak data lama dengan dua anak per skill atau dua induk per Tier (tanpa attempt)', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    await dropIdx('assessment_sets_boss_child_skill_uq');
    await dropIdx('assessment_sets_boss_tier_published_uq');
    const extras: string[] = [];
    try {
      const [dupKid] = await db.insert(assessmentSets).values({ assessmentType: 'BOSS_SECTION', title: 'L dup', parentSetId: b.parent.id, skillCategory: 'LISTENING', timeLimitSeconds: 60, questionsJson: [mcq('Q-LX1', 'LISTENING', 1)] as object[], questionCount: 1, listeningAssetId: b.L.listeningAssetId, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' }).returning();
      extras.push(dupKid!.id);
      const r1 = await start(u, b.parent.id);
      expect(r1.status).toBe(500);
      expect((await intro(u, b.parent.id)).status).toBe(404);
      await db.delete(assessmentSets).where(eq(assessmentSets.id, dupKid!.id));
      extras.pop();
      const [dupParent] = await db.insert(assessmentSets).values({ assessmentType: 'TIER_BOSS_EXAM', title: 'B dup', tierId: b.tier.id, timeLimitSeconds: 60, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' }).returning();
      extras.push(dupParent!.id);
      expect((await start(u, b.parent.id)).status).toBe(500);
      expect((await intro(u, b.parent.id)).status).toBe(404);
      expect((await db.execute(sql`SELECT count(*)::int AS n FROM attempts WHERE user_id = ${u.user.id}::uuid`)).rows[0]).toEqual({ n: 0 });
    } finally {
      for (const id of extras) await db.delete(assessmentSets).where(eq(assessmentSets.id, id));
      await db.execute(sql.raw(CHILD_IDX));
      await db.execute(sql.raw(TIER_IDX));
    }
    expect((await start(u, b.parent.id)).status).toBe(201); // set normal tetap dapat dimulai
  });

  it('F-14-02: section dimulai mendekati batas attempt -> deadline_at section = deadline_at attempt, remaining_seconds mengikutinya', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    const a = (await start(u, b.parent.id)).json.data;
    const attemptDeadline = Date.parse(a.deadline_at);
    at(attemptDeadline - 60 * SEC);
    const s = await secStart(u, a.id, b.L.id);
    expect(s.status, JSON.stringify(s.json)).toBe(200);
    expect(Date.parse(s.json.data.section.deadline_at)).toBe(attemptDeadline);
    expect(s.json.data.section.remaining_seconds).toBe(60);
    // section awal (waktu normal) tidak terpengaruh
    const u2 = await freshUser(1);
    const b2 = await makeBoss({ tier: 1, writing: false, speaking: false });
    const a2 = (await start(u2, b2.parent.id)).json.data;
    const s2 = await secStart(u2, a2.id, b2.L.id);
    expect(s2.json.data.section.remaining_seconds).toBe(900);
  });

  it('F-14-03: set diubah selama attempt (poin diturunkan) -> submit tidak 500; raw dijepit ke max; hasil dapat dibaca', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id);
    await playSection(u, a.id, b.R.id); // 40/40 pada penutupan section
    await db.update(assessmentSets).set({ questionsJson: weighted('R', 'READING', [5, 5]) as object[], questionCount: 2 }).where(eq(assessmentSets.id, b.R.id)); // max kini 10
    const r = await submit(u, a.id);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const sec = r.json.data.boss.sections;
    expect(sec[1]).toMatchObject({ skill: 'READING', raw_score: 10, max_score: 10, raw_40: 40 });
    expect((await result(u, a.id)).status).toBe(200);
  });

  it('F-14-03: set diubah saat section masih ACTIVE -> section submit dan attempt submit tetap 200', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1, writing: false, speaking: false });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id, () => true, false);
    await db.update(assessmentSets).set({ questionsJson: weighted('L', 'LISTENING', [1]) as object[], questionCount: 1 }).where(eq(assessmentSets.id, b.L.id));
    expect((await secSubmit(u, a.id, b.L.id)).status).toBe(200);
    await playSection(u, a.id, b.R.id);
    expect((await submit(u, a.id)).status).toBe(200);
  });

  it('F-14-05: sections/start|submit dibatasi 30/menit/user (ke-31 429 RATE_LIMITED); intro 30/menit', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    const first = await secStart(u, a.id, b.L.id);
    expect(first.status).toBe(200);
    for (let i = 1; i < 30; i++) expect((await secStart(u, a.id, b.L.id)).status).toBe(200); // resume tanpa efek
    const over = await secStart(u, a.id, b.L.id);
    expect(over.status).toBe(429);
    expect(over.json.error.code).toBe('RATE_LIMITED');
    expect((await secSubmit(u, a.id, b.L.id)).status).toBe(429); // bucket yang sama (section_action)

    const u2 = await freshUser(1);
    for (let i = 0; i < 30; i++) expect((await intro(u2, b.parent.id)).status).toBe(200);
    expect((await intro(u2, b.parent.id)).status).toBe(429);
  });

  it('F-14-08/09: hasil membawa latest_submission_id, graded_submission_id, ai_status per section W/S (L/R null); submission_ids tetap urut naik', async () => {
    const u = await freshUser(2);
    const b = await makeBoss({ tier: 2, L: [20, 20], R: [20, 20] });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id, (id) => id === 'Q-L1');
    await playSection(u, a.id, b.R.id, (id) => id === 'Q-R1');
    await secStart(u, a.id, b.W!.id);
    const w = (await db.insert(submissions).values({ userId: u.user.id, kind: 'WRITING_TASK2', attemptId: a.id, questionId: 'Q-BW1', promptSnapshot: 'p', responseText: words(30), wordCount: 30, status: 'GRADED' }).returning())[0]!;
    await db.insert(aiEvaluations).values({ submissionId: w.id, method: 'AI_LOCAL', overallBand: '6.0', criteriaScores: {}, flags: {} });
    await secSubmit(u, a.id, b.W!.id);
    await secStart(u, a.id, b.S!.id);
    const sp = (await db.insert(submissions).values({ userId: u.user.id, kind: 'SPEAKING_PART2', attemptId: a.id, questionId: 'Q-BS1', promptSnapshot: 'p', responseText: 't', status: 'GRADING' }).returning())[0]!;
    await secSubmit(u, a.id, b.S!.id);
    const r = await submit(u, a.id);
    expect(BossResultSchema.safeParse(r.json.data.boss).success).toBe(true);
    const [l, rd, wr, spk] = r.json.data.boss.sections;
    expect(l).toMatchObject({ latest_submission_id: null, graded_submission_id: null, ai_status: null });
    expect(rd).toMatchObject({ latest_submission_id: null, graded_submission_id: null, ai_status: null });
    expect(wr).toMatchObject({ submission_ids: [w.id], latest_submission_id: w.id, graded_submission_id: w.id, ai_status: 'GRADED', band: 6 });
    expect(spk).toMatchObject({ submission_ids: [sp.id], latest_submission_id: sp.id, graded_submission_id: null, ai_status: 'PENDING', band: null });

    // Kirim ulang Writing: submission baru (GRADED tetapi SELF_ASSESSMENT) -> terbaru dulu; band tetap dari yang AI_LOCAL
    const newer = (await db.insert(submissions).values({ userId: u.user.id, kind: 'WRITING_TASK2', attemptId: a.id, questionId: 'Q-BW1', promptSnapshot: 'p', responseText: words(30), wordCount: 30, status: 'GRADED' }).returning())[0]!;
    await db.insert(aiEvaluations).values({ submissionId: newer.id, method: 'SELF_ASSESSMENT', overallBand: '8.0', criteriaScores: {}, flags: {} });
    const g1 = (await result(u, a.id)).json.data.boss.sections[2];
    expect(g1).toMatchObject({ submission_ids: [w.id, newer.id], latest_submission_id: newer.id, graded_submission_id: w.id, ai_status: 'GRADED', band: 6 });

    // Submission terbaru masih diproses: PENDING walau ada band lama; Speaking terminal tanpa evaluasi: NO_BAND
    await db.update(submissions).set({ status: 'GRADING' }).where(eq(submissions.id, newer.id));
    await db.update(submissions).set({ status: 'FAILED' }).where(eq(submissions.id, sp.id));
    const g2 = (await result(u, a.id)).json.data.boss.sections;
    expect(g2[2]).toMatchObject({ latest_submission_id: newer.id, graded_submission_id: w.id, ai_status: 'PENDING' });
    expect(g2[3]).toMatchObject({ latest_submission_id: sp.id, graded_submission_id: null, ai_status: 'NO_BAND' });
  });

  it('F-14-09: W/S tanpa submission -> NOT_SUBMITTED', async () => {
    const u = await freshUser(1);
    const b = await makeBoss({ tier: 1 });
    const a = (await start(u, b.parent.id)).json.data;
    await playSection(u, a.id, b.L.id);
    await playSection(u, a.id, b.R.id);
    const r = await submit(u, a.id);
    expect(r.status).toBe(200);
    const s = r.json.data.boss.sections;
    expect(s[2]).toMatchObject({ skill: 'WRITING', submission_ids: [], latest_submission_id: null, graded_submission_id: null, ai_status: 'NOT_SUBMITTED' });
    expect(s[3]).toMatchObject({ skill: 'SPEAKING', ai_status: 'NOT_SUBMITTED' });
  });
});
