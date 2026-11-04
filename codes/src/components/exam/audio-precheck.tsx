'use client';

import { Headphones, Volume2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { id } from '@/i18n/id';

type AudioCtxCtor = typeof AudioContext;

/** Nada uji 440 Hz selama 1 detik lewat WebAudio (tanpa berkas). Mengembalikan false bila WebAudio tidak tersedia. */
export function playTestTone(): boolean {
  const w = window as unknown as { AudioContext?: AudioCtxCtor; webkitAudioContext?: AudioCtxCtor };
  const Ctx = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctx) return false;
  try {
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => void ctx.close();
    osc.start();
    osc.stop(ctx.currentTime + 1);
    return true;
  } catch {
    return false;
  }
}

/** Pra-cek audio ExamIntro (SPEC-011): putar nada uji, lalu centang konfirmasi. */
export function AudioPrecheck({ confirmed, onConfirmedChange }: { confirmed: boolean; onConfirmedChange: (v: boolean) => void }) {
  const [playing, setPlaying] = React.useState(false);
  const [unsupported, setUnsupported] = React.useState(false);
  const play = () => {
    const ok = playTestTone();
    setUnsupported(!ok);
    if (!ok) return;
    setPlaying(true);
    setTimeout(() => setPlaying(false), 1000);
  };
  return (
    <section aria-labelledby="audio-check" className="grid gap-3 rounded-lg border bg-card p-4">
      <h2 id="audio-check" className="flex items-center gap-2 text-sm font-semibold">
        <Headphones className="size-4" aria-hidden="true" />
        {id.audioCheck.title}
      </h2>
      <p className="text-sm text-muted-foreground">{id.audioCheck.desc}</p>
      <Button type="button" variant="outline" className="w-fit" onClick={play} disabled={playing}>
        <Volume2 aria-hidden="true" />
        {playing ? id.audioCheck.playing : id.audioCheck.play}
      </Button>
      {unsupported ? (
        <p role="alert" className="text-sm text-destructive">
          {id.audioCheck.unsupported}
        </p>
      ) : null}
      <div className="flex items-start gap-3">
        <Checkbox id="audio-confirm" checked={confirmed} onCheckedChange={(v) => onConfirmedChange(v === true)} className="mt-0.5 size-5" />
        <label htmlFor="audio-confirm" className="text-sm leading-snug">
          {id.audioCheck.confirm}
        </label>
      </div>
    </section>
  );
}
