'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { gamificationApi } from '@/lib/api/gamification';

export const STATS_KEY = ['me', 'stats'] as const;
export const RADAR_KEY = ['me', 'skills', 'radar'] as const;

/** Statistik gamifikasi. Non-kritis: galat tidak memunculkan Toast; pemanggil menyembunyikan tampilan. */
export function useStats() {
  return useQuery({
    queryKey: STATS_KEY,
    queryFn: ({ signal }) => gamificationApi.stats(signal),
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Segarkan statistik, radar, dan riwayat prediksi setelah hasil attempt tampil
 * (poin, mahkota, streak, skor keterampilan berubah di server dalam transaksi submit).
 */
export function useRefreshProgressOnMount() {
  const qc = useQueryClient();
  React.useEffect(() => {
    void qc.invalidateQueries({ queryKey: STATS_KEY });
    void qc.invalidateQueries({ queryKey: ['me', 'skills'] });
    void qc.invalidateQueries({ queryKey: ['me', 'band-predictions'] });
    void qc.invalidateQueries({ queryKey: ['me', 'exam-history'] });
  }, [qc]);
}
