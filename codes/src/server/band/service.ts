/** BandService (SPEC-009): tabel konversi berversi di DB. Spec ujian memuat tabel aktif lewat `getActiveTable`. */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { bandConversionRows, bandConversionTables } from '@/db/schema';
import type { BandSkillName, CreateBandTableBody } from '@/contracts/band';
import { writeAudit } from '../audit';
import { getDb, type DbOrTx } from '../db';
import { ApiError, notFound, type ErrorDetail } from '../http/errors';
import { logger } from '../logger';
import type { BandRowLike } from './convert';
import { validateBandRows } from './validate';

export interface BandTable {
  tableId: string;
  skill: BandSkillName;
  versionLabel: string;
  sourceNote: string | null;
  rows: BandRowLike[];
}

async function rowsOf(db: DbOrTx, tableId: string): Promise<BandRowLike[]> {
  const rows = await db.select().from(bandConversionRows).where(eq(bandConversionRows.tableId, tableId)).orderBy(asc(bandConversionRows.rawMin));
  return rows.map((r) => ({ raw_min: r.rawMin, raw_max: r.rawMax, band: Number(r.band) }));
}

/** Tabel aktif satu skill. Tidak ada tabel aktif = galat konfigurasi (500, dicatat). */
export async function getActiveTable(db: DbOrTx, skill: BandSkillName): Promise<BandTable> {
  const [t] = await db
    .select()
    .from(bandConversionTables)
    .where(and(eq(bandConversionTables.skill, skill), eq(bandConversionTables.isActive, true)))
    .limit(1);
  if (!t) {
    logger.error({ skill }, 'band_table_inactive');
    throw new ApiError('INTERNAL_ERROR');
  }
  return { tableId: t.id, skill, versionLabel: t.versionLabel, sourceNote: t.sourceNote, rows: await rowsOf(db, t.id) };
}

export async function getActiveTables(db: DbOrTx) {
  const listening = await getActiveTable(db, 'LISTENING');
  const reading = await getActiveTable(db, 'READING_ACADEMIC');
  const dto = (t: BandTable) => ({ table_id: t.tableId, version_label: t.versionLabel, source_note: t.sourceNote, rows: t.rows });
  return { listening: dto(listening), reading_academic: dto(reading), disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.' };
}

const usedCount = sql<number>`(SELECT count(*)::int FROM attempts a WHERE a.band_table_id = "band_conversion_tables"."id")`;
const rowCount = sql<number>`(SELECT count(*)::int FROM band_conversion_rows r WHERE r.table_id = "band_conversion_tables"."id")`;

interface ListRow {
  id: string;
  skill: BandSkillName;
  versionLabel: string;
  isActive: boolean;
  effectiveFrom: Date | null;
  createdAt: Date;
  rowCount: number;
  used: number;
}

const listItem = (t: ListRow) => ({
  id: t.id,
  skill: t.skill,
  version_label: t.versionLabel,
  is_active: t.isActive,
  effective_from: t.effectiveFrom ? t.effectiveFrom.toISOString() : null,
  row_count: Number(t.rowCount),
  used_by_attempts: Number(t.used),
  created_at: t.createdAt.toISOString(),
});

const selectCols = {
  id: bandConversionTables.id,
  skill: bandConversionTables.skill,
  versionLabel: bandConversionTables.versionLabel,
  isActive: bandConversionTables.isActive,
  effectiveFrom: bandConversionTables.effectiveFrom,
  createdAt: bandConversionTables.createdAt,
  rowCount,
  used: usedCount,
};

export async function listTables(skill?: BandSkillName) {
  const rows = await getDb()
    .select(selectCols)
    .from(bandConversionTables)
    .where(skill ? eq(bandConversionTables.skill, skill) : undefined)
    .orderBy(asc(bandConversionTables.skill), desc(bandConversionTables.createdAt), desc(bandConversionTables.id));
  return rows.map(listItem);
}

export async function getTable(tableId: string) {
  const db = getDb();
  const [t] = await db
    .select({ ...selectCols, sourceNote: bandConversionTables.sourceNote })
    .from(bandConversionTables)
    .where(eq(bandConversionTables.id, tableId))
    .limit(1);
  if (!t) throw notFound();
  return { ...listItem(t), source_note: t.sourceNote, rows: await rowsOf(db, t.id) };
}

const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
};

export async function createTable(actorId: string, body: CreateBandTableBody, ipHash?: string) {
  const issues = validateBandRows(body.rows);
  if (issues.length > 0) {
    const details: ErrorDetail[] = issues.map((i) => ({ path: i.path, code: i.code, message: i.message }));
    throw new ApiError('VALIDATION_ERROR', { details });
  }
  const sorted = [...body.rows].sort((a, b) => a.raw_min - b.raw_min);
  try {
    return await getDb().transaction(async (tx) => {
      const [dup] = await tx
        .select({ id: bandConversionTables.id })
        .from(bandConversionTables)
        .where(and(eq(bandConversionTables.skill, body.skill), eq(bandConversionTables.versionLabel, body.version_label)))
        .limit(1);
      if (dup) throw new ApiError('VERSION_LABEL_TAKEN');
      const [t] = await tx
        .insert(bandConversionTables)
        .values({ skill: body.skill, versionLabel: body.version_label, sourceNote: body.source_note ?? null, isActive: false, createdBy: actorId })
        .returning();
      await tx
        .insert(bandConversionRows)
        .values(sorted.map((r) => ({ tableId: t!.id, rawMin: r.raw_min, rawMax: r.raw_max, band: r.band.toFixed(1) })));
      await writeAudit(tx, {
        actorUserId: actorId,
        action: 'BAND_TABLE_CREATED',
        entityType: 'band_table',
        entityId: t!.id,
        metadata: { skill: body.skill, version_label: body.version_label, row_count: sorted.length },
        ipHash,
      });
      return { id: t!.id, skill: body.skill, version_label: t!.versionLabel, is_active: false, row_count: sorted.length };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError('VERSION_LABEL_TAKEN'); // balapan dua pembuatan dengan label sama
    throw err;
  }
}

export async function activateTable(actorId: string, tableId: string, ipHash?: string) {
  return getDb().transaction(async (tx) => {
    const [probe] = await tx.select({ skill: bandConversionTables.skill }).from(bandConversionTables).where(eq(bandConversionTables.id, tableId)).limit(1);
    if (!probe) throw notFound();
    // Serialkan aktivasi per skill; indeks unik parsial tetap menjadi jaring pengaman terakhir.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`band_activate:${probe.skill}`}, 0))`);
    const [t] = await tx.select().from(bandConversionTables).where(eq(bandConversionTables.id, tableId)).limit(1).for('update');
    if (!t) throw notFound();
    if (t.isActive) throw new ApiError('ALREADY_ACTIVE');
    const prev = await tx
      .update(bandConversionTables)
      .set({ isActive: false })
      .where(and(eq(bandConversionTables.skill, t.skill), eq(bandConversionTables.isActive, true)))
      .returning({ id: bandConversionTables.id });
    const [now] = await tx
      .update(bandConversionTables)
      .set({ isActive: true, effectiveFrom: sql`now()` })
      .where(eq(bandConversionTables.id, tableId))
      .returning();
    await writeAudit(tx, {
      actorUserId: actorId,
      action: 'BAND_TABLE_ACTIVATE',
      entityType: 'band_table',
      entityId: tableId,
      metadata: { skill: t.skill, version_label: t.versionLabel, previous_table_id: prev[0]?.id ?? null },
      ipHash,
    });
    return { id: now!.id, skill: now!.skill, is_active: true, effective_from: now!.effectiveFrom ? now!.effectiveFrom.toISOString() : null };
  });
}

export async function deleteTable(actorId: string, tableId: string, ipHash?: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [t] = await tx.select().from(bandConversionTables).where(eq(bandConversionTables.id, tableId)).limit(1).for('update');
    if (!t) throw notFound();
    // Dirujuk lewat kolom atau tercantum di result_json attempt mana pun (spec 010/011/014 menyimpan id tabel di sana).
    const ref = await tx.execute(sql`
      SELECT 1 FROM attempts
      WHERE band_table_id = ${tableId}::uuid OR result_json::text LIKE ${`%${tableId}%`}
      LIMIT 1`);
    if (t.isActive || ref.rows.length > 0) throw new ApiError('BAND_TABLE_IN_USE');
    await tx.delete(bandConversionTables).where(eq(bandConversionTables.id, tableId));
    await writeAudit(tx, {
      actorUserId: actorId,
      action: 'BAND_TABLE_DELETED',
      entityType: 'band_table',
      entityId: tableId,
      metadata: { skill: t.skill, version_label: t.versionLabel },
      ipHash,
    });
  });
}
