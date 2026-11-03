import {
  LearnCompleteResponseSchema,
  LearnProgressResponseSchema,
  MiniTaskCompleteResponseSchema,
  SubModuleDetailResponseSchema,
  type LearnSubtabType,
} from '@/contracts/player';
import { apiFetch } from './client';

export const playerApi = {
  detail: async (code: string, signal?: AbortSignal) =>
    (await apiFetch(`/sub-modules/${encodeURIComponent(code)}`, { schema: SubModuleDetailResponseSchema, signal })).data,

  /** Heartbeat bukti belajar. Klien hanya mengirim subtab dan detik; server yang meng-clamp. */
  learnProgress: async (subModuleId: string, body: { subtab: LearnSubtabType; active_seconds: number }, keepalive = false) =>
    (
      await apiFetch(`/sub-modules/${subModuleId}/learn-progress`, {
        method: 'POST',
        body,
        keepalive,
        schema: LearnProgressResponseSchema,
      })
    ).data,

  learnComplete: async (subModuleId: string) =>
    (await apiFetch(`/sub-modules/${subModuleId}/learn-complete`, { method: 'POST', schema: LearnCompleteResponseSchema })).data,

  miniTaskComplete: async (subModuleId: string) =>
    (
      await apiFetch(`/sub-modules/${subModuleId}/mini-task/complete`, {
        method: 'POST',
        schema: MiniTaskCompleteResponseSchema,
      })
    ).data,
};
