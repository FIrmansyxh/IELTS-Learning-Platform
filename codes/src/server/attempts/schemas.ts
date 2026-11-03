import { z } from 'zod';
import { Uuid } from '@/contracts/common';

/**
 * Body PUT answers: hanya `response` (objek bebas); bentuk per tipe soal diperiksa server terhadap soal yang
 * DISAJIKAN (butuh state attempt). Field tingkat atas lain (`is_correct`, `time_spent_ms`, ...) ditolak `unrecognized_key`.
 */
export const SubmitAnswerBodySchema = z.strictObject({ response: z.record(z.string(), z.unknown()) });
export const AttemptIdParamSchema = z.strictObject({ attempt_id: Uuid });
export const AnswerParamsSchema = z.strictObject({ attempt_id: Uuid, question_id: z.string().min(1).max(40) });
