'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { placementApi } from '@/lib/api/placement';
import { Skeleton } from '@/components/ui/skeleton';
import { id } from '@/i18n/id';

export default function PlacementRedirectPage() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['placement-status'],
    queryFn: ({ signal }) => placementApi.status(signal),
    staleTime: 0,
  });

  React.useEffect(() => {
    if (!q.data) return;
    if (q.data.active_attempt_id) {
      router.replace(`/ujian/${q.data.active_attempt_id}`);
      return;
    }
    if (q.data.pending_result) {
      router.replace(`/ujian/${q.data.pending_result.attempt_id}/hasil`);
      return;
    }
    if (q.data.available && q.data.assessment_set_id) {
      router.replace(`/ujian/mulai/${q.data.assessment_set_id}`);
      return;
    }
    router.replace('/peta');
  }, [q.data, router]);

  return (
    <div className="mx-auto mt-10 grid max-w-md gap-4 text-center">
      <Skeleton className="h-40 w-full rounded-xl" />
      <p className="text-muted-foreground">{id.common.loading}</p>
    </div>
  );
}

