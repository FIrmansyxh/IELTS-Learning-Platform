'use client';

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
import { fmt, id } from '@/i18n/id';
import { formatClock } from '@/lib/format';

const MILESTONES_MIN = [10, 5, 1];

/**
 * Kerangka Mode Ujian (design-system 5.19): tema tenang, tanpa navigasi global/gamifikasi, header tipis
 * dengan timer hitung mundur. `aria-live` hanya diumumkan pada tonggak 10/5/1 menit. `beforeunload` aktif
 * selama ujian berjalan. Dipakai SPEC-008/014/015.
 */
export function ExamShell({
  title,
  remainingSeconds,
  unansweredCount,
  onEnd,
  endLabel,
  navigator,
  children,
}: {
  title: string;
  remainingSeconds: number | null;
  unansweredCount: number;
  onEnd: () => void;
  endLabel?: string;
  navigator?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [announce, setAnnounce] = React.useState('');
  const announced = React.useRef(new Set<number>());

  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Pesan kustom diabaikan peramban modern; mengaktifkan dialog bawaan peramban.
      e.returnValue = `${id.quiz.exam.leaveTitle} ${id.quiz.exam.leaveBody}`;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  React.useEffect(() => {
    if (remainingSeconds === null) return;
    for (const m of MILESTONES_MIN) {
      if (remainingSeconds <= m * 60 && remainingSeconds > m * 60 - 5 && !announced.current.has(m)) {
        announced.current.add(m);
        setAnnounce(fmt(id.quiz.exam.milestone, { n: m }));
      }
    }
  }, [remainingSeconds]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        <div className="flex items-center gap-3">
          {remainingSeconds !== null ? (
            <p className="tabular-nums text-sm" role="timer" aria-label={id.quiz.exam.timeLeft}>
              {formatClock(remainingSeconds)}
            </p>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
            {endLabel ?? id.quiz.exam.end}
          </Button>
        </div>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:px-8">
        {navigator}
        {children}
      </main>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.quiz.exam.endTitle}</DialogTitle>
            <DialogDescription>
              {id.quiz.exam.endBody}
              {unansweredCount > 0 ? ` ${fmt(id.quiz.exam.endUnanswered, { n: unansweredCount })}` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {id.common.cancel}
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onEnd();
              }}
            >
              {id.quiz.exam.endConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
