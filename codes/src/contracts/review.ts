import { z } from 'zod';

/** Kontrak pengulangan berjarak (SPEC-026): `GET /api/v1/me/reviews`. */
export const ReviewSummarySchema = z.object({
  /** Soal terjadwal yang sudah jatuh tempo. */
  due_count: z.number().int(),
  /** Semua soal terjadwal yang belum dikuasai (termasuk yang jatuh tempo). */
  scheduled_count: z.number().int(),
  mastered_count: z.number().int(),
  /** Jatuh tempo terdekat di masa depan; null bila tidak ada. */
  next_due_at: z.iso.datetime().nullable(),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;
export const ReviewSummaryResponseSchema = z.object({ data: ReviewSummarySchema });

/** Batas soal per sesi ulang yang dikirim klien. */
export const REVIEW_SESSION_MAX = 20;
