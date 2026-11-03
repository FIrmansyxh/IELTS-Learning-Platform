import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ResumeCardResponseSchema, UpdateLastLearnedResponseSchema } from '@/contracts/resume';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as getRoute, PUT as putRoute } from '@/app/api/v1/me/last-learned/route';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { call, learnerSession } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial, subId } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
afterAll(async () => {
  await resetLearning();
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
});

type L = Awaited<ReturnType<typeof learnerSession>>;
/* eslint-disable @typescript-eslint/no-explicit-any */
const put = (u: L, body: unknown) => call(putRoute, 'PUT', '/api/v1/me/last-learned', { cookie: u.cookie, body });
const get = (u: L) => call(getRoute, 'GET', '/api/v1/me/last-learned', { cookie: u.cookie });
const row = async (u: L) => (await db.execute(sql`SELECT * FROM user_last_learned_state WHERE user_id = ${u.user.id}::uuid`)).rows[0] as any;
const VID = 'dQw4w9WgXcQ';

describe('PUT /me/last-learned', () => {
  it('video detik 222 disimpan dengan tier/modul turunan; GET -> RESUME dengan label dan path persis', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { videoIds: [VID] });
    const u = await learnerSession();
    const r = await put(u, { sub_module_id: id, active_tab: 'LEARN', active_learn_subtab: 'VIDEO', active_video_id: VID, video_progress_sec: 222, last_question_index: null, active_attempt_id: null });
    expect(r.status).toBe(200);
    expect(UpdateLastLearnedResponseSchema.safeParse(r.json).success).toBe(true);
    const saved = await row(u);
    expect(saved).toMatchObject({ active_tab: 'LEARN', active_learn_subtab: 'VIDEO', active_video_id: VID, video_progress_sec: 222 });
    expect(saved.active_tier_id).toBeTruthy();
    expect(saved.active_module_id).toBeTruthy();
    const g = await get(u);
    expect(ResumeCardResponseSchema.safeParse(g.json).success).toBe(true);
    expect(g.json.data).toMatchObject({
      state: 'RESUME',
      position_label: 'Video 03:42',
      resume_path: '/belajar/1.1.1?tab=pelajari&sub=video&t=222',
      change_path: '/peta',
      active_tab: 'LEARN',
      active_learn_subtab: 'VIDEO',
      video_progress_sec: 222,
      breadcrumb: { tier_label: 'Tier 1' },
      sub_module: { sub_module_code: '1.1.1' },
    });
  });

  it('normalisasi: DRILL membuang subtab/video/detik; LEARN non-video membuang video', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { videoIds: [VID] });
    const u = await learnerSession();
    await put(u, { sub_module_id: id, active_tab: 'DRILL', active_learn_subtab: 'VIDEO', active_video_id: VID, video_progress_sec: 50, last_question_index: 2 });
    expect(await row(u)).toMatchObject({ active_learn_subtab: null, video_progress_sec: 0, active_video_id: null, last_question_index: 2 });
    await put(u, { sub_module_id: id, active_tab: 'LEARN', active_learn_subtab: 'ARTICLE', active_video_id: VID, video_progress_sec: 9, last_question_index: 5 });
    expect(await row(u)).toMatchObject({ active_learn_subtab: 'ARTICLE', video_progress_sec: 0, active_video_id: null, last_question_index: null });
  });

  it('video bukan milik sub-modul -> 400 video_not_in_sub_module dan baris tidak berubah', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { videoIds: [VID] });
    const u = await learnerSession();
    await put(u, { sub_module_id: id, active_tab: 'LEARN', active_learn_subtab: 'ARTICLE' });
    const before = await row(u);
    const r = await put(u, { sub_module_id: id, active_tab: 'LEARN', active_learn_subtab: 'VIDEO', active_video_id: 'aaaaaaaaaaa', video_progress_sec: 5 });
    expect(r.status).toBe(400);
    expect(r.json.error.details[0].code).toBe('video_not_in_sub_module');
    expect(await row(u)).toEqual(before);
  });

  it('LOCKED -> 403; tidak ada/DRAFT -> 404; detik di luar rentang / kunci tak dikenal -> 400', async () => {
    await seedMaterial('1.1.1');
    const { subId: locked } = await seedMaterial('1.1.2');
    const u = await learnerSession();
    expect((await put(u, { sub_module_id: locked, active_tab: 'LEARN' })).json.error.code).toBe('LOCKED_CONTENT');
    expect((await put(u, { sub_module_id: randomUUID(), active_tab: 'LEARN' })).status).toBe(404);
    expect((await put(u, { sub_module_id: await subId('1.1.3'), active_tab: 'LEARN' })).status).toBe(404);
    const id = await subId('1.1.1');
    expect((await put(u, { sub_module_id: id, active_tab: 'LEARN', video_progress_sec: -1 })).json.error.details[0].code).toBe('out_of_range');
    expect((await put(u, { sub_module_id: id, active_tab: 'LEARN', video_progress_sec: 21601 })).status).toBe(400);
    expect((await put(u, { sub_module_id: id, active_tab: 'LEARN', user_id: 'x' })).json.error.details[0].code).toBe('unrecognized_key');
  });

  it('upsert menaikkan updated_at walau posisi sama; PUT ke-31 dalam semenit -> 429', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await put(u, { sub_module_id: id, active_tab: 'LEARN' });
    const t1 = new Date((await row(u)).updated_at);
    await new Promise((r) => setTimeout(r, 15));
    await put(u, { sub_module_id: id, active_tab: 'LEARN' });
    expect(new Date((await row(u)).updated_at).getTime()).toBeGreaterThan(t1.getTime());
    let last = 0;
    for (let i = 0; i < 29; i++) last = (await put(u, { sub_module_id: id, active_tab: 'LEARN' })).status;
    expect(last).toBe(429); // total permintaan ke-31
  });
});

describe('posisi DRILL', () => {
  async function drillSetup() {
    const { subId: id } = await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', Array.from({ length: 10 }, () => Q.mcq()));
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    const att = (await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: set.id } })).json.data;
    return { id, u, att };
  }

  it('attempt IN_PROGRESS valid: Soal 4 dari 10 dan path ?tab=latihan&q=3&attempt=<uuid>', async () => {
    const { id, u, att } = await drillSetup();
    await put(u, { sub_module_id: id, active_tab: 'DRILL', last_question_index: 3, active_attempt_id: att.id });
    const d = (await get(u)).json.data;
    expect(d).toMatchObject({ state: 'RESUME', active_tab: 'DRILL', last_question_index: 3, question_count: 10, position_label: 'Tab Latihan - Soal 4 dari 10' });
    expect(d.resume_path).toBe(`/belajar/1.1.1?tab=latihan&q=3&attempt=${att.id}`);
  });

  it('attempt sudah GRADED: indeks diabaikan, Tab Latihan tanpa q dan attempt', async () => {
    const { id, u, att } = await drillSetup();
    await put(u, { sub_module_id: id, active_tab: 'DRILL', last_question_index: 3, active_attempt_id: att.id });
    await db.execute(sql`UPDATE attempts SET status = 'GRADED' WHERE id = ${att.id}::uuid`);
    const d = (await get(u)).json.data;
    expect(d).toMatchObject({ position_label: 'Tab Latihan', last_question_index: null, question_count: null });
    expect(d.resume_path).toBe('/belajar/1.1.1?tab=latihan');
  });

  it('active_attempt_id milik pengguna lain disimpan NULL tanpa error', async () => {
    const { id, att } = await drillSetup();
    const other = await learnerSession();
    await markLearnDone(other.user.id, '1.1.1');
    const r = await put(other, { sub_module_id: id, active_tab: 'DRILL', last_question_index: 1, active_attempt_id: att.id });
    expect(r.status).toBe(200);
    expect((await row(other)).active_attempt_id).toBeNull();
  });
});

describe('GET /me/last-learned fallback (D-RESUME)', () => {
  it('pengguna baru: FALLBACK_NEXT ke 1.1.1 tab LEARN', async () => {
    await seedMaterial('1.1.1');
    await seedMaterial('1.1.2');
    const u = await learnerSession();
    const d = (await get(u)).json.data;
    expect(d).toMatchObject({ state: 'FALLBACK_NEXT', position_label: 'Sub-modul berikutnya', active_tab: 'LEARN', resume_path: '/belajar/1.1.1?tab=pelajari', updated_at: null });
    expect(d.sub_module.sub_module_code).toBe('1.1.1');
  });

  it('sub-modul tersimpan kini COMPLETED -> fallback ke sub-modul UNLOCKED berikutnya', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    await seedMaterial('1.1.2');
    const u = await learnerSession();
    await put(u, { sub_module_id: id, active_tab: 'LEARN', active_learn_subtab: 'ARTICLE' });
    await db.execute(sql`UPDATE user_sub_module_progress SET status = 'COMPLETED', completed_at = now() WHERE user_id = ${u.user.id}::uuid AND sub_module_id = ${id}::uuid`);
    const d = (await get(u)).json.data;
    expect(d.state).toBe('FALLBACK_NEXT');
    expect(d.sub_module.sub_module_code).toBe('1.1.2');
  });

  it('sub-modul tersimpan kini ARCHIVED -> fallback (bukan 404)', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    await seedMaterial('1.1.2');
    const u = await learnerSession();
    await put(u, { sub_module_id: id, active_tab: 'LEARN' });
    await db.execute(sql`UPDATE sub_modules SET status = 'ARCHIVED' WHERE id = ${id}::uuid`);
    const r = await get(u);
    expect(r.status).toBe(200);
    expect(r.json.data.state).toBe('FALLBACK_NEXT');
  });

  it('materi selesai + belum lulus drill -> tab fallback DRILL; semua selesai -> data null', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await markLearnDone(u.user.id, '1.1.1');
    expect((await get(u)).json.data.resume_path).toBe('/belajar/1.1.1?tab=latihan');
    await db.execute(sql`UPDATE user_sub_module_progress SET status = 'COMPLETED', completed_at = now() WHERE user_id = ${u.user.id}::uuid AND sub_module_id = ${id}::uuid`);
    expect((await get(u)).json).toEqual({ data: null });
  });

  it('tanpa konten dipublikasikan -> data null; tanpa sesi -> 401', async () => {
    const u = await learnerSession();
    expect((await get(u)).json).toEqual({ data: null });
    expect((await call(getRoute, 'GET', '/api/v1/me/last-learned')).status).toBe(401);
  });
});
