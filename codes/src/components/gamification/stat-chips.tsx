'use client';

import { Flame, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { useStats } from './use-stats';

const nf = new Intl.NumberFormat('id-ID');

/**
 * Chip header (top bar AppShell): streak harian + total poin. Satu `aria-label` ringkas pada wadah.
 * Loading = Skeleton; galat = disembunyikan tanpa Toast (non-kritis). Tidak dirender pada Mode Ujian
 * karena layout ujian tidak memakai AppShell.
 */
export function StatChips() {
  const q = useStats();
  if (q.isPending) {
    return (
      <div className="flex gap-2" role="status" aria-label={id.common.loading}>
        <Skeleton className="h-8 w-14 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
    );
  }
  if (q.isError) return null;
  const { daily_streak_days: streak, total_points: points } = q.data;
  return (
    <div
      role="group"
      aria-label={fmt(id.gamification.chips.aria, { streak, points: nf.format(points) })}
      data-testid="stat-chips"
      className="flex items-center gap-2"
    >
      <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-semibold tabular-nums">
        <Flame className="size-4 fill-[var(--color-streak)] stroke-[var(--color-streak)]" aria-hidden="true" />
        <span aria-hidden="true">{streak}</span>
      </span>
      <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-semibold tabular-nums text-[var(--color-accent-text)]">
        <Sparkles className="size-4 fill-[var(--color-accent)] stroke-[var(--color-accent)]" aria-hidden="true" />
        <span aria-hidden="true">{nf.format(points)}</span>
      </span>
    </div>
  );
}
