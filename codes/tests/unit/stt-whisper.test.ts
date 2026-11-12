// SPEC-013 (addendum 2026-11-11): adaptor whisper.cpp. Ditemukan saat uji langsung whisper-server v1.9.5:
// `text` memuat baris baru per segmen, sehingga transkrip tampil terpotong-potong.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhisperCppClient } from '@/server/ai/stt';

describe('WhisperCppClient.transcribe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('menyatukan baris transkrip, menghitung keyakinan dari avg_logprob, dan mengirim parameter baku', async () => {
    const wav = path.join(mkdtempSync(path.join(tmpdir(), 'stt-')), 'in.wav');
    writeFileSync(wav, Buffer.alloc(64));
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get('response_format')).toBe('verbose_json');
      expect(form.get('language')).toBe('en');
      return new Response(
        JSON.stringify({
          text: ' Well, to be honest, I don\'t write\n by hand.\n Most notes are on my phone.',
          segments: [
            { start: 0, end: 2.5, text: ' Well, to be honest,', avg_logprob: Math.log(0.9) },
            { start: 2.5, end: 4, text: ' by hand.', avg_logprob: Math.log(0.7) },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await new WhisperCppClient({ baseUrl: 'http://127.0.0.1:8081', model: 'small.en' }).transcribe(wav);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://127.0.0.1:8081/inference');
    expect(r.text).toBe("Well, to be honest, I don't write by hand. Most notes are on my phone.");
    expect(r.segments[1]).toMatchObject({ start_ms: 2500, end_ms: 4000, text: 'by hand.' });
    expect(r.confidence).toBeCloseTo(0.8, 5);
  });

  it('melempar galat bila server menjawab bukan 2xx (antrean akan mengulang)', async () => {
    const wav = path.join(mkdtempSync(path.join(tmpdir(), 'stt-')), 'in.wav');
    writeFileSync(wav, Buffer.alloc(64));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503, statusText: 'Service Unavailable' })));
    await expect(new WhisperCppClient({ baseUrl: 'http://127.0.0.1:8081' }).transcribe(wav)).rejects.toThrow('503');
  });
});
