'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { ActiveDrill } from '@/components/quiz/active-drill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AttemptResult } from '@/contracts/attempts';
import { attemptsApi } from '@/lib/api/attempts';
import { isApiError } from '@/lib/api/client';
import { CheckpointResultView } from './checkpoint-result';

export function CheckpointSession({ attemptId }: { attemptId: string }) {
  const [result, setResult] = React.useState<AttemptResult | null>(null);

  const attemptQ = useQuery({
    queryKey: ['checkpoint', 'attempt', attemptId],
    queryFn: ({ signal }) => attemptsApi.get(attemptId, signal),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const resultQ = useQuery({
    queryKey: ['checkpoint', 'result', attemptId],
    queryFn: ({ signal }) => attemptsApi.result(attemptId, signal),
    enabled: attemptQ.data !== undefined && attemptQ.data.status !== 'IN_PROGRESS' && !result,
    staleTime: 0,
    retry: false,
  });

  if (result) return <CheckpointResultView result={result} />;
  if (resultQ.data) return <CheckpointResultView result={resultQ.data} />;

  if (attemptQ.isPending || resultQ.isPending) {
    return <Skeleton className="h-96 w-full max-w-3xl mx-auto rounded-xl" role="status" aria-label="Memuat sesi..." />;
  }

  if (attemptQ.isError) {
    if (isApiError(attemptQ.error) && attemptQ.error.status === 404) {
      return (
        <div className="mx-auto grid max-w-md gap-3 rounded-lg border bg-card p-6">
          <h1 className="text-xl font-bold">Sesi Checkpoint Tidak Ditemukan</h1>
          <Button asChild className="w-fit">
            <Link href="/peta">Kembali ke Peta</Link>
          </Button>
        </div>
      );
    }
    return <ErrorState title="Gagal memuat sesi checkpoint" onRetry={() => void attemptQ.refetch()} />;
  }

  const attempt = attemptQ.data;
  if (!attempt) return null;

  if (attempt.status === 'ABANDONED') {
    return (
      <div className="mx-auto grid max-w-md gap-3 rounded-lg border bg-card p-6">
        <h1 className="text-xl font-bold">Sesi Checkpoint Sudah Ditinggalkan</h1>
        <p className="text-sm text-muted-foreground">Sesi ini telah digantikan oleh sesi baru atau dibatalkan.</p>
        <Button asChild className="w-fit">
          <Link href="/peta">Kembali ke Peta</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ActiveDrill
        attempt={attempt}
        onFinished={(res: AttemptResult) => {
          setResult(res);
        }}
      />
    </div>
  );
}
