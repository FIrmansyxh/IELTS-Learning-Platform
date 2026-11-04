/** Pembuat fixture rekaman uji lewat ffmpeg (array argumen, tanpa shell). Hanya dipakai tes. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type AudioFormat = 'webm' | 'ogg' | 'm4a';
const CODEC: Record<AudioFormat, string[]> = {
  webm: ['-c:a', 'libopus'],
  ogg: ['-c:a', 'libopus'],
  m4a: ['-c:a', 'aac'],
};
const cache = new Map<string, Buffer>();

/**
 * Sinus `seconds` detik. `streamed` (hanya webm) menulis ke pipa sehingga kontainer TANPA elemen Duration, seperti
 * hasil MediaRecorder peramban (ffprobe tidak melaporkan durasi).
 */
export function makeAudio(format: AudioFormat, seconds: number, opts: { streamed?: boolean } = {}): Buffer {
  const key = `${format}:${seconds}:${opts.streamed ? 's' : 'f'}`;
  const hit = cache.get(key);
  if (hit) return Buffer.from(hit);
  const dir = mkdtempSync(path.join(tmpdir(), 'ielts-fixture-'));
  const src = ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, ...CODEC[format]];
  let buf: Buffer;
  if (opts.streamed && format === 'webm') {
    const r = spawnSync('ffmpeg', [...src, '-f', 'webm', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
    if (r.status !== 0) throw new Error('ffmpeg gagal membuat fixture');
    buf = r.stdout;
  } else {
    const out = path.join(dir, `a.${format}`);
    const r = spawnSync('ffmpeg', [...src, out], { stdio: 'ignore', timeout: 120_000 });
    if (r.status !== 0) throw new Error('ffmpeg gagal membuat fixture');
    buf = readFileSync(out);
  }
  cache.set(key, buf);
  return Buffer.from(buf);
}

/**
 * Memalsukan elemen Duration (0x4489) pada webm bukan-stream menjadi `seconds` (TimecodeScale default 1 ms), seperti pengunggah
 * jahat. Mengembalikan salinan baru; melempar bila elemen tidak ditemukan.
 */
export function forgeWebmDuration(buf: Buffer, seconds: number): Buffer {
  const out = Buffer.from(buf);
  const limit = Math.min(out.length - 12, 4096);
  for (let i = 0; i < limit; i++) {
    if (out[i] !== 0x44 || out[i + 1] !== 0x89) continue;
    if (out[i + 2] === 0x84) {
      out.writeFloatBE(seconds * 1000, i + 3);
      return out;
    }
    if (out[i + 2] === 0x88) {
      out.writeDoubleBE(seconds * 1000, i + 3);
      return out;
    }
  }
  throw new Error('elemen Duration webm tidak ditemukan');
}
