'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gamificationApi } from '@/lib/api/gamification';

export const STATS_KEY = ['gamification', 'stats'] as const;

export function useGamificationStats() {
  return useQuery({
    queryKey: STATS_KEY,
    queryFn: ({ signal }) => gamificationApi.stats(signal),
    staleTime: 30_000,
  });
}

export function useInvalidateGamificationStats() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: STATS_KEY });
}

