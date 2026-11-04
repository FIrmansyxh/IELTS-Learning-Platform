import { z } from 'zod';
import { ExamIntroFullSchema } from '@/contracts/exams';
import { BossIntroSchema } from './boss-contract';
import { apiFetch } from './client';
import { PlacementIntroSchema } from './placement-contract';

/**
 * Intro ujian untuk semua tipe: `ExamIntroFullSchema` (bersama dengan server; alasan terblokir Boss/Placement dan
 * `scope` Placement) ditambah blok `boss`/`placement` yang diketik di sisi klien.
 */
export const ExamIntroExtSchema = ExamIntroFullSchema.extend({
  boss: BossIntroSchema.nullable().optional(),
  placement: PlacementIntroSchema.nullable().optional(),
});
export type ExamIntroData = z.infer<typeof ExamIntroExtSchema>;
export const ExamIntroExtResponseSchema = z.object({ data: ExamIntroExtSchema });

export const examsApi = {
  intro: async (assessmentSetId: string, signal?: AbortSignal) =>
    (await apiFetch(`/exams/${assessmentSetId}/intro`, { schema: ExamIntroExtResponseSchema, signal })).data,
};
