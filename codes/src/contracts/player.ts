import { z } from 'zod';
import { IsoDateTime, ProgressStatus, SkillCategory, Uuid } from './common';

/** Skema pemutar materi (SPEC-005). Klien longgar terhadap kunci tambahan (z.object), ketat pada bentuk yang dipakai. */
export const LearnSubtab = z.enum(['ARTICLE', 'VIDEO', 'SLIDES']);
export const MiniTaskType = z.enum(['AI_SHORT_WRITING', 'AI_SHORT_SPEAKING', 'SELF_CHECK']);
export const MasteryCrownLevel = z.enum(['NONE', 'SILVER', 'GOLD']);

export const VideoDTO = z.object({
  asset_id: Uuid,
  video_id: z.string(),
  title: z.string(),
  instructor_channel: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  start_sec: z.number().int().min(0),
  end_sec: z.number().int().min(0).nullable().optional(),
});

export const SlideDTO = z.object({
  asset_id: Uuid,
  order: z.number().int(),
  caption: z.string().nullable().optional(),
  alt: z.string(),
  url: z.string(),
});

export const AttachmentDTO = z.object({
  asset_id: Uuid,
  title: z.string(),
  file_type: z.enum(['PDF', 'DOCX']),
  size_bytes: z.number().int(),
  url: z.string(),
});

export const MiniTaskDTO = z.object({
  task_type: MiniTaskType,
  prompt: z.string(),
  success_criteria: z.string().nullable().optional(),
});

export const LearnProgressDTO = z.object({
  status: ProgressStatus,
  progress_percent: z.number().int().min(0).max(100),
  learn_completed_at: IsoDateTime.nullable(),
  mini_task_completed_at: IsoDateTime.nullable(),
  best_score_percent: z.number(),
  mastery_crown: MasteryCrownLevel,
  learn_active_seconds: z.number().int(),
  learn_visited_subtabs: z.array(LearnSubtab),
  learn_ready: z.boolean(),
  /** Aditif (W2): ambang `learn.min_active_seconds` dari server; klien lama boleh mengabaikan. */
  min_active_seconds: z.number().int().optional(),
});

export const DrillInfoDTO = z.object({
  assessment_set_id: Uuid.nullable(),
  question_count: z.number().int(),
  time_limit_seconds: z.number().int(),
  pass_percent: z.number(),
  can_start: z.boolean(),
  blocked_reason: z.enum(['LEARN_NOT_COMPLETED', 'NO_DRILL_PUBLISHED']).nullable(),
});

export const SubModuleDetailDTO = z.object({
  sub_module: z.object({
    id: Uuid,
    sub_module_code: z.string(),
    title: z.string(),
    passing_score_percent: z.number(),
    content_version: z.number().int(),
    module: z.object({
      id: Uuid,
      module_code: z.string(),
      title: z.string(),
      skill_category: SkillCategory,
    }),
    tier: z.object({ id: Uuid, tier_number: z.number().int(), title: z.string() }),
  }),
  material: z.object({
    article_markdown: z.string(),
    videos: z.array(VideoDTO),
    slides: z.array(SlideDTO),
    attachments: z.array(AttachmentDTO),
    mini_task: MiniTaskDTO.nullable(),
    attribution_text: z.string().nullable(),
  }),
  progress: LearnProgressDTO,
  drill: DrillInfoDTO,
  navigation: z.object({
    prev_sub_module_code: z.string().nullable(),
    next_sub_module_code: z.string().nullable(),
  }),
});

export const SubModuleDetailResponseSchema = z.object({ data: SubModuleDetailDTO });

export const LearnProgressRequestSchema = z.strictObject({
  subtab: LearnSubtab,
  active_seconds: z.number().int().min(1).max(30),
});
export const LearnProgressResponseSchema = z.object({
  data: z.object({
    learn_active_seconds: z.number().int(),
    learn_visited_subtabs: z.array(LearnSubtab),
    learn_ready: z.boolean(),
  }),
});

export const LearnCompleteResponseSchema = z.object({
  data: z.object({ learn_completed_at: IsoDateTime, drill_can_start: z.boolean() }),
});

export const MiniTaskCompleteResponseSchema = z.object({
  data: z.object({ mini_task_completed_at: IsoDateTime }),
});

export type SubModuleDetail = z.infer<typeof SubModuleDetailDTO>;
export type LearnSubtabType = z.infer<typeof LearnSubtab>;
export type VideoItem = z.infer<typeof VideoDTO>;
export type SlideItem = z.infer<typeof SlideDTO>;
export type AttachmentItem = z.infer<typeof AttachmentDTO>;
export type LearnProgressState = z.infer<typeof LearnProgressDTO>;
