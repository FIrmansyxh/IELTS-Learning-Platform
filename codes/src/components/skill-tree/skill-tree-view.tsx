'use client';

import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { Skeleton } from '@/components/ui/skeleton';
import { id } from '@/i18n/id';
import { tracksApi } from '@/lib/api/tracks';
import { CuratedTrackView } from '@/components/tracks/curated-track-view';
import { TrackPicker } from '@/components/tracks/track-picker';
import { SkillTree } from './skill-tree';

export const CURRICULUM_TREE_KEY = ['curriculum-tree'] as const;

function TreeSkeleton() {
  return (
    <div className="grid gap-8" role="status" aria-label={id.common.loading}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-4">
          <Skeleton className="h-36 w-full rounded-lg" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="hidden h-48 w-full rounded-lg md:block" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Halaman /peta: memuat GET /curriculum/tree lalu merender SkillTree atau CuratedTrackView sesuai jalur terpilih. */
export function SkillTreeView() {
  const [selectedTrackCode, setSelectedTrackCode] = React.useState<string | null>(null);

  const tree = useQuery({
    queryKey: [...CURRICULUM_TREE_KEY, selectedTrackCode],
    queryFn: ({ signal }) => tracksApi.tree(selectedTrackCode, signal),
    staleTime: 0,
  });

  const track = tree.data?.track ?? null;
  const isCurated = track !== null && track.code !== 'GT-STRUCT';

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-3xl font-bold">{id.tree.title}</h1>
        <p className="mt-1 text-muted-foreground">{id.tree.description}</p>
      </header>

      <TrackPicker
        selectedTrackCode={selectedTrackCode ?? track?.code ?? null}
        onSelectTrack={(code) => setSelectedTrackCode(code)}
      />

      {tree.isPending ? (
        <TreeSkeleton />
      ) : tree.isError ? (
        <ErrorState title={id.tree.loadFailedTitle} body={id.tree.loadFailedBody} onRetry={() => void tree.refetch()} />
      ) : isCurated && track ? (
        <CuratedTrackView
          track={track}
          onSwitchToCurriculum={() => setSelectedTrackCode('GT-STRUCT')}
        />
      ) : (
        <SkillTree tree={tree.data} />
      )}
    </div>
  );
}
