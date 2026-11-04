'use client';

import { useQuery } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { id } from '@/i18n/id';
import { placementApi } from '@/lib/api/placement';
import type { PlacementStatus } from '@/lib/api/placement-contract';

export const PLACEMENT_STATUS_KEY = ['placement-status'] as const;

/** GET /placement. Galat tidak ditampilkan: titik masuk Placement hanya tambahan, bukan alur utama. */
export function usePlacementStatus() {
  return useQuery({
    queryKey: PLACEMENT_STATUS_KEY,
    queryFn: ({ signal }) => placementApi.status(signal),
    staleTime: 0,
    retry: false,
  });
}

/** Tautan mulai Placement (set Placement `PUBLISHED`, tanpa attempt berjalan/hasil menunggu) atau null. */
export function placementStartHref(status: PlacementStatus | undefined): string | null {
  if (!status || !status.available || status.active_attempt_id || !status.assessment_set_id) return null;
  return `/ujian/mulai/${status.assessment_set_id}`;
}

/** Kartu status Placement: tes berjalan atau hasil menunggu diterapkan. Selain itu tidak menampilkan apa pun. */
export function PlacementStatusCard({ status }: { status: PlacementStatus | undefined }) {
  if (!status) return null;
  if (status.blocked_reason === 'RESULT_PENDING_APPLY' && status.pending_result) {
    return (
      <Card data-testid="placement-pending">
        <CardHeader>
          <CardTitle className="text-xl">
            <h2>{id.placement.entry.pendingTitle}</h2>
          </CardTitle>
          <CardDescription>{id.placement.entry.pendingBody}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg">
            <Link href={`/ujian/${status.pending_result.attempt_id}/hasil`}>{id.placement.entry.viewResult}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (status.available && status.active_attempt_id) {
    return (
      <Card data-testid="placement-active">
        <CardHeader>
          <CardTitle className="text-xl">
            <h2>{id.placement.entry.resumeTitle}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg">
            <Link href={`/ujian/${status.active_attempt_id}`}>{id.placement.entry.resume}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return null;
}

/** Ajakan Placement di `/peta` untuk pengguna tanpa progres. */
export function PlacementMapHint() {
  const q = usePlacementStatus();
  const href = placementStartHref(q.data);
  return (
    <>
      <PlacementStatusCard status={q.data} />
      {href ? (
        <aside
          aria-label={id.placement.entry.cta}
          data-testid="placement-map-hint"
          className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-sm">
            <Compass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {id.placement.entry.mapHint}
          </p>
          <Button asChild variant="outline">
            <Link href={href}>{id.placement.entry.cta}</Link>
          </Button>
        </aside>
      ) : null}
    </>
  );
}
