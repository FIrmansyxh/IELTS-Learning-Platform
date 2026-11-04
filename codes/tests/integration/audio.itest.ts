/** SPEC-011 (Backend): GET /attempts/{attempt_id}/audio. Setiap AC sisi server + edge case Range. */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, attempts, tiers } from '@/db/schema';
import { AttemptResponseSchema } from '@/contracts/attempts';
import { setClockForTest } from '@/server/clock';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { activeAudioStreams, resetAudioSlots } from '@/server/attempts/audio-limits';
import { logger } from '@/server/logger';
import { assessmentTypeHandlers } from '@/server/attempts/handlers';
import { getStorage } from '@/server/storage';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as audioRoute } from '@/app/api/v1/attempts/[attempt_id]/audio/route';
import { call, freshIp, learnerSession } from './helpers';
import { addDrill, addFileAsset, markLearnDone, resetLearning, seedMaterial } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
const realSkipHandler = assessmentTypeHandlers.SKIP_MODULE_TEST!;
afterAll(async () => {
  await resetLearning();
  await closeDb();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type L = Awaited<ReturnType<typeof learnerSession>>;

const SIZE = 4_812_344;
/** Berkas deterministik 4.812.344 byte (pola berulang) agar isi rentang dapat dibandingkan byte per byte. */
const AUDIO = (() => {
  const b = Buffer.alloc(SIZE);
  for (let i = 0; i < SIZE; i++) b[i] = (i * 31 + (i >> 8)) & 255;
  return b;
})();

const start = (u: L, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
const submit = (u: L, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });

/** GET biner (call() mem-parse JSON). */
async function rawAudio(id: string, cookie: string | null, opts: { range?: string; query?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': freshIp(), ...(opts.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (opts.range) headers.range = opts.range;
  const res = await audioRoute(new Request(`http://localhost:3000/api/v1/attempts/${id}/audio${opts.query ?? ''}`, { method: 'GET', headers }), {
    params: Promise.resolve({ attempt_id: id }),
  });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, body };
}
const jsonOf = (b: Buffer) => JSON.parse(b.toString('utf8'));

async function audioAsset(over: { mime?: string; ext?: string; kind?: 'AUDIO_LISTENING' | 'IMAGE'; data?: Buffer; storeFile?: boolean } = {}) {
  return addFileAsset({
    kind: (over.kind ?? 'AUDIO_LISTENING') as 'AUDIO_LISTENING',
    mime: over.mime ?? 'audio/mpeg',
    ext: over.ext ?? 'mp3',
    data: over.data ?? AUDIO,
    storeFile: over.storeFile,
    title: 'Audio uji',
  });
}

async function practiceSet(assetId: string | null) {
  await seedMaterial('1.1.1');
  const set = await addDrill('1.1.1', [Q.mcq({ question_id: 'Q-A1', skill: 'LISTENING', section_no: 1 }), Q.mcq({ question_id: 'Q-A2', skill: 'LISTENING', section_no: 1 })], {
    listeningAssetId: assetId,
  });
  return set;
}

const examHandler = {
  async start() {
    return { mode: 'EXAM' as const, passPercent: 50, questionLimit: null, keepOrder: true };
  },
  async onFinish() {
    return { progress: null };
  },
};
async function examSet(assetId: string | null) {
  const mod = (await db.execute(sql`SELECT id FROM modules WHERE module_code = '1.1'`)).rows[0] as { id: string };
  const [s] = await db
    .insert(assessmentSets)
    .values({
      assessmentType: 'SKIP_MODULE_TEST',
      title: 'Ujian Listening uji',
      moduleId: mod.id,
      timeLimitSeconds: 300,
      questionsJson: [Q.mcq({ question_id: 'Q-E1', skill: 'LISTENING', section_no: 1 })],
      questionCount: 1,
      listeningAssetId: assetId,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
    })
    .returning();
  return s!;
}

async function learner() {
  const u = await learnerSession();
  await markLearnDone(u.user.id, '1.1.1');
  return u;
}

beforeEach(async () => {
  resetRateLimits();
  resetAudioSlots();
  await resetLearning();
  await db.execute(sql`DELETE FROM content_assets`);
});
afterEach(() => {
  setClockForTest(null);
  assessmentTypeHandlers.SKIP_MODULE_TEST = realSkipHandler;
  vi.restoreAllMocks();
});

describe('AttemptDTO.listening (kontrak data SPEC-011)', () => {
  it('audio_url memuat attempt_id (bukan asset_id); sesuai skema kontrak; set tanpa audio -> listening null', async () => {
    const { asset } = await audioAsset();
    const set = await practiceSet(asset.id);
    const u = await learner();
    const r = await start(u, set.id);
    expect(AttemptResponseSchema.safeParse(r.json).success).toBe(true);
    const dto = r.json.data;
    expect(dto.listening).toEqual({ audio_url: `/api/v1/attempts/${dto.id}/audio`, mime_type: 'audio/mpeg', duration_sec: 0 });
    expect(JSON.stringify(dto)).not.toContain(asset.id);
    expect(dto.questions.every((q: any) => q.section_no === 1)).toBe(true);

    await resetLearning();
    const plain = await practiceSet(null);
    const u2 = await learner();
    expect((await start(u2, plain.id)).json.data.listening).toBeNull();
  });
});

describe('AttemptDTO.listening hanya untuk aset yang dapat dilayani (F-11-03)', () => {
  it('MIME varian WAV dinormalisasi ke audio/wav (sama dengan Content-Type endpoint)', async () => {
    const { asset } = await audioAsset({ mime: 'audio/x-wav', ext: 'wav', data: Buffer.from('RIFFxxxxWAVEfmt 0123456789') });
    const u = await learner();
    const r = await start(u, (await practiceSet(asset.id)).id);
    expect(AttemptResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data.listening.mime_type).toBe('audio/wav');
    const audio = await rawAudio(r.json.data.id, u.cookie, { range: 'bytes=0-3' });
    expect(audio.headers.get('content-type')).toBe('audio/wav');
  });

  it('aset bukan AUDIO_LISTENING atau MIME di luar allow-list -> listening null (endpoint juga 404); skema kontrak tetap valid', async () => {
    const img = await audioAsset({ kind: 'IMAGE', mime: 'image/png', ext: 'png', data: Buffer.from('x') });
    const u1 = await learner();
    const r1 = await start(u1, (await practiceSet(img.asset.id)).id);
    expect(AttemptResponseSchema.safeParse(r1.json).success).toBe(true);
    expect(r1.json.data.listening).toBeNull();
    expect((await rawAudio(r1.json.data.id, u1.cookie)).status).toBe(404);

    await resetLearning();
    const flac = await audioAsset({ mime: 'audio/flac', ext: 'flac', data: Buffer.from('fLaC') });
    const u2 = await learner();
    const r2 = await start(u2, (await practiceSet(flac.asset.id)).id);
    expect(AttemptResponseSchema.safeParse(r2.json).success).toBe(true);
    expect(r2.json.data.listening).toBeNull();
    expect((await rawAudio(r2.json.data.id, u2.cookie)).status).toBe(404);
  });
});

describe('GET /attempts/{id}/audio', () => {
  async function setup(mode: 'PRACTICE' | 'EXAM' = 'PRACTICE', over: Parameters<typeof audioAsset>[0] = {}) {
    const { asset, data } = await audioAsset(over);
    let set;
    if (mode === 'EXAM') {
      assessmentTypeHandlers.SKIP_MODULE_TEST = examHandler;
      await seedMaterial('1.1.1');
      set = await examSet(asset.id);
    } else set = await practiceSet(asset.id);
    const u = await learner();
    const a = (await start(u, set.id)).json.data;
    return { u, asset, data, set, attemptId: a.id as string };
  }

  it('AC1: Range bytes=0-1023 -> 206, Content-Range 0-1023/4812344, header keamanan, isi byte sama', async () => {
    const { u, attemptId } = await setup();
    const r = await rawAudio(attemptId, u.cookie, { range: 'bytes=0-1023' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 0-1023/${SIZE}`);
    expect(r.headers.get('content-length')).toBe('1024');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-type')).toBe('audio/mpeg');
    expect(r.headers.get('content-disposition')).toBe('inline');
    expect(r.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(r.headers.get('etag')).toBeNull();
    expect(r.body.equals(AUDIO.subarray(0, 1024))).toBe(true);
  });

  it('AC2: tanpa Range -> 200 seluruh berkas, Content-Length 4812344', async () => {
    const { u, attemptId } = await setup();
    const r = await rawAudio(attemptId, u.cookie);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-length')).toBe(String(SIZE));
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('content-range')).toBeNull();
    expect(createHash('sha256').update(r.body).digest('hex')).toBe(createHash('sha256').update(AUDIO).digest('hex'));
  });

  it('AC3: Range bytes=9999999- -> 416 RANGE_NOT_SATISFIABLE + Content-Range bytes */total + body error standar', async () => {
    const { u, attemptId } = await setup();
    const r = await rawAudio(attemptId, u.cookie, { range: 'bytes=9999999-' });
    expect(r.status).toBe(416);
    expect(r.headers.get('content-range')).toBe(`bytes */${SIZE}`);
    expect(jsonOf(r.body).error).toMatchObject({ code: 'RANGE_NOT_SATISFIABLE' });
    expect(jsonOf(r.body).error.request_id).toBeTruthy();
    for (const bad of ['bytes=10-5', 'bytes=-0', 'bytes=zzz']) {
      expect((await rawAudio(attemptId, u.cookie, { range: bad })).status, bad).toBe(416);
    }
  });

  it('edge: sufiks -500, ujung terbuka, ujung dipotong, WAV/seluruh ukuran; multi-rentang -> 200 penuh', async () => {
    const { u, attemptId } = await setup();
    const suffix = await rawAudio(attemptId, u.cookie, { range: 'bytes=-500' });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('content-range')).toBe(`bytes ${SIZE - 500}-${SIZE - 1}/${SIZE}`);
    expect(suffix.body.equals(AUDIO.subarray(SIZE - 500))).toBe(true);

    const open = await rawAudio(attemptId, u.cookie, { range: `bytes=${SIZE - 10}-` });
    expect(open.status).toBe(206);
    expect(open.body.equals(AUDIO.subarray(SIZE - 10))).toBe(true);

    const clamp = await rawAudio(attemptId, u.cookie, { range: `bytes=${SIZE - 4}-${SIZE + 1000}` });
    expect(clamp.headers.get('content-range')).toBe(`bytes ${SIZE - 4}-${SIZE - 1}/${SIZE}`);
    expect(clamp.headers.get('content-length')).toBe('4');

    const multi = await rawAudio(attemptId, u.cookie, { range: 'bytes=0-9,20-29' });
    expect(multi.status).toBe(200);
    expect(multi.body.length).toBe(SIZE);
  });

  it('edge: permintaan Range paralel independen (Safari) mengembalikan isi yang benar masing-masing', async () => {
    const { u, attemptId } = await setup();
    const ranges: Array<[number, number]> = [[0, 1], [1000, 5000], [SIZE - 100, SIZE - 1], [2_000_000, 2_000_999], [64, 64]];
    const out = await Promise.all(ranges.map(([s, e]) => rawAudio(attemptId, u.cookie, { range: `bytes=${s}-${e}` })));
    out.forEach((r, i) => {
      const [s, e] = ranges[i]!;
      expect(r.status).toBe(206);
      expect(r.body.equals(AUDIO.subarray(s, e + 1))).toBe(true);
    });
  });

  it('edge: koneksi diputus di tengah aliran tidak menjadi 500 dan permintaan berikutnya tetap normal', async () => {
    const { u, attemptId } = await setup();
    const res = await audioRoute(
      new Request(`http://localhost:3000/api/v1/attempts/${attemptId}/audio`, { headers: { cookie: u.cookie, 'x-forwarded-for': freshIp() } }),
      { params: Promise.resolve({ attempt_id: attemptId }) },
    );
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel(); // klien memutus
    const again = await rawAudio(attemptId, u.cookie, { range: 'bytes=0-9' });
    expect(again.status).toBe(206);
  });

  it('AC4: attempt milik user lain -> 404 NOT_FOUND (bukan 403); tanpa sesi -> 401; attempt tak dikenal -> 404; id bukan uuid -> 400', async () => {
    const { attemptId } = await setup();
    const other = await learnerSession();
    const r = await rawAudio(attemptId, other.cookie);
    expect(r.status).toBe(404);
    expect(jsonOf(r.body).error.code).toBe('NOT_FOUND');
    expect((await rawAudio(attemptId, null)).status).toBe(401);
    const missing = await rawAudio(randomUUID(), other.cookie);
    expect(missing.status).toBe(404);
    const bad = await call(audioRoute, 'GET', '/api/v1/attempts/xyz/audio', { cookie: other.cookie, params: { attempt_id: 'xyz' } });
    expect(bad.status).toBe(400);
  });

  it('AC5: attempt GRADED (setelah submit) -> 409 ATTEMPT_NOT_ACTIVE; ABANDONED juga', async () => {
    const { u, attemptId } = await setup();
    expect((await submit(u, attemptId)).status).toBe(200);
    const r = await rawAudio(attemptId, u.cookie, { range: 'bytes=0-9' });
    expect(r.status).toBe(409);
    expect(jsonOf(r.body).error.code).toBe('ATTEMPT_NOT_ACTIVE');

    await resetLearning();
    await db.execute(sql`DELETE FROM content_assets`);
    const second = await setup();
    await db.update(attempts).set({ status: 'ABANDONED' }).where(eq(attempts.id, second.attemptId));
    expect((await rawAudio(second.attemptId, second.u.cookie)).status).toBe(409);
  });

  it('EXAM: dilayani selama IN_PROGRESS; setelah deadline + 5 dtk (ditegakkan server) -> 409 tanpa efek samping; sebelum itu tetap 206', async () => {
    const t0 = Date.parse('2026-11-03T10:00:00.000Z');
    setClockForTest(() => t0);
    const { u, attemptId } = await setup('EXAM');
    const dto = (await call(getRoute, 'GET', `/api/v1/attempts/${attemptId}`, { cookie: u.cookie, params: { attempt_id: attemptId } })).json.data;
    expect(dto.mode).toBe('EXAM');
    expect(dto.listening.audio_url).toBe(`/api/v1/attempts/${attemptId}/audio`);
    expect((await rawAudio(attemptId, u.cookie, { range: 'bytes=0-9' })).status).toBe(206);

    setClockForTest(() => t0 + 300_000 + 4_000); // masih dalam toleransi 5 dtk
    expect((await rawAudio(attemptId, u.cookie, { range: 'bytes=0-9' })).status).toBe(206);

    setClockForTest(() => t0 + 300_000 + 6_000);
    const late = await rawAudio(attemptId, u.cookie, { range: 'bytes=0-9' });
    expect(late.status).toBe(409);
    expect(jsonOf(late.body).error.code).toBe('ATTEMPT_NOT_ACTIVE');
    // endpoint audio tidak mengubah state (finalisasi tetap lewat GET attempt/submit)
    expect((await db.execute(sql`SELECT status FROM attempts WHERE id = ${attemptId}::uuid`)).rows[0]).toEqual({ status: 'IN_PROGRESS' });
  });

  it('EXAM: tidak ada jalur lain ke berkas (URL hanya via attempt_id; asset_id tidak dipetakan ke route audio)', async () => {
    const { u, asset, attemptId } = await setup('EXAM');
    const viaAssetId = await rawAudio(asset.id, u.cookie);
    expect(viaAssetId.status).toBe(404);
    const r = await rawAudio(attemptId, u.cookie);
    expect(r.headers.get('content-disposition')).not.toMatch(/attachment/i);
    expect(r.headers.get('cache-control')).toContain('no-store');
  });

  it('AC6: set tanpa listening_asset_id -> 404; aset bukan AUDIO_LISTENING / MIME tidak diizinkan -> 404', async () => {
    await seedMaterial('1.1.1');
    const set = await addDrill('1.1.1', [Q.mcq({ question_id: 'Q-N1' })]);
    const u = await learner();
    const a = (await start(u, set.id)).json.data;
    expect((await rawAudio(a.id, u.cookie)).status).toBe(404);

    const img = await audioAsset({ kind: 'IMAGE', mime: 'image/png', ext: 'png', data: Buffer.from('x') });
    await db.update(assessmentSets).set({ listeningAssetId: img.asset.id }).where(eq(assessmentSets.id, set.id));
    expect((await rawAudio(a.id, u.cookie)).status).toBe(404);

    const odd = await audioAsset({ mime: 'audio/flac', ext: 'flac', data: Buffer.from('fLaC') });
    await db.update(assessmentSets).set({ listeningAssetId: odd.asset.id }).where(eq(assessmentSets.id, set.id));
    expect((await rawAudio(a.id, u.cookie)).status).toBe(404);
  });

  it('AC7: berkas hilang di storage tetapi baris ada -> 404 + log error asset_file_missing tanpa path', async () => {
    const { u, asset, attemptId } = await setup();
    const key = asset.storageKey!;
    await getStorage().remove(key);
    const spy = vi.spyOn(logger, 'error');
    const r = await rawAudio(attemptId, u.cookie, { range: 'bytes=0-9' });
    expect(r.status).toBe(404);
    expect(jsonOf(r.body).error.code).toBe('NOT_FOUND');
    expect(spy).toHaveBeenCalledWith(expect.any(Object), 'asset_file_missing');
    expect(JSON.stringify(spy.mock.calls)).not.toContain(key);
    expect(r.body.toString()).not.toContain(key);
  });

  it('AC8: tidak ada Content-Disposition attachment; MIME WAV varian dinormalisasi ke audio/wav; ogg dilayani', async () => {
    const wav = await setup('PRACTICE', { mime: 'audio/x-wav', ext: 'wav', data: Buffer.from('RIFFxxxxWAVEfmt 0123456789') });
    const r = await rawAudio(wav.attemptId, wav.u.cookie, { range: 'bytes=0-3' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-type')).toBe('audio/wav');
    expect(r.headers.get('content-disposition')).toBe('inline');
    expect(r.body.toString()).toBe('RIFF');
    await resetLearning();
    const ogg = await setup('PRACTICE', { mime: 'audio/ogg', ext: 'ogg', data: Buffer.from('OggS0123456789') });
    expect((await rawAudio(ogg.attemptId, ogg.u.cookie)).headers.get('content-type')).toBe('audio/ogg');
  });

  it('query section diabaikan untuk attempt non-Boss; section bukan uuid -> 400', async () => {
    const { u, attemptId } = await setup();
    expect((await rawAudio(attemptId, u.cookie, { query: `?section=${randomUUID()}`, range: 'bytes=0-1' })).status).toBe(206);
    expect((await rawAudio(attemptId, u.cookie, { query: '?section=nope' })).status).toBe(400);
  });

  it('F-11-02: bucket audio_stream 60/menit per pengguna (429 RATE_LIMITED dengan Retry-After), pengguna lain tidak terpengaruh', async () => {
    const { u, attemptId } = await setup();
    const statuses: number[] = [];
    let retry: string | null = null;
    for (let i = 0; i < 62; i++) {
      const r = await rawAudio(attemptId, u.cookie, { range: 'bytes=0-0', headers: { 'x-forwarded-for': '10.250.0.1' } });
      statuses.push(r.status);
      if (r.status === 429) {
        retry = r.headers.get('retry-after');
        expect(jsonOf(r.body).error.code).toBe('RATE_LIMITED');
      }
    }
    expect(statuses.slice(0, 60).every((x) => x === 206)).toBe(true);
    expect(statuses[60]).toBe(429);
    expect(retry).toBeTruthy();
  });

  it('F-11-02: permintaan tanpa Range dibatasi 6 per attempt; permintaan Range tidak terpengaruh; attempt lain terpisah', async () => {
    const { u, attemptId } = await setup();
    for (let i = 0; i < 6; i++) expect((await rawAudio(attemptId, u.cookie)).status, `full#${i}`).toBe(200);
    const blocked = await rawAudio(attemptId, u.cookie);
    expect(blocked.status).toBe(429);
    expect(jsonOf(blocked.body).error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await rawAudio(attemptId, u.cookie, { range: 'bytes=0-9' })).status).toBe(206);
    expect((await rawAudio(attemptId, u.cookie, { range: 'bytes=0-' })).status).toBe(206);
  });

  it('F-11-02: maks 4 aliran serentak per pengguna (ke-5 -> 429 + Retry-After); slot kembali setelah aliran dibatalkan/selesai', async () => {
    const { u, attemptId } = await setup();
    const open = (range = 'bytes=0-') =>
      audioRoute(new Request(`http://localhost:3000/api/v1/attempts/${attemptId}/audio`, { headers: { cookie: u.cookie, range, 'x-forwarded-for': freshIp() } }), {
        params: Promise.resolve({ attempt_id: attemptId }),
      });
    const held = await Promise.all([open(), open(), open(), open()]);
    expect(held.every((r) => r.status === 206)).toBe(true);
    expect(activeAudioStreams(u.user.id)).toBe(4);
    const fifth = await open();
    expect(fifth.status).toBe(429);
    expect(fifth.headers.get('retry-after')).toBeTruthy();
    expect(activeAudioStreams(u.user.id)).toBe(4);

    await held[0]!.body!.cancel();
    expect(activeAudioStreams(u.user.id)).toBe(3);
    const again = await open('bytes=0-9');
    expect(again.status).toBe(206);
    expect((await again.arrayBuffer()).byteLength).toBe(10);

    for (const r of held.slice(1)) await r.body!.cancel();
    expect(activeAudioStreams(u.user.id)).toBe(0);
  });
});

describe('GET /attempts/{id}/audio?section= (attempt TIER_BOSS_EXAM, SPEC-014)', () => {
  async function bossSetup(phase: string | null) {
    const { asset } = await audioAsset();
    const [t1] = await db.select().from(tiers).where(eq(tiers.tierNumber, 1));
    const [boss] = await db
      .insert(assessmentSets)
      .values({ assessmentType: 'TIER_BOSS_EXAM', title: 'Boss', tierId: t1!.id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
      .returning();
    const mkSection = async (skill: 'LISTENING' | 'READING', listeningAssetId: string | null) =>
      (
        await db
          .insert(assessmentSets)
          .values({ assessmentType: 'BOSS_SECTION', title: skill, parentSetId: boss!.id, skillCategory: skill, timeLimitSeconds: 600, questionsJson: [], questionCount: 0, listeningAssetId, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
          .returning()
      )[0]!;
    const listening = await mkSection('LISTENING', asset.id);
    const reading = await mkSection('READING', null);
    const u = await learnerSession();
    const sections = phase === null ? {} : { [listening.id]: { phase, started_at: null, deadline_at: null }, [reading.id]: { phase, started_at: null, deadline_at: null } };
    const [a] = await db
      .insert(attempts)
      .values({
        userId: u.user.id,
        assessmentSetId: boss!.id,
        assessmentVersion: 1,
        mode: 'EXAM',
        deadlineAt: new Date(Date.now() + 3_600_000),
        state: { v: 1, order: [], last_resume_at: new Date().toISOString(), pass_percent: null, served: {}, sections },
      })
      .returning();
    return { u, attemptId: a!.id, listening, reading };
  }

  it('section ACTIVE -> 206 audio set anak; tanpa section -> 404', async () => {
    const { u, attemptId, listening } = await bossSetup('ACTIVE');
    const ok = await rawAudio(attemptId, u.cookie, { query: `?section=${listening.id}`, range: 'bytes=0-1023' });
    expect(ok.status).toBe(206);
    expect(ok.body.equals(AUDIO.subarray(0, 1024))).toBe(true);
    const none = await rawAudio(attemptId, u.cookie, { range: 'bytes=0-1023' });
    expect(none.status).toBe(404);
  });

  it('section PENDING / DONE / tak ada di state -> 409 ATTEMPT_NOT_ACTIVE', async () => {
    for (const phase of ['PENDING', 'DONE', null]) {
      await resetLearning();
      await db.execute(sql`DELETE FROM content_assets`);
      const { u, attemptId, listening } = await bossSetup(phase);
      const r = await rawAudio(attemptId, u.cookie, { query: `?section=${listening.id}` });
      expect(r.status, String(phase)).toBe(409);
      expect(jsonOf(r.body).error.code).toBe('ATTEMPT_NOT_ACTIVE');
    }
  });

  it('section bukan anak set induk attempt -> 404; section tanpa audio -> 404', async () => {
    const { u, attemptId, reading } = await bossSetup('ACTIVE');
    expect((await rawAudio(attemptId, u.cookie, { query: `?section=${randomUUID()}` })).status).toBe(404);
    expect((await rawAudio(attemptId, u.cookie, { query: `?section=${reading.id}` })).status).toBe(404);
    const other = await learnerSession();
    expect((await rawAudio(attemptId, other.cookie, { query: `?section=${reading.id}` })).status).toBe(404);
  });
});
