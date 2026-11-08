'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { ActiveDrill } from '@/components/quiz/active-drill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AttemptResult } from '@/contracts/attempts';
import { id } from '@/i18n/id';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { parsePassages, type Passage } from '@/lib/reading/parsePassages';
import { MixResultView } from './mix-result';
import { passageForQuestion, type MixPassageRef } from './mix-utils';

function parseOne(markdown: string): Passage | null {
  try {
    return parsePassages(markdown)[0] ?? null;
  } catch {
    return null;
  }
}

/** Teks bacaan pendamping soal Reading (bisa dilipat; panel bergulir sendiri agar soal tetap terlihat). */
export function MixPassageCard({ passage }: { passage: MixPassageRef }) {
  const [open, setOpen] = React.useState(true);
  const parsed = React.useMemo(() => parseOne(passage.markdown), [passage.markdown]);
  const bodyId = React.useId();
  return (
    <section aria-label={id.mix.run.passage} className="rounded-xl border bg-card" data-testid="mix-passage">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span>{id.mix.run.passage}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {open ? id.mix.run.passageHide : id.mix.run.passageShow}
          <ChevronDown className={open ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} aria-hidden="true" />
        </span>
      </button>
      <div id={bodyId} hidden={!open} className="max-h-[40dvh] overflow-y-auto border-t px-4 py-3" lang="en">
        {parsed ? (
          <div className="grid gap-3 text-sm leading-relaxed">
            {parsed.title && !/^Teks \d+$/.test(parsed.title) ? <h3 className="font-semibold">{parsed.title}</h3> : null}
            {parsed.paragraphs.map((p) => (
              <p key={p.index}>
                {p.label ? <strong className="mr-1.5">{p.label}</strong> : null}
                {p.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed">{passage.markdown}</p>
        )}
      </div>
    </section>
  );
}

function SessionSkeleton() {
  return <Skeleton className="h-96 w-full max-w-3xl rounded-xl" role="status" aria-label={id.common.loading} />;
}

/** Memuat hasil attempt yang sudah selesai (muat ulang halaman / buka dari tautan). */
export function MixResultLoader({ attemptId }: { attemptId: string }) {
  const q = useQuery({
    queryKey: ['mix', 'result', attemptId],
    queryFn: ({ signal }) => attemptsApi.result(attemptId, signal),
    staleTime: 0,
    retry: false,
  });
  if (q.isPending) return <SessionSkeleton />;
  if (q.isError) return <ErrorState title={id.mix.result.loadFailed} onRetry={() => void q.refetch()} />;
  return <MixResultView result={q.data} />;
}

/**
 * Sesi Latihan Campur: memakai ulang Active Drill (umpan balik instan per soal, soal Writing/Speaking lewat kartu
 * AI yang sama). Attempt selesai/kedaluwarsa menampilkan hasil.
 */
export function MixSession({ attemptId }: { attemptId: string }) {
  const [result, setResult] = React.useState<AttemptResult | null>(null);
  const q = useQuery({
    queryKey: ['mix', 'attempt', attemptId],
    queryFn: ({ signal }) => attemptsApi.get(attemptId, signal),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const queryClient = useQueryClient();
  const finished = q.data !== undefined && q.data.status !== 'IN_PROGRESS';

  if (result) return <MixResultView result={result} />;
  if (q.isPending) return <SessionSkeleton />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <div className="grid max-w-md gap-3 rounded-lg border bg-card p-6">
          <h1 className="text-xl font-bold">{id.mix.run.notFound}</h1>
          <Button asChild className="w-fit">
            <Link href="/latihan/campur">{id.mix.title}</Link>
          </Button>
        </div>
      );
    }
    return <ErrorState title={id.mix.run.loadFailed} onRetry={() => void q.refetch()} />;
  }

  const attempt = q.data;
  if (attempt.status === 'ABANDONED') {
    return (
      <div className="grid max-w-md gap-3 rounded-lg border bg-card p-6">
        <h1 className="text-xl font-bold">{id.mix.run.abandoned}</h1>
        <Button asChild className="w-fit">
          <Link href="/latihan/campur">{id.mix.title}</Link>
        </Button>
      </div>
    );
  }
  if (finished) {
    return <MixResultLoader attemptId={attemptId} />;
  }

  return (
    <div className="max-w-3xl">
      <ActiveDrill
        key={attempt.id}
        attempt={attempt}
        contextSlot={(question) => {
          const p = passageForQuestion(question, attempt.passages);
          return p ? <MixPassageCard key={`${question.passage_index}`} passage={p} /> : null;
        }}
        onFinished={(res) => {
          void queryClient.invalidateQueries({ queryKey: ['mix', 'active'] });
          setResult(res);
        }}
      />
    </div>
  );
}
