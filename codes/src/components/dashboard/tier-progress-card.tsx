'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { TierProgress } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

/** Progres 4 tier kurikulum; badge "Skip Test" bila tier bisa dilompati lewat tes. */
export function TierProgressCard({
  tiers,
  loading = false,
  className,
}: {
  tiers: readonly TierProgress[] | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading || !tiers) {
    return <Skeleton className={cn('h-56 rounded-2xl', className)} role="status" aria-label="Memuat" />;
  }
  return (
    <Card data-testid="dash-tiers" className={cn('gap-4 rounded-2xl p-5', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Progres Kurikulum</h2>
        <Link href="/peta" className="text-sm font-medium text-primary underline underline-offset-2">
          Buka Peta
        </Link>
      </div>
      {tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kurikulum belum tersedia.</p>
      ) : (
        <ol className="grid gap-3">
          {tiers.map((t) => (
            <li key={t.tier_number} data-testid={`dash-tier-${t.tier_number}`} className={cn('grid gap-1.5', t.locked && 'opacity-60')}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  {t.locked && <Lock className="size-3.5 shrink-0" aria-label="Terkunci" />}
                  <span className="truncate">
                    Tier {t.tier_number} · {t.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t.cefr_level}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {t.skip_test_available && <Badge variant="outline">Skip Test</Badge>}
                  <span className="tabular-nums text-muted-foreground">{t.progress_percent}%</span>
                </span>
              </div>
              <Progress value={t.progress_percent} aria-label={`Progres Tier ${t.tier_number}`} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
