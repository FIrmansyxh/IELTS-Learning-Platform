/**
 * Titik pendaftaran hook lintas spec. Diimpor (side-effect) oleh service yang memicu hook.
 * Spec 016 mendaftarkan gamifikasi di sini.
 */
import type { Tx } from './db';
import { initializeProgress } from './gatekeeping/service';
import { userCreatedHooks } from './auth/hooks';
import { attemptCompletedHooks } from './attempts/hooks';
import { activityHooks, type ActivityEvent } from './activity/hooks';
import { evaluationGradedHooks } from './ai/hooks';
import {
  ensureUserStats,
  gamificationHook,
  handleMiniTaskGamification,
  recordActivity,
} from './gamification/service';
import {
  skillScoreEvaluationHook,
  skillScoreHook,
} from './skills/service';
import { reviewScheduleHook } from './review/service';

if (!userCreatedHooks.includes(onUserCreated)) userCreatedHooks.push(onUserCreated);

async function onUserCreated(tx: Parameters<typeof initializeProgress>[0], user: { id: string }) {
  await initializeProgress(tx, user.id);
  await ensureUserStats(tx, user.id);
}

if (!attemptCompletedHooks.includes(gamificationHook)) {
  attemptCompletedHooks.push(gamificationHook);
}

if (!attemptCompletedHooks.includes(skillScoreHook)) {
  attemptCompletedHooks.push(skillScoreHook);
}

// SPEC-026: jadwal pengulangan berjarak dari jawaban Active Drill / Latihan campur.
if (!attemptCompletedHooks.includes(reviewScheduleHook)) {
  attemptCompletedHooks.push(reviewScheduleHook);
}

if (!evaluationGradedHooks.includes(skillScoreEvaluationHook)) {
  evaluationGradedHooks.push(skillScoreEvaluationHook);
}

async function onActivity(tx: Tx, event: ActivityEvent) {
  // DRILL_SUBMIT dicatat oleh gamificationHook (semua cabangnya memanggil recordActivity). Mencatat di sini
  // lebih dulu membuat poin harian terkredit sebelum hook, sehingga AttemptResultDTO.points.daily jadi 0.
  if (event.kind === 'DRILL_SUBMIT') return;
  if (event.kind === 'MINI_TASK_COMPLETE' && event.subModuleId) {
    await handleMiniTaskGamification(tx, event.userId, event.subModuleId);
  } else {
    await recordActivity(tx, event.userId);
  }
}

if (!activityHooks.includes(onActivity)) {
  activityHooks.push(onActivity);
}
