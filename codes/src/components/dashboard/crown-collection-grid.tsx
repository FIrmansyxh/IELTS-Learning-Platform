'use client';

import { Crown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CROWN_BANDS, CROWN_TIERS, type CrownCollection, type CrownTier } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

const CROWN_COLOR: Record<CrownTier, string> = {
  NONE: '#78716C',
  BRONZE: '#B45309',
  SILVER: '#94A3B8',
  GOLD: '#F59E0B',
};

/** Koleksi 4 mahkota berdasarkan akurasi terbaik per sub-modul. */
export function CrownCollectionGrid({
  collection,
  loading = false,
  className,
}: {
  collection: CrownCollection | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading || !collection) {
    return <Skeleton className={cn('h-44 rounded-2xl', className)} role="status" aria-label="Memuat" />;
  }
  return (
    <Card data-testid="dash-crowns" className={cn('gap-3 rounded-2xl p-5', className)}>
      <h2 className="text-sm font-semibold text-muted-foreground">Koleksi Mahkota</h2>
      {collection.attempted === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="dash-crowns-empty">
          Selesaikan drill untuk mulai mengoleksi mahkota.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CROWN_TIERS.map((tier) => {
          const earned = collection.counts[tier] > 0;
          return (
            <li
              key={tier}
              data-testid={`dash-crown-${tier}`}
              className={cn('flex flex-col items-center gap-1 rounded-xl border p-3 text-center', !earned && 'opacity-60')}
            >
              <Crown className="size-7" style={{ color: CROWN_COLOR[tier] }} aria-hidden="true" />
              <span className="text-xl font-bold tabular-nums">{collection.counts[tier]}</span>
              <span className="text-xs font-medium">{CROWN_BANDS[tier].label}</span>
              <span className="text-[11px] text-muted-foreground">{CROWN_BANDS[tier].range}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
