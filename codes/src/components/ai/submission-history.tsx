'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import * as React from 'react';
import { Pagination, ResponsiveList, type Column } from '@/components/admin/responsive-list';
import { formatBand } from '@/components/band/band-display';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { id } from '@/i18n/id';
import { aiApi } from '@/lib/api/ai';
import { SubmissionKind, type SubmissionKindType, type SubmissionListItem } from '@/lib/api/ai-contract';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 20;
const ALL = 'ALL';

/** Riwayat penilaian `/riwayat/penilaian`: tabel di desktop, kartu di mobile, filter jenis, paginasi. */
export function SubmissionHistory() {
  const [kind, setKind] = React.useState<SubmissionKindType | typeof ALL>(ALL);
  const [page, setPage] = React.useState(1);
  const q = useQuery({
    queryKey: ['ai', 'submissions', kind, page],
    queryFn: ({ signal }) => aiApi.list({ kind: kind === ALL ? undefined : kind, page, page_size: PAGE_SIZE }, signal),
    retry: false,
  });

  const columns: Column<SubmissionListItem>[] = [
    {
      key: 'kind',
      header: id.ai.history.colKind,
      cell: (r) => (
        <Link href={`/riwayat/penilaian/${r.id}`} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">
          {id.ai.kinds[r.kind] ?? r.kind}
        </Link>
      ),
    },
    {
      key: 'band',
      header: id.ai.history.colBand,
      className: 'text-right',
      cell: (r) => (
        <span className="tabular-nums">
          {r.overall_band !== null ? formatBand(r.overall_band) : id.ai.history.noBand}
          {r.method === 'SELF_ASSESSMENT' ? (
            <Badge variant="secondary" className="ml-2">
              {id.ai.self.badge}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'words',
      header: id.ai.history.colWords,
      className: 'text-right',
      cell: (r) => <span className="tabular-nums">{r.word_count !== null ? r.word_count : id.ai.history.noBand}</span>,
    },
    { key: 'date', header: id.ai.history.colDate, cell: (r) => formatDateTime(r.created_at) },
    {
      key: 'status',
      header: id.ai.history.colStatus,
      cell: (r) => <Badge variant={r.status === 'GRADED' ? 'default' : r.status === 'FAILED' ? 'destructive' : 'outline'}>{id.ai.statuses[r.status] ?? r.status}</Badge>,
    },
  ];

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <h1 className="text-3xl font-bold">{id.ai.history.title}</h1>
      <p className="text-sm text-muted-foreground">{id.band.estimasi}</p>
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="history-kind">{id.ai.history.filterLabel}</Label>
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v as SubmissionKindType | typeof ALL);
            setPage(1);
          }}
        >
          <SelectTrigger id="history-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{id.ai.history.filterAll}</SelectItem>
            {SubmissionKind.options.map((k) => (
              <SelectItem key={k} value={k}>
                {id.ai.kinds[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ResponsiveList
        caption={id.ai.history.caption}
        columns={columns}
        rows={q.data?.data}
        rowKey={(r) => r.id}
        isLoading={q.isPending}
        error={q.isError}
        onRetry={() => void q.refetch()}
        emptyMessage={id.ai.history.empty}
      />
      <Pagination meta={q.data?.meta} onPage={setPage} />
    </div>
  );
}
