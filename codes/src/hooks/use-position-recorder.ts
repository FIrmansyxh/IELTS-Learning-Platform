'use client';

import * as React from 'react';
import type { LearnSubtabType } from '@/contracts/player';
import type { UpdateLastLearnedRequest } from '@/contracts/resume';
import { isApiError } from '@/lib/api/client';
import { resumeApi } from '@/lib/api/resume';

export type PositionInput = {
  activeTab: 'LEARN' | 'DRILL' | 'MINI_TASK';
  subtab?: LearnSubtabType | null;
  videoId?: string | null;
  videoSec?: number;
  questionIndex?: number | null;
  attemptId?: string | null;
};

const VIDEO_DEBOUNCE_MS = 5000;
const MIN_GAP_MS = 2500; // bucket heartbeat 30/menit/user (dibagi dengan learn-progress)
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Normalisasi sisi klien selaras aturan server (field yang tidak relevan dikirim null/0). */
export function buildPositionBody(subModuleId: string, p: PositionInput): UpdateLastLearnedRequest {
  const learn = p.activeTab === 'LEARN';
  const isVideo = learn && p.subtab === 'VIDEO';
  const videoId = isVideo && p.videoId && VIDEO_ID_RE.test(p.videoId) ? p.videoId : null;
  return {
    sub_module_id: subModuleId,
    active_tab: p.activeTab,
    active_learn_subtab: learn ? (p.subtab ?? null) : null,
    active_video_id: videoId,
    video_progress_sec: isVideo ? Math.max(0, Math.min(21600, Math.floor(p.videoSec ?? 0))) : 0,
    last_question_index:
      p.activeTab === 'DRILL' && p.questionIndex != null ? Math.max(0, Math.min(199, p.questionIndex)) : null,
    active_attempt_id: p.activeTab === 'DRILL' ? (p.attemptId ?? null) : null,
  };
}

/**
 * Perekam posisi belajar (SPEC-007). Menyimpan posisi terakhir saja di memori; pembaruan video dibatasi
 * satu kali per 5 detik, perubahan tab/soal segera (dengan jarak minimum). Saat pagehide memakai
 * fetch keepalive. Kegagalan diam-diam diulang pada simpan berikutnya; 401 menghentikan pengiriman.
 */
export function usePositionRecorder(subModuleId: string | null) {
  const pending = React.useRef<UpdateLastLearnedRequest | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = React.useRef(0);
  const stopped = React.useRef(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const send = React.useCallback((keepalive = false) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const body = pending.current;
    if (!body || stopped.current) return;
    pending.current = null;
    lastSent.current = Date.now();
    resumeApi
      .update(body, keepalive)
      .then(() => setSavedAt(Date.now()))
      .catch((e: unknown) => {
        if (isApiError(e) && e.status === 401) {
          stopped.current = true;
          return;
        }
        // Simpan ulang hanya bila belum ada posisi yang lebih baru.
        if (!pending.current) pending.current = body;
      });
  }, []);

  const schedule = React.useCallback(
    (delay: number) => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        send();
      }, delay);
    },
    [send],
  );

  const record = React.useCallback(
    (p: PositionInput, opts: { throttle?: boolean } = {}) => {
      if (!subModuleId) return;
      pending.current = buildPositionBody(subModuleId, p);
      if (opts.throttle) {
        schedule(VIDEO_DEBOUNCE_MS);
        return;
      }
      const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastSent.current));
      if (wait === 0) send();
      else {
        // Perubahan segera menggantikan jadwal debounce yang lebih lama.
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        schedule(wait);
      }
    },
    [subModuleId, schedule, send],
  );

  React.useEffect(() => {
    const onHide = () => send(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send(true);
    };
    const onOnline = () => send();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      send(true);
    };
  }, [send]);

  return { record, savedAt };
}
