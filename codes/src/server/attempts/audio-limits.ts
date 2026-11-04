/**
 * Batas aliran audio serentak per pengguna (SPEC-011; QA F-11-02). In-memory per proses, sama seperti rate limit
 * (`server/http/rate-limit.ts`): cukup untuk host tunggal MVP. Slot dilepas saat aliran selesai, dibatalkan klien, atau galat;
 * slot yang tertinggal (mis. respons tak pernah dibaca) kedaluwarsa otomatis setelah `SLOT_TTL_MS`.
 */
import { ApiError } from '../http/errors';

export const MAX_CONCURRENT_AUDIO_STREAMS = 4;
export const SLOT_TTL_MS = 15 * 60_000;

const slots = new Map<string, Map<symbol, number>>();

/** Ambil satu slot; melempar 429 RATE_LIMITED (+ Retry-After) bila pengguna sudah memegang batas maksimum. */
export function acquireAudioSlot(userId: string, now = Date.now()): () => void {
  let mine = slots.get(userId);
  if (!mine) {
    mine = new Map();
    slots.set(userId, mine);
  }
  for (const [token, at] of mine) if (now - at > SLOT_TTL_MS) mine.delete(token);
  if (mine.size >= MAX_CONCURRENT_AUDIO_STREAMS) {
    throw new ApiError('RATE_LIMITED', { headers: { 'Retry-After': '2' } });
  }
  const token = Symbol('audio-slot');
  mine.set(token, now);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const m = slots.get(userId);
    if (!m) return;
    m.delete(token);
    if (m.size === 0) slots.delete(userId);
  };
}

/** Bungkus aliran agar slot dilepas tepat sekali saat selesai / dibatalkan / galat. */
export function releaseOnEnd(body: ReadableStream<Uint8Array>, release: () => void): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          release();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (e) {
        release();
        controller.error(e);
      }
    },
    async cancel(reason) {
      release();
      await reader.cancel(reason);
    },
  });
}

/** Hanya untuk pengujian. */
export function resetAudioSlots(): void {
  slots.clear();
}
export function activeAudioStreams(userId: string): number {
  return slots.get(userId)?.size ?? 0;
}
