/**
 * `npm run doctor` (SPEC-025 D7/D10): periksa kesiapan aplikasi lokal. Tidak mengubah apa pun.
 * Status: ok (siap), warn (berfungsi tetapi ada catatan), fail (perlu diperbaiki).
 */
import { access, constants, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { config } from '../config';
import { getDb } from '../db';

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
  const missing = ['DATABASE_URL', 'AUTH_SECRET', 'IP_HMAC_SECRET'].filter((k) => !process.env[k]);
  return missing.length === 0
    ? { name: 'Konfigurasi .env', status: 'ok', detail: 'DATABASE_URL, AUTH_SECRET, IP_HMAC_SECRET terisi' }
    : { name: 'Konfigurasi .env', status: 'fail', detail: `belum diisi: ${missing.join(', ')}` };
}

/**
 * Banding migrasi terpasang dengan jurnal. Tabel migrasi hanya dapat dibaca peran migrator (peran aplikasi
 * sengaja tidak punya akses), jadi pakai DATABASE_MIGRATOR_URL bila ada dan beri catatan bila tidak.
 */
async function migrationsCheck(): Promise<DoctorCheck> {
  const url = process.env.DATABASE_MIGRATOR_URL;
  let expected = 0;
  try {
    const journal = JSON.parse(await readFile(path.join(process.cwd(), 'drizzle', 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
    expected = journal.entries.length;
  } catch {
    return { name: 'Migrasi', status: 'warn', detail: 'jurnal migrasi tidak ditemukan (jalankan dari folder codes/)' };
  }
  if (!url) return { name: 'Migrasi', status: 'warn', detail: `tidak dapat diperiksa tanpa DATABASE_MIGRATOR_URL (jurnal: ${expected} migrasi). Pastikan: npm run db:migrate` };
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const r = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
    const applied = Number(r.rows[0]?.n ?? 0);
    return applied >= expected
      ? { name: 'Migrasi', status: 'ok', detail: `${applied} dari ${expected} terpasang` }
      : { name: 'Migrasi', status: 'fail', detail: `${applied} dari ${expected} terpasang. Jalankan: npm run db:migrate` };
  } catch {
    return { name: 'Migrasi', status: 'fail', detail: 'belum terpasang. Jalankan: npm run db:migrate' };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function dbChecks(): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  const db = getDb();
  try {
    await db.execute(sql`SELECT 1`);
    out.push({ name: 'Database', status: 'ok', detail: 'terhubung' });
  } catch (e) {
    out.push({ name: 'Database', status: 'fail', detail: `tidak terhubung (${(e as Error).message.slice(0, 80)}). Nyalakan Postgres lalu coba lagi.` });
    return out;
  }
  out.push(await migrationsCheck());
  try {
    const r = await db.execute(sql`SELECT (SELECT count(*) FROM tiers)::int AS tiers, (SELECT count(*) FROM sub_modules)::int AS subs, (SELECT count(*) FROM sub_modules WHERE status = 'PUBLISHED')::int AS published`);
    const x = r.rows[0] as { tiers: number; subs: number; published: number };
    out.push(
      Number(x.tiers) === 4
        ? { name: 'Data awal (seed)', status: 'ok', detail: `${x.tiers} Tier, ${x.subs} sub-modul (${x.published} terbit)` }
        : { name: 'Data awal (seed)', status: 'fail', detail: 'kurikulum belum ada. Jalankan: npm run db:seed' },
    );
    if (Number(x.published) === 0 && Number(x.tiers) === 4) {
      out.push({ name: 'Konten', status: 'warn', detail: 'belum ada sub-modul terbit. Impor: npm run content:import -- content/gt-modules/3.3.3 --publish' });
    }
    const b = await db.execute(sql`SELECT skill, count(*)::int AS n FROM band_conversion_tables WHERE is_active GROUP BY skill`);
    const skills = new Set((b.rows as Array<{ skill: string }>).map((z) => z.skill));
    const need = ['LISTENING', 'READING_GENERAL'].filter((s) => !skills.has(s));
    out.push(need.length === 0 ? { name: 'Tabel band aktif', status: 'ok', detail: 'Listening dan Reading General Training' } : { name: 'Tabel band aktif', status: 'fail', detail: `belum aktif: ${need.join(', ')}. Jalankan: npm run db:seed` });
    const p = await db.execute(sql`SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL AND status = 'ACTIVE'`);
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

function hostCheck(): DoctorCheck {
  const host = process.env.HOSTNAME ?? '127.0.0.1';
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  return loopback
    ? { name: 'Akses jaringan', status: 'ok', detail: `hanya loopback (${host})` }
    : { name: 'Akses jaringan', status: 'fail', detail: `HOSTNAME=${host}: aplikasi tanpa login tidak boleh dibuka ke jaringan. Gunakan 127.0.0.1.` };
}

export const OFFLINE_NOTES = [
  'Video YouTube di materi butuh internet (kartu video memberi pesan bila offline).',
  'Evaluasi Speaking lewat Claude/GPT/Gemini dilakukan di aplikasi lain di browser dan butuh internet.',
  'Build pertama mengunduh font Google; model LLM diunduh sekali.',
];

export async function runDoctor(): Promise<DoctorCheck[]> {
  return [nodeCheck(), envCheck(), hostCheck(), ...(await dbChecks()), await assetsCheck(), await llmCheck()];
}
