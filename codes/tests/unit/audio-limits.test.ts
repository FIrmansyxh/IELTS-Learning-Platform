import { afterEach, describe, expect, it } from 'vitest';
import { activeAudioStreams, acquireAudioSlot, MAX_CONCURRENT_AUDIO_STREAMS, releaseOnEnd, resetAudioSlots, SLOT_TTL_MS } from '@/server/attempts/audio-limits';
import { servedAudioMime } from '@/server/attempts/audio-asset';
import { BUCKETS, consume, resetRateLimits } from '@/server/http/rate-limit';
import { ApiError } from '@/server/http/errors';

afterEach(() => {
  resetAudioSlots();
  resetRateLimits();
});

describe('batas aliran audio serentak (F-11-02)', () => {
  it('maks 4 per pengguna; ke-5 -> 429 RATE_LIMITED dengan Retry-After; pengguna lain tidak terpengaruh', () => {
    const rel = Array.from({ length: MAX_CONCURRENT_AUDIO_STREAMS }, () => acquireAudioSlot('u1'));
    try {
      acquireAudioSlot('u1');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('RATE_LIMITED');
      expect((e as ApiError).headers?.['Retry-After']).toBeTruthy();
    }
    expect(() => acquireAudioSlot('u2')).not.toThrow();
    rel[0]!();
    expect(() => acquireAudioSlot('u1')).not.toThrow();
  });

  it('pelepasan idempoten dan slot basi kedaluwarsa', () => {
    const t0 = 1_000_000;
    const rel = Array.from({ length: MAX_CONCURRENT_AUDIO_STREAMS }, () => acquireAudioSlot('u1', t0));
    rel[0]!();
    rel[0]!();
    expect(activeAudioStreams('u1')).toBe(MAX_CONCURRENT_AUDIO_STREAMS - 1);
    acquireAudioSlot('u1', t0);
    expect(() => acquireAudioSlot('u1', t0 + 1)).toThrow();
    expect(() => acquireAudioSlot('u1', t0 + SLOT_TTL_MS + 1)).not.toThrow();
  });

  it('slot dilepas saat aliran habis, dibatalkan, atau galat', async () => {
    const src = (chunks: number, fail = false) =>
      new ReadableStream<Uint8Array>({
        pull(c) {
          if (chunks-- > 0) c.enqueue(new Uint8Array([1]));
          else if (fail) c.error(new Error('x'));
          else c.close();
        },
      });
    const run = async (s: ReadableStream<Uint8Array>) => {
      const r = s.getReader();
      for (;;) if ((await r.read()).done) return;
    };
    await run(releaseOnEnd(src(2), acquireAudioSlot('u1')));
    expect(activeAudioStreams('u1')).toBe(0);

    const cancelled = releaseOnEnd(src(5), acquireAudioSlot('u1'));
    expect(activeAudioStreams('u1')).toBe(1);
    await cancelled.cancel();
    expect(activeAudioStreams('u1')).toBe(0);

    await expect(run(releaseOnEnd(src(1, true), acquireAudioSlot('u1')))).rejects.toThrow('x');
    expect(activeAudioStreams('u1')).toBe(0);
  });
});

describe('bucket audio (F-11-02)', () => {
  it('audio_stream 60/menit per pengguna', () => {
    expect(BUCKETS.audio_stream).toEqual({ limit: 60, windowMs: 60_000 });
    for (let i = 0; i < 60; i++) expect(consume('audio_stream', 'u1')).toBeNull();
    expect(consume('audio_stream', 'u1')).toBeGreaterThanOrEqual(1);
    expect(consume('audio_stream', 'u2')).toBeNull();
  });
  it('audio_full 6/jam per attempt', () => {
    for (let i = 0; i < 6; i++) expect(consume('audio_full', 'a1')).toBeNull();
    expect(consume('audio_full', 'a1')).not.toBeNull();
    expect(consume('audio_full', 'a2')).toBeNull();
  });
});

describe('servedAudioMime (F-11-03)', () => {
  const base = { kind: 'AUDIO_LISTENING', mimeType: 'audio/mpeg', storageKey: 'aa/x.mp3', storageBackend: 'LOCAL' };
  it('menormalkan varian WAV dan menerima mpeg/ogg', () => {
    expect(servedAudioMime(base)).toBe('audio/mpeg');
    expect(servedAudioMime({ ...base, mimeType: 'audio/x-wav' })).toBe('audio/wav');
    expect(servedAudioMime({ ...base, mimeType: 'audio/vnd.wave' })).toBe('audio/wav');
    expect(servedAudioMime({ ...base, mimeType: 'audio/ogg' })).toBe('audio/ogg');
  });
  it('null bila bukan AUDIO_LISTENING, EXTERNAL, tanpa kunci, atau MIME di luar allow-list', () => {
    expect(servedAudioMime({ ...base, kind: 'IMAGE' })).toBeNull();
    expect(servedAudioMime({ ...base, storageBackend: 'EXTERNAL' })).toBeNull();
    expect(servedAudioMime({ ...base, storageKey: null })).toBeNull();
    expect(servedAudioMime({ ...base, mimeType: 'audio/flac' })).toBeNull();
    expect(servedAudioMime({ ...base, mimeType: null })).toBeNull();
    expect(servedAudioMime(null)).toBeNull();
  });
});
