import type { AssessmentTypeHandler } from '../attempts/handlers';
import { ApiError } from '../http/errors';

/**
 * Handler `MIX_PRACTICE` (SPEC-022 D6). Tidak ada gerbang dan tidak ada efek gatekeeping/Boss/Skip: sesi dibuat oleh
 * `POST /mix-sessions` (bukan `POST /attempts`), dan saat selesai hanya `skillScoreHook` yang menulis radar
 * (gamifikasi dilewati di hook-nya; `passed`/`band_score` NULL, `points_awarded` 0).
 */
export const mixPracticeHandler: AssessmentTypeHandler = {
  async start() {
    throw new ApiError('ASSESSMENT_TYPE_NOT_ENABLED');
  },
  async onFinish() {
    return { progress: null };
  },
};
