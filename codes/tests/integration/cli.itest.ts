import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { NOW, execute, closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { runCli } from '@/server/cli/run';
import { anonymizeDeletedUsers } from '@/server/jobs/purge';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { call, makeUser, loginAs } from './helpers';
import { addDrill, markLearnDone, progressOf, publishSub, resetLearning, seedMaterial } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
/* eslint-disable @typescript-eslint/no-explicit-any */
async function wipeUsers() {
  await execute(db, sql`DELETE FROM users`);
}
afterAll(async () => {
  await resetLearning();
  await wipeUsers();
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
  await wipeUsers();
});

/** Jalankan CLI dan tangkap keluarannya. */
async function cli(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const scalar = async (q: ReturnType<typeof sql>) => Object.values((await execute(db, q)).rows[0] as any)[0] as any;

describe('CLI profil', () => {
  it('create, list, rename, delete (--yes wajib)', async () => {
    expect((await cli('profile', 'list')).out).toContain('Belum ada profil');
    const c = await cli('profile', 'create', 'Rina', 'Putri');
    expect(c).toMatchObject({ code: 0 });
    expect(c.out).toContain('Rina Putri');
    expect((await cli('profile', 'create', 'rina putri')).code).toBe(1); // nama kembar
    const l = await cli('profile', 'list');
    expect(l.out).toContain('Rina Putri');

    expect((await cli('profile', 'rename', 'RINA putri', 'Rina P.')).code).toBe(0);
    expect((await cli('profile', 'list')).out).toContain('Rina P.');

    const noYes = await cli('profile', 'delete', 'Rina P.');
    expect(noYes.code).toBe(1);
    expect(noYes.err).toContain('--yes');
    expect(await scalar(sql`SELECT count(*) FROM users`)).toBe(1);

    const del = await cli('profile', 'delete', 'rina p.', '--yes');
    expect(del.code).toBe(0);
    expect(await scalar(sql`SELECT count(*) FROM users`)).toBe(0);
    const missing = await cli('profile', 'delete', 'Tidak Ada', '--yes');
    expect(missing).toMatchObject({ code: 1 });
    expect(missing.err).toContain('tidak ditemukan');
  });

  it('profil dapat dirujuk lewat id', async () => {
    await cli('profile', 'create', 'Budi');
    const id = await scalar(sql`SELECT id FROM users LIMIT 1`);
    expect((await cli('profile', 'rename', id, 'Budi S.')).code).toBe(0);
  });
});

describe('CLI progres', () => {
  async function learner(name: string) {
    await cli('profile', 'create', name);
    return (await scalar(sql`SELECT id FROM users WHERE display_name = ${name}`)) as string;
  }

  it('unlock: membuka sub-modul terkunci (sumber ADMIN); ulang -> sudah terbuka; kode salah/tak ada', async () => {
    await publishSub('1.1.1', '3.3.2');
    const id = await learner('Ani');
    const ok = await cli('progress', 'unlock', 'Ani', '3.3.2');
    expect(ok).toMatchObject({ code: 0 });
    expect(ok.out).toContain('3.3.2');
    expect(await progressOf(id, '3.3.2')).toMatchObject({ status: 'UNLOCKED', unlock_source: 'ADMIN' });

    const again = await cli('progress', 'unlock', 'Ani', '3.3.2');
    expect(again.code).toBe(1);
    expect(again.err).toContain('sudah terbuka');
    expect((await cli('progress', 'unlock', 'Ani', 'abc')).err).toContain('Kode harus berbentuk');
    expect((await cli('progress', 'unlock', 'Ani', '3.9.9')).err).toContain('tidak ada di kurikulum');
    const unpublished = await cli('progress', 'unlock', 'Ani', '4.3.2');
    expect(unpublished.code).toBe(1);
    expect(unpublished.err).toContain('belum diterbitkan');
    expect((await cli('progress', 'unlock', 'Nobody', '3.3.2')).code).toBe(1);
  });

  it('reset --sub: percobaan dan progres sub-modul itu dihapus; --yes wajib; kode non sub-modul ditolak', async () => {
    await seedMaterial('1.1.1');
    await addDrill('1.1.1', [Q.mcq(), Q.mcq(), Q.mcq()]);
    const id = await learner('Citra');
    const u = await makeUser({ displayName: 'Citra Sesi' }); // untuk cookie percobaan atas nama profil Citra
    await execute(db, sql`UPDATE users SET id = id WHERE id = ${u.user.id}`);
    const s = await loginAs(u.email);
    await markLearnDone(u.user.id, '1.1.1');
    const set = (await execute(db, sql`SELECT id FROM assessment_sets WHERE assessment_type = 'ACTIVE_DRILL' LIMIT 1`)).rows[0] as any;
    const a = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: s.cookie, body: { assessment_set_id: set.id } });
    expect(a.status).toBe(201);
    expect(await scalar(sql`SELECT count(*) FROM attempts WHERE user_id = ${u.user.id}`)).toBe(1);

    expect((await cli('progress', 'reset', 'Citra Sesi', '--sub', '1.1.1')).code).toBe(1); // tanpa --yes
    expect((await cli('progress', 'reset', 'Citra Sesi', '--sub', '1.1', '--yes')).err).toContain('kode sub-modul');
    expect((await cli('progress', 'reset', 'Citra Sesi', '--yes')).err).toContain('--sub');
    expect((await cli('progress', 'reset', 'Citra Sesi', '--sub', '1.1.1', '--all', '--yes')).err).toContain('Pilih salah satu');

    const r = await cli('progress', 'reset', 'Citra Sesi', '--sub', '1.1.1', '--yes');
    expect(r.code).toBe(0);
    expect(r.out).toContain('Percobaan dihapus: 1');
    expect(await scalar(sql`SELECT count(*) FROM attempts WHERE user_id = ${u.user.id}`)).toBe(0);
    expect((await progressOf(u.user.id, '1.1.1')).learn_completed_at).toBeNull();
    expect(id).toBeTruthy();
  });

  it('reset --all: seluruh progres dibuat ulang dari awal, placement dibuka lagi, poin tidak disentuh', async () => {
    await publishSub('1.1.1', '1.1.2');
    const id = await learner('Dewi');
    await execute(db, sql`UPDATE user_sub_module_progress SET status = 'COMPLETED', best_score_percent = 90 WHERE user_id = ${id} AND sub_module_id IN (SELECT id FROM sub_modules WHERE sub_module_code = '1.1.1')`);
    await execute(db, sql`UPDATE users SET placement_completed_at = ${NOW} WHERE id = ${id}`);
    await cli('points', 'adjust', 'Dewi', '40', '--reason', 'uji');

    const r = await cli('progress', 'reset', 'Dewi', '--all', '--yes');
    expect(r.code).toBe(0);
    const first = await progressOf(id, '1.1.1');
    expect(first.status).toBe('UNLOCKED');
    expect(Number(first.best_score_percent ?? 0)).toBe(0);
    expect(await scalar(sql`SELECT placement_completed_at FROM users WHERE id = ${id}`)).toBeNull();
    expect(await scalar(sql`SELECT total_points FROM user_stats WHERE user_id = ${id}`)).toBe(40);
    expect(await scalar(sql`SELECT count(*) FROM audit_log WHERE action = 'PROGRESS_RESET' AND entity_id = ${id}`)).toBe(1);
  });
});

describe('CLI poin dan pengaturan', () => {
  it('points adjust: validasi, total, tidak di bawah 0, riwayat ledger; points show', async () => {
    await cli('profile', 'create', 'Eko');
    expect((await cli('points', 'adjust', 'Eko', '0', '--reason', 'x salah')).code).toBe(1);
    expect((await cli('points', 'adjust', 'Eko', '1.5', '--reason', 'pecahan')).code).toBe(1);
    expect((await cli('points', 'adjust', 'Eko', '10')).err).toContain('Alasan wajib');
    const up = await cli('points', 'adjust', 'Eko', '50', '--reason', 'bonus uji');
    expect(up.out).toContain('kini 50');
    const down = await cli('points', 'adjust', 'Eko', '-80', '--reason', 'koreksi');
    expect(down.out).toContain('kini 0'); // dikunci 0
    expect(await scalar(sql`SELECT count(*) FROM point_ledger WHERE source = 'ADJUSTMENT'`)).toBe(2);
    expect((await cli('points', 'show')).out).toContain('Eko');
  });

  it('settings: list, get, set bertipe, rentang, enum, dan aturan Gold > Silver', async () => {
    const list = await cli('settings', 'list');
    expect(list.code).toBe(0);
    expect(list.out).toContain('drill.question_count');
    expect(list.out).not.toContain('signup.mode');
    expect((await cli('settings', 'get', 'drill.question_count')).out).toContain('drill.question_count = 10');
    const set = await cli('settings', 'set', 'drill.question_count', '12');
    expect(set.out).toContain('= 12');
    expect(JSON.parse(String(await scalar(sql`SELECT value FROM app_settings WHERE key = 'drill.question_count'`)))).toBe(12);
    const bad = await cli('settings', 'set', 'attempt.cooldown_minutes', '2000');
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('di luar rentang');
    expect((await cli('settings', 'set', 'drill.question_count', 'banyak')).err).toContain('Tipe data');
    expect((await cli('settings', 'set', 'tidak.ada', '1')).code).toBe(1);
    const gold = await cli('settings', 'set', 'crown.gold_min', '70');
    expect(gold.err).toContain('Gold harus lebih besar');
    expect((await cli('settings', 'set', 'crown.gold_min', '95')).code).toBe(0);
    await cli('settings', 'set', 'crown.gold_min', '90');
    await cli('settings', 'set', 'drill.question_count', '10');
    expect(await scalar(sql`SELECT count(*) FROM audit_log WHERE action = 'SETTINGS_CHANGED'`)).toBeGreaterThanOrEqual(3);
  });
});

describe('CLI tabel band', () => {
  it('list per skill; import dari berkas (validasi), aktivasi, label ganda ditolak', async () => {
    const all = await cli('band', 'list');
    expect(all.out).toContain('READING_GENERAL');
    expect(all.out).toContain('v1-gt-2026-11');
    expect((await cli('band', 'list', '--skill', 'ADA')).code).toBe(1);
    expect((await cli('band', 'list', '--skill', 'LISTENING')).out).not.toContain('READING_');

    const dir = mkdtempSync(path.join(tmpdir(), 'band-'));
    const f = path.join(dir, 'tabel.json');
    const rows = [{ raw_min: 0, raw_max: 20, band: 4 }, { raw_min: 21, raw_max: 40, band: 6 }];
    writeFileSync(f, JSON.stringify({ skill: 'READING_GENERAL', version_label: 'v-uji-cli', rows }));
    const imp = await cli('band', 'import', f);
    expect(imp.code).toBe(0);
    expect(imp.out).toContain('v-uji-cli');
    const dup = await cli('band', 'import', f);
    expect(dup.code).toBe(1);
    expect(dup.err).toMatch(/[Ll]abel/);

    const id = await scalar(sql`SELECT id FROM band_conversion_tables WHERE version_label = 'v-uji-cli'`);
    expect((await cli('band', 'activate', id)).code).toBe(0);
    expect(await scalar(sql`SELECT is_active FROM band_conversion_tables WHERE id = ${id}`)).toBe(1);
    expect(await scalar(sql`SELECT count(*) FROM band_conversion_tables WHERE skill = 'READING_GENERAL' AND is_active`)).toBe(1);

    const bad = path.join(dir, 'rusak.json');
    writeFileSync(bad, JSON.stringify({ skill: 'READING_GENERAL', version_label: 'celah', rows: [{ raw_min: 0, raw_max: 10, band: 4 }, { raw_min: 12, raw_max: 40, band: 6 }] }));
    expect((await cli('band', 'import', bad)).code).toBe(1);
    expect((await cli('band', 'import', path.join(dir, 'tidak-ada.json'))).err).toContain('tidak bisa dibaca');

    // kembalikan tabel aktif bawaan agar berkas tes lain tidak terpengaruh
    await execute(db, sql`UPDATE band_conversion_tables SET is_active = false`); // indeks aktif unik: matikan dulu
    await execute(db, sql`UPDATE band_conversion_tables SET is_active = true WHERE version_label IN ('v1-umum-2026-11', 'v1-gt-2026-11')`);
    await execute(db, sql`DELETE FROM band_conversion_tables WHERE version_label = 'v-uji-cli'`);
  });
});

describe('CLI doctor dan penggunaan', () => {
  it('doctor melaporkan DB, migrasi, seed, band, dan catatan internet', async () => {
    const d = await cli('doctor');
    expect(d.out).toMatch(/\[OK\]\s+Database: terhubung/);
    expect(d.out).toMatch(/\[OK\]\s+Migrasi: \d+ dari \d+ terpasang/);
    expect(d.out).toContain('4 Tier');
    expect(d.out).toContain('Tabel band aktif');
    expect(d.out).toContain('YouTube');
    expect(d.out).toContain('Penilai Writing (LLM)');
  });

  it('tanpa argumen/--help menampilkan bantuan; perintah tak dikenal -> kode 1', async () => {
    const none = await cli();
    expect(none.code).toBe(1);
    expect(none.out).toContain('Pemakaian');
    expect((await cli('--help')).code).toBe(0);
    const unknown = await cli('banana', 'split');
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain('tidak dikenal');
  });
});

describe('pemeliharaan worker: anonimisasi profil terhapus lunak', () => {
  it('> 30 hari dianonimkan, < 30 hari tidak; idempoten; audit tercatat', async () => {
    const old = await makeUser();
    const recent = await makeUser();
    await execute(db, sql`UPDATE users SET deleted_at = ${NOW} - 2678400000, status = 'DISABLED' WHERE id = ${old.user.id}`);
    await execute(db, sql`UPDATE users SET deleted_at = ${NOW} - 2505600000, status = 'DISABLED' WHERE id = ${recent.user.id}`);
    expect(await anonymizeDeletedUsers(db)).toBeGreaterThanOrEqual(1);
    const o = (await execute(db, sql`SELECT display_name FROM users WHERE id = ${old.user.id}`)).rows[0] as any;
    expect(o).toMatchObject({ display_name: 'Pengguna dihapus' });
    const r = (await execute(db, sql`SELECT display_name FROM users WHERE id = ${recent.user.id}`)).rows[0] as any;
    expect(r.display_name).toBe(recent.email); // email = nama profil (kompatibilitas helper)
    expect(await anonymizeDeletedUsers(db)).toBe(0);
    expect(await scalar(sql`SELECT count(*) FROM audit_log WHERE action = 'USER_ANONYMIZED' AND entity_id = ${old.user.id}`)).toBe(1);
  });
});
