'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { NativeSelect } from '@/components/admin/curation/fields';
import { Pagination, ResponsiveList, type Column } from '@/components/admin/responsive-list';
import { EstimasiNotice, formatBand } from '@/components/band/band-display';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fmt, id } from '@/i18n/id';
import { skillsApi } from '@/lib/api/skills';
import { ExamHistoryType, type BandPrediction, type ExamHistoryItem } from '@/lib/api/skills-contract';
import { formatDateTime, formatScorePercent } from '@/lib/format';
import { BandProgressChart } from './band-progress-chart';

const t = id.history.exam;
const PAGE_SIZE = 20;
const POINT_PAGE = 100;
const ALL = 'ALL';

/** `result_path` hanya boleh tautan internal (cegah open redirect bila server keliru). */
export function safeInternalPath(p: string): string {
  return p.startsWith('/') && !p.startsWith('//') ? p : '/riwayat/ujian';
}

function ResultCell({ passed }: { passed: boolean | null }) {
  if (passed === null) return <span className="text-muted-foreground">{t.noResult}</span>;
  return passed ? (
    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-done-text)]">
      <CheckCircle2 className="size-4" aria-hidden="true" />
      {t.passed}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-accent-text)]">
      <XCircle className="size-4" aria-hidden="true" />
      {t.notPassed}
    </span>
  );
}

/** Titik grafik: urut lama -> baru; bila lebih dari satu halaman, ambil halaman terakhir (terbaru). */
async function loadPoints(signal?: AbortSignal): Promise<BandPrediction[]> {
  const first = await skillsApi.predictions({ page: 1, page_size: POINT_PAGE }, signal);
  if (first.meta.total <= POINT_PAGE) return first.data;
  const last = await skillsApi.predictions({ page: Math.ceil(first.meta.total / POINT_PAGE), page_size: POINT_PAGE }, signal);
  return last.data;
}

/** `/riwayat/ujian`: grafik Perkembangan Band + tabel riwayat ujian (kartu di mobile). */
export function ExamHistory() {
  const [type, setType] = React.useState<string>(ALL);
  const [page, setPage] = React.useState(1);
  const points = useQuery({ queryKey: ['me', 'band-predictions', 'chart'], queryFn: ({ signal }) => loadPoints(signal), retry: false });
  const params = { page, page_size: PAGE_SIZE, assessment_type: type === ALL ? undefined : (type as ExamHistoryItem['assessment_type']) };
  const list = useQuery({
    queryKey: ['me', 'exam-history', params],
    queryFn: ({ signal }) => skillsApi.examHistory(params, signal),
    placeholderData: (prev) => prev,
    retry: false,
  });

  const columns: Column<ExamHistoryItem>[] = [
    { key: 'when', header: t.colWhen, cell: (r) => formatDateTime(r.submitted_at) },
    {
      key: 'type',
      header: t.colType,
      cell: (r) => (
        <span className="grid gap-0.5">
          <span className="font-medium">{t.types[r.assessment_type] ?? r.assessment_type}</span>
          <span className="text-xs text-muted-foreground">{r.title}</span>
        </span>
      ),
    },
    { key: 'score', header: t.colScore, className: 'text-right', cell: (r) => <span className="tabular-nums">{formatScorePercent(r.score_percent)}%</span> },
    { key: 'band', header: t.colBand, className: 'text-right', cell: (r) => <span className="tabular-nums">{r.band_score === null ? '-' : formatBand(r.band_score)}</span> },
    { key: 'result', header: t.colResult, cell: (r) => <ResultCell passed={r.passed} /> },
    {
      key: 'view',
      header: t.colView,
      hideLabelOnCard: true,
      cell: (r) => (
        <Button asChild variant="outline" size="sm" className="w-full md:w-auto">
          <Link href={safeInternalPath(r.result_path)} aria-label={fmt(t.viewAria, { title: r.title })}>
            {t.view}
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">{t.title}</h1>
      {points.isError ? null : points.isPending ? (
        <div className="h-64 animate-pulse rounded-xl border bg-muted motion-reduce:animate-none" role="status" aria-label={id.common.loading} />
      ) : (
        <BandProgressChart points={points.data} />
      )}

      <section aria-labelledby="exam-list-title" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="exam-list-title" className="text-lg font-bold">
            {t.listTitle}
          </h2>
          <div className="grid gap-1.5">
            <Label htmlFor="exam-type">{t.filterType}</Label>
            <NativeSelect
              id="exam-type"
              className="sm:w-56"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value={ALL}>{id.common.all}</option>
              {ExamHistoryType.options.map((o) => (
                <option key={o} value={o}>
                  {t.types[o]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <ResponsiveList
          caption={t.listTitle}
          columns={columns}
          rows={list.data?.data}
          rowKey={(r) => r.attempt_id}
          isLoading={list.isPending}
          error={list.isError}
          onRetry={() => void list.refetch()}
          emptyMessage={t.empty}
          rowLabel={(r) => r.title}
        />
        <Pagination meta={list.data?.meta} onPage={setPage} />
        <EstimasiNotice />
      </section>
    </div>
  );
}
