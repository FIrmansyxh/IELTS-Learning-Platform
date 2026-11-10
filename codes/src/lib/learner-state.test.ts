// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api/client';
import { changesLearnerState, invalidateLearnerState, LEARNER_STATE_EVENT, LEARNER_STATE_KEYS } from './learner-state';

afterEach(() => vi.unstubAllGlobals());

describe('learner-state', () => {
  it('hanya permintaan yang mengubah progres/poin yang dianggap mengubah data turunan', () => {
    expect(changesLearnerState('POST', '/attempts/a1/submit')).toBe(true);
    expect(changesLearnerState('POST', '/simulations/s1/sections/READING/submit')).toBe(true);
    expect(changesLearnerState('POST', '/sub-modules/x/learn-complete')).toBe(true);
    expect(changesLearnerState('POST', '/sub-modules/x/mini-task/complete')).toBe(true);
    expect(changesLearnerState('POST', '/submissions/writing')).toBe(true);
    expect(changesLearnerState('PATCH', '/me/profile')).toBe(true);
    expect(changesLearnerState('PUT', '/me/active-track')).toBe(true);
    // autosave, heartbeat, dan baca data tidak memicu muat ulang
    expect(changesLearnerState('PUT', '/attempts/a1/answers/q1')).toBe(false);
    expect(changesLearnerState('POST', '/sub-modules/x/learn-progress')).toBe(false);
    expect(changesLearnerState('PUT', '/me/last-learned')).toBe(false);
    expect(changesLearnerState('GET', '/attempts/a1/submit')).toBe(false);
  });

  it('apiFetch memancarkan event setelah submit berhasil, tidak saat gagal atau GET', async () => {
    const seen = vi.fn();
    window.addEventListener(LEARNER_STATE_EVENT, seen);
    try {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
      await apiFetch('/simulations/s1/abandon', { method: 'POST' });
      expect(seen).toHaveBeenCalledTimes(1);
      await apiFetch('/me/stats');
      expect(seen).toHaveBeenCalledTimes(1);
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
      await expect(apiFetch('/attempts/a1/submit', { method: 'POST' })).rejects.toBeTruthy();
      expect(seen).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(LEARNER_STATE_EVENT, seen);
    }
  });

  it('invalidateLearnerState menandai basi semua kunci turunan', () => {
    const qc = new QueryClient();
    for (const key of LEARNER_STATE_KEYS) qc.setQueryData([...key, 'x'], 1);
    qc.setQueryData(['lain'], 1);
    invalidateLearnerState(qc);
    for (const key of LEARNER_STATE_KEYS) expect(qc.getQueryState([...key, 'x'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['lain'])?.isInvalidated).toBe(false);
  });
});
