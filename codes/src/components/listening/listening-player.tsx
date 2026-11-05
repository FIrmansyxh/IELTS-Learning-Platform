'use client';

import { AlertCircle, CheckCircle2, Info, Loader2, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { id } from '@/i18n/id';

export interface ListeningPlayerProps {
  mode: 'EXAM' | 'PRACTICE';
  audioUrl: string;
  durationSec?: number | null;
  attemptId: string;
  className?: string;
  onEnded?: () => void;
}

function formatMmSs(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ListeningPlayer({
  mode,
  audioUrl,
  durationSec,
  attemptId,
  className = '',
  onEnded,
}: ListeningPlayerProps) {
  const isExam = mode === 'EXAM';
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const lastPositionRef = React.useRef<number>(0);

  const [status, setStatus] = React.useState<'idle' | 'playing' | 'ended'>('idle');
  const [currentTime, setCurrentTime] = React.useState<number>(0);
  const [duration, setDuration] = React.useState<number>(durationSec ?? 0);
  const [volume, setVolume] = React.useState<number>(1);
  const [muted, setMuted] = React.useState<boolean>(false);
  const [speed, setSpeed] = React.useState<number>(1);
  const [interrupted, setInterrupted] = React.useState<boolean>(false);
  const [hasNetworkError, setHasNetworkError] = React.useState<boolean>(false);
  const [loadingMetadata, setLoadingMetadata] = React.useState<boolean>(true);
  const [loadError, setLoadError] = React.useState<boolean>(false);

  // Baca posisi tersimpan dari localStorage pada mount (EXAM mode recovery)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`audio:v1:${attemptId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { position_sec?: number };
        if (typeof parsed.position_sec === 'number' && parsed.position_sec > 0) {
          lastPositionRef.current = parsed.position_sec;
          setCurrentTime(parsed.position_sec);
        }
      }
    } catch {
      // Abaikan bila localStorage tidak tersedia
    }
  }, [attemptId]);

  // Simpan posisi audio berkala setiap 500 ms saat memutar
  React.useEffect(() => {
    if (status !== 'playing') return;
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended) {
        lastPositionRef.current = audio.currentTime;
        try {
          localStorage.setItem(
            `audio:v1:${attemptId}`,
            JSON.stringify({ position_sec: Math.round(audio.currentTime) }),
          );
        } catch {
          // Abaikan
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [status, attemptId]);

  // Event handlers audio
  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio) {
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationSec ?? 0;
      setDuration(d);
      setLoadingMetadata(false);
      setLoadError(false);

      // Bila ada posisi tersimpan sebelumnya
      if (lastPositionRef.current > 0 && lastPositionRef.current < d) {
        audio.currentTime = lastPositionRef.current;
        setCurrentTime(lastPositionRef.current);
      }
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
      lastPositionRef.current = audio.currentTime;
    }
  };

  // Anti-rewind & clamp jumping pada EXAM mode
  const handleSeeking = () => {
    if (!isExam) return;
    const audio = audioRef.current;
    if (!audio) return;
    const diff = Math.abs(audio.currentTime - lastPositionRef.current);
    if (diff > 1.5) {
      audio.currentTime = lastPositionRef.current;
      setCurrentTime(lastPositionRef.current);
    }
  };

  // Guard: kembalikan playbackRate ke 1 pada EXAM bila diubah lewat konsol
  const handleRateChange = () => {
    if (!isExam) return;
    const audio = audioRef.current;
    if (audio && audio.playbackRate !== 1) {
      audio.playbackRate = 1;
    }
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (isExam && status === 'playing' && audio && !audio.ended) {
      setInterrupted(true);
    }
  };

  const handleEnded = () => {
    setStatus('ended');
    setInterrupted(false);
    onEnded?.();
  };

  const handleError = () => {
    setHasNetworkError(true);
    if (isExam && status === 'playing') {
      setInterrupted(true);
    } else if (status === 'idle') {
      setLoadError(true);
    }
  };

  // Kontrol putar
  const startPlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      setInterrupted(false);
      setHasNetworkError(false);
      if (lastPositionRef.current > 0) {
        audio.currentTime = lastPositionRef.current;
      }
      await audio.play();
      setStatus('playing');
    } catch {
      setInterrupted(true);
    }
  };

  const resumeAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      setInterrupted(false);
      audio.currentTime = lastPositionRef.current;
      await audio.play();
      setStatus('playing');
    } catch {
      setInterrupted(true);
    }
  };

  const reloadAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      setInterrupted(false);
      setHasNetworkError(false);
      audio.src = audioUrl;
      audio.load();
      audio.currentTime = lastPositionRef.current;
      await audio.play();
      setStatus('playing');
    } catch {
      setInterrupted(true);
    }
  };

  // Kontrol Practice
  const togglePracticePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setStatus('playing');
    } else {
      audio.pause();
      setStatus('idle');
    }
  };

  const handleRewind5s = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Math.max(0, audio.currentTime - 5);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    lastPositionRef.current = nextTime;
  };

  const handleSpeedChange = (newSpeed: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = newSpeed;
    setSpeed(newSpeed);
  };

  const handleSeekSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = target;
      setCurrentTime(target);
      lastPositionRef.current = target;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = vol;
      audio.muted = vol === 0;
      setVolume(vol);
      setMuted(vol === 0);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (audio) {
      const nextMuted = !muted;
      audio.muted = nextMuted;
      setMuted(nextMuted);
    }
  };

  // Tampilan error bila audio tidak ditemukan
  if (loadError) {
    return (
      <Card className={`border-destructive/50 bg-destructive/5 ${className}`}>
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <AlertCircle className="size-6 text-destructive shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold text-destructive">{id.listening.audioNotAvailableTitle}</p>
              <p className="text-sm text-muted-foreground">{id.listening.audioNotAvailableBody}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void reloadAudio()}>
            {id.listening.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const percent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const isPlaying = status === 'playing';
  const isEnded = status === 'ended';

  return (
    <Card className={`border shadow-sm ${className}`} role="region" aria-label="Pemutar Audio">
      <CardContent className="p-4 sm:p-5 grid gap-4">
        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          tabIndex={-1}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onRateChange={handleRateChange}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
          }}
        />

        {/* Status Text (Aria Live) */}
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2" aria-live="polite">
            {isEnded ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                {id.listening.statusEnded}
              </span>
            ) : isPlaying ? (
              <span className="flex items-center gap-1.5 font-medium text-primary">
                <span className="size-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                {id.listening.statusPlaying}
              </span>
            ) : (
              <span className="text-muted-foreground">{id.listening.statusNotStarted}</span>
            )}
          </div>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatMmSs(currentTime)} / {formatMmSs(duration)}
          </span>
        </div>

        {/* Progress Bar / Slider */}
        {isExam ? (
          // eslint-disable-next-line jsx-a11y/role-supports-aria-props
          <div
            role="progressbar"
            aria-readonly="true"
            aria-valuenow={Math.round(currentTime)}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-label={id.listening.progressAria}
            className="relative h-2 w-full overflow-hidden rounded-full bg-secondary"
          >
            <div
              className="h-full bg-primary transition-[width] duration-300 ease-linear"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : (
          <div className="grid gap-1">
            <input
              type="range"
              role="slider"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeekSlider}
              aria-label={id.listening.progressAria}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${formatMmSs(currentTime)} dari ${formatMmSs(duration)}`}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>
        )}

        {/* Interruption / Stalled Alert Banner in EXAM mode */}
        {isExam && interrupted && !isEnded && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{id.listening.audioInterrupted}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void resumeAudio()}>
                {id.listening.resumeAudio}
              </Button>
              {hasNetworkError && (
                <Button size="sm" variant="outline" onClick={() => void reloadAudio()}>
                  {id.listening.reloadAudio}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Ended Info Banner in EXAM mode */}
        {isExam && isEnded && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            <span>{id.listening.endedNotice}</span>
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isExam ? (
              // Mode EXAM: Tombol putar besar 56px (h-14 w-14) tanpa jeda/mundur/kecepatan
              <Button
                type="button"
                size="lg"
                disabled={isPlaying || isEnded}
                onClick={() => void (lastPositionRef.current > 0 ? resumeAudio() : startPlay())}
                aria-label={id.listening.playAudio}
                className="h-14 w-14 rounded-full p-0 shadow-md transition-transform hover:scale-105 active:scale-95"
              >
                {loadingMetadata ? (
                  <Loader2 className="size-6 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="size-6 fill-current ml-0.5" aria-hidden="true" />
                )}
              </Button>
            ) : (
              // Mode PRACTICE: Tombol putar/jeda, mundur 5s, kecepatan
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => void togglePracticePlay()}
                  aria-label={isPlaying ? id.listening.practicePause : id.listening.practicePlay}
                  className="size-11 rounded-full p-0"
                >
                  {isPlaying ? (
                    <span className="font-bold text-xs">II</span>
                  ) : (
                    <Play className="size-5 fill-current ml-0.5" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRewind5s}
                  aria-label={id.listening.rewind5s}
                  title={id.listening.rewind5s}
                >
                  <RotateCcw className="size-3.5 mr-1" aria-hidden="true" />
                  5s
                </Button>
                <div className="flex items-center rounded-md border text-xs">
                  <button
                    type="button"
                    onClick={() => handleSpeedChange(0.75)}
                    className={`px-2 py-1 rounded-l-md ${speed === 0.75 ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted'}`}
                    aria-pressed={speed === 0.75}
                  >
                    0.75x
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSpeedChange(1)}
                    className={`px-2 py-1 rounded-r-md ${speed === 1 ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted'}`}
                    aria-pressed={speed === 1}
                  >
                    1x
                  </button>
                </div>
              </div>
            )}

            {isExam && (
              <p className="text-xs text-muted-foreground hidden sm:block">
                {id.listening.examNotice}
              </p>
            )}
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={toggleMute}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-4" aria-hidden="true" />
              ) : (
                <Volume2 className="size-4" aria-hidden="true" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label={id.listening.volumeAria}
              className="w-16 sm:w-24 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>
        </div>

        {isExam && (
          <p className="text-xs text-muted-foreground sm:hidden">
            {id.listening.examNotice}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
