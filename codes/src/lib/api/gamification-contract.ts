import { z } from 'zod';
import { PointEntryDTO, PointsResponseSchema as ServerPointsResponseSchema, StatsDTO } from '@/contracts/gamification';

/** Skema SPEC-016 berasal dari `src/contracts/gamification.ts` (satu berkas dengan server); modul ini hanya alias tipe. */
export { GamificationBlockSchema, PointSource, StatsResponseSchema } from '@/contracts/gamification';
export type { GamificationBlock } from '@/contracts/gamification';
export type Stats = z.infer<typeof StatsDTO>;

/**
 * Riwayat poin dibaca TOLERAN terhadap tipe ledger yang belum dikenal klien (mis. `ADJUSTMENT`, F-16-04): `source` berupa
 * string bebas sehingga satu baris asing tidak menggagalkan seluruh daftar. Tampilan memakai label umum untuk tipe asing.
 */
export const PointsListResponseSchema = z.object({
  data: z.array(PointEntryDTO.extend({ source: z.string() })),
  meta: ServerPointsResponseSchema.shape.meta,
});
export type PointEntry = z.infer<typeof PointsListResponseSchema>['data'][number];
