'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/common/state-views';
import { Skeleton } from '@/components/ui/skeleton';
import { id } from '@/i18n/id';
import { curriculumApi } from '@/lib/api/curriculum';
import { SkillTree } from './skill-tree';

export const CURRICULUM_TREE_KEY = ['curriculum-tree'] as const;

function TreeSkeleton() {
  return (
    <div className="grid gap-8" role="status" aria-label={id.common.loading}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-4">
          <Skeleton className="h-36 w-full rounded-lg" />
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="hidden h-48 w-full rounded-lg xl:block" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Halaman /peta: memuat GET /curriculum/tree lalu merender SkillTree dengan state loading/error. */
export function SkillTreeView() {
  const tree = useQuery({
    queryKey: CURRICULUM_TREE_KEY,
    queryFn: ({ signal }) => curriculumApi.tree(signal),
    // Status gerbang berubah setelah ujian; selalu muat ulang saat halaman dibuka.
    staleTime: 0,
  });

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-3xl font-bold">{id.tree.title}</h1>
        <p className="mt-1 text-muted-foreground">{id.tree.description}</p>
      </header>
      {tree.isPending ? (
        <TreeSkeleton />
      ) : tree.isError ? (
        <ErrorState title={id.tree.loadFailedTitle} body={id.tree.loadFailedBody} onRetry={() => void tree.refetch()} />
      ) : (
        <SkillTree tree={tree.data} />
      )}
    </div>
  );
}
