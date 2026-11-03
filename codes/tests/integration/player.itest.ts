import { rm } from 'node:fs/promises';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { LearnCompleteResponseSchema, LearnProgressResponseSchema, SubModuleDetailResponseSchema } from '@/contracts/player';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as getDetail } from '@/app/api/v1/sub-modules/[sub_module]/route';
import { POST as postProgress } from '@/app/api/v1/sub-modules/[sub_module]/learn-progress/route';
import { POST as postComplete } from '@/app/api/v1/sub-modules/[sub_module]/learn-complete/route';
import { POST as postMini } from '@/app/api/v1/sub-modules/[sub_module]/mini-task/complete/route';
import { GET as getAsset } from '@/app/api/v1/assets/[asset_id]/file/route';
import { activityHooks } from '@/server/activity/hooks';
import { call, learnerSession } from './helpers';
import { addDrill, addFileAsset, markLearnDone, progressOf, resetLearning, seedMaterial, subId } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
afterAll(closeDb);
beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
});

type L = Awaited<ReturnType<typeof learnerSession>>;
const detail = (u: L, code: string) => call(getDetail, 'GET', `/api/v1/sub-modules/${code}`, { cookie: u.cookie, params: { sub_module: code } });
const ping = (u: L, id: string, body: unknown) =>
  call(postProgress, 'POST', `/api/v1/sub-modules/${id}/learn-progress`, { cookie: u.cookie, params: { sub_module: id }, body });
const complete = (u: L, id: string) => call(postComplete, 'POST', `/api/v1/sub-modules/${id}/learn-complete`, { cookie: u.cookie, params: { sub_module: id } });
const mini = (u: L, id: string) => call(postMini, 'POST', `/api/v1/sub-modules/${id}/mini-task/complete`, { cookie: u.cookie, params: { sub_module: id } });
const asset = (u: L, id: string, headers: Record<string, string> = {}) =>
  call(getAsset, 'GET', `/api/v1/assets/${id}/file`, { cookie: u.cookie, params: { asset_id: id }, headers });
/** Mundurkan stempel ping terakhir (jam server tidak dapat dimajukan pada route, jadi dimundurkan di DB). */
const setProgress = (u: L, id: string, set: ReturnType<typeof sql>) =>
  db.execute(sql`UPDATE user_sub_module_progress SET ${set} WHERE user_id = ${u.user.id}::uuid AND sub_module_id = ${id}::uuid`);

describe('GET /sub-modules/{code}', () => {
  it('UNLOCKED -> 200, IN_PROGRESS, artikel non-kosong, drill terblokir LEARN_NOT_COMPLETED; sesuai skema kontrak', async () => {
    const { subId: id } = await seedMaterial('1.1.1', {
      videoIds: ['dQw4w9WgXcQ'],
      slides: 2,
      attachments: [{ title: 'Daftar 100 Verb-3 Irregular' }],
      miniTask: 'AI_SHORT_WRITING',
      attribution: 'Disusun sendiri.',
    });
    await seedMaterial('1.1.2');
    await addDrill('1.1.1', [Q.mcq(), Q.fill()]);
    const u = await learnerSession();
    const r = await detail(u, '1.1.1');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(SubModuleDetailResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d.sub_module).toMatchObject({ id, sub_module_code: '1.1.1', module: { module_code: '1.1' }, tier: { tier_number: 1 } });
    expect(d.progress).toMatchObject({ status: 'IN_PROGRESS', learn_active_seconds: 0, learn_visited_subtabs: [], learn_ready: false, progress_percent: 0 });
    expect(d.material.article_markdown).toContain('artikel');
    expect(d.material.attribution_text).toBe('Disusun sendiri.');
    expect(d.drill).toMatchObject({ question_count: 2, time_limit_seconds: 300, pass_percent: 75, can_start: false, blocked_reason: 'LEARN_NOT_COMPLETED' });
    expect(d.navigation).toEqual({ prev_sub_module_code: null, next_sub_module_code: '1.1.2' });
    expect(d.material.mini_task).toEqual({ task_type: 'AI_SHORT_WRITING', prompt: 'Tulis ulang kalimat berikut.', success_criteria: 'RAHASIA: kriteria rubrik internal' });
    expect(d.material.videos[0]).toMatchObject({ video_id: 'dQw4w9WgXcQ', start_sec: 95, end_sec: 420, language: 'ID' });
    expect(d.material.slides.map((s: { url: string }) => s.url)).toEqual(d.material.slides.map((s: { asset_id: string }) => `/api/v1/assets/${s.asset_id}/file`));
    expect(d.material.attachments[0]).toMatchObject({ file_type: 'PDF', title: 'Daftar 100 Verb-3 Irregular' });
    expect(d.material.attachments[0].size_bytes).toBeGreaterThan(0);
  });

  it('payload tidak memuat ai_rubric_criteria, storage_key, sha256, external_url', async () => {
    await seedMaterial('1.1.1', { videoIds: ['dQw4w9WgXcQ'], slides: 1, attachments: [{ title: 'Lampiran' }], miniTask: 'SELF_CHECK' });
    const u = await learnerSession();
    const text = JSON.stringify((await detail(u, '1.1.1')).json);
    for (const k of ['ai_rubric_criteria', 'storage_key', 'sha256', 'external_url', 'youtube.com']) expect(text).not.toContain(k);
  });

  it('LOCKED -> 403 LOCKED_CONTENT tanpa membocorkan materi; DRAFT/ARCHIVED/tidak ada -> 404; format salah -> 400', async () => {
    await seedMaterial('1.1.1');
    await seedMaterial('1.1.2', { article: 'RAHASIA-ISI-ARTIKEL-LOCKED' });
    await seedMaterial('2.1.1');
    const u = await learnerSession();
    const locked = await detail(u, '1.1.2');
    expect(locked.status).toBe(403);
    expect(locked.json.error.code).toBe('LOCKED_CONTENT');
    expect(locked.json.error.details[0].code).toBe('PREVIOUS_INCOMPLETE');
    expect(JSON.stringify(locked.json)).not.toContain('RAHASIA-ISI-ARTIKEL-LOCKED');
    expect(JSON.stringify(locked.json)).not.toContain('article_markdown');
    const tier = await detail(u, '2.1.1');
    expect(tier.status).toBe(403);
    expect(tier.json.error.details[0].code).toBe('TIER_LOCKED');

    expect((await detail(u, '1.1.3')).status).toBe(404); // DRAFT
    await db.execute(sql`UPDATE sub_modules SET status = 'ARCHIVED' WHERE sub_module_code = '1.1.4'`);
    expect((await detail(u, '1.1.4')).status).toBe(404);
    expect((await detail(u, '9.9.9')).status).toBe(404);
    const bad = await detail(u, 'abc');
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe('VALIDATION_ERROR');
  });

  it('tanpa sesi -> 401; drill belum ada -> NO_DRILL_PUBLISHED (prioritas di atas LEARN_NOT_COMPLETED)', async () => {
    await seedMaterial('1.1.1');
    const noAuth = await call(getDetail, 'GET', '/api/v1/sub-modules/1.1.1', { params: { sub_module: '1.1.1' } });
    expect(noAuth.status).toBe(401);
    const u = await learnerSession();
    const r = await detail(u, '1.1.1');
    expect(r.json.data.drill).toMatchObject({ assessment_set_id: null, can_start: false, blocked_reason: 'NO_DRILL_PUBLISHED' });
  });

  it('dua set drill PUBLISHED: dipilih version tertinggi', async () => {
    await seedMaterial('1.1.1');
    const lo = await addDrill('1.1.1', [Q.mcq()], { version: 1 });
    const hi = await addDrill('1.1.1', [Q.mcq(), Q.mcq()], { version: 3 });
    const u = await learnerSession();
    const d = (await detail(u, '1.1.1')).json.data.drill;
    expect(d.assessment_set_id).toBe(hi.id);
    expect(d.assessment_set_id).not.toBe(lo.id);
  });

  it('video dengan video_id korup dibuang dari payload (tidak pernah dikirim ke klien)', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { videoIds: ['dQw4w9WgXcQ'] });
    await db.execute(sql`UPDATE content_assets SET external_ref = 'bad id!' WHERE kind = 'VIDEO_EMBED'`);
    void id;
    const u = await learnerSession();
    expect((await detail(u, '1.1.1')).json.data.material.videos).toEqual([]);
  });
});

describe('POST learn-progress (anti-farming)', () => {
  it('ping pertama dengan 30 detik bertambah tepat 5; sub-tab tercatat tanpa duplikat', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { videoIds: ['dQw4w9WgXcQ'] });
    const u = await learnerSession();
    await detail(u, '1.1.1');
    const a = await ping(u, id, { subtab: 'ARTICLE', active_seconds: 30 });
    expect(a.status).toBe(200);
    expect(LearnProgressResponseSchema.safeParse(a.json).success).toBe(true);
    expect(a.json.data).toEqual({ learn_active_seconds: 5, learn_visited_subtabs: ['ARTICLE'], learn_ready: false });
    const b = await ping(u, id, { subtab: 'ARTICLE', active_seconds: 30 });
    expect(b.json.data.learn_visited_subtabs).toEqual(['ARTICLE']);
    expect(b.json.data.learn_active_seconds).toBe(5); // ping berurutan cepat: elapsed ~0 -> +0 (F-05-01)
  });

  it('learn_last_ping_at 10 detik lalu + klaim 30 -> bertambah <= 10', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await setProgress(u, id, sql`learn_active_seconds = 20, learn_last_ping_at = now() - interval '10 seconds'`);
    const r = await ping(u, id, { subtab: 'ARTICLE', active_seconds: 30 });
    const gained = r.json.data.learn_active_seconds - 20;
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThanOrEqual(10);
  });

  it('ping setelah jeda panjang dibatasi klaim klien; di atas 30 ditolak validasi', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await setProgress(u, id, sql`learn_active_seconds = 0, learn_last_ping_at = now() - interval '1 hour'`);
    expect((await ping(u, id, { subtab: 'ARTICLE', active_seconds: 25 })).json.data.learn_active_seconds).toBe(25);
    expect((await ping(u, id, { subtab: 'ARTICLE', active_seconds: 31 })).status).toBe(400);
    expect((await ping(u, id, { subtab: 'ARTICLE', active_seconds: 0 })).status).toBe(400);
    expect((await ping(u, id, { subtab: 'ARTICLE', active_seconds: 5, learn_active_seconds: 999 })).json.error.details[0].code).toBe('unrecognized_key');
  });

  it('subtab VIDEO/SLIDES tanpa konten -> 400 subtab_unavailable', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    for (const subtab of ['VIDEO', 'SLIDES']) {
      const r = await ping(u, id, { subtab, active_seconds: 5 });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('VALIDATION_ERROR');
      expect(r.json.error.details[0].code).toBe('subtab_unavailable');
    }
  });

  it('LOCKED -> 403, tidak ada -> 404, tidak AVAILABLE -> 404', async () => {
    await seedMaterial('1.1.1');
    const { subId: lockedId } = await seedMaterial('1.1.2');
    const u = await learnerSession();
    expect((await ping(u, lockedId, { subtab: 'ARTICLE', active_seconds: 5 })).status).toBe(403);
    expect((await ping(u, '00000000-0000-4000-8000-000000000000', { subtab: 'ARTICLE', active_seconds: 5 })).status).toBe(404);
    expect((await ping(u, await subId('1.1.3'), { subtab: 'ARTICLE', active_seconds: 5 })).status).toBe(404);
    expect((await ping(u, 'bukan-uuid', { subtab: 'ARTICLE', active_seconds: 5 })).status).toBe(400);
  });

  it('sub-modul COMPLETED tetap menerima ping tanpa mengubah status', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await setProgress(u, id, sql`status = 'COMPLETED', completed_at = now()`);
    expect((await ping(u, id, { subtab: 'ARTICLE', active_seconds: 5 })).status).toBe(200);
    expect((await progressOf(u.user.id, '1.1.1')).status).toBe('COMPLETED');
  });

  it('31 ping dalam semenit: permintaan ke-31 -> 429 RATE_LIMITED', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await ping(u, id, { subtab: 'ARTICLE', active_seconds: 1 })).status;
    expect(last).toBe(429);
  });

  it('dua ping serentak diserialkan: total tidak melebihi batas waktu nyata', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    const rs = await Promise.all([1, 2, 3, 4].map(() => ping(u, id, { subtab: 'ARTICLE', active_seconds: 30 })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    // pertama +5; tiga berikutnya masing-masing paling banyak +2 (elapsed ~0)
    expect((await progressOf(u.user.id, '1.1.1')).learn_active_seconds).toBeLessThanOrEqual(5 + 3 * 2);
  });
});

describe('POST learn-complete', () => {
  it('45 detik -> 409 insufficient_active_time dan learn_completed_at tetap NULL', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await setProgress(u, id, sql`learn_active_seconds = 45, learn_visited_subtabs = '{ARTICLE}'`);
    const r = await complete(u, id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('LEARN_REQUIREMENTS_NOT_MET');
    expect(r.json.error.details).toEqual([
      { path: 'learn_active_seconds', code: 'insufficient_active_time', message: 'Waktu belajar aktif minimal 60 detik (sekarang 45).' },
    ]);
    expect((await progressOf(u.user.id, '1.1.1')).learn_completed_at).toBeNull();
  });

  it('61 detik tetapi video belum dikunjungi -> 409 subtab_not_visited', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { videoIds: ['dQw4w9WgXcQ'] });
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await setProgress(u, id, sql`learn_active_seconds = 61, learn_visited_subtabs = '{ARTICLE}'`);
    const r = await complete(u, id);
    expect(r.status).toBe(409);
    expect(r.json.error.details).toEqual([{ path: 'learn_visited_subtabs', code: 'subtab_not_visited', message: 'Buka tab Video terlebih dahulu.' }]);
  });

  it('syarat terpenuhi -> 200; drill.can_start true; panggilan ulang mengembalikan stempel yang sama; hook aktivitas sekali', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { videoIds: ['dQw4w9WgXcQ'] });
    await addDrill('1.1.1', [Q.mcq()]);
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await setProgress(u, id, sql`learn_active_seconds = 61, learn_visited_subtabs = '{ARTICLE,VIDEO}'`);
    const events: string[] = [];
    const hook = async (_tx: unknown, e: { kind: string }) => void events.push(e.kind);
    activityHooks.push(hook as never);
    try {
      const a = await complete(u, id);
      expect(a.status).toBe(200);
      expect(LearnCompleteResponseSchema.safeParse(a.json).success).toBe(true);
      expect(a.json.data.drill_can_start).toBe(true);
      const b = await complete(u, id);
      expect(b.status).toBe(200);
      expect(b.json.data.learn_completed_at).toBe(a.json.data.learn_completed_at);
      expect(events).toEqual(['LEARN_COMPLETE']);
    } finally {
      activityHooks.splice(activityHooks.indexOf(hook as never), 1);
    }
    const g = (await detail(u, '1.1.1')).json.data;
    expect(g.drill).toMatchObject({ can_start: true, blocked_reason: null });
    expect(g.progress.progress_percent).toBe(50); // D7: 50% belajar + 50% drill
  });

  it('tanpa video dan slide, 60 detik + ARTICLE -> 200; tanpa drill: drill_can_start false', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await setProgress(u, id, sql`learn_active_seconds = 60, learn_visited_subtabs = '{ARTICLE}'`);
    const r = await complete(u, id);
    expect(r.status).toBe(200);
    expect(r.json.data.drill_can_start).toBe(false);
  });

  it('ambang waktu mengikuti app_settings learn.min_active_seconds', async () => {
    const { subId: id } = await seedMaterial('1.1.1');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await setProgress(u, id, sql`learn_active_seconds = 30, learn_visited_subtabs = '{ARTICLE}'`);
    await db.execute(sql`UPDATE app_settings SET value = '20'::jsonb WHERE key = 'learn.min_active_seconds'`);
    try {
      expect((await complete(u, id)).status).toBe(200);
    } finally {
      await db.execute(sql`UPDATE app_settings SET value = '60'::jsonb WHERE key = 'learn.min_active_seconds'`);
    }
  });

  it('LOCKED -> 403; tidak AVAILABLE -> 404', async () => {
    await seedMaterial('1.1.1');
    const { subId: lockedId } = await seedMaterial('1.1.2');
    const u = await learnerSession();
    expect((await complete(u, lockedId)).status).toBe(403);
    expect((await complete(u, await subId('1.1.3'))).status).toBe(404);
  });
});

describe('POST mini-task/complete', () => {
  it('SELF_CHECK setelah materi selesai -> 200 sekali (idempoten); sebelum materi selesai -> 409 LEARN_NOT_COMPLETED', async () => {
    const { subId: id } = await seedMaterial('1.1.1', { miniTask: 'SELF_CHECK' });
    const u = await learnerSession();
    await detail(u, '1.1.1');
    const early = await mini(u, id);
    expect(early.status).toBe(409);
    expect(early.json.error.code).toBe('LEARN_NOT_COMPLETED');
    await markLearnDone(u.user.id, '1.1.1');
    const a = await mini(u, id);
    expect(a.status).toBe(200);
    expect(typeof a.json.data.mini_task_completed_at).toBe('string');
    const b = await mini(u, id);
    expect(b.json.data.mini_task_completed_at).toBe(a.json.data.mini_task_completed_at);
    expect((await detail(u, '1.1.1')).json.data.progress.mini_task_completed_at).toBe(a.json.data.mini_task_completed_at);
  });

  it('tipe AI -> 409 MINI_TASK_NOT_SELF_CHECK; tanpa Mini-Task -> 409 NO_MINI_TASK', async () => {
    const { subId: ai } = await seedMaterial('1.1.1', { miniTask: 'AI_SHORT_WRITING' });
    const { subId: none } = await seedMaterial('1.1.2');
    const u = await learnerSession();
    await detail(u, '1.1.1');
    await markLearnDone(u.user.id, '1.1.1');
    expect((await mini(u, ai)).json.error.code).toBe('MINI_TASK_NOT_SELF_CHECK');
    await db.execute(sql`UPDATE user_sub_module_progress SET status = 'COMPLETED', completed_at = now() WHERE user_id = ${u.user.id}::uuid`);
    await detail(u, '1.1.2');
    expect((await mini(u, none)).json.error.code).toBe('NO_MINI_TASK');
  });
});

describe('GET /assets/{asset_id}/file', () => {
  it('slide terbuka -> 200 dengan header keamanan dan ETag', async () => {
    const { slideAssets } = await seedMaterial('1.1.1', { slides: 1 });
    const u = await learnerSession();
    const r = await rawGet(u, slideAssets[0]!);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(r.headers.get('content-disposition')).toBe('inline');
    expect(r.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
    expect(Number(r.headers.get('content-length'))).toBeGreaterThan(0);
    expect(r.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('DOCUMENT -> Content-Disposition attachment dengan nama berkas dari judul', async () => {
    const { docAssets } = await seedMaterial('1.1.1', { attachments: [{ title: 'Daftar 100 Verb-3 Irregular' }] });
    const u = await learnerSession();
    const res = await rawGet(u, docAssets[0]!);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="daftar-100-verb-3-irregular.pdf"');
  });

  it('badan biner utuh, ETag cocok -> 304, tidak cocok -> 200 penuh', async () => {
    const { slideAssets } = await seedMaterial('1.1.1', { slides: 1 });
    const u = await learnerSession();
    const first = await rawGet(u, slideAssets[0]!);
    const bytes = Buffer.from(await first.arrayBuffer());
    expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47');
    const etag = first.headers.get('etag')!;
    const hit = await rawGet(u, slideAssets[0]!, { 'if-none-match': etag });
    expect(hit.status).toBe(304);
    expect(hit.headers.get('etag')).toBe(etag);
    expect((await hit.arrayBuffer()).byteLength).toBe(0);
    const miss = await rawGet(u, slideAssets[0]!, { 'if-none-match': '"lain"' });
    expect(miss.status).toBe(200);
  });

  it('aset yang tidak dilayani: AUDIO_LISTENING, VIDEO_EMBED, tak dirujuk, tidak ada -> 404', async () => {
    await seedMaterial('1.1.1', { videoIds: ['dQw4w9WgXcQ'] });
    const u = await learnerSession();
    const { asset: audio } = await addFileAsset({ kind: 'AUDIO_LISTENING', mime: 'audio/mpeg', ext: 'mp3', data: Buffer.from('ID3-uji-audio-unik') });
    expect((await asset(u, audio.id)).status).toBe(404);
    const video = (await db.execute(sql`SELECT id FROM content_assets WHERE kind = 'VIDEO_EMBED' LIMIT 1`)).rows[0] as { id: string };
    expect((await asset(u, video.id)).status).toBe(404);
    const { asset: orphan } = await addFileAsset({ kind: 'SLIDE_IMAGE', mime: 'image/png', ext: 'png' });
    expect((await asset(u, orphan.id)).status).toBe(404);
    expect((await asset(u, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await asset(u, 'bukan-uuid')).status).toBe(400);
  });

  it('aset yang hanya dirujuk sub-modul LOCKED -> 403 LOCKED_CONTENT; sub-modul DRAFT -> 404', async () => {
    await seedMaterial('1.1.1');
    const { slideAssets } = await seedMaterial('1.1.2', { slides: 1 });
    const u = await learnerSession();
    const r = await asset(u, slideAssets[0]!);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('LOCKED_CONTENT');
    await db.execute(sql`UPDATE sub_modules SET status = 'DRAFT' WHERE sub_module_code = '1.1.2'`);
    expect((await asset(u, slideAssets[0]!)).status).toBe(404);
  });

  it('berkas hilang dari storage -> 404 tanpa membocorkan path', async () => {
    const { slideAssets } = await seedMaterial('1.1.1', { slides: 1 });
    const u = await learnerSession();
    const key = ((await db.execute(sql`SELECT storage_key FROM content_assets WHERE id = ${slideAssets[0]}::uuid`)).rows[0] as { storage_key: string }).storage_key;
    await rm(`${process.env.ASSETS_DIR}/${key}`);
    const r = await asset(u, slideAssets[0]!);
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.json)).not.toContain(key);
  });

  it('mime di luar daftar putih tidak dilayani', async () => {
    const { slideAssets } = await seedMaterial('1.1.1', { slides: 1 });
    await db.execute(sql`UPDATE content_assets SET mime_type = 'text/html' WHERE id = ${slideAssets[0]}::uuid`);
    const u = await learnerSession();
    expect((await asset(u, slideAssets[0]!)).status).toBe(404);
  });

  it('tanpa sesi -> 401', async () => {
    const { slideAssets } = await seedMaterial('1.1.1', { slides: 1 });
    const r = await call(getAsset, 'GET', '/api/v1/assets/x/file', { params: { asset_id: slideAssets[0]! } });
    expect(r.status).toBe(401);
  });
});

/** GET aset dengan respons mentah (helper `call` mem-parse JSON, tidak cocok untuk biner). */
async function rawGet(u: L, id: string, headers: Record<string, string> = {}): Promise<Response> {
  return getAsset(
    new Request(`http://localhost:3000/api/v1/assets/${id}/file`, {
      headers: { origin: 'http://localhost:3000', 'x-forwarded-for': '10.99.0.1', cookie: u.cookie, ...headers },
    }),
    { params: Promise.resolve({ asset_id: id }) },
  );
}

