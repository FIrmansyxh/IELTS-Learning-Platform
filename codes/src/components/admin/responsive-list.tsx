'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState, EmptyState } from '@/components/common/state-views';
import type { PageMeta } from '@/lib/api/types';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Sembunyikan label pada kartu mobile (mis. kolom aksi). */
  hideLabelOnCard?: boolean;
};

/**
 * Tabel (>= md) yang berubah menjadi daftar kartu label:nilai pada mobile, lengkap dengan
 * state loading/error/kosong (design-system 5.6). Tanpa scroll horizontal.
 */
export function ResponsiveList<T>({
  caption,
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  emptyMessage,
  rowLabel,
  rowClassName,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  isLoading: boolean;
  error: boolean;
  onRetry: () => void;
  emptyMessage: string;
  rowLabel?: (row: T) => string;
  /** Kelas tambahan per baris (mis. penanda merah). */
  rowClassName?: (row: T) => string | undefined;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-2" role="status" aria-label={id.common.loading}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState onRetry={onRetry} />;
  if (!rows || rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} scope="col" className={c.className}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={cn('min-h-12', rowClassName?.(row))}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            aria-label={rowLabel?.(row)}
            className={cn('grid gap-2 rounded-lg border bg-card p-4 text-sm', rowClassName?.(row))}
          >
            {columns.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3">
                {c.hideLabelOnCard ? null : <span className="shrink-0 text-muted-foreground">{c.header}</span>}
                <div className={c.hideLabelOnCard ? 'w-full' : 'min-w-0 text-right break-words'}>{c.cell(row)}</div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({
  meta,
  onPage,
}: {
  meta: PageMeta | undefined;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.page_size));
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Paginasi">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {fmt(id.common.pageOf, { page: meta.page, total: totalPages })} · {fmt(id.common.totalRows, { total: meta.total })}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          {id.common.previous}
        </Button>
        <Button variant="outline" size="sm" disabled={meta.page >= totalPages} onClick={() => onPage(meta.page + 1)}>
          {id.common.next}
        </Button>
      </div>
    </nav>
  );
}
