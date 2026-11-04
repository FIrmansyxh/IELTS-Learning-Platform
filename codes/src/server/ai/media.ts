/**
 * Pemanggilan ffprobe/ffmpeg (SPEC-013). SEMUA lewat `spawn` dengan array argumen (tanpa shell, tanpa interpolasi string),
 * `-nostdin` untuk ffmpeg, dan timeout keras. `child_process.exec`/`execSync` DILARANG (aturan lint + uji statis).
 */
import { spawn } from 'node:child_process';

export const FFPROBE_TIMEOUT_MS = 10_000;
export const FFMPEG_TIMEOUT_MS = 60_000;
const MAX_CAPTURE = 64 * 1024;

export class MediaError extends Error {
  constructor(readonly code: 'AUDIO_UNREADABLE') {
    super(code);
    this.name = 'MediaError';
  }
}

interface RunResult {
  code: number | null;
  stdout: string;
  timedOut: boolean;
}

export function runCommand(cmd: string, args: readonly string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let timedOut = false;
    let settled = false;
    const child = spawn(cmd, [...args], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    const done = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, timedOut });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_CAPTURE) stdout += d.toString('utf8');
    });
    child.on('error', () => done(null));
    child.on('close', (code) => done(code));
  });
}

/** Durasi dalam ms dari ffprobe; null bila kontainer tidak mencatat durasi (mis. webm hasil MediaRecorder). Gagal baca -> AUDIO_UNREADABLE. */
export async function probeDurationMs(file: string, timeoutMs = FFPROBE_TIMEOUT_MS): Promise<number | null> {
  const r = await runCommand('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], timeoutMs);
  if (r.timedOut || r.code !== 0) throw new MediaError('AUDIO_UNREADABLE');
  let parsed: { format?: { duration?: unknown } };
  try {
    parsed = JSON.parse(r.stdout) as typeof parsed;
  } catch {
    throw new MediaError('AUDIO_UNREADABLE');
  }
  const d = Number(parsed.format?.duration);
  if (parsed.format === undefined) throw new MediaError('AUDIO_UNREADABLE');
  return Number.isFinite(d) && d >= 0 ? Math.round(d * 1000) : null;
}

/** Batas keluaran konversi: 151 dtk (> batas 150 dtk agar rekaman lebih panjang terdeteksi, tetapi keluaran tetap terbatas). */
export const WAV_OUTPUT_LIMIT_SEC = 151;
/** Batas byte keluaran WAV 16 kHz mono 16-bit untuk 151 dtk (+ ruang header). */
export const WAV_OUTPUT_MAX_BYTES = WAV_OUTPUT_LIMIT_SEC * 32_000 + 4096;

/** Demuxer ffmpeg yang dipaksa menurut MIME hasil deteksi magic bytes (tanpa tebakan dari isi berkas). */
const DEMUXER_BY_MIME: Record<string, string> = {
  'audio/webm': 'matroska,webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mov,mp4,m4a,3gp,3g2,mj2',
};

/**
 * Konversi ke WAV 16 kHz mono. Keluaran DIBATASI (`-t` dan `-fs`) sehingga berkas berjam-jam tidak menjadi WAV raksasa;
 * format masukan dipaksa menurut MIME, hanya protokol `file`, trek video dibuang. Gagal/timeout -> AUDIO_UNREADABLE.
 * Durasi sah ditentukan dari WAV hasil konversi (`wavDurationMs`), BUKAN dari header kontainer.
 */
export async function convertToWav(input: string, output: string, timeoutMs = FFMPEG_TIMEOUT_MS, mime?: string): Promise<void> {
  const demuxer = mime ? DEMUXER_BY_MIME[mime] : undefined;
  const r = await runCommand(
    'ffmpeg',
    [
      '-nostdin',
      '-y',
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-threads',
      '1',
      ...(demuxer ? ['-f', demuxer] : []),
      '-i',
      input,
      '-vn',
      '-t',
      String(WAV_OUTPUT_LIMIT_SEC),
      '-fs',
      String(WAV_OUTPUT_MAX_BYTES),
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'wav',
      output,
    ],
    timeoutMs,
  );
  if (r.timedOut || r.code !== 0) throw new MediaError('AUDIO_UNREADABLE');
}

/** Durasi WAV PCM 16-bit mono 16 kHz (44 byte header) dalam ms. */
export const wavDurationMs = (sizeBytes: number): number => Math.round((Math.max(0, sizeBytes - 44) / 32000) * 1000);
