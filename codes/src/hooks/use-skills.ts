'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { skillsApi } from '@/lib/api/skills';
import type { BandPredictionsQuery, ExamHistoryQuery } from '@/contracts/skills';

export const RADAR_KEY = ['skills', 'radar'] as const;
export const BAND_PREDICTIONS_KEY = ['skills', 'band-predictions'] as const;
export const EXAM_HISTORY_KEY = ['skills', 'exam-history'] as const;

export function useRadarData() {
  return useQuery({
    queryKey: RADAR_KEY,
    queryFn: ({ signal }) => skillsApi.radar(signal),
    staleTime: 30_000,
  });
}

export function useBandPredictions(query?: Partial<BandPredictionsQuery>) {
  return useQuery({
    queryKey: [...BAND_PREDICTIONS_KEY, query],
    queryFn: ({ signal }) => skillsApi.bandPredictions(query, signal),
    staleTime: 30_000,
  });
}

export function useExamHistory(query?: Partial<ExamHistoryQuery>) {
  return useQuery({
    queryKey: [...EXAM_HISTORY_KEY, query],
    queryFn: ({ signal }) => skillsApi.examHistory(query, signal),
    staleTime: 30_000,
  });
}

export function useInvalidateSkills() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: RADAR_KEY });
    qc.invalidateQueries({ queryKey: BAND_PREDICTIONS_KEY });
    qc.invalidateQueries({ queryKey: EXAM_HISTORY_KEY });
  };
}

