'use client';

import { useQuery } from '@tanstack/react-query';
import { FileAudio, FileText, Link2, Plus, PlaySquare, Search } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssetKind, RightsStatus, type AssetListItem } from '@/contracts/assets';
import { fmt, id } from '@/i18n/id';
import { assetsApi } from '@/lib/api/assets';
import { formatDate } from '@/lib/format';
import { AssetDetailSheet } from './asset-detail-sheet';
import { ExternalAssetSheet } from './external-asset-sheet';
import { BlocksPublishNote, RightsBadge } from './license-badges';
import { LicenseBanner } from './license-banner';
import { Pagination, ResponsiveList, type Column } from './responsive-list';
import { UploadAssetSheet } from './upload-asset-sheet';

const t = id.assets.list;
const PAGE_SIZE = 20;
const ALL = 'all';

/** Baris `UNVERIFIED` yang dirujuk konten = penghalang publikasi (ditandai merah). */
export function isPublishBlocker(a: Pick<AssetListItem, 'rights_status' | 'reference_count'>): boolean {
  return a.rights_status === 'UNVERIFIED' && a.reference_count > 0;
}

function Thumb({ asset }: { asset: AssetListItem }) {
  if (asset.kind === 'SLIDE_IMAGE' || asset.kind === 'IMAGE') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- berkas privat admin dari endpoint sesi
      <img
        src={assetsApi.fileUrl(asset.id)}
        alt=""
        loading="lazy"
        className="size-10 rounded border bg-muted object-cover"
      />
    );
  }
  const Icon =
    asset.kind === 'AUDIO_LISTENING'
      ? FileAudio
      : asset.kind === 'DOCUMENT'
        ? FileText
        : asset.kind === 'VIDEO_EMBED'
          ? PlaySquare
          : Link2;
  return (
    <span className="grid size-10 place-items-center rounded border bg-muted text-muted-foreground">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

export function AssetsPanel() {
  const [page, setPage] = React.useState(1);
  const [kind, setKind] = React.useState(ALL);
  const [rights, setRights] = React.useState(ALL);
  const [sourceId, setSourceId] = React.useState(ALL);
  const [onlyUnverified, setOnlyUnverified] = React.useState(false);
  const [qInput, setQInput] = React.useState('');
  const [q, setQ] = React.useState('');
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [externalOpen, setExternalOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const h = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(h);
  }, [qInput]);
  React.useEffect(() => setPage(1), [kind, rights, sourceId, onlyUnverified, q]);
  // Tautan dari kurasi konten (SPEC-020): `?buka=<asset_id>` membuka detail aset, `?belum=1` memfilter belum diverifikasi.
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const target = sp.get('buka');
    if (target) setDetailId(target);
    if (sp.get('belum') === '1') setOnlyUnverified(true);
  }, []);

  const sources = useQuery({ queryKey: ['admin', 'sources'], queryFn: assetsApi.sources });
  const params = {
    page,
    page_size: PAGE_SIZE,
    kind: kind === ALL ? undefined : kind,
    rights_status: onlyUnverified ? 'UNVERIFIED' : rights === ALL ? undefined : rights,
    source_id: sourceId === ALL ? undefined : sourceId,
    q: q || undefined,
  };
  const list = useQuery({
    queryKey: ['admin', 'assets', params],
    queryFn: () => assetsApi.list(params),
    placeholderData: (prev) => prev,
  });
  const filtered = Boolean(q) || kind !== ALL || rights !== ALL || sourceId !== ALL || onlyUnverified;

  const columns: Column<AssetListItem>[] = [
    { key: 'preview', header: t.colPreview, className: 'w-16', cell: (a) => <Thumb asset={a} /> },
    {
      key: 'title',
      header: t.colTitle,
      cell: (a) => (
        <div className="grid gap-1 text-left">
          <button
            type="button"
            onClick={() => setDetailId(a.id)}
            aria-label={`${t.open}: ${a.title}`}
            className="min-h-11 text-left font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
          >
            {a.title}
          </button>
          {isPublishBlocker(a) ? <BlocksPublishNote /> : null}
        </div>
      ),
    },
    {
      key: 'code',
      header: t.colCode,
      cell: (a) => (a.asset_code ? <code className="font-mono text-xs break-all">{a.asset_code}</code> : '-'),
    },
    { key: 'kind', header: t.colKind, cell: (a) => id.assets.kinds[a.kind] ?? a.kind },
    { key: 'source', header: t.colSource, cell: (a) => a.source.code },
    { key: 'rights', header: t.colRights, cell: (a) => <RightsBadge status={a.rights_status} /> },
    {
      key: 'refs',
      header: t.colRefs,
      cell: (a) => (a.reference_count > 0 ? fmt(t.refCount, { n: a.reference_count }) : t.noRefs),
    },
    { key: 'date', header: t.colDate, cell: (a) => formatDate(a.created_at) },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{id.assets.assetsTitle}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setExternalOpen(true)}>
            <Link2 aria-hidden="true" />
            {t.addExternal}
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Plus aria-hidden="true" />
            {t.add}
          </Button>
        </div>
      </div>

      <LicenseBanner />

      <form
        role="search"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(qInput.trim());
        }}
      >
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="assets-q">{t.search}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="assets-q"
              type="search"
              maxLength={100}
              value={qInput}
              className="pl-9"
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="assets-kind">{t.filterKind}</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id="assets-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{id.common.all}</SelectItem>
              {AssetKind.options.map((k) => (
                <SelectItem key={k} value={k}>
                  {id.assets.kinds[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="assets-rights">{t.filterRights}</Label>
          <Select value={onlyUnverified ? 'UNVERIFIED' : rights} onValueChange={setRights} disabled={onlyUnverified}>
            <SelectTrigger id="assets-rights" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{id.common.all}</SelectItem>
              {RightsStatus.options.map((r) => (
                <SelectItem key={r} value={r}>
                  {id.assets.rights[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="assets-source">{t.filterSource}</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger id="assets-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{id.common.all}</SelectItem>
              {(sources.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-11 items-end gap-3 pb-1.5">
          <Checkbox
            id="assets-unverified"
            checked={onlyUnverified}
            onCheckedChange={(c) => setOnlyUnverified(c === true)}
          />
          <Label htmlFor="assets-unverified" className="font-normal">
            {t.onlyUnverified}
          </Label>
        </div>
      </form>

      <ResponsiveList
        caption={id.assets.assetsTitle}
        columns={columns}
        rows={list.data?.data}
        rowKey={(a) => a.id}
        isLoading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyMessage={filtered ? t.emptyFiltered : t.empty}
        rowLabel={(a) => a.title}
        rowClassName={(a) => (isPublishBlocker(a) ? 'border-destructive bg-destructive/5' : undefined)}
      />
      <Pagination meta={list.data?.meta} onPage={setPage} />

      <UploadAssetSheet open={uploadOpen} onOpenChange={setUploadOpen} onOpenExisting={setDetailId} />
      <ExternalAssetSheet open={externalOpen} onOpenChange={setExternalOpen} onOpenExisting={setDetailId} />
      <AssetDetailSheet assetId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
