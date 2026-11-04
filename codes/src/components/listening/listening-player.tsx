'use client';

import { CheckCircle2, CircleDashed, Headphones, Pause, Play, Rewind, Volume2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { formatClock } from '@/lib/format';
import { loadAudioPosition, saveAudioPosition } from '@/lib/reading/storage';
import { cn } from '@/lib/utils';

/** Lompatan `seeking` lebih dari ini (detik) dari posisi terakhir dikembalikan (mode ujian). */
export const SEEK_TOLERANCE_SEC = 1.5;
const TRACK_INTERVAL_MS = 500;
const PERSIST_EVERY_MS = 1000;

type Status = 'idle' | 'playing' | 'paused' | 'ended';

export type ListeningPlayerProps = {
  mode: 'EXAM' | 'PRACTICE';
  audioUrl: string;
  durationSec: number;
  /** Bila ada, posisi terakhir disimpan di `audio:v1:{attemptId}` agar pemutaran dapat dilanjutkan setelah muat ulang. */
  attemptId?: string;
  /** Dipanggil sekali saat audio berakhir. */
  onEnded?: () => void;
};

/**
 * Pemutar Listening (SPEC-011, design-system 5.14).
 * EXAM: tanpa jeda/geser/ulang/kecepatan; hanya Putar dan Volume. Lompatan posisi dikembalikan ke `lastPosition`.
 * Ini hambatan UX, bukan kontrol keamanan (pengguna teknis tetap dapat memutar ulang di luar aplikasi).
 * PRACTICE: kontrol penuh (Putar/Jeda, geser, mundur 5 detik, kecepatan 0.75x/1x, volume).
 */
export function ListeningPlayer({ mode, audioUrl, durationSec, attemptId, onEnded }: ListeningPlayerProps) {
  const exam = mode === 'EXAM';
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const lastPosition = React.useRef(0);
  const lastPersist = React.useRef(0);
  const statusRef = React.useRef<Status>('idle');
  const everLoaded = React.useRef(false);
  const onEndedRef = React.useRef(onEnded);
  onEndedRef.current = onEnded;

  const [status, setStatusState] = React.useState<Status>('idle');
  const [metaLoaded, setMetaLoaded] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);
  const [interrupted, setInterrupted] = React.useState(false);
  const [netError, setNetError] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [total, setTotal] = React.useState(durationSec);
  const [volume, setVolumeState] = React.useState(1);
  const [rate, setRate] = React.useState(1);
  const [saved, setSaved] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const setStatus = React.useCallback((s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  // Posisi tersimpan hanya dibaca di klien setelah mount (menghindari ketidakcocokan hidrasi).
  React.useEffect(() => {
    if (!attemptId || !exam) return;
    const pos = loadAudioPosition(attemptId);
    if (pos === null || pos <= 0) return;
    lastPosition.current = pos;
    setCurrent(pos);
    if (durationSec > 0 && pos >= durationSec - 1) setStatus('ended');
    else setSaved(pos);
  }, [attemptId, exam, durationSec, setStatus]);

  const persist = React.useCallback(
    (sec: number, force = false) => {
      if (!attemptId || !exam) return;
      const now = Date.now();
      if (!force && now - lastPersist.current < PERSIST_EVERY_MS) return;
      lastPersist.current = now;
      saveAudioPosition(attemptId, sec);
    },
    [attemptId, exam],
  );

  // Pelacak posisi terakhir tiap 500 ms selama diputar.
  React.useEffect(() => {
    if (status !== 'playing') return;
    const t = setInterval(() => {
      const a = audioRef.current;
      if (!a || a.seeking) return;
      const ct = a.currentTime;
      // Kemajuan alami saja (F-11-01): tanpa penjaga selisih di sini, agar jeda pelacak > 1,5 dtk tidak membuatnya macet.
      // Lompatan ditangani `onSeeking` yang berjalan sinkron sebelum tick.
      if (!exam || ct >= lastPosition.current) lastPosition.current = ct;
      setCurrent(ct);
      persist(lastPosition.current);
    }, TRACK_INTERVAL_MS);
    return () => clearInterval(t);
  }, [status, exam, persist]);

  // Status audio untuk pembaca layar: elemen `<audio>` baru perlu dicek bila sudah cukup termuat (cache).
  React.useEffect(() => {
    const a = audioRef.current;
    if (a && a.readyState >= 1 && !metaLoaded) {
      everLoaded.current = true;
      setMetaLoaded(true);
      if (Number.isFinite(a.duration) && a.duration > 0) setTotal(Math.round(a.duration));
    }
  }, [metaLoaded, reloadKey]);

  const startAt = React.useCallback((sec: number) => {
    const a = audioRef.current;
    if (!a) return;
    if (sec > 0 && Math.abs(a.currentTime - sec) > 0.25) a.currentTime = sec;
    void Promise.resolve(a.play()).catch(() => {
      // Pemutaran ditolak/gagal: pada ujian tampilkan banner gangguan; selebihnya biarkan tombol Putar.
      if (exam && everLoaded.current) setInterrupted(true);
      else if (!everLoaded.current) setUnavailable(true);
    });
  }, [exam]);

  const play = () => {
    setInterrupted(false);
    const a = audioRef.current;
    if (!a) return;
    startAt(exam ? lastPosition.current : a.currentTime);
  };

  const resumeAfterInterrupt = () => {
    setInterrupted(false);
    setNetError(false);
    startAt(lastPosition.current);
  };

  const reloadSource = () => {
    const a = audioRef.current;
    if (!a) return;
    setInterrupted(false);
    setNetError(false);
    const pos = lastPosition.current;
    const onReady = () => {
      a.removeEventListener('loadedmetadata', onReady);
      startAt(pos);
    };
    a.addEventListener('loadedmetadata', onReady);
    a.src = audioUrl;
    a.load();
  };

  const retryUnavailable = () => {
    setUnavailable(false);
    setMetaLoaded(false);
    everLoaded.current = false;
    setReloadKey((k) => k + 1);
  };

  /* ---------- peristiwa <audio> ---------- */
  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    everLoaded.current = true;
    setMetaLoaded(true);
    setUnavailable(false);
    const d = e.currentTarget.duration;
    if (Number.isFinite(d) && d > 0) setTotal(Math.round(d));
  };
  const onPlaying = () => {
    setInterrupted(false);
    setNetError(false);
    setStatus('playing');
  };
  const onPause = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (e.currentTarget.ended || statusRef.current === 'ended') return;
    if (exam) {
      // Pada ujian tidak ada kontrol jeda: berhenti berarti gangguan (peramban, perangkat, jaringan).
      if (statusRef.current === 'playing') setInterrupted(true);
      setStatus('idle');
    } else {
      setStatus('paused');
    }
  };
  const onStalledOrError = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (!everLoaded.current) {
      if (e.type === 'error') setUnavailable(true);
      return;
    }
    if (exam && statusRef.current === 'playing') setInterrupted(true);
    if (e.type === 'error') setNetError(true);
  };
  const onSeeking = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (!exam) return;
    const a = e.currentTarget;
    if (Math.abs(a.currentTime - lastPosition.current) > SEEK_TOLERANCE_SEC) {
      a.currentTime = lastPosition.current;
      if (statusRef.current === 'playing' && a.paused) void Promise.resolve(a.play()).catch(() => undefined);
    }
  };
  const onRateChange = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (exam && e.currentTarget.playbackRate !== 1) e.currentTarget.playbackRate = 1;
  };
  const onTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const a = e.currentTarget;
    if (!exam) setCurrent(a.currentTime);
    else if (!a.seeking && a.currentTime >= lastPosition.current) lastPosition.current = a.currentTime;
  };
  const onAudioEnded = () => {
    setStatus('ended');
    setInterrupted(false);
    setCurrent(total);
    lastPosition.current = total;
    persist(total, true);
    onEndedRef.current?.();
  };

  const setVolume = (v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  };
  const seekTo = (sec: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(total || sec, sec));
    setCurrent(a.currentTime);
  };
  const changeRate = (r: number) => {
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  };
  const togglePractice = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void Promise.resolve(a.play()).catch(() => undefined);
    else a.pause();
  };

  const statusText =
    status === 'ended' ? id.listening.statusEnded : status === 'playing' ? id.listening.statusPlaying : id.listening.statusIdle;
  const StatusIcon = status === 'ended' ? CheckCircle2 : status === 'playing' ? Volume2 : CircleDashed;
  const clock = fmt(id.listening.time, { cur: formatClock(current), total: formatClock(total) });
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  const canResume = exam && status === 'idle' && !interrupted && saved !== null && saved > 0;

  const audioEl = (
    <audio
      key={reloadKey}
      ref={audioRef}
      src={audioUrl}
      preload="metadata"
      data-testid="listening-audio"
      onLoadedMetadata={onLoadedMetadata}
      onPlaying={onPlaying}
      onPause={onPause}
      onStalled={onStalledOrError}
      onError={onStalledOrError}
      onSeeking={onSeeking}
      onRateChange={onRateChange}
      onTimeUpdate={onTimeUpdate}
      onEnded={onAudioEnded}
    />
  );

  if (unavailable) {
    return (
      <section aria-label={id.listening.card} className="grid gap-3 rounded-xl border bg-card p-4">
        {audioEl}
        <div role="alert" className="grid gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <Headphones className="size-5" aria-hidden="true" />
            {id.listening.unavailableTitle}
          </p>
          <p className="text-sm text-muted-foreground">{id.listening.unavailableBody}</p>
          <Button variant="outline" className="w-fit" onClick={retryUnavailable}>
            {id.common.retry}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={id.listening.card} className="grid gap-3 rounded-xl border bg-card p-4" data-testid="listening-player">
      {audioEl}
      {!metaLoaded ? (
        <Skeleton className="h-24 w-full rounded-lg" role="status" aria-label={id.common.loading} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            {exam ? (
              <Button
                size="lg"
                className="h-14 min-w-14 shrink-0 px-5"
                aria-label={canResume ? id.listening.resume : id.listening.play}
                disabled={status === 'playing' || status === 'ended'}
                onClick={play}
              >
                <Play aria-hidden="true" className="size-6" />
                {canResume ? <span>{id.listening.resume}</span> : null}
              </Button>
            ) : (
              <Button
                className="shrink-0"
                size="icon"
                aria-label={status === 'playing' ? id.listening.pause : id.listening.play}
                onClick={togglePractice}
              >
                {status === 'playing' ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              </Button>
            )}
            <div className="grid min-w-0 flex-1 gap-1.5">
              {exam ? (
                // progressbar valid tanpa aria-readonly (tidak didukung role ini; axe aria-allowed-attr). Baca-saja =
                // tanpa tabindex dan tanpa handler interaksi (spec 011 diperbarui, QA F-11-04).
                <div
                  role="progressbar"
                  data-readonly="true"
                  aria-label={id.listening.progress}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(1, total)}
                  aria-valuenow={Math.round(current)}
                  aria-valuetext={clock}
                  className="h-2 w-full overflow-hidden rounded-full bg-primary/20"
                >
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              ) : (
                <input
                  type="range"
                  aria-label={id.listening.seek}
                  aria-valuetext={clock}
                  min={0}
                  max={Math.max(1, total)}
                  step={1}
                  value={Math.min(Math.round(current), Math.max(1, total))}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="h-11 w-full accent-[var(--color-primary)]"
                />
              )}
              <p className="tabular-nums text-sm text-muted-foreground">{clock}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p aria-live="polite" className="flex items-center gap-1.5 text-sm font-medium">
              <StatusIcon className="size-4" aria-hidden="true" />
              {statusText}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Volume2 className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">{id.listening.volume}</span>
              <input
                type="range"
                aria-label={id.listening.volume}
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-11 w-28 accent-[var(--color-primary)]"
              />
            </label>
            {!exam ? (
              <>
                <Button variant="outline" size="sm" onClick={() => seekTo((audioRef.current?.currentTime ?? current) - 5)}>
                  <Rewind aria-hidden="true" />
                  {id.listening.back5}
                </Button>
                <div role="group" aria-label={id.listening.speed} className="flex gap-1">
                  {[0.75, 1].map((r) => (
                    <Button
                      key={r}
                      size="sm"
                      variant={rate === r ? 'default' : 'outline'}
                      aria-pressed={rate === r}
                      onClick={() => changeRate(r)}
                    >
                      {fmt(id.listening.speedOpt, { n: r })}
                    </Button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {exam ? <p className="text-sm font-medium">{id.listening.examNote}</p> : null}

          {interrupted ? (
            <div role="alert" className="grid gap-2 rounded-lg border border-destructive/40 bg-background p-3">
              <p className="text-sm font-semibold">{id.listening.interrupted}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={resumeAfterInterrupt}>
                  {id.listening.resume}
                </Button>
                {netError ? (
                  <Button size="sm" variant="outline" onClick={reloadSource}>
                    {id.listening.reload}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {exam && status === 'ended' ? (
            <p role="status" className={cn('rounded-lg border bg-accent p-3 text-sm font-medium')}>
              {id.listening.endedBanner}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
