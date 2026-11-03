'use client';

import * as React from 'react';
import type { LearnSubtabType } from '@/contracts/player';

const INTERACTION_WINDOW_MS = 60_000;
const FLUSH_EVERY_SEC = 15;
const MAX_PER_PING = 30;
const INTERACTION_EVENTS = ['scroll', 'click', 'keydown', 'pointerdown', 'touchstart', 'wheel'] as const;

export type FlushFn = (subtab: LearnSubtabType, seconds: number, keepalive: boolean) => Promise<unknown>;

/**
 * Penghitung waktu belajar aktif (SPEC-005 langkah 6). Detik bertambah hanya saat tab terlihat DAN
 * ada interaksi (scroll/klik/tombol) dalam 60 detik terakhir ATAU video sedang PLAYING.
 * Dikirim tiap 15 detik, saat pindah sub-tab, dan saat pagehide. Kegagalan jaringan diam: detik dikembalikan
 * ke penampung dan dicoba pada ping berikutnya (tanpa Toast).
 */
export function useActiveLearnTimer({
  enabled,
  subtab,
  onFlush,
}: {
  enabled: boolean;
  subtab: LearnSubtabType;
  onFlush: FlushFn;
}) {
  const acc = React.useRef(0);
  const sinceFlush = React.useRef(0);
  const lastInteraction = React.useRef(Date.now());
  const videoPlaying = React.useRef(false);
  const inFlight = React.useRef(false);
  const subtabRef = React.useRef(subtab);
  const flushRef = React.useRef(onFlush);
  subtabRef.current = subtab;
  flushRef.current = onFlush;

  const flush = React.useCallback((forSubtab?: LearnSubtabType, keepalive = false) => {
    if (acc.current < 1) return;
    if (inFlight.current && !keepalive) return;
    const seconds = Math.min(Math.floor(acc.current), MAX_PER_PING);
    acc.current -= seconds;
    inFlight.current = true;
    Promise.resolve(flushRef.current(forSubtab ?? subtabRef.current, seconds, keepalive))
      .catch(() => {
        acc.current += seconds;
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    lastInteraction.current = Date.now();
    const touch = () => {
      lastInteraction.current = Date.now();
    };
    for (const ev of INTERACTION_EVENTS) window.addEventListener(ev, touch, { capture: true, passive: true });

    const tick = setInterval(() => {
      const visible = document.visibilityState === 'visible';
      const interacted = Date.now() - lastInteraction.current <= INTERACTION_WINDOW_MS;
      if (visible && (videoPlaying.current || interacted)) {
        acc.current += 1;
        sinceFlush.current += 1;
      }
      if (sinceFlush.current >= FLUSH_EVERY_SEC) {
        sinceFlush.current = 0;
        flush();
      }
    }, 1000);

    const onHide = () => flush(undefined, true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(tick);
      for (const ev of INTERACTION_EVENTS) window.removeEventListener(ev, touch, { capture: true });
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flush(undefined, true);
    };
  }, [enabled, flush]);

  /** Dipanggil sebelum sub-tab berganti agar detik tercatat pada sub-tab yang benar. */
  const flushFor = React.useCallback((prev: LearnSubtabType) => flush(prev), [flush]);
  const setVideoPlaying = React.useCallback((playing: boolean) => {
    videoPlaying.current = playing;
  }, []);

  return { flushFor, setVideoPlaying };
}
