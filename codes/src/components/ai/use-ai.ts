'use client';

import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { aiApi } from '@/lib/api/ai';
import type { Submission } from '@/lib/api/ai-contract';
import { isTerminalStatus, pollIntervalMs } from '@/lib/ai/job';

export const AI_STATUS_KEY = ['ai', 'status'] as const;
export const submissionKey = (submissionId: string) => ['ai', 'submission', submissionId] as const;

/** Status penilai AI + kuota. Gagal memuat bukan kendala: pengiriman tetap diizinkan. */
export function useAiStatus() {
  return useQuery({
    queryKey: AI_STATUS_KEY,
    queryFn: ({ signal }) => aiApi.status(signal),
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Polling submission (SPEC-012): 2 detik selama 30 detik pertama, lalu 5 detik, berhenti di status
 * terminal. `initial` (respons POST) mengisi cache agar tidak ada kedipan kosong. Galat sementara
 * (mis. 429 `job_poll`) tidak menghentikan polling.
 */
export function useSubmissionPolling(submissionId: string | null, initial?: Submission | null) {
  const startedAt = React.useRef(Date.now());
  React.useEffect(() => {
    startedAt.current = Date.now();
  }, [submissionId]);

  return useQuery({
    queryKey: submissionKey(submissionId ?? 'none'),
    queryFn: ({ signal }) => aiApi.get(submissionId as string, signal),
    enabled: submissionId !== null,
    initialData: initial ?? undefined,
    retry: false,
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && isTerminalStatus(data.status)) return false;
      return pollIntervalMs(Date.now() - startedAt.current);
    },
  });
}
