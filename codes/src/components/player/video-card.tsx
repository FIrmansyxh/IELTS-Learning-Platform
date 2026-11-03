'use client';

import { ExternalLink, VideoOff } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { VideoItem } from '@/contracts/player';
import { fmt, id } from '@/i18n/id';
import { formatClock } from '@/lib/format';
import {
  effectiveEnd,
  effectiveStart,
  loadYouTubeApi,
  VIDEO_ID_RE,
  YT_STATE,
  youtubeWatchUrl,
  type YTPlayer,
} from './youtube';

const POSITION_INTERVAL_MS = 5000;
const READY_TIMEOUT_MS = 15000;

type Status = 'loading' | 'ready' | 'error';

/**
 * Pemutar YouTube (IFrame API). URL embed dibangun HANYA dari `video_id` yang lolos regex; host nocookie.
 * Posisi dilaporkan tiap 5 detik saat PLAYING dan saat dijeda/selesai.
 */
export function VideoCard({
  video,
  resumeAt,
  onPlayingChange,
  onPosition,
}: {
  video: VideoItem;
  /** Detik lanjut dari SPEC-007 (query `t`). */
  resumeAt: number | null;
  onPlayingChange: (videoId: string, playing: boolean) => void;
  onPosition: (videoId: string, seconds: number) => void;
}) {
  const valid = VIDEO_ID_RE.test(video.video_id);
  const [status, setStatus] = React.useState<Status>(valid ? 'loading' : 'error');
  const [retryKey, setRetryKey] = React.useState(0);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const cbRef = React.useRef({ onPlayingChange, onPosition });
  cbRef.current = { onPlayingChange, onPosition };

  const start = effectiveStart(video.start_sec, video.end_sec, resumeAt);
  const end = effectiveEnd(video.start_sec, video.end_sec);
  const videoId = video.video_id;
  const title = video.title;

  React.useEffect(() => {
    if (!VIDEO_ID_RE.test(videoId)) {
      setStatus('error');
      return;
    }
    if (end === null && video.end_sec != null) {
      console.warn('video end_sec <= start_sec; memutar tanpa end', videoId);
    }
    let cancelled = false;
    let player: YTPlayer | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    setStatus('loading');

    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const current = () => {
      try {
        return Math.floor(player?.getCurrentTime() ?? 0);
      } catch {
        return 0;
      }
    };

    loadYouTubeApi()
      .then((YT) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        const mount = document.createElement('div');
        host.replaceChildren(mount);
        readyTimer = setTimeout(() => {
          if (!cancelled) setStatus((s) => (s === 'ready' ? s : 'error'));
        }, READY_TIMEOUT_MS);
        player = new YT.Player(mount, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            start,
            ...(end !== null ? { end } : {}),
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              if (readyTimer) clearTimeout(readyTimer);
              try {
                player?.getIframe().setAttribute('title', fmt(id.player.video.iframeTitle, { title }));
              } catch {
                /* iframe belum siap */
              }
              setStatus('ready');
            },
            onStateChange: (e) => {
              if (cancelled) return;
              if (e.data === YT_STATE.PLAYING) {
                cbRef.current.onPlayingChange(videoId, true);
                stopPoll();
                poll = setInterval(() => cbRef.current.onPosition(videoId, current()), POSITION_INTERVAL_MS);
              } else if (e.data === YT_STATE.PAUSED || e.data === YT_STATE.ENDED) {
                stopPoll();
                cbRef.current.onPlayingChange(videoId, false);
                cbRef.current.onPosition(videoId, current());
              }
            },
            onError: () => {
              if (!cancelled) setStatus('error');
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      stopPoll();
      if (readyTimer) clearTimeout(readyTimer);
      cbRef.current.onPlayingChange(videoId, false);
      try {
        player?.destroy();
      } catch {
        /* sudah dibongkar */
      }
    };
    // `video.end_sec` hanya dipakai untuk peringatan; efek bergantung pada nilai efektif.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, title, start, end, retryKey]);

  const label =
    end !== null
      ? fmt(id.player.video.section, { from: formatClock(video.start_sec), to: formatClock(end) })
      : fmt(id.player.video.sectionOpen, { from: formatClock(video.start_sec) });

  return (
    <figure className="grid gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
        {status === 'error' ? (
          <div role="alert" className="absolute inset-0 grid place-content-center justify-items-center gap-3 p-4 text-center">
            <VideoOff className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">{id.player.video.failed}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {valid ? (
                <Button asChild variant="outline" size="sm">
                  <a href={youtubeWatchUrl(videoId, start)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden="true" />
                    {id.player.video.openYoutube}
                  </a>
                </Button>
              ) : null}
              {valid ? (
                <Button variant="secondary" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
                  {id.common.retry}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {status === 'loading' ? (
              <Skeleton className="absolute inset-0 rounded-none" role="status" aria-label={id.player.video.loading} />
            ) : null}
            <div ref={hostRef} className="absolute inset-0 [&_iframe]:size-full" />
          </>
        )}
      </div>
      <figcaption className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{video.title}</span>
        {' · '}
        {label}
        {video.instructor_channel ? ` · ${fmt(id.player.video.channel, { name: video.instructor_channel })}` : ''}
      </figcaption>
    </figure>
  );
}
