/** Pembungkus panggilan route SPEC-021 yang dipakai bersama oleh tracks.itest.ts dan tracks-ac.itest.ts. */
import { GET as tracksRoute } from '@/app/api/v1/tracks/route';
import { PUT as activeTrackRoute } from '@/app/api/v1/me/active-track/route';
import { GET as treeRoute } from '@/app/api/v1/curriculum/tree/route';
import { GET as subModuleRoute } from '@/app/api/v1/sub-modules/[sub_module]/route';
import { PUT as subModuleStyleRoute } from '@/app/api/v1/sub-modules/[sub_module]/style/route';
import { POST as checkpointAttemptRoute } from '@/app/api/v1/tracks/[track_code]/checkpoints/[item_id]/attempts/route';
import { GET as lastLearnedRoute } from '@/app/api/v1/me/last-learned/route';
import { call, learnerSession } from './helpers';

export type L = Awaited<ReturnType<typeof learnerSession>>;

export const getTracks = (u: L | null) => call(tracksRoute, 'GET', '/api/v1/tracks', { cookie: u?.cookie });
export const setActiveTrack = (u: L | null, trackCode: string) =>
  call(activeTrackRoute, 'PUT', '/api/v1/me/active-track', { cookie: u?.cookie, body: { track_code: trackCode } });
export const getTree = (u: L | null, query?: Record<string, string>) => {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  return call(treeRoute, 'GET', `/api/v1/curriculum/tree${qs}`, { cookie: u?.cookie });
};
export const getSubModule = (u: L | null, code: string, query?: Record<string, string>) => {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  return call(subModuleRoute, 'GET', `/api/v1/sub-modules/${code}${qs}`, {
    cookie: u?.cookie,
    params: { sub_module: code },
  });
};
export const setSubModuleStyle = (u: L | null, code: string, style: string | null) =>
  call(subModuleStyleRoute, 'PUT', `/api/v1/sub-modules/${code}/style`, {
    cookie: u?.cookie,
    params: { sub_module: code },
    body: { style },
  });
export const startCheckpoint = (u: L | null, trackCode: string, itemId: string) =>
  call(checkpointAttemptRoute, 'POST', `/api/v1/tracks/${trackCode}/checkpoints/${itemId}/attempts`, {
    cookie: u?.cookie,
    params: { track_code: trackCode, item_id: itemId },
    body: {},
  });
export const getLastLearned = (u: L | null) => call(lastLearnedRoute, 'GET', '/api/v1/me/last-learned', { cookie: u?.cookie });
