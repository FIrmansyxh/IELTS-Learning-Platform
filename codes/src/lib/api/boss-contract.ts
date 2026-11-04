import { z } from 'zod';
import { AttemptSchema } from '@/contracts/attempts';
import { IsoDateTime } from '@/contracts/common';
import { BossGateSchema, BossResultSchema, BossSkillSchema, SectionDTOSchema } from '@/contracts/exams';

/**
 * Skema Boss Stage (SPEC-014) di sisi klien. Bentuk bersama (`SectionDTO`, gerbang, hasil `boss`) dipakai dari
 * `src/contracts/exams.ts` (satu berkas dengan server); hanya blok yang belum ada di sana (intro `boss`, respons
 * `start`/`submit` section) didefinisikan di sini mengikuti `specifications/014_spec_boss_stage.md`. Drift TIDAK
 * ditambal di klien: respons yang tidak cocok melempar `RESPONSE_INVALID`.
 */
export const BossSkill = BossSkillSchema;
export type BossSkillName = z.infer<typeof BossSkill>;

export const SectionSchema = SectionDTOSchema;
export type Section = z.infer<typeof SectionSchema>;
export const SectionsSchema = z.array(SectionSchema);

export const GateSchema = BossGateSchema;
export type Gate = z.infer<typeof GateSchema>;

export { BossResultSchema };
export type BossResult = z.infer<typeof BossResultSchema>;
export type BossResultSection = BossResult['sections'][number];

/** Blok `boss` pada GET /exams/{id}/intro. */
export const BossIntroSchema = z.object({
  tier_number: z.number().int(),
  gate: GateSchema,
  sections: SectionsSchema,
  total_time_limit_seconds: z.number().int(),
  last_result: z.object({ passed: z.boolean(), score_percent: z.number(), boss_band: z.number(), at: IsoDateTime }).nullable(),
  advisory_note: z.string(),
});
export type BossIntro = z.infer<typeof BossIntroSchema>;

/** POST /attempts/{id}/sections/{section}/start. */
export const StartSectionResponseSchema = z.object({
  data: z.object({
    section: SectionSchema,
    passage_markdown: z.string().nullable(),
    listening: AttemptSchema.shape.listening,
    questions: AttemptSchema.shape.questions,
    answers: AttemptSchema.shape.answers,
    server_now: IsoDateTime,
  }),
});
export type StartSectionData = z.infer<typeof StartSectionResponseSchema>['data'];

/** POST /attempts/{id}/sections/{section}/submit. */
export const SubmitSectionResponseSchema = z.object({
  data: z.object({ section: SectionSchema, next_section: SectionSchema.nullable() }),
});
export type SubmitSectionData = z.infer<typeof SubmitSectionResponseSchema>['data'];
