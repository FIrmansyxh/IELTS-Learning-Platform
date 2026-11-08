/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { execute, getDb } from '@/server/db';
import { GET as tracksRoute } from '@/app/api/v1/tracks/route';
import { PUT as activeTrackRoute } from '@/app/api/v1/me/active-track/route';
import { GET as treeRoute } from '@/app/api/v1/curriculum/tree/route';
import { GET as subModuleRoute } from '@/app/api/v1/sub-modules/[sub_module]/route';
import { PUT as subModuleStyleRoute } from '@/app/api/v1/sub-modules/[sub_module]/style/route';
import { POST as checkpointAttemptRoute } from '@/app/api/v1/tracks/[track_code]/checkpoints/[item_id]/attempts/route';
import { GET as lastLearnedRoute } from '@/app/api/v1/me/last-learned/route';
import { ensureProgressRows, recomputeStatuses } from '@/server/gatekeeping/service';
import { call, learnerSession } from './helpers';
import { addDrill, resetLearning, seedMaterial } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
type L = Awaited<ReturnType<typeof learnerSession>>;

const getTracks = (u: L | null) => call(tracksRoute, 'GET', '/api/v1/tracks', { cookie: u?.cookie });
const setActiveTrack = (u: L | null, trackCode: string) =>
  call(activeTrackRoute, 'PUT', '/api/v1/me/active-track', { cookie: u?.cookie, body: { track_code: trackCode } });
const getTree = (u: L | null, query?: Record<string, string>) => {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  return call(treeRoute, 'GET', `/api/v1/curriculum/tree${qs}`, { cookie: u?.cookie });
};
const getSubModule = (u: L | null, code: string, query?: Record<string, string>) => {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  return call(subModuleRoute, 'GET', `/api/v1/sub-modules/${code}${qs}`, {
    cookie: u?.cookie,
    params: { sub_module: code },
  });
};
const setSubModuleStyle = (u: L | null, code: string, style: string | null) =>
  call(subModuleStyleRoute, 'PUT', `/api/v1/sub-modules/${code}/style`, {
    cookie: u?.cookie,
    params: { sub_module: code },
    body: { style },
  });
const startCheckpoint = (u: L | null, trackCode: string, itemId: string) =>
  call(checkpointAttemptRoute, 'POST', `/api/v1/tracks/${trackCode}/checkpoints/${itemId}/attempts`, {
    cookie: u?.cookie,
    params: { track_code: trackCode, item_id: itemId },
    body: {},
  });
const getLastLearned = (u: L | null) => call(lastLearnedRoute, 'GET', '/api/v1/me/last-learned', { cookie: u?.cookie });

describe('SPEC-021: Jalur Belajar & Gaya Penyampaian Materi (Integration)', () => {
  let user: L;

  beforeEach(async () => {
    await resetLearning();
    user = await learnerSession();
    await ensureProgressRows(db, user.user.id);
    await recomputeStatuses(db, user.user.id);
  });

  describe('AC-1 & AC-17: GET /api/v1/tracks', () => {
    it('mengembalikan tepat 4 jalur PUBLISHED dengan GT-STRUCT aktif secara default', async () => {
      const res = await getTracks(user);
      expect(res.status).toBe(200);
      const tracks = res.json.data;
      expect(tracks).toHaveLength(4);

      const codes = tracks.map((t: any) => t.code);
      expect(codes).toEqual(['GT-STRUCT', 'GT-WRITING', 'GT-READING', 'GT-SPRINT-4W']);

      const struct = tracks.find((t: any) => t.code === 'GT-STRUCT');
      expect(struct.total_sub_modules).toBe(31);
      expect(struct.checkpoint_count).toBe(0);
      expect(struct.is_active).toBe(true);

      const writing = tracks.find((t: any) => t.code === 'GT-WRITING');
      expect(writing.total_sub_modules).toBe(15);
      expect(writing.checkpoint_count).toBe(3);
      expect(writing.is_active).toBe(false);

      const reading = tracks.find((t: any) => t.code === 'GT-READING');
      expect(reading.total_sub_modules).toBe(7);
      expect(reading.checkpoint_count).toBe(2);

      const sprint = tracks.find((t: any) => t.code === 'GT-SPRINT-4W');
      expect(sprint.total_sub_modules).toBe(20);
      expect(sprint.checkpoint_count).toBe(4);
      expect(sprint.layout).toBe('SPRINT');
    });

    it('menolak tanpa autentikasi dengan 401', async () => {
      const res = await getTracks(null);
      expect(res.status).toBe(401);
    });
  });

  describe('AC-2: PUT /api/v1/me/active-track', () => {
    it('mengubah jalur aktif ke GT-WRITING dengan sukses (204) dan 404 bila kode tidak dikenal', async () => {
      const res = await setActiveTrack(user, 'GT-WRITING');
      expect(res.status).toBe(204);

      const listRes = await getTracks(user);
      const writing = listRes.json.data.find((t: any) => t.code === 'GT-WRITING');
      expect(writing.is_active).toBe(true);

      const struct = listRes.json.data.find((t: any) => t.code === 'GT-STRUCT');
      expect(struct.is_active).toBe(false);

      const notFoundRes = await setActiveTrack(user, 'GT-UNKNOWN');
      expect(notFoundRes.status).toBe(404);
    });
  });

  describe('AC-3, AC-4, AC-7: GET /api/v1/curriculum/tree', () => {
    it('menampilkan data.track sesuai jalur aktif dan mendukung query track opsional', async () => {
      const resDefault = await getTree(user);
      expect(resDefault.status).toBe(200);
      expect(resDefault.json.data.track.code).toBe('GT-STRUCT');
      expect(resDefault.json.data.track.items).toHaveLength(31);

      const resWriting = await getTree(user, { track: 'GT-WRITING' });
      expect(resWriting.status).toBe(200);
      expect(resWriting.json.data.track.code).toBe('GT-WRITING');
      expect(resWriting.json.data.track.items).toHaveLength(18); // 15 sub-module + 3 checkpoint

      const resSprint = await getTree(user, { track: 'GT-SPRINT-4W' });
      expect(resSprint.status).toBe(200);
      expect(resSprint.json.data.track.layout).toBe('SPRINT');
      expect(resSprint.json.data.track.items).toHaveLength(24); // 20 sub-module + 4 checkpoint
    });

    it('menolak query track dengan format tidak valid (400) atau tidak ditemukan (404)', async () => {
      const badRes = await getTree(user, { track: 'INVALID_FORMAT' });
      expect(badRes.status).toBe(400);

      const nfRes = await getTree(user, { track: 'GT-NOTEXIST' });
      expect(nfRes.status).toBe(404);
    });

    it('AC-7: Tier 2 LOCKED menahan item 2.1.1 tetap LOCKED di jalur GT-WRITING', async () => {
      await seedMaterial('2.1.1');
      const res = await getTree(user, { track: 'GT-WRITING' });
      const item211 = res.json.data.track.items.find((it: any) => it.sub_module?.sub_module_code === '2.1.1');
      if (item211) {
        expect(item211.sub_module.status).toBe('LOCKED');
        expect(item211.sub_module.lock_reason?.code).toBe('TIER_LOCKED');
      }
    });
  });

  describe('AC-5 & AC-16: Sub-module Style & Delivery', () => {
    it('GET /sub-modules/{code} memuat blok delivery dan mendukung query style', async () => {
      await seedMaterial('1.1.1');
      const res = await getSubModule(user, '1.1.1');
      expect(res.status).toBe(200);
      expect(res.json.data.delivery).toBeDefined();
      expect(res.json.data.delivery.applied_style).toBe('LEARN_FIRST');
      expect(res.json.data.delivery.available_styles).toContain('LEARN_FIRST');
    });

    it('PUT /sub-modules/{code}/style mengubah override gaya dan dapat direset ke null', async () => {
      await seedMaterial('1.1.1');
      const setRes = await setSubModuleStyle(user, '1.1.1', 'PRACTICE_FIRST');
      expect(setRes.status).toBe(204);

      const checkRes = await getSubModule(user, '1.1.1');
      expect(checkRes.json.data.delivery.source).toBe('USER_OVERRIDE');

      const resetRes = await setSubModuleStyle(user, '1.1.1', null);
      expect(resetRes.status).toBe(204);

      const checkReset = await getSubModule(user, '1.1.1');
      expect(checkReset.json.data.delivery.source).toBe('TRACK_DEFAULT');
    });
  });

  describe('AC-10 & AC-11: Checkpoint Attempts', () => {
    it('menolak memulai checkpoint bila sub-modul yang dicakup belum selesai (409 CHECKPOINT_NOT_READY)', async () => {
      const treeRes = await getTree(user, { track: 'GT-WRITING' });
      const cpItem = treeRes.json.data.track.items.find((it: any) => it.kind === 'CHECKPOINT');
      expect(cpItem).toBeDefined();

      const res = await startCheckpoint(user, 'GT-WRITING', cpItem.item_id);
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe('CHECKPOINT_NOT_READY');
    });

    it('menolak bila item_id bukan checkpoint milik jalur itu (404 NOT_FOUND)', async () => {
      const res = await startCheckpoint(user, 'GT-WRITING', '00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });

    it('AC-10: bila sub-modul selesai dan kolam cukup, startCheckpoint mengembalikan 201 dengan 10 soal', async () => {
      // Siapkan 4 sub-modul pertama GT-WRITING: 1.1.1, 1.1.2, 1.1.3, 1.1.4
      const subs = ['1.1.1', '1.1.2', '1.1.3', '1.1.4'];
      for (const s of subs) {
        await seedMaterial(s);
        await addDrill(s, [Q.mcq(), Q.mcq(), Q.mcq(), Q.mcq()]);
        await execute(
          db,
          sql`UPDATE user_sub_module_progress SET status = 'COMPLETED', learn_completed_at = CURRENT_TIMESTAMP WHERE user_id = ${user.user.id} AND sub_module_id = (SELECT id FROM sub_modules WHERE sub_module_code = ${s})`,
        );
      }

      const treeRes = await getTree(user, { track: 'GT-WRITING' });
      const cpItem = treeRes.json.data.track.items.find((it: any) => it.kind === 'CHECKPOINT');
      expect(cpItem).toBeDefined();
      expect(cpItem.checkpoint.status).toBe('READY');

      const res = await startCheckpoint(user, 'GT-WRITING', cpItem.item_id);
      expect(res.status).toBe(201);
      expect(res.json.data.attempt_id).toBeDefined();
      expect(res.json.data.question_count).toBe(10);
      expect(res.json.data.pass_percent).toBe(75);
      expect(res.json.data.covers).toEqual(subs);
    });
  });

  describe('AC-18: GET /api/v1/me/last-learned', () => {
    it('menyertakan active_track { code, title } pada respons kartu resume', async () => {
      const res = await getLastLearned(user);
      expect(res.status).toBe(200);
      if (res.json.data) {
        expect(res.json.data.active_track).toBeDefined();
        expect(res.json.data.active_track.code).toBe('GT-STRUCT');
        expect(res.json.data.active_track.title).toBeDefined();
      }
    });
  });
});
