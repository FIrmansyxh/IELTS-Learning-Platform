import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { ActiveBandTablesResponseSchema, BandTableListResponseSchema, CreateBandTableResponseSchema, ActivateBandTableResponseSchema } from '@/contracts/band';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { convertRawToBand } from '@/server/band/convert';
import { getActiveTable } from '@/server/band/service';
import { GET as activeRoute } from '@/app/api/v1/band-tables/active/route';
import { GET as listRoute, POST as createRoute } from '@/app/api/v1/admin/band-tables/route';
import { GET as detailRoute, DELETE as deleteRoute } from '@/app/api/v1/admin/band-tables/[table_id]/route';
import { POST as activateRoute } from '@/app/api/v1/admin/band-tables/[table_id]/activate/route';
import { adminSession, call, learnerSession } from './helpers';

const db = getDb();
/* eslint-disable @typescript-eslint/no-explicit-any */
afterAll(async () => {
  await db.execute(sql`DELETE FROM attempts WHERE band_table_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM band_conversion_tables WHERE version_label <> 'v1-umum-2026-11'`);
  await db.execute(sql`UPDATE band_conversion_tables SET is_active = (version_label = 'v1-umum-2026-11')`);
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await db.execute(sql`DELETE FROM attempts WHERE band_table_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM band_conversion_tables WHERE version_label <> 'v1-umum-2026-11'`);
  await db.execute(sql`UPDATE band_conversion_tables SET is_active = (version_label = 'v1-umum-2026-11')`);
});

const create = (cookie: string | null, body: unknown) => call(createRoute, 'POST', '/api/v1/admin/band-tables', { cookie, body });
const activate = (cookie: string | null, id: string) => call(activateRoute, 'POST', `/api/v1/admin/band-tables/${id}/activate`, { cookie, params: { table_id: id } });
const del = (cookie: string | null, id: string) => call(deleteRoute, 'DELETE', `/api/v1/admin/band-tables/${id}`, { cookie, params: { table_id: id } });
const detail = (cookie: string | null, id: string) => call(detailRoute, 'GET', `/api/v1/admin/band-tables/${id}`, { cookie, params: { table_id: id } });
const list = (cookie: string | null, qs = '') => call(listRoute, 'GET', `/api/v1/admin/band-tables${qs}`, { cookie });

const VALID = { skill: 'READING_ACADEMIC', version_label: 'v2-contoh', source_note: 'Revisi uji', rows: [{ raw_min: 0, raw_max: 14, band: 4.0 }, { raw_min: 15, raw_max: 29, band: 6.0 }, { raw_min: 30, raw_max: 40, band: 7.5 }] };
const activeCount = async (skill: string) => Number((await db.execute(sql`SELECT count(*)::int AS n FROM band_conversion_tables WHERE skill = ${skill}::band_table_skill AND is_active`)).rows[0]!.n);
const audit = async (action: string, id: string) => Number((await db.execute(sql`SELECT count(*)::int AS n FROM audit_log WHERE action = ${action} AND entity_id = ${id}`)).rows[0]!.n);

describe('seed', () => {
  it('tepat 1 tabel aktif per skill berlabel v1-umum-2026-11, 17 baris menutup 0..40 tanpa celah', async () => {
    for (const skill of ['LISTENING', 'READING_ACADEMIC']) {
      const t = (await db.execute(sql`SELECT id, version_label, is_active, source_note, effective_from FROM band_conversion_tables WHERE skill = ${skill}::band_table_skill AND is_active`)).rows as any[];
      expect(t).toHaveLength(1);
      expect(t[0].version_label).toBe('v1-umum-2026-11');
      expect(t[0].source_note).toContain('Perkiraan');
      expect(t[0].effective_from).not.toBeNull();
      const rows = (await db.execute(sql`SELECT raw_min, raw_max FROM band_conversion_rows WHERE table_id = ${t[0].id}::uuid ORDER BY raw_min`)).rows as any[];
      expect(rows).toHaveLength(17);
      let next = 0;
      for (const r of rows) {
        expect(r.raw_min).toBe(next);
        next = r.raw_max + 1;
      }
      expect(next).toBe(41);
    }
  });

  it('konversi dari DB: Listening 25/26/29/30/0/40 dan Reading 14/15/18/19/26/27', async () => {
    const l = await getActiveTable(db, 'LISTENING');
    expect([25, 26, 29, 30, 0, 40].map((n) => convertRawToBand(l.rows, n))).toEqual([6.0, 6.5, 6.5, 7.0, 0.0, 9.0]);
    const r = await getActiveTable(db, 'READING_ACADEMIC');
    expect([14, 15, 18, 19, 26, 27].map((n) => convertRawToBand(r.rows, n))).toEqual([4.5, 5.0, 5.0, 5.5, 6.0, 6.5]);
  });

  it('seed idempoten: dijalankan ulang tidak menggandakan tabel/baris', async () => {
    const { seedModules } = await import('../../scripts/seed');
    const mod = seedModules.find((m) => m.name === 'band-tables')!;
    await db.transaction(async (tx) => mod.run(tx as never));
    expect(Number((await db.execute(sql`SELECT count(*)::int AS n FROM band_conversion_tables`)).rows[0]!.n)).toBe(2);
    expect(Number((await db.execute(sql`SELECT count(*)::int AS n FROM band_conversion_rows`)).rows[0]!.n)).toBe(34);
  });
});

describe('GET /band-tables/active', () => {
  it('learner 200 sesuai kontrak, 17 baris per tabel terurut raw_min, disclaimer; tanpa sesi 401', async () => {
    const u = await learnerSession();
    const r = await call(activeRoute, 'GET', '/api/v1/band-tables/active', { cookie: u.cookie });
    expect(r.status).toBe(200);
    expect(ActiveBandTablesResponseSchema.safeParse(r.json).success).toBe(true);
    const d = r.json.data;
    expect(d.listening.rows).toHaveLength(17);
    expect(d.reading_academic.rows).toHaveLength(17);
    expect(d.listening.rows.map((x: any) => x.raw_min)).toEqual([...d.listening.rows.map((x: any) => x.raw_min)].sort((a, b) => a - b));
    expect(d.listening.version_label).toBe('v1-umum-2026-11');
    expect(d.disclaimer).toBe('Perkiraan latihan, bukan skor resmi IELTS.');
    expect((await call(activeRoute, 'GET', '/api/v1/band-tables/active')).status).toBe(401);
  });

  it('tanpa tabel aktif -> 500 INTERNAL_ERROR generik', async () => {
    const u = await learnerSession();
    await db.execute(sql`UPDATE band_conversion_tables SET is_active = false WHERE skill = 'LISTENING'`);
    const r = await call(activeRoute, 'GET', '/api/v1/band-tables/active', { cookie: u.cookie });
    expect(r.status).toBe(500);
    expect(r.json.error.code).toBe('INTERNAL_ERROR');
    await db.execute(sql`UPDATE band_conversion_tables SET is_active = true WHERE skill = 'LISTENING' AND version_label = 'v1-umum-2026-11'`);
  });
});

describe('admin: otorisasi', () => {
  it('learner -> 403 FORBIDDEN pada semua endpoint admin; tanpa sesi 401', async () => {
    const u = await learnerSession();
    expect((await create(u.cookie, VALID)).json.error.code).toBe('FORBIDDEN');
    expect((await list(u.cookie)).status).toBe(403);
    expect((await detail(u.cookie, '11111111-1111-4111-8111-111111111111')).status).toBe(403);
    expect((await activate(u.cookie, '11111111-1111-4111-8111-111111111111')).status).toBe(403);
    expect((await del(u.cookie, '11111111-1111-4111-8111-111111111111')).status).toBe(403);
    expect((await create(null, VALID)).status).toBe(401);
  });
});

describe('POST /admin/band-tables', () => {
  it('201 tidak aktif, row_count 3, tabel aktif lama tidak berubah, audit BAND_TABLE_CREATED', async () => {
    const a = await adminSession();
    const before = (await db.execute(sql`SELECT id FROM band_conversion_tables WHERE skill = 'READING_ACADEMIC' AND is_active`)).rows[0] as any;
    const r = await create(a.cookie, VALID);
    expect(r.status).toBe(201);
    expect(CreateBandTableResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ skill: 'READING_ACADEMIC', version_label: 'v2-contoh', is_active: false, row_count: 3 });
    const after = (await db.execute(sql`SELECT id FROM band_conversion_tables WHERE skill = 'READING_ACADEMIC' AND is_active`)).rows as any[];
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(await audit('BAND_TABLE_CREATED', r.json.data.id)).toBe(1);
  });

  it('baris tidak terurut diterima dan disimpan terurut; detail memuat rows + source_note', async () => {
    const a = await adminSession();
    const r = await create(a.cookie, { ...VALID, rows: [...VALID.rows].reverse() });
    expect(r.status).toBe(201);
    const d = await detail(a.cookie, r.json.data.id);
    expect(d.status).toBe(200);
    expect(d.json.data.source_note).toBe('Revisi uji');
    expect(d.json.data.rows.map((x: any) => x.raw_min)).toEqual([0, 15, 30]);
    expect(d.json.data.rows[2].band).toBe(7.5);
  });

  it.each([
    ['coverage_gap', [{ raw_min: 0, raw_max: 14, band: 4 }, { raw_min: 16, raw_max: 40, band: 6 }]],
    ['coverage_overlap', [{ raw_min: 0, raw_max: 20, band: 4 }, { raw_min: 18, raw_max: 40, band: 6 }]],
    ['coverage_overlap', [{ raw_min: 0, raw_max: 20, band: 4 }, { raw_min: 0, raw_max: 40, band: 6 }]],
    ['band_invalid', [{ raw_min: 0, raw_max: 40, band: 6.3 }]],
    ['non_monotonic', [{ raw_min: 0, raw_max: 20, band: 6 }, { raw_min: 21, raw_max: 40, band: 5 }]],
    ['range_invalid', [{ raw_min: 10, raw_max: 5, band: 6 }]],
    ['range_invalid', [{ raw_min: 0, raw_max: 41, band: 6 }]],
  ])('400 VALIDATION_ERROR %s', async (code, rows) => {
    const a = await adminSession();
    const r = await create(a.cookie, { ...VALID, version_label: `v-${Math.random().toString(36).slice(2, 8)}`, rows });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('VALIDATION_ERROR');
    expect(r.json.error.details.map((d: any) => d.code)).toContain(code);
    expect(Number((await db.execute(sql`SELECT count(*)::int AS n FROM band_conversion_tables`)).rows[0]!.n)).toBe(2);
  });

  it('kunci tak dikenal -> unrecognized_key; label hanya spasi -> 400; skill tak valid -> 400', async () => {
    const a = await adminSession();
    const r1 = await create(a.cookie, { ...VALID, is_active: true });
    expect(r1.status).toBe(400);
    expect(r1.json.error.details.map((d: any) => d.code)).toContain('unrecognized_key');
    expect((await create(a.cookie, { ...VALID, version_label: '   ' })).status).toBe(400);
    expect((await create(a.cookie, { ...VALID, skill: 'WRITING' })).status).toBe(400);
    expect((await create(a.cookie, { ...VALID, rows: [] })).status).toBe(400);
  });

  it('label ganda pada skill sama -> 409 VERSION_LABEL_TAKEN; skill lain boleh; pembuatan serentak tepat satu berhasil', async () => {
    const a = await adminSession();
    expect((await create(a.cookie, VALID)).status).toBe(201);
    const dup = await create(a.cookie, VALID);
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('VERSION_LABEL_TAKEN');
    expect((await create(a.cookie, { ...VALID, skill: 'LISTENING' })).status).toBe(201);
    const rs = await Promise.all([1, 2, 3].map(() => create(a.cookie, { ...VALID, version_label: 'balapan' })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(2);
  });
});

describe('GET /admin/band-tables', () => {
  it('daftar sesuai kontrak, filter skill, row_count dan used_by_attempts', async () => {
    const a = await adminSession();
    await create(a.cookie, VALID);
    const all = await list(a.cookie);
    expect(all.status).toBe(200);
    expect(BandTableListResponseSchema.safeParse(all.json).success).toBe(true);
    expect(all.json.data).toHaveLength(3);
    const reading = await list(a.cookie, '?skill=READING_ACADEMIC');
    expect(reading.json.data).toHaveLength(2);
    expect(reading.json.data.find((t: any) => t.version_label === 'v2-contoh')).toMatchObject({ is_active: false, row_count: 3, used_by_attempts: 0 });
    expect(reading.json.data.find((t: any) => t.version_label === 'v1-umum-2026-11')).toMatchObject({ is_active: true, row_count: 17 });
    expect((await list(a.cookie, '?skill=SPEAKING')).status).toBe(400);
  });

  it('detail: id bukan uuid -> 400 invalid_uuid; tidak ada -> 404', async () => {
    const a = await adminSession();
    const bad = await detail(a.cookie, 'abc');
    expect(bad.status).toBe(400);
    expect(bad.json.error.details[0].code).toBe('invalid_uuid');
    expect((await detail(a.cookie, '11111111-1111-4111-8111-111111111111')).status).toBe(404);
  });
});

describe('POST activate', () => {
  it('200, tepat 1 aktif per skill (lama nonaktif), audit; ulang -> 409 ALREADY_ACTIVE; skill lain tidak terpengaruh', async () => {
    const a = await adminSession();
    const id = (await create(a.cookie, VALID)).json.data.id;
    const r = await activate(a.cookie, id);
    expect(r.status).toBe(200);
    expect(ActivateBandTableResponseSchema.safeParse(r.json).success).toBe(true);
    expect(r.json.data).toMatchObject({ id, skill: 'READING_ACADEMIC', is_active: true });
    expect(r.json.data.effective_from).not.toBeNull();
    expect(await activeCount('READING_ACADEMIC')).toBe(1);
    expect(await activeCount('LISTENING')).toBe(1);
    const old = (await db.execute(sql`SELECT is_active FROM band_conversion_tables WHERE skill = 'READING_ACADEMIC' AND version_label = 'v1-umum-2026-11'`)).rows[0] as any;
    expect(old.is_active).toBe(false);
    expect(await audit('BAND_TABLE_ACTIVATE', id)).toBe(1);
    const again = await activate(a.cookie, id);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe('ALREADY_ACTIVE');
    expect((await activate(a.cookie, '11111111-1111-4111-8111-111111111111')).status).toBe(404);
    // tabel aktif baru dipakai konversi
    const t = await getActiveTable(db, 'READING_ACADEMIC');
    expect(convertRawToBand(t.rows, 20)).toBe(6.0);
  });

  it('dua aktivasi serentak untuk dua tabel skill sama: tetap tepat satu aktif, tanpa 500', async () => {
    const a = await adminSession();
    const id1 = (await create(a.cookie, { ...VALID, version_label: 'v-a' })).json.data.id;
    const id2 = (await create(a.cookie, { ...VALID, version_label: 'v-b' })).json.data.id;
    const rs = await Promise.all([activate(a.cookie, id1), activate(a.cookie, id2)]);
    expect(rs.every((r) => r.status < 500)).toBe(true);
    expect(await activeCount('READING_ACADEMIC')).toBe(1);
  });

  it('hasil lama tidak berubah: attempt dengan band_table_id tabel lama tetap, tabel lama tidak dapat dihapus', async () => {
    const a = await adminSession();
    const u = await learnerSession();
    const oldId = ((await db.execute(sql`SELECT id FROM band_conversion_tables WHERE skill = 'READING_ACADEMIC' AND is_active`)).rows[0] as any).id as string;
    // attempt sintetis dengan band_score dari tabel lama
    const set = (await db.execute(sql`
      INSERT INTO assessment_sets (assessment_type, title, tier_id, time_limit_seconds, origin, status)
      VALUES ('TIER_BOSS_EXAM', 'Boss uji band', (SELECT id FROM tiers WHERE tier_number = 1), 600, 'ORIGINAL_AUTHORED', 'DRAFT') RETURNING id`)).rows[0] as any;
    await db.execute(sql`
      INSERT INTO attempts (user_id, assessment_set_id, assessment_version, mode, status, band_score, band_table_id, state)
      VALUES (${u.user.id}::uuid, ${set.id}::uuid, 1, 'EXAM', 'GRADED', 6.5, ${oldId}::uuid, '{}'::jsonb)`);
    const id = (await create(a.cookie, VALID)).json.data.id;
    expect((await activate(a.cookie, id)).status).toBe(200);
    const att = (await db.execute(sql`SELECT band_score::float AS b, band_table_id FROM attempts WHERE user_id = ${u.user.id}::uuid`)).rows[0] as any;
    expect(att).toMatchObject({ b: 6.5, band_table_id: oldId });
    const del1 = await del(a.cookie, oldId);
    expect(del1.status).toBe(409);
    expect(del1.json.error.code).toBe('BAND_TABLE_IN_USE');
    expect((await list(a.cookie, '?skill=READING_ACADEMIC')).json.data.find((t: any) => t.id === oldId).used_by_attempts).toBe(1);
    // QA F-09-02: jaring pengaman di DB - penghapusan langsung via SQL ditolak (FK RESTRICT), band_table_id tidak dikosongkan diam-diam.
    await expect(db.execute(sql`DELETE FROM band_conversion_tables WHERE id = ${oldId}::uuid`)).rejects.toThrow();
    expect(((await db.execute(sql`SELECT band_table_id FROM attempts WHERE user_id = ${u.user.id}::uuid`)).rows[0] as any).band_table_id).toBe(oldId);
    await db.execute(sql`DELETE FROM attempts WHERE user_id = ${u.user.id}::uuid`);
    await db.execute(sql`DELETE FROM assessment_sets WHERE id = ${set.id}::uuid`);
  });

  it('tabel yang dirujuk result_json attempt juga tidak dapat dihapus', async () => {
    const a = await adminSession();
    const u = await learnerSession();
    const id = (await create(a.cookie, VALID)).json.data.id;
    const set = (await db.execute(sql`
      INSERT INTO assessment_sets (assessment_type, title, tier_id, time_limit_seconds, origin, status)
      VALUES ('TIER_BOSS_EXAM', 'Boss uji band 2', (SELECT id FROM tiers WHERE tier_number = 1), 600, 'ORIGINAL_AUTHORED', 'DRAFT') RETURNING id`)).rows[0] as any;
    await db.execute(sql`
      INSERT INTO attempts (user_id, assessment_set_id, assessment_version, mode, status, state, result_json)
      VALUES (${u.user.id}::uuid, ${set.id}::uuid, 1, 'EXAM', 'GRADED', '{}'::jsonb, ${JSON.stringify({ boss: { band_table_ids: [id] } })}::jsonb)`);
    const r = await del(a.cookie, id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('BAND_TABLE_IN_USE');
    await db.execute(sql`DELETE FROM attempts WHERE user_id = ${u.user.id}::uuid`);
    await db.execute(sql`DELETE FROM assessment_sets WHERE id = ${set.id}::uuid`);
  });
});

describe('DELETE /admin/band-tables/{id}', () => {
  it('tabel nonaktif tak terpakai: 204 + baris ikut terhapus + audit; aktif -> 409; tidak ada -> 404', async () => {
    const a = await adminSession();
    const id = (await create(a.cookie, VALID)).json.data.id;
    const r = await del(a.cookie, id);
    expect(r.status).toBe(204);
    expect(Number((await db.execute(sql`SELECT count(*)::int AS n FROM band_conversion_rows WHERE table_id = ${id}::uuid`)).rows[0]!.n)).toBe(0);
    expect(await audit('BAND_TABLE_DELETED', id)).toBe(1);
    expect((await del(a.cookie, id)).status).toBe(404);
    const active = ((await db.execute(sql`SELECT id FROM band_conversion_tables WHERE skill = 'LISTENING' AND is_active`)).rows[0] as any).id;
    const rr = await del(a.cookie, active);
    expect(rr.status).toBe(409);
    expect(rr.json.error.code).toBe('BAND_TABLE_IN_USE');
    expect(rr.json.error.message).toBe('Tabel aktif atau sudah dipakai tidak dapat dihapus.');
  });
});
