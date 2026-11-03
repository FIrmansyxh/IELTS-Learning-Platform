/** Pemuat YouTube IFrame API (security-standards 3.2: URL embed dibangun hanya dari video_id tervalidasi). */
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const API_SRC = 'https://www.youtube.com/iframe_api';

export type YTPlayer = {
  destroy(): void;
  getCurrentTime(): number;
  getIframe(): HTMLIFrameElement;
};
export type YTPlayerOptions = {
  host: string;
  videoId: string;
  width?: string;
  height?: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
    onError?: (e: { data: number }) => void;
  };
};
export type YTNamespace = { Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer };

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2 } as const;

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YT missing'));
    };
    const s = document.createElement('script');
    s.src = API_SRC;
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      s.remove();
      reject(new Error('script load failed'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export function youtubeWatchUrl(videoId: string, startSec: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.floor(startSec))}s`;
}

/**
 * Detik mulai efektif. `resumeAt` (SPEC-007) dipakai bila berada dalam rentang bagian video;
 * bila melebihi `end_sec` kembali ke `start_sec`.
 */
export function effectiveStart(startSec: number, endSec: number | null | undefined, resumeAt: number | null): number {
  if (resumeAt === null || resumeAt <= startSec) return startSec;
  if (endSec != null && endSec > startSec && resumeAt > endSec) return startSec;
  return resumeAt;
}

/** `end_sec` yang tidak lebih besar dari `start_sec` (data korup) diabaikan. */
export function effectiveEnd(startSec: number, endSec: number | null | undefined): number | null {
  if (endSec == null) return null;
  return endSec > startSec ? endSec : null;
}
