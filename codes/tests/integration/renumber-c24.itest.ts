import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { CODE_RENUMBER_C24 } from '@/server/content/curriculum-structure';
import { renumberC24 } from '@/server/content/renumber-c24';
import { closeDb, execute, getDb, type Tx } from '@/server/db';

const db = getDb();
afterAll(closeDb);

class Rollback extends Error {}

/** Kode baru -> [kode lama, kode modul lama] untuk membangun ulang struktur sebelum C-24 (urutan aman terhadap indeks unik). */
const REVERSE: Array<[string, string, string]> = [
  ['1.1.2', '1.1.5', '1.1'],
  ['1.3.4', '1.1.4', '1.1'],
  ['1.3.3', '1.1.9', '1.1'],
  ['1.3.2', '1.1.3', '1.1'],
  ['1.3.1', '1.1.2', '1.1'],
  ['1.2.3', '1.1.8', '1.1'],
  ['1.2.2', '1.1.7', '1.1'],
  ['1.2.1', '1.1.6', '1.1'],
  ['1.4.2', '1.2.2', '1.2'],
  ['1.4.1', '1.2.1', '1.2'],
  ['1.5.2', '1.3.2', '1.3'],
  ['1.5.1', '1.3.1', '1.3'],
];

async function toOldStructure(tx: Tx) {
  // Modul tata bahasa baru 1.2/1.3 disingkirkan (kode sementara), lalu Vocab/Reading kembali ke 1.2/1.3.
  await execute(tx, sql`UPDATE modules SET module_code = 'x.2', order_index = 92 WHERE module_code = '1.2'`);
  await execute(tx, sql`UPDATE modules SET module_code = 'x.3', order_index = 93 WHERE module_code = '1.3'`);
  await execute(tx, sql`UPDATE modules SET module_code = '1.2', order_index = 2 WHERE module_code = '1.4'`);
  await execute(tx, sql`UPDATE modules SET module_code = '1.3', order_index = 3 WHERE module_code = '1.5'`);
  for (const [nu, old, mod] of REVERSE) {
    await execute(
      tx,
      sql`UPDATE sub_modules SET sub_module_code = ${old}, order_index = ${Number(old.split('.')[2])},
          module_id = (SELECT id FROM modules WHERE module_code = ${mod}) WHERE sub_module_code = ${nu}`,
    );
  }
}

async function layout(tx: Tx) {
  const r = await execute<{ code: string; id: string; mod: string; ord: number }>(
    tx,
    sql`SELECT s.sub_module_code AS code, s.id AS id, m.module_code AS mod, s.order_index AS ord
        FROM sub_modules s JOIN modules m ON m.id = s.module_id WHERE s.sub_module_code LIKE '1.%'`,
  );
  return new Map(r.rows.map((x) => [x.code, x]));
}

describe('migrasi C-24: Modul 1.1 dipecah menjadi 1.1-1.3', () => {
  it('basis data baru tidak diubah; basis data lama dimigrasi dengan id dan progres utuh; idempoten', async () => {
    const out: Record<string, unknown> = {};
    await expect(
      db.transaction(async (tx) => {
        const fresh = await layout(tx);
        out.freshNoop = await renumberC24(tx);

        await toOldStructure(tx);
        const old = await layout(tx);
        // Struktur lama: semua grammar di Modul 1.1; Vocab 1.2; Reading 1.3.
        out.oldShape = ['1.1.1', '1.1.9', '1.2.1', '1.3.2'].map((c) => `${c}@${old.get(c)?.mod}`);

        out.migrated = await renumberC24(tx);
        const after = await layout(tx);
        out.idsKept = [...fresh].every(([code, row]) => after.get(code)?.id === row.id);
        out.sameShape = [...fresh].every(([code, row]) => after.get(code)?.mod === row.mod && after.get(code)?.ord === row.ord);
        // Kode lama menunjuk sub-modul yang sama dengan kode baru (id sebelum dan sesudah).
        out.mapped = Object.entries(CODE_RENUMBER_C24).every(([from, to]) => old.get(from)?.id === after.get(to)?.id);
        out.again = await renumberC24(tx);
        const mods = await execute<{ c: string; t: string }>(tx, sql`SELECT module_code AS c, title AS t FROM modules WHERE module_code LIKE '1.%' ORDER BY order_index`);
        out.mods = mods.rows.filter((m) => /^1\.\d$/.test(m.c)).map((m) => m.c);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);

    expect(out.freshNoop).toEqual({ migrated: false, moved: 0 });
    expect(out.oldShape).toEqual(['1.1.1@1.1', '1.1.9@1.1', '1.2.1@1.2', '1.3.2@1.3']);
    expect(out.migrated).toEqual({ migrated: true, moved: 12 });
    expect(out.idsKept).toBe(true);
    expect(out.sameShape).toBe(true);
    expect(out.mapped).toBe(true);
    expect(out.again).toEqual({ migrated: false, moved: 0 });
    expect(out.mods).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5']);

    // Transaksi dibatalkan: struktur baru tetap utuh.
    const r = await execute<{ c: number }>(db, sql`SELECT COUNT(*) AS c FROM modules WHERE module_code IN ('1.4','1.5') AND tier_id IN (SELECT id FROM tiers WHERE tier_number = 1)`);
    expect(Number(r.rows[0]!.c)).toBe(2);
  });
});
