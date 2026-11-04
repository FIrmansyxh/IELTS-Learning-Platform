'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import * as React from 'react';
import { Pagination, ResponsiveList, type Column } from '@/components/admin/responsive-list';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { id } from '@/i18n/id';
import { gamificationApi } from '@/lib/api/gamification';
import type { PointEntry } from '@/lib/api/gamification-contract';
import { formatDateTime } from '@/lib/format';

const t = id.gamification.points;
const PAGE_SIZE = 20;

function HistoryBody() {
  const [page, setPage] = React.useState(1);
  const q = useQuery({
    queryKey: ['me', 'points', page],
    queryFn: ({ signal }) => gamificationApi.points({ page, page_size: PAGE_SIZE }, signal),
    placeholderData: (prev) => prev,
    retry: false,
  });
  const columns: Column<PointEntry>[] = [
    { key: 'time', header: t.colTime, cell: (r) => formatDateTime(r.created_at) },
    {
      key: 'source',
      header: t.colSource,
      cell: (r) => (
        <span className="grid gap-0.5">
          <span className="font-medium">{t.sources[r.source] ?? t.sourceOther}</span>
          {r.note ? <span className="text-xs text-muted-foreground">{r.note}</span> : null}
        </span>
      ),
    },
    {
      key: 'points',
      header: t.colPoints,
      className: 'text-right',
      cell: (r) => <span className="font-semibold tabular-nums">{r.points > 0 ? `+${r.points}` : r.points}</span>,
    },
  ];
  return (
    <div className="grid gap-4 px-4 pb-6">
      <ResponsiveList
        caption={t.title}
        columns={columns}
        rows={q.data?.data}
        rowKey={(r) => r.id}
        isLoading={q.isPending}
        error={q.isError}
        onRetry={() => void q.refetch()}
        emptyMessage={t.empty}
      />
      <Pagination meta={q.data?.meta} onPage={setPage} />
    </div>
  );
}

/** Tautan "Riwayat poin" pada profil: Sheet berisi tabel `GET /me/points` (mobile: kartu). */
export function PointsHistorySheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full sm:w-fit">
          <History aria-hidden="true" />
          {id.gamification.stats.pointsHistory}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription>{t.description}</SheetDescription>
        </SheetHeader>
        <HistoryBody />
      </SheetContent>
    </Sheet>
  );
}
