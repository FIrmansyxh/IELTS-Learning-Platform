import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withApi } from '@/server/http/withApi';
import { resetRateLimits } from '@/server/http/rate-limit';

const post = (headers: Record<string, string>, body?: string) =>
  new Request('http://localhost:3000/api/v1/x', { method: 'POST', headers, body });
const json = { 'content-type': 'application/json', origin: 'http://localhost:3000' };
afterEach(() => resetRateLimits());

const echo = withApi({ auth: 'public', body: z.strictObject({ a: z.number().int() }) }, async ({ body }) => ({
  status: 201,
  data: body,
}));

describe('withApi (tanpa DB)', () => {
  it('sukses: envelope data, header no-store dan X-Request-Id', async () => {
    const res = await echo(post({ ...json, 'x-forwarded-for': '1.0.0.1' }, JSON.stringify({ a: 1 })));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { a: 1 } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('error: request_id sama dengan header, pesan Indonesia generik', async () => {
    const res = await echo(post({ ...json, 'x-forwarded-for': '1.0.0.2' }, JSON.stringify({ a: 'x' })));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.request_id).toBe(res.headers.get('x-request-id'));
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Data yang dikirim tidak valid.');
  });

  it('CSRF: Origin asing / tanpa Origin ditolak; GET tidak diperiksa', async () => {
    expect((await echo(post({ ...json, origin: 'https://evil.example' }, '{"a":1}'))).status).toBe(403);
    expect((await echo(post({ 'content-type': 'application/json' }, '{"a":1}'))).status).toBe(403);
    expect((await echo(post({ ...json, origin: 'http://localhost:3000.evil.example' }, '{"a":1}'))).status).toBe(403);
    const get = withApi({ auth: 'public' }, async () => ({ data: { ok: true } }));
    expect((await get(new Request('http://localhost:3000/x', { headers: { 'x-forwarded-for': '1.1.1.1' } }))).status).toBe(200);
  });

  it('415 untuk Content-Type salah, 413 untuk body besar, 400 untuk JSON rusak dan field tak dikenal', async () => {
    const h = (n: number) => ({ ...json, 'x-forwarded-for': `1.0.1.${n}` });
    expect((await echo(post({ ...h(1), 'content-type': 'text/plain' }, '{"a":1}'))).status).toBe(415);
    const big = await echo(post(h(2), JSON.stringify({ a: 1, pad: 'x'.repeat(1_100_000) })));
    expect(big.status).toBe(413);
    const bad = await echo(post(h(3), '{rusak'));
    expect((await bad.json()).error.details[0].code).toBe('invalid_json');
    const extra = await echo(post(h(4), JSON.stringify({ a: 1, role: 'admin' })));
    expect((await extra.json()).error.details[0]).toMatchObject({ path: 'role', code: 'unrecognized_key' });
  });

  it('galat tak terduga -> 500 INTERNAL_ERROR generik tanpa bocor pesan internal', async () => {
    const boom = withApi({ auth: 'public' }, async () => {
      throw new Error('SELECT * FROM users WHERE password = hunter2 di /srv/app/secret.ts');
    });
    const res = await boom(new Request('http://localhost:3000/x', { headers: { 'x-forwarded-for': '2.2.2.2' } }));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).toContain('INTERNAL_ERROR');
    expect(text).not.toMatch(/hunter2|SELECT|secret\.ts|stack/);
  });

  it('rate limit general_ip pada endpoint public: permintaan ke-61 -> 429 dengan Retry-After', async () => {
    const get = withApi({ auth: 'public' }, async () => ({ data: 1 }));
    let last = 200;
    let retry: string | null = null;
    for (let i = 0; i < 61; i++) {
      const res = await get(new Request('http://localhost:3000/x', { headers: { 'x-forwarded-for': '9.9.9.9' } }));
      last = res.status;
      retry = res.headers.get('retry-after');
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThanOrEqual(1);
  });

  it('endpoint ber-auth tanpa cookie -> 401 UNAUTHENTICATED', async () => {
    const get = withApi({ auth: 'user' }, async () => ({ data: 1 }));
    const res = await get(new Request('http://localhost:3000/x'));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
  });
});
