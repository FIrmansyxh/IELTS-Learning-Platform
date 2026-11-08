import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { sha256Hex } from '../content/validate';
import {
  computePlannedMs,
  estimateDurationMs,
  isWithinDurationTolerance,
  verifyAntiClip,
} from './duration';
import { parseListeningScript } from './script-parser';

const execFileAsync = promisify(execFile);

export interface BuilderOptions {
  scriptPath: string;
  outputDir?: string; // Default: codes/content/gt-listening
  dryRun?: boolean;
  keepTemp?: boolean;
  ttsEngineCmd?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
}

export interface BuildResult {
  exitCode: 0 | 1 | 2 | 3;
  error?: string;
  errorCode?: string;
  lines: string[];
  plannedMs?: number;
  measuredMs?: number;
  estimatedMs?: number;
  audioSha256?: string;
}

export async function checkToolAvailable(cmd: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(cmd, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mengukur durasi audio (dalam milidetik) menggunakan ffprobe.
 */
export async function probeAudioDurationMs(filePath: string, ffprobeCmd = 'ffprobe'): Promise<number> {
  const { stdout } = await execFileAsync(ffprobeCmd, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const sec = parseFloat(stdout.trim());
  if (Number.isNaN(sec) || sec <= 0) {
    throw new Error(`Gagal membaca durasi audio ffprobe dari ${filePath}`);
  }
  return Math.round(sec * 1000);
}

/**
 * Eksekusi utama proses listening:build (SPEC-024).
 */
export async function buildListening(options: BuilderOptions): Promise<BuildResult> {
  const lines: string[] = [];
  const scriptPath = path.resolve(options.scriptPath);

  // 1. Baca & Validasi Skrip (langkah a)
  let rawScript: string;
  try {
    rawScript = await readFile(scriptPath, 'utf8');
  } catch {
    return {
      exitCode: 1,
      error: `Skrip tidak ditemukan di ${scriptPath}`,
      lines: [`galat_baca_skrip: Berkas tidak ditemukan: ${scriptPath}`],
    };
  }

  const { script, issues } = parseListeningScript(rawScript);
  if (issues.length > 0 || !script) {
    return {
      exitCode: 1,
      error: 'Validasi skrip gagal',
      lines: issues.map((i) => `${i.code}: ${i.message}${i.lineNo ? ` (baris ${i.lineNo})` : ''}`),
    };
  }

  const meta = script.meta;
  const estimatedMs = estimateDurationMs(script.items, meta.speed);

  // 2. Cek Lingkungan (langkah b)
  const ffmpegCmd = options.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobeCmd = options.ffprobePath || process.env.FFPROBE_PATH || 'ffprobe';
  const ttsCmd = options.ttsEngineCmd || process.env.TTS_ENGINE_CMD;

  const hasFfmpeg = await checkToolAvailable(ffmpegCmd, ['-version']);
  const hasFfprobe = await checkToolAvailable(ffprobeCmd, ['-version']);

  if (!hasFfmpeg || !hasFfprobe) {
    return {
      exitCode: 2,
      error: 'ffmpeg atau ffprobe tidak ditemukan di sistem / PATH',
      errorCode: 'ffmpeg_missing',
      lines: [
        `lingkungan_tidak_siap: ffmpeg/ffprobe tidak ditemukan di PATH.`,
        `Periksa variabel FFMPEG_PATH dan FFPROBE_PATH di .env atau pasang ffmpeg di PATH.`,
      ],
    };
  }

  // Dry run selesai di sini
  if (options.dryRun) {
    lines.push(`OK: dry-run valid | ${meta.part_code} | estimasi durasi: ${(estimatedMs / 1000).toFixed(1)}s`);
    return {
      exitCode: 0,
      lines,
      estimatedMs,
    };
  }

  // 3. Sintesis dan Pemrosesan Audio
  if (!ttsCmd) {
    return {
      exitCode: 2,
      error: 'TTS_ENGINE_CMD belum dikonfigurasi di .env',
      errorCode: 'tts_engine_missing',
      lines: [
        `lingkungan_tidak_siap: TTS_ENGINE_CMD tidak dikonfigurasi di .env atau opsi.`,
        `Tentukan jalur mesin TTS lokal (Kokoro / Piper) sebelum menjalankan build nyata.`,
      ],
    };
  }

  const tempDir = path.join(os.tmpdir(), `ielts-listening-${meta.part_code.toLowerCase()}-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  const segmentMsList: number[] = [];

  try {
    // Sintesis tiap ujaran
    for (let i = 0; i < script.utterances.length; i++) {
      const utt = script.utterances[i];
      const wavPath = path.join(tempDir, `utt_${String(i).padStart(3, '0')}.wav`);
      const voiceId = meta.voices[utt.speaker];
      const speedVal = meta.speed[utt.speaker] ?? 1.0;

      // Panggil mesin TTS
      try {
        await execFileAsync(ttsCmd, [
          '--voice',
          voiceId,
          '--speed',
          String(speedVal),
          '--text',
          utt.text,
          '--output',
          wavPath,
        ]);
      } catch (e) {
        return {
          exitCode: 2,
          error: `Mesin TTS gagal menghasilkan audio untuk ujaran baris ${utt.lineNo}`,
          errorCode: 'tts_failed',
          lines: [`tts_execution_failed: Mesin TTS keluar dengan galat pada baris ${utt.lineNo}: ${(e as Error).message}`],
        };
      }

      // Ukur durasi segmen WAV
      let segMs: number;
      try {
        segMs = await probeAudioDurationMs(wavPath, ffprobeCmd);
      } catch {
        segMs = 0;
      }
      segmentMsList.push(segMs);

      // Cek anti-klip (D5)
      const antiClip = verifyAntiClip(utt.text, segMs / 1000);
      if (!antiClip.valid) {
        return {
          exitCode: 3,
          error: `Pemeriksaan anti-klip gagal pada baris ${utt.lineNo}`,
          errorCode: 'segment_suspect',
          lines: [`segment_suspect: ${antiClip.reason} (baris ${utt.lineNo})`],
        };
      }
    }

    // Hitung planned_ms
    const plannedMs = computePlannedMs(script.items, segmentMsList);

    // Gabungkan segmen dan jeda dengan ffmpeg
    const finalMp3Path = path.join(tempDir, 'output.mp3');
    // Jalankan filter complex atau concat file list
    // Buat file concat demuxer
    const concatTxtPath = path.join(tempDir, 'concat.txt');
    const concatEntries: string[] = [];

    // Hening awal 1000 ms
    const silence1s = path.join(tempDir, 'silence_1000ms.wav');
    await execFileAsync(ffmpegCmd, ['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '1.0', '-q:a', '9', silence1s]);
    concatEntries.push(`file '${silence1s.replace(/\\/g, '/')}'`);

    let prevSpeaker: string | null = null;
    let uttIndex = 0;

    for (const item of script.items) {
      if (item.kind === 'PAUSE') {
        const pauseWav = path.join(tempDir, `pause_${item.lineNo}.wav`);
        await execFileAsync(ffmpegCmd, [
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=24000:cl=mono',
          '-t',
          String(item.durationSec),
          '-q:a',
          '9',
          pauseWav,
        ]);
        concatEntries.push(`file '${pauseWav.replace(/\\/g, '/')}'`);
      } else if (item.kind === 'UTTERANCE') {
        if (prevSpeaker !== null) {
          const gapSec = prevSpeaker === item.speaker ? 0.3 : 0.6;
          const gapWav = path.join(tempDir, `gap_${item.lineNo}.wav`);
          await execFileAsync(ffmpegCmd, [
            '-f',
            'lavfi',
            '-i',
            'anullsrc=r=24000:cl=mono',
            '-t',
            String(gapSec),
            '-q:a',
            '9',
            gapWav,
          ]);
          concatEntries.push(`file '${gapWav.replace(/\\/g, '/')}'`);
        }
        const wavPath = path.join(tempDir, `utt_${String(uttIndex++).padStart(3, '0')}.wav`);
        concatEntries.push(`file '${wavPath.replace(/\\/g, '/')}'`);
        prevSpeaker = item.speaker;
      }
    }

    // Hening akhir 1500 ms
    const silence1500ms = path.join(tempDir, 'silence_1500ms.wav');
    await execFileAsync(ffmpegCmd, ['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '1.5', '-q:a', '9', silence1500ms]);
    concatEntries.push(`file '${silence1500ms.replace(/\\/g, '/')}'`);

    await writeFile(concatTxtPath, concatEntries.join('\n'), 'utf8');

    // Concat & normalisasi volume -19 LUFS, true peak -2 dB, mono 24 kHz 96 kbps
    await execFileAsync(ffmpegCmd, [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatTxtPath,
      '-af',
      'loudnorm=I=-19:TP=-2:LRA=11',
      '-ar',
      '24000',
      '-ac',
      '1',
      '-b:a',
      '96k',
      '-y',
      finalMp3Path,
    ]);

    // Ukur durasi berkas final MP3
    const measuredMs = await probeAudioDurationMs(finalMp3Path, ffprobeCmd);

    // Cek batas toleransi 5%
    if (!isWithinDurationTolerance(measuredMs, plannedMs)) {
      return {
        exitCode: 3,
        error: `Durasi audio terukur (${(measuredMs / 1000).toFixed(2)}s) di luar batas toleransi 5% dari planned_ms (${(plannedMs / 1000).toFixed(2)}s)`,
        errorCode: 'duration_tolerance_exceeded',
        plannedMs,
        measuredMs,
        lines: [
          `duration_mismatch: Durasi terukur ${measuredMs}ms berbeda lebih dari 5% dari ${plannedMs}ms.`,
        ],
      };
    }

    // 4. Penulisan Atomik Aset & Manifest (langkah g)
    const baseDir = options.outputDir ? path.resolve(options.outputDir) : path.resolve('content/gt-listening');
    const audioDir = path.join(baseDir, 'assets', 'audio');
    await mkdir(audioDir, { recursive: true });

    const mp3Name = `${meta.part_code.toLowerCase()}.mp3`;
    const targetMp3Path = path.join(audioDir, mp3Name);
    const tempMp3Path = `${targetMp3Path}.tmp`;

    // Salin MP3 ke .tmp lalu rename
    await copyFile(finalMp3Path, tempMp3Path);
    await copyFile(tempMp3Path, targetMp3Path);
    await unlink(tempMp3Path).catch(() => undefined);

    const audioBuf = await readFile(targetMp3Path);
    const audioSha256 = sha256Hex(audioBuf);

    // Update assets.manifest.json secara atomik
    const manifestPath = path.join(baseDir, 'assets.manifest.json');
    let manifestData = { contract_version: '1.1', assets: [] as Array<Record<string, unknown>> };
    try {
      const curMan = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (curMan && Array.isArray(curMan.assets)) {
        manifestData = curMan;
      }
    } catch {
      // Manifest baru jika belum ada
    }

    const assetCode = `gt-listening/${meta.part_code.toLowerCase()}`;
    const newAssetEntry = {
      asset_code: assetCode,
      kind: 'AUDIO_LISTENING',
      title: meta.title,
      source_code: 'OWN',
      rights_status: 'OWN_ORIGINAL',
      file: `audio/${mp3Name}`,
      attribution_text: 'Audio dibuat dengan suara sintetis.',
    };

    const existIdx = manifestData.assets.findIndex((a: { asset_code?: string }) => a.asset_code === assetCode);
    if (existIdx >= 0) {
      manifestData.assets[existIdx] = newAssetEntry;
    } else {
      manifestData.assets.push(newAssetEntry);
    }

    const tempManifestPath = `${manifestPath}.tmp`;
    await writeFile(tempManifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
    await copyFile(tempManifestPath, manifestPath);
    await unlink(tempManifestPath).catch(() => undefined);

    lines.push(`OK: audio berhasil dibangun`);
    lines.push(`- part_code: ${meta.part_code}`);
    lines.push(`- durasi terukur: ${(measuredMs / 1000).toFixed(2)}s (planned: ${(plannedMs / 1000).toFixed(2)}s)`);
    lines.push(`- sha256: ${audioSha256}`);
    lines.push(`- aset: ${assetCode}`);

    return {
      exitCode: 0,
      lines,
      plannedMs,
      measuredMs,
      audioSha256,
    };
  } finally {
    if (!options.keepTemp) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
