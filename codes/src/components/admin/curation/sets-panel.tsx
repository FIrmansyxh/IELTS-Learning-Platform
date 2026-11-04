'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Pagination, ResponsiveList, type Column } from '@/components/admin/responsive-list';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fmt, id } from '@/i18n/id';
import { curationApi } from '@/lib/api/curation';
import { AssessmentSetType, type SetSummary } from '@/lib/api/curation-contract';
import { ReviewStatus } from '@/contracts/common';
import { formatDateTime } from '@/lib/format';
import { CurationTabs } from './curation-tabs';
import { NativeSelect } from './fields';
import { ReviewStatusBadge } from './status';

const t = id.curation.sets;
const PAGE_SIZE = 20;
const ALL = 'all';

/** `/admin/konten/soal`: daftar set dengan filter jenis, status, tier, dan pencarian judul. */
export function SetsPanel() {
  const [page, setPage] = React.useState(1);
  const [type, setType] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);
  const [tier, setTier] = React.useState(ALL);
  const [qInput, setQInput] = React.useState('');
  const [q, setQ] = React.useState('');

  React.useEffect(() => {
    const h = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(h);
  }, [qInput]);
  React.useEffect(() => setPage(1), [type, status, tier, q]);

  const params = {
    page,
    page_size: PAGE_SIZE,
    assessment_type: type === ALL ? undefined : type,
    status: status === ALL ? undefined : status,
    tier_number: tier === ALL ? undefined : Number(tier),
    q: q || undefined,
  };
  const list = useQuery({
    queryKey: ['admin', 'curation-sets', params],
    queryFn: ({ signal }) => curationApi.sets(params, signal),
    placeholderData: (prev) => prev,
  });
  const filtered = Boolean(q) || type !== ALL || status !== ALL || tier !== ALL;

  const columns: Column<SetSummary>[] = [
    {
      key: 'title',
      header: t.colTitle,
      cell: (s) => (
        <div className="grid gap-0.5 text-left">
          <Link
            href={`/admin/konten/soal/${s.id}`}
            aria-label={fmt(t.openAria, { title: s.title })}
            className="min-h-11 font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
          >
            {s.title}
          </Link>
          <span className="text-xs text-muted-foreground">{s.scope_label}</span>
        </div>
      ),
    },
    { key: 'type', header: t.colType, cell: (s) => id.curation.setTypes[s.assessment_type] ?? s.assessment_type },
    { key: 'status', header: t.colStatus, cell: (s) => <ReviewStatusBadge status={s.status} /> },
    { key: 'questions', header: t.colQuestions, className: 'text-right', cell: (s) => <span className="tabular-nums">{s.question_count}</span> },
    { key: 'version', header: t.colVersion, className: 'text-right', cell: (s) => <span className="tabular-nums">{s.version}</span> },
    { key: 'updated', header: t.colUpdated, cell: (s) => formatDateTime(s.updated_at) },
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>
      <CurationTabs current="soal" />

      <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); }}>
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="sets-q">{t.search}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="sets-q" type="search" maxLength={100} value={qInput} className="pl-9" onChange={(e) => setQInput(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sets-type">{t.filterType}</Label>
          <NativeSelect id="sets-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value={ALL}>{id.common.all}</option>
            {AssessmentSetType.options.map((o) => (
              <option key={o} value={o}>
                {id.curation.setTypes[o]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sets-status">{t.filterStatus}</Label>
          <NativeSelect id="sets-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={ALL}>{id.common.all}</option>
            {ReviewStatus.options.map((o) => (
              <option key={o} value={o}>
                {id.curation.status[o]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sets-tier">{t.filterTier}</Label>
          <NativeSelect id="sets-tier" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value={ALL}>{id.common.all}</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={String(n)}>
                {fmt(id.tree.tierLabel, { n })}
              </option>
            ))}
          </NativeSelect>
        </div>
      </form>

      <ResponsiveList
        caption={t.title}
        columns={columns}
        rows={list.data?.data}
        rowKey={(s) => s.id}
        isLoading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyMessage={filtered ? t.emptyFiltered : t.empty}
        rowLabel={(s) => s.title}
      />
      <Pagination meta={list.data?.meta} onPage={setPage} />
    </div>
  );
}

