import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { safeErr } from '@/server/safe-error';
import { withApi } from '@/server/http/withApi';
import { resetRateLimits } from '@/server/http/rate-limit';

describe('safeErr (F-01)', () => {
  it('tidak memuat message (SQL + parameter) maupun baris pesan di stack', () => {
    const e = Object.assign(new Error('Failed query: insert into users ... params: budi@example.test,$argon2id$secret'), { name: 'DrizzleQueryError', cause: { code: '57P01' } });
    const out = JSON.stringify(safeErr(e));
    expect(out).not.toContain('budi@example.test');
    expect(out).not.toContain('argon2id');
    expect(out).not.toContain('Failed query');
    expect(safeErr(e)).toMatchObject({ name: 'DrizzleQueryError', code: '57P01' });
  });
  it('nilai bukan Error hanya mencatat tipe', () => {
    expect(safeErr('rahasia@x.test')).toEqual({ name: 'string' });
  });
});

describe('batas body 1 MB saat streaming (F-03)', () => {
  const echo = withApi({ auth: 'public', body: z.strictObject({ a: z.string() }) }, async ({ body }) => ({ data: body }));
  const headers = { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': '7.7.7.7' };
  it('body chunked tanpa Content-Length yang melewati 1 MB ditolak 413 tanpa dibaca habis', async () => {
    resetRateLimits();
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(256 * 1024).fill(97));
        if (pulled > 100) c.close();
      },
    });
    const res = await echo(new Request('http://localhost:3000/x', { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit));
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(20);
  });
  it('body kecil tetap diterima', async () => {
    resetRateLimits();
    const res = await echo(new Request('http://localhost:3000/x', { method: 'POST', headers: { ...headers, 'x-forwarded-for': '7.7.7.8' }, body: '{"a":"b"}' }));
    expect(res.status).toBe(200);
  });
});
