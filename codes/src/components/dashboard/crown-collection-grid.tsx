'use client';

import { Crown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CROWN_BANDS, CROWN_TIERS, type CrownCollection, type CrownTier } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

/** Warna mahkota (hex tetap sesuai spesifikasi; tetap terbaca di terang dan gelap karena ada label teks). */
const CROWN_COLOR: Record<CrownTier, string> = {
  NONE: '#78716C',
  BRONZE: '#B45309',
  SILVER: '#94A3B8',
  GOLD: '#F59E0B',
};

/** Koleksi 4 mahkota berdasarkan akurasi terbaik per sub-modul, plus bar sebaran. */
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
  const total = collection.attempted;
  return (
    <Card data-testid="dash-crowns" className={cn('gap-3 rounded-2xl p-5', className)}>
      <h2 className="text-sm font-semibold text-muted-foreground">Koleksi Mahkota</h2>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="dash-crowns-empty">
          Selesaikan drill untuk mulai mengoleksi mahkota.
        </p>
      ) : (
        <div
          role="img"
          aria-label={`Sebaran ${total} sub-modul berdasarkan akurasi`}
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        >
          {CROWN_TIERS.map((tier) =>
            collection.counts[tier] > 0 ? (
              <span key={tier} style={{ width: `${(collection.counts[tier] / total) * 100}%`, background: CROWN_COLOR[tier] }} />
            ) : null,
          )}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {CROWN_TIERS.map((tier) => {
          const earned = collection.counts[tier] > 0;
          return (
            <li
              key={tier}
              data-testid={`dash-crown-${tier}`}
              className={cn('flex flex-col items-center gap-0.5 rounded-xl border p-3 text-center', !earned && 'opacity-55')}
              style={earned ? { background: `color-mix(in srgb, ${CROWN_COLOR[tier]} 14%, transparent)`, borderColor: `color-mix(in srgb, ${CROWN_COLOR[tier]} 45%, transparent)` } : undefined}
            >
              <Crown className="size-6" style={{ color: CROWN_COLOR[tier] }} aria-hidden="true" />
              <span className="text-xl font-bold leading-tight tabular-nums">{collection.counts[tier]}</span>
              <span className="text-xs font-medium">{CROWN_BANDS[tier].label}</span>
              <span className="text-[11px] text-muted-foreground">{CROWN_BANDS[tier].range}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
