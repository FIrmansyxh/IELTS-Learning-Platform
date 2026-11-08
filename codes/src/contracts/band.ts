import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';

/** Skema konverter band (SPEC-009). */
export const BandSkill = z.enum(['LISTENING', 'READING_ACADEMIC', 'READING_GENERAL']);
export type BandSkillName = z.infer<typeof BandSkill>;

export const BandRowSchema = z.object({
  raw_min: z.number().int().min(0).max(40),
  raw_max: z.number().int().min(0).max(40),
  band: z.number().min(0).max(9).multipleOf(0.5),
});
export type BandRow = z.infer<typeof BandRowSchema>;

const ActiveTable = z.object({
  table_id: Uuid,
  version_label: z.string(),
  source_note: z.string().nullable(),
  rows: z.array(BandRowSchema),
});
export const ActiveBandTablesResponseSchema = z.object({
  data: z.object({ listening: ActiveTable, reading_academic: ActiveTable, reading_general: ActiveTable, disclaimer: z.string() }),
});
export type ActiveBandTables = z.infer<typeof ActiveBandTablesResponseSchema>['data'];

export const BandTableListItemSchema = z.object({
  id: Uuid,
  skill: BandSkill,
  version_label: z.string(),
  is_active: z.boolean(),
  effective_from: IsoDateTime.nullable(),
  row_count: z.number().int(),
  used_by_attempts: z.number().int(),
  created_at: IsoDateTime,
});
export type BandTableListItem = z.infer<typeof BandTableListItemSchema>;
export const BandTableListResponseSchema = z.object({ data: z.array(BandTableListItemSchema) });

export const CreateBandTableRequestSchema = z.strictObject({
  skill: BandSkill,
  version_label: z.string().trim().min(1).max(60),
  source_note: z.string().max(500).optional(),
  rows: z.array(BandRowSchema).min(1).max(41),
});
export type CreateBandTableRequest = z.infer<typeof CreateBandTableRequestSchema>;

export const CreateBandTableResponseSchema = z.object({
  data: z.object({ id: Uuid, skill: BandSkill, version_label: z.string(), is_active: z.boolean(), row_count: z.number().int() }),
});
export const ActivateBandTableResponseSchema = z.object({
  data: z.object({ id: Uuid, skill: BandSkill, is_active: z.boolean(), effective_from: IsoDateTime.nullable() }),
});

/**
 * Body POST /admin/band-tables sebagaimana diterima server (SPEC-009). Aturan rentang/band/cakupan diperiksa server
 * agar kode detail kontrak (range_invalid, band_invalid, coverage_gap, ...) yang dikembalikan, bukan kode Zod generik.
 * Ditambahkan Backend; CreateBandTableRequestSchema milik Frontend tidak diubah.
 */
export const CreateBandTableBodySchema = z.strictObject({
  skill: BandSkill,
  version_label: z.string().trim().min(1).max(60),
  source_note: z.string().max(500).optional(),
  rows: z
    .array(z.strictObject({ raw_min: z.number(), raw_max: z.number(), band: z.number() }))
    .min(1)
    .max(41),
});
export type CreateBandTableBody = z.infer<typeof CreateBandTableBodySchema>;

export const BandTableIdParamSchema = z.strictObject({ table_id: Uuid });
export const BandTableListQuerySchema = z.strictObject({ skill: BandSkill.optional() });
