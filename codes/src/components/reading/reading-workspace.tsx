'use client';

import { FileText } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { id } from '@/i18n/id';
import type { Passage } from '@/lib/reading/parsePassages';
import { clampSplit, loadSplit, saveSplit, SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN } from '@/lib/reading/storage';
import { cn } from '@/lib/utils';
import { PassagePanel } from './passage-panel';
import { useHighlights } from './use-highlights';

const SPLIT_STEP = 5;
const QUERY = '(min-width: 1024px)';

/** true bila viewport >= 1024px (mode split); jsdom/SSR tanpa matchMedia dianggap sempit. */
export function useIsSplit(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false),
    () => false,
  );
}

/** Rasio panel kiri 35-65 (persen), default 50, tersimpan global di `split:v1`. */
export function useSplitRatio() {
  const [ratio, setRatio] = React.useState(SPLIT_DEFAULT);
  React.useEffect(() => setRatio(loadSplit()), []);
  const commit = React.useCallback((n: number) => {
    const v = clampSplit(n);
    setRatio(v);
    saveSplit(v);
  }, []);
  return [ratio, commit] as const;
}

function Splitter({ ratio, onChange, containerRef }: { ratio: number; onChange: (n: number) => void; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const dragging = React.useRef(false);
  const fromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return clampSplit(((clientX - rect.left) / rect.width) * 100);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={id.reading.splitter}
      aria-valuemin={SPLIT_MIN}
      aria-valuemax={SPLIT_MAX}
      aria-valuenow={ratio}
      tabIndex={0}
      data-testid="splitter"
      className="group relative flex w-3 cursor-col-resize touch-none items-center justify-center bg-border outline-none hover:bg-primary/40 focus-visible:bg-primary focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onChange(ratio + SPLIT_STEP);
        else if (e.key === 'ArrowLeft') onChange(ratio - SPLIT_STEP);
        else if (e.key === 'Home') onChange(SPLIT_MIN);
        else if (e.key === 'End') onChange(SPLIT_MAX);
        else return;
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const v = fromPointer(e.clientX);
        if (v !== null) onChange(v);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
    >
      <span aria-hidden="true" className="h-10 w-1 rounded-full bg-muted-foreground/60" />
    </div>
  );
}

export type ReadingWorkspaceProps = {
  attemptId: string;
  /** null = teks tidak dapat diuraikan; panel teks diganti kartu galat dan soal tetap dapat dijawab. */
  passages: Passage[] | null;
  errorCode?: string | null;
  passageNo: number;
  onPassageNo: (n: number) => void;
  /** Judul panel soal pada mode split, mis. "Teks 2: Soal 14-26". */
  questionsTitle?: React.ReactNode;
  /** Isi panel soal. Mode split: soal teks aktif; mode tab: pemanggil boleh menampilkan semua teks. */
  renderQuestions: (layout: 'split' | 'tabs') => React.ReactNode;
  /** true = tinggi mengikuti induk/ruang tersisa (di dalam Mode Ujian); false = tinggi tetap terbatas (latihan). */
  fill?: boolean;
  className?: string;
};

function PassageUnavailable({ code }: { code?: string | null }) {
  const report = async () => {
    try {
      await navigator.clipboard.writeText(code ?? 'passage_unavailable');
      toast.success(id.reading.reportCopied);
    } catch {
      toast.error(id.common.copyFailed);
    }
  };
  return (
    <div role="alert" className="grid gap-2 rounded-lg border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold">
        <FileText className="size-5" aria-hidden="true" />
        {id.reading.unavailableTitle}
      </p>
      <p className="text-sm text-muted-foreground">{id.reading.unavailableBody}</p>
      <Button variant="outline" size="sm" className="w-fit" onClick={() => void report()}>
        {id.reading.report}
      </Button>
    </div>
  );
}

/**
 * Ruang baca split-screen (SPEC-010). >= 1024px: dua panel dengan pembagi (hanya dua area scroll).
 * < 1024px: tab "Teks | Soal"; posisi scroll tiap tab dipertahankan di state.
 */
export function ReadingWorkspace({ attemptId, passages, errorCode, passageNo, onPassageNo, questionsTitle, renderQuestions, fill = true, className }: ReadingWorkspaceProps) {
  const split = useIsSplit();
  const [ratio, commitRatio] = useSplitRatio();
  const { highlights, add, removeIds, clear } = useHighlights(attemptId, passages);
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = React.useState<'passage' | 'questions'>('questions');
  const scrollSaved = React.useRef({ passage: 0, questions: 0 });
  const scrollEls = React.useRef<{ passage: HTMLDivElement | null; questions: HTMLDivElement | null }>({ passage: null, questions: null });
  const refFor = React.useMemo(
    () => ({
      passage: (el: HTMLDivElement | null) => {
        scrollEls.current.passage = el;
        if (el) el.scrollTop = scrollSaved.current.passage;
      },
      questions: (el: HTMLDivElement | null) => {
        scrollEls.current.questions = el;
        if (el) el.scrollTop = scrollSaved.current.questions;
      },
    }),
    [],
  );
  const switchTab = (next: 'passage' | 'questions') => {
    const cur = scrollEls.current[tab];
    if (cur) scrollSaved.current[tab] = cur.scrollTop;
    setTab(next);
  };

  const passageNode = passages ? (
    <PassagePanel
      passages={passages}
      passageNo={passageNo}
      onPassageNo={onPassageNo}
      highlights={highlights}
      onAdd={add}
      onRemoveIds={removeIds}
      onClear={clear}
    />
  ) : (
    <PassageUnavailable code={errorCode} />
  );

  const height = fill ? 'min-h-0 flex-1' : 'h-[calc(100dvh-10rem)] min-h-[24rem]';

  if (split) {
    return (
      <div
        ref={gridRef}
        data-testid="reading-split"
        className={cn('grid min-h-0 w-full', height, className)}
        style={{ gridTemplateColumns: `minmax(0, ${ratio}fr) 0.75rem minmax(0, ${100 - ratio}fr)` }}
      >
        <section aria-label={id.reading.passagePanel} className="min-h-0 overflow-y-auto px-4 pb-6 sm:px-6" data-testid="panel-passage">
          {passageNode}
        </section>
        <Splitter ratio={ratio} onChange={commitRatio} containerRef={gridRef} />
        <section aria-label={id.reading.questionsPanel} className="min-h-0 overflow-y-auto px-4 pb-6 sm:px-6" data-testid="panel-questions">
          {questionsTitle ? <h2 className="sticky top-0 z-10 -mx-4 border-b bg-background px-4 py-3 text-lg font-bold sm:-mx-6 sm:px-6">{questionsTitle}</h2> : null}
          <div className="pt-4">{renderQuestions('split')}</div>
        </section>
      </div>
    );
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => switchTab(v as 'passage' | 'questions')}
      className={cn('flex min-h-0 w-full flex-col gap-0', height, className)}
      data-testid="reading-tabs"
    >
      <TabsList aria-label={id.reading.tabsLabel} className="sticky top-0 z-20 grid h-11 w-full shrink-0 grid-cols-2 rounded-none border-b bg-background p-1">
        <TabsTrigger value="passage" className="h-full">
          {id.reading.passageTab}
        </TabsTrigger>
        <TabsTrigger value="questions" className="h-full">
          {id.reading.questionsTab}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="passage" className="flex min-h-0 flex-1 flex-col">
        <div ref={refFor.passage} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="panel-passage">
          {passageNode}
          <Button variant="outline" className="mt-4 w-full" onClick={() => switchTab('questions')}>
            {id.reading.backToQuestions}
          </Button>
        </div>
      </TabsContent>
      <TabsContent value="questions" className="flex min-h-0 flex-1 flex-col">
        <div ref={refFor.questions} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="panel-questions">
          <div className="flex items-center justify-between gap-2 py-3">
            <h2 className="text-base font-bold">{id.reading.questionsPanel}</h2>
            <Button variant="outline" size="sm" onClick={() => switchTab('passage')}>
              <FileText aria-hidden="true" />
              {id.reading.viewPassage}
            </Button>
          </div>
          {renderQuestions('tabs')}
        </div>
      </TabsContent>
    </Tabs>
  );
}

export function ReadingWorkspaceSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-4 lg:grid-cols-2" role="status" aria-label={id.common.loading}>
      <Skeleton className="h-full min-h-64 rounded-xl" />
      <Skeleton className="hidden h-full rounded-xl lg:block" />
    </div>
  );
}
