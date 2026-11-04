import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectRecordingMime } from '@/server/ai/audio-type';
import { convertToWav, MediaError, WAV_OUTPUT_MAX_BYTES, probeDurationMs, runCommand, wavDurationMs } from '@/server/ai/media';
import { forgeWebmDuration, makeAudio } from '../fixtures/audio/make';
import { mkdtempSync, statSync as st, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('detectRecordingMime (magic bytes)', () => {
  it('mengenali webm/ogg/m4a asli hasil ffmpeg', () => {
    expect(detectRecordingMime(makeAudio('webm', 1))).toBe('audio/webm');
    expect(detectRecordingMime(makeAudio('ogg', 1))).toBe('audio/ogg');
    expect(detectRecordingMime(makeAudio('m4a', 1))).toBe('audio/mp4');
  });

  it('menolak .exe (MZ), teks, kosong, dan terlalu pendek', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2000, 1)]);
    expect(detectRecordingMime(exe)).toBeNull();
    expect(detectRecordingMime(Buffer.from('RIFF....WAVEfmt '))).toBeNull();
    expect(detectRecordingMime(Buffer.alloc(0))).toBeNull();
    expect(detectRecordingMime(Buffer.from('OggS'))).toBeNull();
  });

  it('webm doctype matroska dan webm berisi trek video ditolak; ftyp merek asing ditolak', () => {
    const mkv = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('....B\u0082\u0088matroska'), Buffer.alloc(100)]);
    expect(detectRecordingMime(mkv)).toBeNull();
    const video = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('....B\u0082\u0084webm'), Buffer.from('....V_VP9....'), Buffer.alloc(100)]);
    expect(detectRecordingMime(video)).toBeNull();
    const foreign = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypqt  '), Buffer.alloc(100)]);
    expect(detectRecordingMime(foreign)).toBeNull();
  });
});

describe('media (ffprobe/ffmpeg lewat spawn dengan array argumen)', () => {
  const tmp = () => mkdtempSync(path.join(tmpdir(), 'ielts-media-'));

  it('probeDurationMs membaca durasi; konversi WAV 16 kHz mono; wavDurationMs konsisten', async () => {
    const dir = tmp();
    const f = path.join(dir, 'a.ogg');
    writeFileSync(f, makeAudio('ogg', 3));
    const ms = await probeDurationMs(f);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(2500);
    expect(ms!).toBeLessThan(3600);
    const wav = path.join(dir, 'a.wav');
    await convertToWav(f, wav);
    expect(Math.abs(wavDurationMs(st(wav).size) - 3000)).toBeLessThan(300);
  });

  it('berkas korup -> MediaError AUDIO_UNREADABLE (ffprobe dan ffmpeg)', async () => {
    const dir = tmp();
    const f = path.join(dir, 'bad.webm');
    writeFileSync(f, Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(300, 7)]));
    await expect(probeDurationMs(f)).rejects.toBeInstanceOf(MediaError);
    await expect(convertToWav(f, path.join(dir, 'o.wav'))).rejects.toBeInstanceOf(MediaError);
  });

  it('F-13-01: webm dengan Duration dipalsukan (10 dtk, isi 200 dtk): ffprobe tertipu, tetapi WAV keluaran dibatasi dan durasi otoritatif > 150 dtk', async () => {
    const dir = tmp();
    const forged = forgeWebmDuration(makeAudio('webm', 200), 10);
    const f = path.join(dir, 'forged.webm');
    writeFileSync(f, forged);
    const header = await probeDurationMs(f);
    expect(header).not.toBeNull();
    expect(header!).toBeLessThan(11_000); // header berdusta
    const wav = path.join(dir, 'forged.wav');
    await convertToWav(f, wav, undefined, 'audio/webm');
    const size = st(wav).size;
    expect(size).toBeLessThanOrEqual(WAV_OUTPUT_MAX_BYTES);
    const real = wavDurationMs(size);
    expect(real).toBeGreaterThan(150_000); // otoritas = WAV -> AUDIO_TOO_LONG
    expect(real).toBeLessThanOrEqual(152_000);
  });

  it('F-13-01: keluaran WAV tidak pernah melebihi batas walau masukan sangat panjang (600 dtk)', async () => {
    const dir = tmp();
    const f = path.join(dir, 'long.ogg');
    writeFileSync(f, makeAudio('ogg', 600));
    const wav = path.join(dir, 'long.wav');
    await convertToWav(f, wav, undefined, 'audio/ogg');
    expect(st(wav).size).toBeLessThanOrEqual(WAV_OUTPUT_MAX_BYTES);
  });

  it('F-13-06: format masukan dipaksa menurut MIME (ogg diberi label webm ditolak) dan konversi tetap jalan tanpa MIME', async () => {
    const dir = tmp();
    const f = path.join(dir, 'x.ogg');
    writeFileSync(f, makeAudio('ogg', 3));
    await expect(convertToWav(f, path.join(dir, 'x1.wav'), undefined, 'audio/webm')).rejects.toBeInstanceOf(MediaError);
    await convertToWav(f, path.join(dir, 'x2.wav'), undefined, 'audio/ogg');
    expect(st(path.join(dir, 'x2.wav')).size).toBeGreaterThan(44);
  });

  it('timeout membunuh proses dan melapor timedOut', async () => {
    const r = await runCommand('sleep', ['5'], 150);
    expect(r.timedOut).toBe(true);
  });

  it('argumen tidak diinterpretasi shell (tanda $() dan ; tidak dieksekusi)', async () => {
    const dir = tmp();
    const marker = path.join(dir, 'pwned');
    const evil = path.join(dir, `a; touch ${marker}; $(touch ${marker}).webm`);
    await expect(probeDurationMs(evil)).rejects.toBeInstanceOf(MediaError);
    expect(() => st(marker)).toThrow();
  });
});

describe('uji statis ffmpeg/ffprobe (AC SPEC-013)', () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = path.join(d, n);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs)$/.test(p) ? [p] : [];
    });
  const files = [...walk(path.join(process.cwd(), 'src')), ...walk(path.join(process.cwd(), 'scripts'))];

  it('tidak ada impor exec/execSync dari child_process dan tidak ada shell:true di src/scripts', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/import\s*\{[^}]*\b(exec|execSync)\b[^}]*\}\s*from\s*['"](node:)?child_process['"]/);
      expect(src, f).not.toMatch(/require\(['"](node:)?child_process['"]\)\.exec/);
      expect(src, f).not.toMatch(/shell\s*:\s*true/);
    }
  });

  it('seluruh pemanggilan ffmpeg/ffprobe ada di media.ts dengan array argumen, -nostdin (ffmpeg), dan timeout', () => {
    const users = files.filter((f) => /['"`](ffmpeg|ffprobe)['"`]/.test(readFileSync(f, 'utf8')));
    // SPEC-018 (content/assets.ts) juga memanggil ffprobe; keduanya wajib spawn dengan array argumen.
    expect(users.map((f) => path.basename(f)).sort()).toEqual(['assets.ts', 'media.ts']);
    for (const f of users) expect(readFileSync(f, 'utf8'), f).toMatch(/spawn\(/);
    const src = readFileSync(users.find((f) => f.endsWith('media.ts'))!, 'utf8');
    expect(src).toContain("'-nostdin'");
    expect(src).toContain("'-protocol_whitelist'");
    expect(src).toContain("'-t'");
    expect(src).toMatch(/runCommand\('ffprobe', \[/);
    expect(src).toMatch(/runCommand\(\s*'ffmpeg',\s*\[/);
    expect(src).toContain('FFPROBE_TIMEOUT_MS = 10_000');
    expect(src).toContain('FFMPEG_TIMEOUT_MS = 60_000');
    expect(src).toContain('shell: false');
  });
});
