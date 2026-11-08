import { z } from 'zod';
import { IsoDateTime, Uuid } from './common';
import { LearnSubtab } from './player';
import { ActiveTrackRefDTO } from './tracks';

/** Skema Resume Last Learned (SPEC-007). */
export const ResumeTab = z.enum(['LEARN', 'DRILL', 'MINI_TASK']);

export const UpdateLastLearnedRequestSchema = z.strictObject({
  sub_module_id: Uuid,
  active_tab: ResumeTab,
  active_learn_subtab: LearnSubtab.nullable().optional(),
  active_video_id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/)
    .nullable()
    .optional(),
  video_progress_sec: z.number().int().min(0).max(21600).optional(),
  last_question_index: z.number().int().min(0).max(199).nullable().optional(),
  active_attempt_id: Uuid.nullable().optional(),
});
export type UpdateLastLearnedRequest = z.infer<typeof UpdateLastLearnedRequestSchema>;

export const UpdateLastLearnedResponseSchema = z.object({ data: z.object({ updated_at: IsoDateTime }) });

export const ResumeCardDTO = z.object({
  state: z.enum(['RESUME', 'FALLBACK_NEXT']),
  sub_module: z.object({ id: Uuid, sub_module_code: z.string(), title: z.string() }),
  breadcrumb: z.object({ tier_label: z.string(), module_title: z.string() }),
  active_tab: ResumeTab,
  active_learn_subtab: LearnSubtab.nullable(),
  video_progress_sec: z.number().int(),
  last_question_index: z.number().int().nullable(),
  question_count: z.number().int().nullable(),
  position_label: z.string(),
  progress_percent: z.number().int().min(0).max(100),
  resume_path: z.string(),
  change_path: z.string(),
  updated_at: IsoDateTime.nullable().optional(),
  /** SPEC-021: jalur aktif (selalu ada dari server; `optional` di tipe agar fixture klien lama tetap valid). */
  active_track: ActiveTrackRefDTO.optional(),
});
export const ResumeCardResponseSchema = z.object({ data: ResumeCardDTO.nullable() });
export type ResumeCard = z.infer<typeof ResumeCardDTO>;
