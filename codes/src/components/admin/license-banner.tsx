'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info } from 'lucide-react';
import Link from 'next/link';
import { fmt, id } from '@/i18n/id';
import { assetsApi } from '@/lib/api/assets';

/**
 * Banner ringkasan lisensi (SPEC-018). `nonCommercialOnly` dipakai pada langkah 2-4 importer.
 * Gagal muat tidak menghalangi halaman: banner disembunyikan.
 */
export function LicenseBanner({ nonCommercialOnly = false }: { nonCommercialOnly?: boolean }) {
  const q = useQuery({ queryKey: ['admin', 'license-summary'], queryFn: assetsApi.licenseSummary, staleTime: 30_000 });
  if (!q.data) return null;
  const { publish_blockers, non_commercial_sources_in_use: nc, share_alike_sources_in_use: sa } = q.data;
  const showBlockers = !nonCommercialOnly && publish_blockers > 0;
  const showSa = !nonCommercialOnly && sa.length > 0;
  if (!showBlockers && nc.length === 0 && !showSa) return null;

  return (
    <div className="grid gap-2" data-testid="license-banner">
      {showBlockers ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <p className="font-medium">{fmt(id.assets.summary.blockers, { n: publish_blockers })}</p>
          <Link
            href="/admin/konten/aset"
            className="font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {id.assets.summary.blockersLink}
          </Link>
        </div>
      ) : null}
      {nc.length > 0 ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-md border border-[var(--color-warning)] bg-[var(--color-surface-muted)] p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" />
          <p>{fmt(id.assets.summary.nonCommercial, { codes: nc.join(', ') })}</p>
        </div>
      ) : null}
      {showSa ? (
        <div role="status" className="flex items-start gap-3 rounded-md border bg-[var(--color-surface-muted)] p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>{fmt(id.assets.summary.shareAlike, { codes: sa.join(', ') })}</p>
        </div>
      ) : null}
    </div>
  );
}
