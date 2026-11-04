import type { z } from 'zod';
import { BandPredictionSchema, ExamHistoryItemSchema } from '@/contracts/skills';

/** Skema SPEC-017 berasal dari `src/contracts/skills.ts` (satu berkas dengan server); modul ini hanya alias tipe. */
export {
  BandPredictionsResponseSchema,
  ExamHistoryResponseSchema,
  ExamHistoryType,
  RADAR_ORDER,
  RadarResponseSchema,
  RadarSkill,
} from '@/contracts/skills';
export type { PredictionDTO as Prediction, RadarDTO as Radar, RadarSkillName, SkillScoreDTO as SkillScore } from '@/contracts/skills';
export type BandPrediction = z.infer<typeof BandPredictionSchema>;
export type ExamHistoryItem = z.infer<typeof ExamHistoryItemSchema>;
