/**
 * `npm run doctor` (SPEC-025 D7/D10): periksa kesiapan aplikasi lokal. Tidak mengubah apa pun.
 * Status: ok (siap), warn (berfungsi tetapi ada catatan), fail (perlu diperbaiki).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { sql } from 'drizzle-orm';
import { config } from '../config';
import { BACKUP_PATTERN, defaultBackupDir, listBackups } from '../backup';
import { appliedCount, journalTags } from '../db-migrate';
import { databasePath, execute, getDb, getRaw } from '../db';

export type DoctorStatus = 'ok' | 'warn' | 'fail';
export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
}

const MIN_NODE = [22, 20] as const;

function nodeCheck(): DoctorCheck {
  const [maj = 0, min = 0] = process.versions.node.split('.').map(Number);
  const okVer = maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
  return { name: 'Node.js', status: okVer ? 'ok' : 'fail', detail: `v${process.versions.node}${okVer ? '' : ` (butuh >= ${MIN_NODE.join('.')})`}` };
}

function envCheck(): DoctorCheck {
  const missing = ['AUTH_SECRET', 'IP_HMAC_SECRET'].filter((k) => !process.env[k]);
  return missing.length === 0
    ? { name: 'Konfigurasi .env', status: 'ok', detail: 'AUTH_SECRET, IP_HMAC_SECRET terisi' }
    : { name: 'Konfigurasi .env', status: 'fail', detail: `belum diisi: ${missing.join(', ')}` };
}

/** Banding migrasi terpasang (tabel _migrations) dengan jurnal drizzle. */
function migrationsCheck(): DoctorCheck {
  let expected = 0;
  try {
    expected = journalTags().length;
  } catch {
    return { name: 'Migrasi', status: 'warn', detail: 'jurnal migrasi tidak ditemukan (jalankan dari folder codes/)' };
  }
  const applied = appliedCount(getRaw());
  return applied >= expected
    ? { name: 'Migrasi', status: 'ok', detail: `${applied} dari ${expected} terpasang` }
    : { name: 'Migrasi', status: 'fail', detail: `${applied} dari ${expected} terpasang. Jalankan: npm run db:migrate` };
}

/** PRAGMA quick_check: berkas rusak atau bukan database dilaporkan sebagai GAGAL dengan petunjuk pemulihan. */
function integrityCheck(): DoctorCheck {
  const restore = 'Pulihkan: npm run db:restore -- latest --yes';
  try {
    const row = getRaw().prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    if (row?.quick_check === 'ok') return { name: 'Integritas database', status: 'ok', detail: 'quick_check ok' };
    return { name: 'Integritas database', status: 'fail', detail: `${String(row?.quick_check ?? 'tidak diketahui').slice(0, 80)}. ${restore}` };
  } catch (e) {
    return { name: 'Integritas database', status: 'fail', detail: `${(e as Error).message.slice(0, 80)}. ${restore}` };
  }
}

const BACKUP_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** Cadangan harian (SPEC-025 K5): ok bila terbaru <= 48 jam; selain itu hanya catatan. */
export function backupCheck(now: Date = new Date()): DoctorCheck {
  const dir = defaultBackupDir(databasePath());
  const latest = listBackups(dir)[0];
  if (!latest) return { name: 'Cadangan', status: 'warn', detail: 'belum ada cadangan. Dibuat otomatis saat start:local, atau jalankan: npm run db:backup' };
  const date = BACKUP_PATTERN.test(latest) ? latest.slice('ielts-'.length, 'ielts-'.length + 10) : latest;
  const age = now.getTime() - statSync(path.join(dir, latest)).mtimeMs;
  return age <= BACKUP_MAX_AGE_MS
    ? { name: 'Cadangan', status: 'ok', detail: `terakhir ${date}` }
    : { name: 'Cadangan', status: 'warn', detail: `cadangan terakhir ${date} (lebih dari 48 jam). Jalankan: npm run db:backup` };
}

const POSTGRES_LEFTOVER_KEYS = ['DATABASE_URL', 'DATABASE_MIGRATOR_URL', 'TEST_DATABASE_URL'] as const;

/** Sisa konfigurasi Postgres di .env: hanya catatan, dilaporkan dengan nama kunci (bukan nilai). */
export function postgresLeftoverCheck(envFile: string = '.env'): DoctorCheck | null {
  if (!existsSync(envFile)) return null;
  let parsed: Record<string, string | undefined>;
  try {
    parsed = parseEnv(readFileSync(envFile, 'utf8'));
  } catch {
    return null;
  }
  const found = POSTGRES_LEFTOVER_KEYS.filter((k) => k in parsed);
  if (found.length === 0) return null;
  return { name: 'Sisa konfigurasi Postgres', status: 'warn', detail: `${found.join(', ')} masih ada di .env dan tidak dipakai lagi; aman dihapus dari .env` };
}

async function dbChecks(): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  const integrity = integrityCheck();
  out.push(integrity);
  if (integrity.status === 'fail') return out;
  const db = getDb();
  try {
    await execute(db, sql`SELECT 1`);
    out.push({ name: 'Database', status: 'ok', detail: 'terhubung' });
  } catch (e) {
    out.push({ name: 'Database', status: 'fail', detail: `tidak terhubung (${(e as Error).message.slice(0, 80)}). Periksa DATABASE_PATH dan hak tulis folder.` });
    return out;
  }
  out.push(migrationsCheck());
  out.push(backupCheck());
  try {
    const r = await execute(db, sql`SELECT (SELECT count(*) FROM tiers) AS tiers, (SELECT count(*) FROM sub_modules) AS subs, (SELECT count(*) FROM sub_modules WHERE status = 'PUBLISHED') AS published`);
    const x = r.rows[0] as { tiers: number; subs: number; published: number };
    out.push(
      Number(x.tiers) === 4
        ? { name: 'Data awal (seed)', status: 'ok', detail: `${x.tiers} Tier, ${x.subs} sub-modul (${x.published} terbit)` }
        : { name: 'Data awal (seed)', status: 'fail', detail: 'kurikulum belum ada. Jalankan: npm run db:seed' },
    );
    if (Number(x.published) === 0 && Number(x.tiers) === 4) {
      out.push({ name: 'Konten', status: 'warn', detail: 'belum ada sub-modul terbit. Jalankan: npm run start:local (impor otomatis) atau npm run content:import -- content/gt-modules/3.3.3 --publish' });
    }
    const b = await execute(db, sql`SELECT skill, count(*) AS n FROM band_conversion_tables WHERE is_active GROUP BY skill`);
    const skills = new Set((b.rows as Array<{ skill: string }>).map((z) => z.skill));
    const need = ['LISTENING', 'READING_GENERAL'].filter((s) => !skills.has(s));
    out.push(need.length === 0 ? { name: 'Tabel band aktif', status: 'ok', detail: 'Listening dan Reading General Training' } : { name: 'Tabel band aktif', status: 'fail', detail: `belum aktif: ${need.join(', ')}. Jalankan: npm run db:seed` });
    const p = await execute(db, sql`SELECT count(*) AS n FROM users WHERE deleted_at IS NULL AND status = 'ACTIVE'`);
    const n = Number((p.rows[0] as { n: number }).n);
    out.push({ name: 'Profil', status: n > 0 ? 'ok' : 'warn', detail: n > 0 ? `${n} profil` : 'belum ada profil (dibuat di layar /pilih-profil)' });
  } catch (e) {
    out.push({ name: 'Data awal (seed)', status: 'fail', detail: `gagal membaca (${(e as Error).message.slice(0, 80)})` });
  }
  return out;
}

async function assetsCheck(): Promise<DoctorCheck> {
  const dir = path.resolve(config.assetsDir());
  try {
    await access(dir, constants.W_OK);
    return { name: 'Folder aset', status: 'ok', detail: dir };
  } catch {
    return { name: 'Folder aset', status: 'warn', detail: `${dir} belum ada atau tidak bisa ditulisi (dibuat saat aset pertama disimpan)` };
  }
}

async function llmCheck(): Promise<DoctorCheck> {
  if (!config.aiEnabled()) return { name: 'Penilai Writing (LLM)', status: 'warn', detail: 'AI_ENABLED=false: tulisan masuk ke "Nilai Sendiri"' };
  const { getLlmClient } = await import('../ai/llm');
  try {
    const up = await getLlmClient().ping();
    return up
      ? { name: 'Penilai Writing (LLM)', status: 'ok', detail: `aktif (${process.env.LLM_DRIVER ?? 'llamacpp'})` }
      : { name: 'Penilai Writing (LLM)', status: 'fail', detail: 'AI_ENABLED=true tetapi llama-server tidak menjawab. Nyalakan server model, lihat README.' };
  } catch (e) {
    return { name: 'Penilai Writing (LLM)', status: 'fail', detail: (e as Error).message.slice(0, 100) };
  }
}

/** Penilai Speaking (ADR-004 Addendum 3): STT whisper.cpp; penilaian memakai LLM yang sama dengan Writing. */
async function sttCheck(): Promise<DoctorCheck> {
  const name = 'Penilai Speaking (STT)';
  if (!config.aiEnabled() || !config.speakingAiEnabled()) {
    return { name, status: 'warn', detail: 'Nonaktif (AI_ENABLED/SPEAKING_AI_ENABLED): Speaking memakai prompt AI suara pihak ketiga' };
  }
  if ((process.env.STT_DRIVER ?? 'whisper') === 'mock') return { name, status: 'warn', detail: 'STT_DRIVER=mock: transkrip tiruan, bukan suara asli' };
  const { getSttClient } = await import('../ai/stt');
  try {
    const up = await getSttClient().ping();
    return up
      ? { name, status: 'ok', detail: `aktif (whisper.cpp ${process.env.STT_MODEL ?? ''})`.trim() }
      : { name, status: 'fail', detail: 'whisper-server tidak menjawab. Isi WHISPER_BIN/WHISPER_MODEL_PATH lalu jalankan start:local, lihat README.' };
  } catch (e) {
    return { name, status: 'fail', detail: (e as Error).message.slice(0, 100) };
  }
}

function hostCheck(): DoctorCheck {
  const host = process.env.HOSTNAME ?? '127.0.0.1';
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  return loopback
    ? { name: 'Akses jaringan', status: 'ok', detail: `hanya loopback (${host})` }
    : { name: 'Akses jaringan', status: 'fail', detail: `HOSTNAME=${host}: aplikasi tanpa login tidak boleh dibuka ke jaringan. Gunakan 127.0.0.1.` };
}

export const OFFLINE_NOTES = [
  'Video YouTube di materi butuh internet (kartu video memberi pesan bila offline).',
  'Evaluasi Speaking berjalan di laptop (whisper.cpp + LLM lokal); hanya jalur cadangan lewat Claude/GPT/Gemini yang butuh internet.',
  'Build pertama mengunduh font Google; model LLM diunduh sekali.',
];


export async function ffmpegCheck(): Promise<DoctorCheck> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const ffmpegCmd = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobeCmd = process.env.FFPROBE_PATH || 'ffprobe';

  let hasFfmpeg = false;
  let hasFfprobe = false;

  try {
    await execFileAsync(ffmpegCmd, ['-version']);
    hasFfmpeg = true;
  } catch {}

  try {
    await execFileAsync(ffprobeCmd, ['-version']);
    hasFfprobe = true;
  } catch {}

  if (hasFfmpeg && hasFfprobe) {
    const tts = process.env.TTS_ENGINE_CMD ? ' + TTS dikonfigurasi' : '';
    return { name: 'Alat audio (Listening)', status: 'ok', detail: `ffmpeg dan ffprobe terpasang${tts}` };
  }

  return {
    name: 'Alat audio (Listening)',
    status: 'warn',
    detail: 'ffmpeg/ffprobe belum ada di PATH (opsional: hanya dibutuhkan untuk pembuatan konten audio offline listening:build)',
  };
}

export async function runDoctor(): Promise<DoctorCheck[]> {
  const leftover = postgresLeftoverCheck();
  return [nodeCheck(), envCheck(), hostCheck(), ...(await dbChecks()), ...(leftover ? [leftover] : []), await assetsCheck(), await llmCheck(), await sttCheck(), await ffmpegCheck()];
}
