'use client';

import Link from 'next/link';
import { RadarCard } from '@/components/radar/radar-card';
import { useRadarData } from '@/hooks/use-skills';
import { id } from '@/i18n/id';
import { findWeakArea, weakAreaHref } from '@/lib/dashboard';
import { cn } from '@/lib/utils';

/**
 * Radar kompetensi 6 sumbu (RadarCard, Recharts) beserta rekomendasi area lemah di bawahnya.
 * Radar dipakai ulang agar kontrak SPEC-017 (tabel alternatif, estimasi band, uji yang ada) tidak berubah.
 */
export function RadarCompetencyCard({ className }: { className?: string }) {
  const { data } = useRadarData();
  const weak = data ? findWeakArea(data.skills) : null;
  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="dash-radar">
      {/* flex-1: kartu radar mengisi tinggi baris bento agar sejajar dengan kolom di sebelahnya */}
      <RadarCard className="flex-1" />
      {weak && (
        <div
          data-testid="dash-weak-area"
          className="flex items-center justify-between gap-3 rounded-2xl border bg-[var(--color-primary-subtle)] p-4"
        >
          <p className="text-sm">
            Area terlemah: <strong>{id.radar.skills[weak.skill] ?? weak.skill}</strong> ({Math.round(weak.score_percent)}%)
          </p>
          <Link href={weakAreaHref(weak.skill)} className="shrink-0 text-sm font-semibold text-primary underline underline-offset-2">
            Latih sekarang
          </Link>
        </div>
      )}
    </div>
  );
}
