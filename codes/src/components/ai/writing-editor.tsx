'use client';

import { Send } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { wordCount } from '@/components/quiz/answer-utils';
import { fmt, id } from '@/i18n/id';
import { loadDraft, pruneExpiredDrafts, saveDraft } from '@/lib/ai/draft';
import { formatClock, formatTimeWib } from '@/lib/format';
import { cn } from '@/lib/utils';

const AUTOSAVE_MS = 10_000;
const MAX_CHARS = 5000;

/** Tonggak timer yang diumumkan ke pembaca layar: 10, 5, 1 menit (bukan tiap detik). */
export function timerMilestone(remainingSec: number): 10 | 5 | 1 | null {
  if (remainingSec <= 0) return null;
  if (remainingSec <= 60) return 1;
  if (remainingSec <= 300) return 5;
  if (remainingSec <= 600) return 10;
  return null;
}

export type WritingEditorProps = {
  prompt: string;
  stimulusUrl?: string | null;
  /** Batas kata esai (untuk tampilan "n / min. m kata"); null = Mini-Task ("n kata"). */
  minWords: number | null;
  /** Minimal kata yang diterima server (20 esai, 5 Mini-Task). */
  minToSubmit: number;
  /** Sisa waktu attempt dalam detik; null = tanpa timer (Mini-Task). */
  remainingSec?: number | null;
  draftKey: string;
  /** Kuota harian: limit 0 = AI mati (tanpa pembatasan). */
  quota?: { limit: number; remaining: number; resets_at: string | null } | null;
  submitting: boolean;
  /** Setelah terkirim: editor read-only. */
  locked: boolean;
  error?: string | null;
  onSubmit: (text: string) => void;
};

export function WritingEditor({
  prompt,
  stimulusUrl,
  minWords,
  minToSubmit,
  remainingSec = null,
  draftKey,
  quota,
  submitting,
  locked,
  error,
  onSubmit,
}: WritingEditorProps) {
  const [text, setText] = React.useState('');
  const [saved, setSaved] = React.useState<'saved' | 'unsaved' | 'idle'>('idle');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const lastSaved = React.useRef('');
  const prevKey = React.useRef(draftKey);
  const textRef = React.useRef(text);
  textRef.current = text;
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Pulihkan draf (localStorage hanya tersedia di klien).
  React.useEffect(() => {
    pruneExpiredDrafts();
    const d = loadDraft(draftKey);
    const hadNoUser = prevKey.current === '' && textRef.current !== '';
    prevKey.current = draftKey;
    if (d) {
      setText(d);
      lastSaved.current = d;
      setSaved('saved');
    } else if (!hadNoUser) {
      // (Bila pengguna baru dikenali setelah mengetik, teks yang sudah ada dipertahankan.)
      setText('');
      lastSaved.current = '';
      setSaved('idle');
    } else {
      lastSaved.current = '';
    }
  }, [draftKey]);

  // Autosave tiap 10 detik bila ada perubahan.
  React.useEffect(() => {
    if (locked) return;
    const t = setInterval(() => {
      if (textRef.current === lastSaved.current) return;
      const ok = saveDraft(draftKey, textRef.current);
      lastSaved.current = textRef.current;
      setSaved(ok ? 'saved' : 'unsaved');
    }, AUTOSAVE_MS);
    // Simpan juga saat tab disembunyikan/ditutup agar ketikan terakhir tidak hilang (F-12-04).
    const flush = () => {
      if (textRef.current === lastSaved.current) return;
      saveDraft(draftKey, textRef.current);
      lastSaved.current = textRef.current;
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', flush);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', flush);
    };
  }, [draftKey, locked]);

  const words = wordCount(text);
  const quotaBlocked = !!quota && quota.limit > 0 && quota.remaining <= 0;
  const tooShort = words < minToSubmit;
  const canSubmit = !locked && !submitting && !quotaBlocked && !tooShort;
  const lowTime = remainingSec !== null && remainingSec < 300;
  const belowMin = minWords !== null && words < minWords && lowTime;
  const milestone = remainingSec !== null ? timerMilestone(remainingSec) : null;

  function requestSubmit() {
    if (canSubmit) setConfirmOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      requestSubmit();
    }
  }

  const hintId = 'writing-hint';
  const counter = minWords !== null ? fmt(id.ai.writing.wordsMin, { n: words, min: minWords }) : fmt(id.ai.writing.wordsPlain, { n: words });

  const promptPanel = (
    <div className="grid content-start gap-3 rounded-lg border bg-muted p-4">
      <h3 className="text-base font-semibold">{id.ai.writing.promptLabel}</h3>
      <p lang="en" className="whitespace-pre-wrap break-words text-base leading-7" data-testid="writing-prompt">
        {prompt}
      </p>
      {stimulusUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={stimulusUrl} alt={id.ai.writing.stimulusAlt} className="h-auto max-h-80 w-full rounded-md border bg-card object-contain" />
      ) : null}
    </div>
  );

  const editorPanel = (
    <div className="grid content-start gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p
          data-testid="word-counter"
          className={cn('font-semibold tabular-nums', belowMin ? 'text-[var(--color-accent-text)]' : 'text-muted-foreground')}
        >
          {counter}
          {belowMin ? <span className="ml-2 font-normal">({id.ai.writing.belowMin})</span> : null}
        </p>
        {remainingSec !== null ? (
          <p
            data-testid="writing-timer"
            className={cn('font-semibold tabular-nums', lowTime ? 'text-[var(--color-accent-text)]' : 'text-muted-foreground')}
          >
            <span className="sr-only">{id.ai.writing.timerLabel}: </span>
            {formatClock(remainingSec)}
          </p>
        ) : null}
      </div>
      <div className="sr-only" role="status" aria-live="polite" data-testid="timer-announce">
        {milestone ? fmt(id.ai.writing.timerAnnounce, { n: milestone }) : ''}
      </div>
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (saved === 'saved') setSaved('idle');
        }}
        onKeyDown={onKeyDown}
        readOnly={locked}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        lang="en"
        maxLength={MAX_CHARS}
        aria-label={id.ai.writing.textareaLabel}
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        className="min-h-64 w-full resize-y rounded-md border border-input bg-transparent p-3 font-sans text-[17px] leading-7 shadow-xs outline-none read-only:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive sm:min-h-80 dark:bg-input/30"
      />
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p id={hintId}>
          {saved === 'saved' ? id.ai.writing.draftSaved : saved === 'unsaved' ? id.ai.writing.draftUnsaved : id.ai.writing.shortcutHint}
        </p>
        {locked ? <p>{id.ai.writing.sentLabel}</p> : null}
      </div>
      {error ? (
        <p role="alert" data-testid="writing-error" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!locked ? (
        <div className="grid gap-2">
          <Button size="lg" className="w-full sm:w-fit" disabled={!canSubmit} loading={submitting} onClick={requestSubmit} aria-describedby="writing-send-note">
            <Send aria-hidden="true" />
            {submitting ? id.ai.writing.sending : id.ai.writing.send}
          </Button>
          <p id="writing-send-note" className="text-sm text-muted-foreground" data-testid="writing-send-note">
            {quotaBlocked
              ? quota?.resets_at
                ? fmt(id.ai.quotaReached, { time: formatTimeWib(quota.resets_at) })
                : id.ai.quotaReachedNoTime
              : tooShort
                ? fmt(id.ai.writing.tooShort, { n: minToSubmit })
                : ''}
          </p>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-4">
      <Tabs defaultValue="write" className="gap-3 lg:grid lg:grid-cols-2 lg:gap-6" data-testid="writing-split">
        <TabsList className="grid h-11 w-full grid-cols-2 lg:hidden" aria-label={id.ai.writing.tablistLabel}>
          <TabsTrigger value="prompt">{id.ai.writing.promptTab}</TabsTrigger>
          <TabsTrigger value="write">{id.ai.writing.writeTab}</TabsTrigger>
        </TabsList>
        <TabsContent value="prompt" forceMount className="data-[state=inactive]:hidden lg:data-[state=inactive]:block lg:col-start-1 lg:row-start-1">
          {promptPanel}
        </TabsContent>
        <TabsContent value="write" forceMount className="data-[state=inactive]:hidden lg:data-[state=inactive]:block lg:col-start-2 lg:row-start-1">
          {editorPanel}
        </TabsContent>
      </Tabs>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.ai.writing.confirmTitle}</DialogTitle>
            <DialogDescription>{id.ai.writing.confirmBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {id.common.cancel}
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onSubmit(text);
              }}
            >
              {id.ai.writing.confirmSend}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
