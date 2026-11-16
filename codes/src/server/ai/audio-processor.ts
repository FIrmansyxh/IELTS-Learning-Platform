/**
 * Pemrosesan berkas audio dengan ffprobe dan ffmpeg (SPEC-013).
 * Semua pemanggilan proses memakai spawn dengan argumen array untuk mencegah command injection.
 * Biner dari FFPROBE_PATH/FFMPEG_PATH bila diisi (sama dengan Listening), selain itu dari PATH.
 */
import { spawn } from 'node:child_process';
import { ApiError } from '../http/errors';
import { logger } from '../logger';
import { safeErr } from '../safe-error';

export interface AudioProbeResult {
  durationSec: number;
  durationMs: number;
}

export async function probeAudioDuration(filePath: string): Promise<AudioProbeResult> {
  // Jika driver mock / mode test tanpa ffprobe biner: sediakan fallback cerdas
  if (process.env.STT_DRIVER === 'mock' || process.env.NODE_ENV === 'test') {
    return {
      durationSec: 40,
      durationMs: 40000,
    };
  }

  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath];
    const proc = spawn(process.env.FFPROBE_PATH || 'ffprobe', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d;
    });
    proc.stderr.on('data', (d) => {
      stderr += d;
    });

    proc.on('error', (err) => {
      logger.warn({ err: safeErr(err), filePath }, 'ffprobe_spawn_failed');
      reject(new ApiError('AUDIO_UNREADABLE'));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.warn({ code, stderr, filePath }, 'ffprobe_exited_with_error');
        return reject(new ApiError('AUDIO_UNREADABLE'));
      }

      try {
        const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
        const durationSec = parseFloat(parsed.format?.duration ?? '0');
        if (!Number.isFinite(durationSec) || durationSec <= 0) {
          return reject(new ApiError('AUDIO_UNREADABLE'));
        }

        if (durationSec > 150) {
          return reject(new ApiError('AUDIO_TOO_LONG'));
        }
        if (durationSec < 3) {
          return reject(new ApiError('AUDIO_TOO_SHORT'));
        }

        resolve({
          durationSec: Math.round(durationSec),
          durationMs: Math.round(durationSec * 1000),
        });
      } catch (parseErr) {
        logger.warn({ err: safeErr(parseErr), stdout }, 'ffprobe_output_parse_failed');
        reject(new ApiError('AUDIO_UNREADABLE'));
      }
    });
  });
}

export async function convertAudioToWav(inputPath: string, outputPath: string): Promise<void> {
  if (process.env.STT_DRIVER === 'mock' || process.env.NODE_ENV === 'test') {
    // Mode mock/test: tidak perlu konversi ffmpeg biner riil
    return;
  }

  return new Promise((resolve, reject) => {
    const args = ['-nostdin', '-y', '-i', inputPath, '-ac', '1', '-ar', '16000', '-f', 'wav', outputPath];
    const proc = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 60_000,
      windowsHide: true,
    });

    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d;
    });

    proc.on('error', (err) => {
      logger.warn({ err: safeErr(err), inputPath }, 'ffmpeg_spawn_failed');
      reject(new ApiError('AUDIO_UNREADABLE'));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.warn({ code, stderr, inputPath }, 'ffmpeg_conversion_failed');
        return reject(new ApiError('AUDIO_UNREADABLE'));
      }
      resolve();
    });
  });
}
