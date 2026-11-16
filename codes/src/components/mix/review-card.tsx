'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { REVIEW_SESSION_MAX } from '@/contracts/review';
import { fmt, id } from '@/i18n/id';
import { mixApi } from '@/lib/api/mix';

export const MIX_REVIEWS_KEY = ['mix', 'reviews'] as const;

const whenFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Kartu pengulangan berjarak (SPEC-026 D6) di atas Latihan campur. */
export function ReviewCard({ onStart, pending, disabled }: { onStart: () => void; pending: boolean; disabled: boolean }) {
  const q = useQuery({
    queryKey: MIX_REVIEWS_KEY,
    queryFn: ({ signal }) => mixApi.reviews(signal),
    staleTime: 0,
    retry: false,
  });
  const t = id.mix.review;

  if (q.isPending) return <Skeleton className="h-28 rounded-xl" />;
  if (q.isError) return <p className="text-sm text-muted-foreground">{t.loadFailed}</p>;

  const s = q.data;
  const nothing = s.scheduled_count === 0 && s.mastered_count === 0;
  const n = Math.min(s.due_count, REVIEW_SESSION_MAX);

  return (
    <section
      aria-labelledby="review-title"
      data-testid="review-card"
      className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <RotateCcw className="size-5" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 gap-1">
          <h2 id="review-title" className="text-base font-semibold">
            {t.title}
          </h2>
          {nothing ? (
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t.hint}</p>
              <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <div className="flex gap-1.5">
                  <dt className="sr-only">{t.title}</dt>
                  <dd className="font-semibold text-foreground" data-testid="review-due">
                    {fmt(t.due, { n: s.due_count })}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">{t.scheduled}</dt>
                  <dd className="font-semibold tabular-nums">{s.scheduled_count}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">{t.mastered}</dt>
                  <dd className="font-semibold tabular-nums">{s.mastered_count}</dd>
                </div>
              </dl>
              {s.due_count === 0 && s.next_due_at ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  {fmt(t.nextDue, { when: whenFmt.format(new Date(s.next_due_at)) })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
      {nothing ? null : (
        <div className="grid gap-1 md:justify-items-end">
          <Button
            size="lg"
            className="h-auto min-h-[52px] whitespace-normal py-2.5"
            disabled={disabled || s.due_count === 0}
            loading={pending}
            onClick={onStart}
          >
            {pending ? t.starting : fmt(t.start, { n })}
          </Button>
          {s.due_count > REVIEW_SESSION_MAX ? (
            <p className="text-xs text-muted-foreground">{fmt(t.perSession, { n: REVIEW_SESSION_MAX })}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
