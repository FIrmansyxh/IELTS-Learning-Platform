/**
 * Backlog C-24: Modul 1.1 dipecah menjadi 1.1-1.3, Vocab bergeser ke 1.4, Reading ke 1.5.
 * Langkah migrasi untuk basis data yang dibuat sebelum pemecahan. Baris yang sama diubah (kode, modul, urutan),
 * sehingga id sub-modul tetap dan progres, mahkota, riwayat, serta jalur ikut terbawa. Idempoten; tidak berbuat
 * apa pun pada basis data baru (tanpa Modul 1.1) maupun yang sudah dimigrasi (sudah ada Modul 1.5).
 */
import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Tx } from '../db';
import { MODULE_SEEDS } from './curriculum-structure';

type Move = { from: string; to: string; module: '1.1' | '1.2' | '1.3' | '1.4' | '1.5' };

/** Urutan aman terhadap indeks unik (kode sub-modul dan modul+urutan): kode tujuan selalu sudah dikosongkan. */
const MOVES: Move[] = [
  { from: '1.3.1', to: '1.5.1', module: '1.5' },
  { from: '1.3.2', to: '1.5.2', module: '1.5' },
  { from: '1.2.1', to: '1.4.1', module: '1.4' },
  { from: '1.2.2', to: '1.4.2', module: '1.4' },
  { from: '1.1.6', to: '1.2.1', module: '1.2' },
  { from: '1.1.7', to: '1.2.2', module: '1.2' },
  { from: '1.1.8', to: '1.2.3', module: '1.2' },
  { from: '1.1.2', to: '1.3.1', module: '1.3' },
  { from: '1.1.3', to: '1.3.2', module: '1.3' },
  { from: '1.1.9', to: '1.3.3', module: '1.3' },
  { from: '1.1.4', to: '1.3.4', module: '1.3' },
  { from: '1.1.5', to: '1.1.2', module: '1.1' },
];

export async function renumberC24(tx: Tx): Promise<{ migrated: boolean; moved: number }> {
  const byCode = async (code: string) =>
    (await tx.select().from(schema.modules).where(eq(schema.modules.moduleCode, code)))[0];
  const m11 = await byCode('1.1');
  const m12 = await byCode('1.2');
  const m13 = await byCode('1.3');
  const m15 = await byCode('1.5');
  // Struktur lama: 1.2 = Vocab dan 1.3 = Reading, belum ada 1.5.
  if (!m11 || !m12 || !m13 || m15 || m12.skillCategory !== 'VOCAB' || m13.skillCategory !== 'READING') {
    return { migrated: false, moved: 0 };
  }
  const seed = (code: string) => MODULE_SEEDS.find((m) => m.code === code)!;

  await tx.update(schema.modules).set({ moduleCode: '1.5', orderIndex: 5 }).where(eq(schema.modules.id, m13.id));
  await tx.update(schema.modules).set({ moduleCode: '1.4', orderIndex: 4 }).where(eq(schema.modules.id, m12.id));
  const created: Record<string, string> = { '1.1': m11.id, '1.4': m12.id, '1.5': m13.id };
  for (const code of ['1.2', '1.3']) {
    const [row] = await tx
      .insert(schema.modules)
      .values({
        tierId: m11.tierId,
        moduleCode: code,
        skillCategory: seed(code).skill,
        title: seed(code).title,
        orderIndex: Number(code.split('.')[1]),
        status: m11.status,
      })
      .returning({ id: schema.modules.id });
    created[code] = row!.id;
  }
  await tx.update(schema.modules).set({ title: seed('1.1').title }).where(eq(schema.modules.id, m11.id));

  let moved = 0;
  for (const mv of MOVES) {
    const res = await tx
      .update(schema.subModules)
      .set({ subModuleCode: mv.to, moduleId: created[mv.module]!, orderIndex: Number(mv.to.split('.')[2]) })
      .where(and(eq(schema.subModules.subModuleCode, mv.from)))
      .returning({ id: schema.subModules.id });
    moved += res.length;
  }
  return { migrated: true, moved };
}
