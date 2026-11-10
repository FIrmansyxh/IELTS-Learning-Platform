'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Compass } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { id } from '@/i18n/id';
import { tracksApi } from '@/lib/api/tracks';
import { cn } from '@/lib/utils';
import { CURRICULUM_TREE_KEY } from '@/components/skill-tree/skill-tree-view';

export const TRACKS_LIST_KEY = ['tracks', 'list'] as const;

const STYLE_LABELS: Record<string, string> = {
  LEARN_FIRST: 'Belajar dulu',
  PRACTICE_FIRST: 'Latihan dulu',
  CASE_BASED: 'Studi kasus',
};

interface TrackPickerProps {
  selectedTrackCode: string | null;
  onSelectTrack: (trackCode: string) => void;
}

export function TrackPicker({ selectedTrackCode, onSelectTrack }: TrackPickerProps) {
  const qc = useQueryClient();

  const tracksQ = useQuery({
    queryKey: TRACKS_LIST_KEY,
    queryFn: ({ signal }) => tracksApi.list(signal),
    staleTime: 30_000,
  });

  const setActiveMutation = useMutation({
    mutationFn: (trackCode: string) => tracksApi.setActive(trackCode),
    onSuccess: (_, trackCode) => {
      toast.success(`Jalur belajar aktif diubah ke ${trackCode}`);
      void qc.invalidateQueries({ queryKey: TRACKS_LIST_KEY });
      void qc.invalidateQueries({ queryKey: CURRICULUM_TREE_KEY });
    },
    onError: () => {
      toast.error('Gagal mengubah jalur belajar aktif.');
    },
  });

  if (tracksQ.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label={id.common.loading}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (tracksQ.isError || !tracksQ.data) {
    return null;
  }

  const tracks = tracksQ.data;
  const currentActiveTrack = tracks.find((t) => t.is_active);
  const activeCode = selectedTrackCode ?? currentActiveTrack?.code ?? 'GT-STRUCT';

  return (
    <section aria-label="Pilihan Jalur Belajar" className="@container grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Compass className="size-4 text-primary" aria-hidden="true" />
          <span>Pilih Jalur Belajar</span>
        </div>
        {currentActiveTrack ? (
          <span className="text-xs text-muted-foreground">
            Jalur Aktif Anda:{' '}
            <strong className="text-foreground">{currentActiveTrack.title}</strong>
          </span>
        ) : null}
      </div>

      {/* Layar sempit: deretan geser horizontal agar peta tidak terdorong jauh ke bawah; kolom mengikuti lebar wadah. */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-px py-1 @xl:grid @xl:snap-none @xl:grid-cols-2 @xl:overflow-visible @4xl:grid-cols-4">
        {tracks.map((track) => {
          const isSelected = track.code === activeCode;
          const isProfileActive = track.is_active;
          const pct =
            track.total_sub_modules > 0
              ? Math.min(100, Math.round((track.completed_sub_modules / track.total_sub_modules) * 100))
              : 0;

          return (
            <Card
              key={track.code}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              onClick={() => onSelectTrack(track.code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTrack(track.code);
                }
              }}
              className={cn(
                'group relative flex w-[82%] shrink-0 snap-start flex-col justify-between gap-0 cursor-pointer border p-4 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary @xl:w-auto @xl:shrink',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                  : 'hover:border-primary/50 hover:bg-accent/40',
              )}
            >
              <div className="grid gap-2">
                <div className="flex items-start justify-between gap-1">
                  <div className="grid gap-0.5">
                    <h3 className="text-base font-semibold text-foreground leading-tight">{track.title}</h3>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{track.description}</p>
                  </div>
                  {isProfileActive ? (
                    <Badge variant="default" className="shrink-0 text-[10px] bg-primary text-primary-foreground">
                      Aktif
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-normal">
                    Band {track.target_band_min} - {track.target_band_max}
                  </Badge>
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0 font-normal">
                    {STYLE_LABELS[track.delivery_style_default] ?? track.delivery_style_default}
                  </Badge>
                  {track.layout === 'SPRINT' ? (
                    <Badge variant="secondary" className="text-[11px] px-1.5 py-0 font-normal bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      Sprint 4 Minggu
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-2 border-t pt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progres materi</span>
                  <span className="font-medium text-foreground">
                    {track.completed_sub_modules}/{track.total_sub_modules} ({pct}%)
                  </span>
                </div>
                <Progress value={pct} className="h-1.5" />

                {!isProfileActive ? (
                  <Button
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className="mt-1 w-full text-xs h-8"
                    disabled={setActiveMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMutation.mutate(track.code);
                    }}
                  >
                    Jadikan Jalur Aktif
                  </Button>
                ) : (
                  <div className="mt-1 flex h-8 items-center justify-center gap-1.5 text-xs text-primary font-medium">
                    <Check className="size-3.5" aria-hidden="true" />
                    <span>Jalur Utama Profil</span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
