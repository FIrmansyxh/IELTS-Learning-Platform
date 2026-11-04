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
import { cn } from '@/lib/utils';

const MILESTONES_MIN = [10, 5, 1];

/** Teks tombol/dialog akhir yang dapat diganti (Boss: "Selesai Section"; Placement: "Akhiri tes"). */
export type ExamShellLabels = { end?: string; endTitle?: string; endBody?: string; endConfirm?: string };

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
  navigator,
  footer,
  layout = 'page',
  labels,
  children,
}: {
  title: string;
  remainingSeconds: number | null;
  unansweredCount: number;
  onEnd: () => void;
  navigator?: React.ReactNode;
  /** Bilah bawah (prev/next/Kirim); menerima fungsi pembuka Dialog konfirmasi "Akhiri/Kirim". */
  footer?: (openEnd: () => void) => React.ReactNode;
  /** `workspace` = setinggi viewport tanpa scroll halaman (Reading split-screen, SPEC-010). */
  layout?: 'page' | 'workspace';
  labels?: ExamShellLabels;
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
    <div className={cn('bg-background', layout === 'workspace' ? 'flex h-dvh flex-col overflow-hidden' : 'min-h-dvh')}>
      <header
        className={cn(
          'z-30 flex items-center justify-between gap-3 border-b bg-background px-4 py-2',
          layout === 'workspace' ? 'shrink-0' : 'sticky top-0',
        )}
      >
        <h1 className="truncate text-base font-semibold">{title}</h1>
        <div className="flex items-center gap-3">
          {remainingSeconds !== null ? (
            <p className="tabular-nums text-sm" role="timer" aria-label={id.quiz.exam.timeLeft}>
              {formatClock(remainingSeconds)}
            </p>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
            {labels?.end ?? id.quiz.exam.end}
          </Button>
        </div>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {layout === 'workspace' ? (
        <main className="flex min-h-0 flex-1 flex-col">
          {navigator}
          {children}
        </main>
      ) : (
        <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 md:px-8">
          {navigator}
          {children}
        </main>
      )}
      {footer ? (
        <div className={cn('z-30 border-t bg-background px-4 py-2', layout === 'workspace' ? 'shrink-0' : 'sticky bottom-0')}>
          {footer(() => setConfirmOpen(true))}
        </div>
      ) : null}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels?.endTitle ?? id.quiz.exam.endTitle}</DialogTitle>
            <DialogDescription>
              {labels?.endBody ?? id.quiz.exam.endBody}
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
              {labels?.endConfirm ?? id.quiz.exam.endConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
