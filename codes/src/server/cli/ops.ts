/**
 * Operasi pemeliharaan lokal (SPEC-025 D7): pengganti panel admin. Murni fungsi atas DB; dipanggil dari
 * `run.ts` (CLI) dan dapat diuji langsung. Tidak ada pengguna aktor: audit dicatat dengan actor null.
 */
import { sql } from 'drizzle-orm';
import { writeAudit } from '../audit';
import { getDb } from '../db';
import { ApiError } from '../http/errors';
import { createProfile, deleteProfile, listProfiles } from '../auth/profiles';
import { updateProfile } from '../auth/service';
import { adminOverride, ensureProgressRows, recomputeStatuses } from '../gatekeeping/service';
import { adminAdjustUserPoints } from '../gamification/service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Galat yang dipahami pengguna CLI (pesan Indonesia). */
export class CliError extends Error {}

export interface ProfileRef {
  id: string;
  displayName: string;
}

/** Cari profil aktif lewat nama (tanpa memedulikan huruf besar/kecil) atau UUID. */
export async function resolveProfile(ref: string): Promise<ProfileRef> {
  const needle = ref.trim();
  if (needle === '') throw new CliError('Nama atau id profil wajib diisi.');
  const profiles = await listProfiles();
  const hit = UUID_RE.test(needle)
    ? profiles.find((p) => p.id.toLowerCase() === needle.toLowerCase())
    : profiles.find((p) => p.display_name.trim().toLowerCase() === needle.toLowerCase());
  if (!hit) throw new CliError(`Profil "${needle}" tidak ditemukan. Lihat daftar dengan: npm run profile:list`);
  return { id: hit.id, displayName: hit.display_name };
}

// ------------------------------------------------------------------ profil
export const profileList = () => listProfiles();

export async function profileCreate(name: string) {
  const user = await createProfile(name.trim(), '');
  return { id: user.id, displayName: user.displayName };
}

export async function profileRename(ref: string, newName: string): Promise<ProfileRef> {
  const p = await resolveProfile(ref);
  const user = await updateProfile(p.id, { display_name: newName.trim() });
  return { id: user.id, displayName: user.displayName };
}

export async function profileDelete(ref: string): Promise<ProfileRef> {
  const p = await resolveProfile(ref);
  await deleteProfile(p.id, p.displayName, '');
  return p;
}

// ------------------------------------------------------------------ progres
export type UnlockLevel = 'TIER' | 'MODULE' | 'SUB_MODULE';

/** Kode "3" (Tier), "3.3" (Modul), "3.3.3" (Sub-modul) -> level + id entitas. */
export async function resolveCurriculumCode(code: string): Promise<{ level: UnlockLevel; id: string; label: string }> {
  const c = code.trim();
  const db = getDb();
  if (/^[1-4]$/.test(c)) {
    const r = await db.execute(sql`SELECT id, title FROM tiers WHERE tier_number = ${Number(c)}`);
    const row = r.rows[0] as { id: string; title: string } | undefined;
    if (row) return { level: 'TIER', id: row.id, label: `Tier ${c}: ${row.title}` };
  } else if (/^[1-4]\.\d{1,2}$/.test(c)) {
    const r = await db.execute(sql`SELECT id, title FROM modules WHERE module_code = ${c}`);
    const row = r.rows[0] as { id: string; title: string } | undefined;
    if (row) return { level: 'MODULE', id: row.id, label: `Modul ${c}: ${row.title}` };
  } else if (/^[1-4]\.\d{1,2}\.\d{1,2}$/.test(c)) {
    const r = await db.execute(sql`SELECT id, title FROM sub_modules WHERE sub_module_code = ${c}`);
    const row = r.rows[0] as { id: string; title: string } | undefined;
    if (row) return { level: 'SUB_MODULE', id: row.id, label: `Sub-modul ${c}: ${row.title}` };
  } else {
    throw new CliError('Kode harus berbentuk Tier (3), Modul (3.3), atau Sub-modul (3.3.3).');
  }
  throw new CliError(`Kode "${c}" tidak ada di kurikulum.`);
}

export async function progressUnlock(ref: string, code: string): Promise<{ profile: ProfileRef; label: string }> {
  const profile = await resolveProfile(ref);
  const target = await resolveCurriculumCode(code);
  try {
    await getDb().transaction((tx) => adminOverride(tx, null, profile.id, { level: target.level, targetId: target.id }));
  } catch (err) {
    if (err instanceof ApiError && err.code === 'ALREADY_UNLOCKED') throw new CliError(`${target.label} sudah terbuka untuk profil ini.`);
    if (err instanceof ApiError && err.code === 'NOT_AVAILABLE') throw new CliError(`${target.label} belum diterbitkan (masih "segera hadir").`);
    throw err;
  }
  return { profile, label: target.label };
}

export interface ResetResult {
  profile: ProfileRef;
  scope: string;
  attemptsDeleted: number;
}

/**
 * Reset progres. `sub`: satu sub-modul (attempt, baris progres, posisi terakhir). `all`: seluruh progres belajar
 * (attempt, progres Tier/Modul/Sub-modul, posisi terakhir, skor skill, prediksi band, status placement).
 * Poin dan statistik tidak disentuh (gunakan points:adjust).
 */
export async function progressReset(ref: string, opts: { sub?: string; all?: boolean }): Promise<ResetResult> {
  if (!opts.sub && !opts.all) throw new CliError('Tentukan --sub <kode> atau --all.');
  if (opts.sub && opts.all) throw new CliError('Pilih salah satu: --sub atau --all.');
  const profile = await resolveProfile(ref);
  const db = getDb();

  if (opts.sub) {
    const target = await resolveCurriculumCode(opts.sub);
    if (target.level !== 'SUB_MODULE') throw new CliError('--sub memerlukan kode sub-modul, mis. 3.3.3.');
    return db.transaction(async (tx) => {
      const del = await tx.execute(sql`
        DELETE FROM attempts WHERE user_id = ${profile.id}::uuid
          AND assessment_set_id IN (SELECT id FROM assessment_sets WHERE sub_module_id = ${target.id}::uuid)
        RETURNING id`);
      await tx.execute(sql`DELETE FROM user_last_learned_state WHERE user_id = ${profile.id}::uuid AND active_sub_module_id = ${target.id}::uuid`);
      await tx.execute(sql`DELETE FROM user_sub_module_progress WHERE user_id = ${profile.id}::uuid AND sub_module_id = ${target.id}::uuid`);
      await recomputeStatuses(tx, profile.id);
      await writeAudit(tx, { actorUserId: null, action: 'PROGRESS_RESET', entityType: 'user', entityId: profile.id, metadata: { scope: 'sub', code: opts.sub } });
      return { profile, scope: target.label, attemptsDeleted: del.rows.length };
    });
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM user_last_learned_state WHERE user_id = ${profile.id}::uuid`);
    const del = await tx.execute(sql`DELETE FROM attempts WHERE user_id = ${profile.id}::uuid RETURNING id`);
    await tx.execute(sql`DELETE FROM user_sub_module_progress WHERE user_id = ${profile.id}::uuid`);
    await tx.execute(sql`DELETE FROM user_module_progress WHERE user_id = ${profile.id}::uuid`);
    await tx.execute(sql`DELETE FROM user_tier_progress WHERE user_id = ${profile.id}::uuid`);
    await tx.execute(sql`DELETE FROM user_skill_scores WHERE user_id = ${profile.id}::uuid`);
    await tx.execute(sql`DELETE FROM user_band_predictions WHERE user_id = ${profile.id}::uuid`);
    await tx.execute(sql`UPDATE users SET placement_completed_at = NULL, updated_at = now() WHERE id = ${profile.id}::uuid`);
    await ensureProgressRows(tx, profile.id);
    await recomputeStatuses(tx, profile.id);
    await writeAudit(tx, { actorUserId: null, action: 'PROGRESS_RESET', entityType: 'user', entityId: profile.id, metadata: { scope: 'all' } });
    return { profile, scope: 'seluruh progres belajar', attemptsDeleted: del.rows.length };
  });
}

// ------------------------------------------------------------------ poin
export async function pointsAdjust(ref: string, delta: number, reason: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new CliError('Selisih poin harus bilangan bulat selain 0 (mis. 50 atau -20).');
  if (Math.abs(delta) > 100000) throw new CliError('Selisih poin terlalu besar (maks 100000).');
  if (reason.trim().length < 3) throw new CliError('Alasan wajib diisi (--reason "...", minimal 3 karakter).');
  const profile = await resolveProfile(ref);
  const db = getDb();
  return db.transaction(async (tx) => {
    await adminAdjustUserPoints(tx, { userId: profile.id, points: delta, note: reason.trim() });
    await writeAudit(tx, { actorUserId: null, action: 'POINTS_ADJUSTED', entityType: 'user', entityId: profile.id, metadata: { delta, reason: reason.trim() } });
    const r = await tx.execute(sql`SELECT total_points FROM user_stats WHERE user_id = ${profile.id}::uuid`);
    return { profile, total: Number((r.rows[0] as { total_points: number } | undefined)?.total_points ?? 0) };
  });
}

export async function pointsShow() {
  const r = await getDb().execute(sql`
    SELECT u.display_name, COALESCE(s.total_points, 0)::int AS total, COALESCE(s.daily_streak_days, 0)::int AS streak
    FROM users u LEFT JOIN user_stats s ON s.user_id = u.id
    WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE' ORDER BY u.created_at, u.id`);
  return (r.rows as Array<{ display_name: string; total: number; streak: number }>).map((x) => ({ name: x.display_name, total: Number(x.total), streak: Number(x.streak) }));
}
