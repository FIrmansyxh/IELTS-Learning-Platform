import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { sha256Hex } from '../content/validate';

export const ListeningReviewSchema = z.strictObject({
  part_code: z.string().min(1),
  reviewer: z.string().min(1).max(40),
  reviewed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clarity: z.number().int().min(1).max(5),
  speed: z.number().int().min(1).max(5),
  naturalness: z.number().int().min(1).max(5),
  answer_leak: z.boolean(),
  approved: z.boolean(),
  script_sha256: z.string().length(64),
  audio_sha256: z.string().length(64),
  notes: z.string().max(1000).optional(),
});

export type ListeningReview = z.infer<typeof ListeningReviewSchema>;

export interface ReviewValidationResult {
  valid: boolean;
  code?: 'listening_review_missing' | 'listening_review_stale';
  reason?: string;
  review?: ListeningReview;
}

/**
 * Validasi gerbang review audio listening (SPEC-024 D6).
 * Sah bila:
 * - Berkas review ditemukan dan lolos schema
 * - approved === true
 * - clarity >= 4
 * - speed >= 3
 * - answer_leak === false
 * - script_sha256 cocok dengan hash naskah saat ini (bila skrip ada)
 * - audio_sha256 cocok dengan hash audio saat ini
 */
export async function validateListeningReview(params: {
  reviewFilePath: string;
  expectedPartCode: string;
  currentAudioBuffer?: Buffer;
  currentScriptBuffer?: Buffer;
}): Promise<ReviewValidationResult> {
  const { reviewFilePath, expectedPartCode, currentAudioBuffer, currentScriptBuffer } = params;

  let rawContent: string;
  try {
    rawContent = await readFile(reviewFilePath, 'utf8');
  } catch {
    return {
      valid: false,
      code: 'listening_review_missing',
      reason: `Berkas review tidak ditemukan di ${reviewFilePath}`,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch {
    return {
      valid: false,
      code: 'listening_review_stale',
      reason: `Berkas review bukan format JSON yang valid.`,
    };
  }

  const parseResult = ListeningReviewSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    return {
      valid: false,
      code: 'listening_review_stale',
      reason: `Format berkas review tidak sesuai skema: ${parseResult.error.message}`,
    };
  }

  const review = parseResult.data;

  if (review.part_code !== expectedPartCode) {
    return {
      valid: false,
      code: 'listening_review_missing',
      reason: `part_code pada review '${review.part_code}' tidak cocok dengan '${expectedPartCode}'.`,
    };
  }

  if (!review.approved) {
    return {
      valid: false,
      code: 'listening_review_stale',
      reason: `Review belum disetujui (approved: false).`,
      review,
    };
  }

  if (review.clarity < 4) {
    return {
      valid: false,
      code: 'listening_review_stale',
      reason: `Skor kejelasan (clarity: ${review.clarity}) kurang dari syarat minimal 4.`,
      review,
    };
  }

  if (review.speed < 3) {
    return {
      valid: false,
      code: 'listening_review_stale',
      reason: `Skor kecepatan (speed: ${review.speed}) kurang dari syarat minimal 3.`,
      review,
    };
  }

  if (review.answer_leak) {
    return {
      valid: false,
      code: 'listening_review_stale',
      reason: `Review menandai adanya kebocoran jawaban (answer_leak: true).`,
      review,
    };
  }

  if (currentAudioBuffer) {
    const audioHash = sha256Hex(currentAudioBuffer);
    if (audioHash !== review.audio_sha256) {
      return {
        valid: false,
        code: 'listening_review_stale',
        reason: `Hash audio tidak cocok (review: ${review.audio_sha256.slice(0, 8)}..., aktual: ${audioHash.slice(0, 8)}...). Diperlukan uji dengar ulang.`,
        review,
      };
    }
  }

  if (currentScriptBuffer) {
    const scriptHash = sha256Hex(currentScriptBuffer);
    if (scriptHash !== review.script_sha256) {
      return {
        valid: false,
        code: 'listening_review_stale',
        reason: `Hash skrip tidak cocok (review: ${review.script_sha256.slice(0, 8)}..., aktual: ${scriptHash.slice(0, 8)}...). Diperlukan uji dengar ulang.`,
        review,
      };
    }
  }

  return {
    valid: true,
    review,
  };
}
