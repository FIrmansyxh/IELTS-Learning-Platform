'use client';

import Link from 'next/link';
import { Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { TargetBandState } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

/** Kartu Target Band dengan dua kondisi isi (belum ada prediksi / sedang menuju target). */
export function TargetBandCard({
  state,
  loading = false,
  className,
}: {
  state: TargetBandState | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading || !state) {
    return <Skeleton className={cn('h-44 rounded-2xl', className)} role="status" aria-label="Memuat" />;
  }
  return (
    <Card data-testid="dash-target-band" className={cn('gap-3 rounded-2xl p-5', className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Target className="size-4 text-primary" aria-hidden="true" />
        Target Band
      </div>
      {state.kind === 'NO_TARGET' && (
        <>
          <p className="text-sm text-muted-foreground">Belum ada target band. Tetapkan target agar progres terukur.</p>
          <Link href="/profil" className="w-fit text-sm font-medium text-primary underline underline-offset-2">
            Atur target di Profil
          </Link>
        </>
      )}
      {state.kind === 'NO_PREDICTION' && (
        <>
          <p className="text-3xl font-bold tabular-nums">{state.target.toFixed(1)}</p>
          <p className="text-sm text-muted-foreground">
            Selesaikan latihan atau simulasi untuk melihat estimasi band Anda terhadap target ini.
          </p>
        </>
      )}
      {state.kind === 'TRACKING' && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums" data-testid="dash-band-current">
              {state.current.toFixed(1)}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">/ target {state.target.toFixed(1)}</span>
          </div>
          <Progress
            value={Math.min(100, Math.round((state.current / state.target) * 100))}
            aria-label="Kemajuan menuju target band"
          />
          <p className="text-sm text-muted-foreground">
            {state.reached ? 'Target band tercapai. Pertahankan konsistensi.' : `Kurang ${state.gap.toFixed(1)} band lagi menuju target.`}
          </p>
        </>
      )}
    </Card>
  );
}
