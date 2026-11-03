import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiFetch, ApiError, buildUrl } from './client';
import { apiErrorMessage } from './errors';

const Schema = z.object({ data: z.object({ n: z.number() }) });
const rid = '11111111-1111-4111-8111-111111111111';

function stub(res: Response) {
  const fn = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('buildUrl', () => {
  it('menyusun query dan membuang nilai kosong', () => {
    expect(buildUrl('/x', { page: 1, q: '', a: undefined, b: false })).toBe('/api/v1/x?page=1&b=false');
    expect(buildUrl('/x')).toBe('/api/v1/x');
  });
});

describe('apiFetch', () => {
  it('mengurai respons sukses sesuai skema dan mengirim JSON', async () => {
    const fn = stub(new Response(JSON.stringify({ data: { n: 3 } }), { status: 200 }));
    const out = await apiFetch('/a', { method: 'POST', body: { x: 1 }, schema: Schema });
    expect(out.data.n).toBe(3);
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.credentials).toBe('same-origin');
  });

  it('204 tanpa skema mengembalikan undefined', async () => {
    stub(new Response(null, { status: 204 }));
    await expect(apiFetch('/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('memetakan envelope error + Retry-After', async () => {
    stub(
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'x', request_id: rid } }), {
        status: 429,
        headers: { 'Retry-After': '120' },
      }),
    );
    const err = await apiFetch('/a').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(120);
    expect(err.requestId).toBe(rid);
    expect(apiErrorMessage(err)).toBe('Terlalu banyak percobaan. Coba lagi dalam 2 menit.');
  });

  it('membawa details VALIDATION_ERROR', async () => {
    stub(
      new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'x',
            request_id: rid,
            details: [{ path: 'password', code: 'password_too_common', message: 'm' }],
          },
        }),
        { status: 400 },
      ),
    );
    const err = await apiFetch('/a').catch((e) => e);
    expect(err.details[0].code).toBe('password_too_common');
  });

  it('respons menyimpang dari kontrak menjadi RESPONSE_INVALID (tidak ditambal diam-diam)', async () => {
    stub(new Response(JSON.stringify({ data: { n: 'bukan angka' } }), { status: 200 }));
    const err = await apiFetch('/a', { schema: Schema }).catch((e) => e);
    expect(err.code).toBe('RESPONSE_INVALID');
  });

  it('galat jaringan menjadi NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    const err = await apiFetch('/a').catch((e) => e);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(apiErrorMessage(err)).toBe('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
  });

  it('5xx tanpa envelope menjadi INTERNAL_ERROR generik', async () => {
    stub(new Response('<html>', { status: 502 }));
    const err = await apiFetch('/a').catch((e) => e);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});
