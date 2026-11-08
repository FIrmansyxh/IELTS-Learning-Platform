/** Perbaikan temuan QA W2 sisi server: F-06-01 (seed pengacakan), F-06-02 (GET tanpa efek samping), F-05-01 (ping salvo). */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { setClockForTest } from '@/server/clock';
import { execute, closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as pingRoute } from '@/app/api/v1/sub-modules/[sub_module]/learn-progress/route';
import { call, learnerSession } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
afterAll(async () => {
  await resetLearning();
  await closeDb();
});
/* eslint-disable @typescript-eslint/no-explicit-any */
type L = Awaited<ReturnType<typeof learnerSession>>;

const T0 = Date.parse('2026-11-03T10:00:00.000Z');
let clock = T0;
beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
  clock = T0;
  setClockForTest(() => clock);
});
afterEach(() => setClockForTest(null));

const start = (u: L, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
const get = (u: L, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const put = (u: L, id: string, qid: string, response: unknown) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response } });

const mcqs = (n: number) =>
  Array.from({ length: n }, (_, i) => Q.mcq({ question_id: `Q-F${i + 1}`, prompt: `P${i + 1}`, options: [`right-${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-${i + 1}`], explanation_id: 'p' }));
const rightOf = (q: any) => ({ option_ids: [q.options.find((o: any) => o.text === `right-${q.prompt.slice(1)}`).option_id] });

async function setup(n = 10) {
  await seedMaterial('1.1.1');
  const set = await addDrill('1.1.1', mcqs(n));
  const u = await learnerSession();
  await markLearnDone(u.user.id, '1.1.1');
  return { u, set };
}
const spentOf = async (attemptId: string, qid: string) =>
  Number(((await execute(db, sql`SELECT time_spent_ms FROM attempt_answers WHERE attempt_id = ${attemptId} AND question_id = ${qid}`)).rows[0] as any).time_spent_ms);
const resumeAt = async (attemptId: string) => ((await execute(db, sql`SELECT state->>'last_resume_at' AS t FROM attempts WHERE id = ${attemptId}`)).rows[0] as any).t as string;

describe('F-06-01: seed pengacakan CSPRNG', () => {
  it('seed 128-bit tersimpan di attempts.state, bukan turunan id; tidak bocor ke klien', async () => {
    const { u, set } = await setup();
    const r = await start(u, set.id);
    const id: string = r.json.data.id;
    const st = JSON.parse(((await execute(db, sql`SELECT state FROM attempts WHERE id = ${id}`)).rows[0] as any).state);
    expect(st.rng_seed).toMatch(/^[0-9a-f]{32}$/);
    expect(st.rng_seed.startsWith(id.replace(/-/g, '').slice(0, 8))).toBe(false);
    expect(JSON.stringify(r.json)).not.toContain(st.rng_seed);
    expect(JSON.stringify((await get(u, id)).json)).not.toContain(st.rng_seed);
  });

  it('dua attempt pada set sama memakai seed berbeda', async () => {
    const { u, set } = await setup();
    const a = (await start(u, set.id)).json.data.id;
    await execute(db, sql`UPDATE attempts SET status = 'ABANDONED' WHERE id = ${a}`);
    const b = (await start(u, set.id)).json.data.id;
    const seeds = (await execute(db, sql`SELECT state->>'rng_seed' AS s FROM attempts WHERE id IN (${a}, ${b})`)).rows.map((r: any) => r.s);
    expect(new Set(seeds).size).toBe(2);
  });
});

describe('F-06-02: GET /attempts/{id} bebas efek samping', () => {
  it('refresh berulang tidak menggeser basis waktu: time_spent tetap sejak mulai', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    const base = await resumeAt(dto.id);
    for (const dt of [10_000, 20_000, 30_000, 39_000]) {
      clock = T0 + dt;
      expect((await get(u, dto.id)).status).toBe(200);
    }
    expect(await resumeAt(dto.id)).toBe(base);
    const updatedBefore = ((await execute(db, sql`SELECT updated_at FROM attempts WHERE id = ${dto.id}`)).rows[0] as any).updated_at;
    expect(new Date(updatedBefore).getTime()).toBe(T0);
    clock = T0 + 40_000;
    const q = dto.questions[0];
    expect((await put(u, dto.id, q.question_id, rightOf(q))).status).toBe(200);
    expect(await spentOf(dto.id, q.question_id)).toBe(40_000); // bukan ~1 detik
  });

  it('resume cepat via POST /attempts (< 60 dtk) tidak mereset basis; jeda > 60 dtk menggesernya', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    const base = await resumeAt(dto.id);
    clock = T0 + 30_000;
    const quick = await start(u, set.id);
    expect(quick.json.data).toMatchObject({ id: dto.id, resumed: true });
    expect(await resumeAt(dto.id)).toBe(base);

    clock = T0 + 300_000; // pergi 5 menit lalu kembali
    expect((await start(u, set.id)).status).toBe(200);
    expect(await resumeAt(dto.id)).toBe(new Date(T0 + 300_000).toISOString());
    clock = T0 + 305_000;
    const q = dto.questions[1];
    await put(u, dto.id, q.question_id, rightOf(q));
    expect(await spentOf(dto.id, q.question_id)).toBe(5_000);
  });
});

describe('F-05-01: salvo ping belajar', () => {
  it('30 ping dalam ~1 detik menambah jauh < 60 detik (maks 5 detik dari ping pertama)', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    let last: any;
    for (let i = 0; i < 30; i++) {
      clock = T0 + i * 33;
      last = await call(pingRoute, 'POST', `/api/v1/sub-modules/${id}/learn-progress`, {
        cookie: u.cookie,
        params: { sub_module: id },
        body: { subtab: 'ARTICLE', active_seconds: 30 },
      });
      expect(last.status).toBe(200);
    }
    expect(last.json.data.learn_active_seconds).toBeLessThanOrEqual(6);
    expect(last.json.data.learn_active_seconds).toBe(5);
  });
});
