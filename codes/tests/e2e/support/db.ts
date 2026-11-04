/** Akses DB langsung untuk menyiapkan/memeriksa state E2E (peran migrator: pemilik tabel). */
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import pg from 'pg';

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url || !url.endsWith('/ielts_e2e')) throw new Error('DATABASE_MIGRATOR_URL harus menunjuk ielts_e2e (source tests/e2e/e2e.env.sh)');
export const pool = new pg.Pool({ connectionString: url, max: 3 });

export const q = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => (await pool.query(text, params)).rows as T[]; // eslint-disable-line @typescript-eslint/no-explicit-any
export const q1 = async <T = any>(text: string, params: unknown[] = []): Promise<T> => (await q<T>(text, params))[0] as T; // eslint-disable-line @typescript-eslint/no-explicit-any

export const PASSWORD = 'kopi-tubruk-2026!';
const ARGON = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
let cachedHash: string | undefined;
export const passwordHash = async (p = PASSWORD) => (p === PASSWORD ? (cachedHash ??= await hash(p.normalize('NFKC'), ARGON as any)) : hash(p.normalize('NFKC'), ARGON as any)); // eslint-disable-line @typescript-eslint/no-explicit-any

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

export async function createUser(opts: { role?: 'learner' | 'admin'; mustChange?: boolean; password?: string; targetBand?: number | null; name?: string; prefix?: string } = {}): Promise<TestUser> {
  const password = opts.password ?? PASSWORD;
  const email = `${opts.prefix ?? (opts.role === 'admin' ? 'adm' : 'u')}.${randomUUID().slice(0, 8)}@example.test`;
  const displayName = opts.name ?? 'Penguji E2E';
  const r = await q1<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash, role, must_change_password, target_band) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [email, displayName, await passwordHash(password), opts.role ?? 'learner', opts.mustChange ?? false, opts.targetBand === undefined ? 7 : opts.targetBand],
  );
  return { id: r.id, email, password, displayName };
}

export const subId = async (code: string) => (await q1<{ id: string }>('SELECT id FROM sub_modules WHERE sub_module_code=$1', [code])).id;
export const setId = async (title: string) => (await q1<{ id: string }>('SELECT id FROM assessment_sets WHERE title=$1 AND status=$2 ORDER BY created_at DESC LIMIT 1', [title, 'PUBLISHED'])).id;
export const setting = (key: string, value: unknown) => q(`UPDATE app_settings SET value=$2::jsonb WHERE key=$1`, [key, JSON.stringify(value)]);

/** Pastikan baris progres ada lalu paksa status sub-modul (dan materi selesai). Tanpa melewati logika tree: GET tree akan menghitung ulang. */
export async function seedProgress(userId: string, codes: string[], status: 'UNLOCKED' | 'IN_PROGRESS' | 'COMPLETED', opts: { learnDone?: boolean; best?: number } = {}) {
  await ensureRows(userId);
  for (const c of codes) {
    await q(
      `UPDATE user_sub_module_progress SET status=$3::progress_status, learn_completed_at = CASE WHEN $4 THEN now() ELSE learn_completed_at END,
         best_score_percent = GREATEST(best_score_percent, $5), completed_at = CASE WHEN $3='COMPLETED' THEN now() ELSE completed_at END, updated_at=now()
       WHERE user_id=$1 AND sub_module_id=(SELECT id FROM sub_modules WHERE sub_module_code=$2)`,
      [userId, c, status, opts.learnDone ?? status !== 'UNLOCKED', opts.best ?? (status === 'COMPLETED' ? 100 : 0)],
    );
  }
}

/** Sisipkan baris progres LOCKED yang belum ada (padanan ensureProgressRows) agar UPDATE di atas berefek sebelum tree dibuka. */
export async function ensureRows(userId: string) {
  await q(`INSERT INTO user_tier_progress (user_id, tier_id) SELECT $1, id FROM tiers ON CONFLICT DO NOTHING`, [userId]);
  await q(`INSERT INTO user_module_progress (user_id, module_id) SELECT $1, id FROM modules ON CONFLICT DO NOTHING`, [userId]);
  await q(`INSERT INTO user_sub_module_progress (user_id, sub_module_id) SELECT $1, id FROM sub_modules ON CONFLICT DO NOTHING`, [userId]);
}

export async function cleanUsers() {
  await q(`DELETE FROM users WHERE email LIKE '%@example.test' AND role='learner'`);
}

/** Tandai materi selesai langsung di DB (jalan pintas untuk tes yang bukan tentang bukti belajar). */
export async function markLearnDone(userId: string, code: string) {
  await ensureRows(userId);
  await q(
    `UPDATE user_sub_module_progress SET learn_completed_at = now(), status = CASE WHEN status='LOCKED' THEN 'UNLOCKED'::progress_status ELSE status END
       WHERE user_id=$1 AND sub_module_id=(SELECT id FROM sub_modules WHERE sub_module_code=$2)`,
    [userId, code],
  );
}
