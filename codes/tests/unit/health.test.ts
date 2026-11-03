import { describe, expect, it, vi } from 'vitest';
import { HealthResponseSchema } from '@/contracts/health';

const state = vi.hoisted(() => ({ fail: false }));
vi.mock('@/server/db', () => ({
  getPool: () => ({
    query: () =>
      state.fail
        ? Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432'))
        : Promise.resolve({ rows: [{ '?column?': 1 }] }),
  }),
}));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('200 dengan status ok saat DB menjawab', async () => {
    state.fail = false;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.safeParse(await res.json()).success).toBe(true);
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('503 SERVICE_UNAVAILABLE saat DB gagal, tanpa detail internal', async () => {
    state.fail = true;
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.message).toBe('Layanan belum siap.');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(body.error.request_id).toBe(res.headers.get('x-request-id'));
  });
});
