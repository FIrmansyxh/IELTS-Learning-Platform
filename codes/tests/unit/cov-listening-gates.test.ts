import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computePlannedMs,
  countWords,
  estimateDurationMs,
  isWithinDurationTolerance,
  verifyAntiClip,
} from '@/server/listening/duration';
import { validateListeningReview } from '@/server/listening/review-gate';
import { sha256Hex } from '@/server/content/validate';
import type { ScriptItem } from '@/server/listening/script-parser';

const utt = (speaker: string, text: string): ScriptItem => ({ kind: 'UTTERANCE', lineNo: 1, speaker, text });
const pause = (durationSec: number): ScriptItem => ({ kind: 'PAUSE', lineNo: 1, durationSec });

describe('listening/duration (gerbang durasi SPEC-024 D5)', () => {
  it('countWords mengabaikan token tanpa huruf/angka', () => {
    expect(countWords('  Hello  there -- 42 !!! ')).toBe(3);
    expect(countWords('')).toBe(0);
  });

  it('computePlannedMs: hening awal+akhir, jeda eksplisit, jeda implisit sama/beda pembicara', () => {
    const items = [utt('A', 'one'), utt('A', 'two'), pause(2), utt('B', 'three')];
    // 1000+1500 + segmen(1000+2000+3000) + jeda eksplisit 2000 + A->A 300 + A->B 600
    expect(computePlannedMs(items, [1000, 2000, 3000])).toBe(2500 + 6000 + 2000 + 300 + 600);
  });

  it('computePlannedMs: opsi menimpa default; segmen yang kurang dihitung 0', () => {
    expect(computePlannedMs([utt('A', 'x')], [], { initialSilenceMs: 0, finalSilenceMs: 0 })).toBe(0);
  });

  it('estimateDurationMs: kecepatan pembicara mempengaruhi durasi, default 1.0', () => {
    const items = [utt('A', 'a b c d e')]; // 5 kata
    const base = estimateDurationMs(items, {}); // 5/2.5 = 2 detik
    expect(base).toBe(2500 + 2000);
    expect(estimateDurationMs(items, { A: 2 })).toBe(2500 + 1000);
    const two = [utt('A', 'a b'), utt('B', 'c d'), pause(1)];
    // 2500 + 800 + 600(beda) + 800 + 1000
    expect(estimateDurationMs(two, {})).toBe(2500 + 800 + 600 + 800 + 1000);
  });

  it('verifyAntiClip: menolak terlalu pendek, terlalu panjang, dan terlalu sunyi; menerima yang wajar', () => {
    const text = 'one two three four five'; // 5 kata: 0.6s..7.5s
    expect(verifyAntiClip(text, 0.3).valid).toBe(false);
    expect(verifyAntiClip(text, 8).valid).toBe(false);
    const silent = verifyAntiClip(text, 3, -55);
    expect(silent.valid).toBe(false);
    expect(silent.reason).toMatch(/Volume/);
    expect(verifyAntiClip(text, 3, -30)).toMatchObject({ valid: true, wordCount: 5 });
    expect(verifyAntiClip(text, 3)).toMatchObject({ valid: true });
  });

  it('isWithinDurationTolerance: batas tepat 5% lulus, di atasnya gagal, planned<=0 gagal', () => {
    expect(isWithinDurationTolerance(10_500, 10_000)).toBe(true);
    expect(isWithinDurationTolerance(9_500, 10_000)).toBe(true);
    expect(isWithinDurationTolerance(10_501, 10_000)).toBe(false);
    expect(isWithinDurationTolerance(100, 0)).toBe(false);
  });
});

describe('listening/review-gate (gerbang review audio SPEC-024 D6)', () => {
  const audio = Buffer.from('audio-bytes');
  const script = Buffer.from('script-bytes');
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cov-review-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const base = () => ({
    part_code: 'LIS-1',
    reviewer: 'tester',
    reviewed_at: '2026-01-02',
    clarity: 5,
    speed: 4,
    naturalness: 4,
    answer_leak: false,
    approved: true,
    script_sha256: sha256Hex(script),
    audio_sha256: sha256Hex(audio),
  });
  const write = (name: string, body: unknown) => {
    const f = path.join(dir, name);
    writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body));
    return f;
  };
  const run = (file: string, extra: { audio?: Buffer; script?: Buffer } = {}) =>
    validateListeningReview({
      reviewFilePath: file,
      expectedPartCode: 'LIS-1',
      currentAudioBuffer: extra.audio,
      currentScriptBuffer: extra.script,
    });

  it('sah bila semua syarat terpenuhi dan hash cocok', async () => {
    const r = await run(write('ok.json', base()), { audio, script });
    expect(r.valid).toBe(true);
    expect(r.review?.reviewer).toBe('tester');
  });

  it('berkas tidak ada -> listening_review_missing', async () => {
    expect((await run(path.join(dir, 'nope.json'))).code).toBe('listening_review_missing');
  });

  it('JSON rusak / skema salah -> stale', async () => {
    expect((await run(write('bad.json', '{oops'))).code).toBe('listening_review_stale');
    expect((await run(write('schema.json', { ...base(), clarity: 9 }))).code).toBe('listening_review_stale');
    expect((await run(write('extra.json', { ...base(), tak_dikenal: 1 }))).code).toBe('listening_review_stale');
  });

  it('part_code berbeda -> missing', async () => {
    expect((await run(write('part.json', { ...base(), part_code: 'LIS-2' }))).code).toBe('listening_review_missing');
  });

  it.each([
    ['approved false', { approved: false }],
    ['clarity < 4', { clarity: 3 }],
    ['speed < 3', { speed: 2 }],
    ['answer_leak true', { answer_leak: true }],
  ])('ditolak: %s', async (name, patch) => {
    const r = await run(write(`${name.replace(/\W/g, '_')}.json`, { ...base(), ...patch }));
    expect(r.valid).toBe(false);
    expect(r.code).toBe('listening_review_stale');
    expect(r.review).toBeDefined();
  });

  it('batas minimal clarity 4 dan speed 3 masih lulus', async () => {
    expect((await run(write('edge.json', { ...base(), clarity: 4, speed: 3 }))).valid).toBe(true);
  });

  it('audio atau naskah berubah setelah review -> stale', async () => {
    const f = write('hash.json', base());
    const a = await run(f, { audio: Buffer.from('lain') });
    expect(a.valid).toBe(false);
    expect(a.reason).toMatch(/audio/i);
    const s = await run(f, { script: Buffer.from('lain') });
    expect(s.valid).toBe(false);
    expect(s.reason).toMatch(/skrip/i);
  });
});
