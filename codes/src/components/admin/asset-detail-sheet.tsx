'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ALLOWED_RIGHTS_BY_KIND, type AssetDetail, type RightsStatusValue } from '@/contracts/assets';
import { fmt, id } from '@/i18n/id';
import { assetsApi } from '@/lib/api/assets';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatBytes, formatDateTime } from '@/lib/format';
import { ConfirmDialog } from './dialogs';
import { LicenseBadge, RightsBadge } from './license-badges';

const t = id.assets.detail;

function safeExternal(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function Preview({ asset }: { asset: AssetDetail }) {
  const fileUrl = assetsApi.fileUrl(asset.id);
  if (asset.kind === 'SLIDE_IMAGE' || asset.kind === 'IMAGE') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- berkas privat admin dari endpoint sesi, bukan aset statis
      <img
        src={fileUrl}
        alt={fmt(id.assets.list.previewAlt, { title: asset.title })}
        className="max-h-64 w-full rounded-md border bg-muted object-contain"
      />
    );
  }
  if (asset.kind === 'AUDIO_LISTENING') {
    return <audio controls preload="none" src={fileUrl} className="w-full" aria-label={asset.title} />;
  }
  if (asset.kind === 'DOCUMENT') {
    return (
      <Button asChild variant="outline">
        <a href={fileUrl} target="_blank" rel="noopener noreferrer">
          <FileText aria-hidden="true" />
          {t.previewDocument}
        </a>
      </Button>
    );
  }
  const ext = safeExternal(asset.external_url);
  return ext ? (
    <Button asChild variant="outline">
      <a href={ext} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden="true" />
        {t.previewExternal}
      </a>
    </Button>
  ) : (
    <p className="text-sm text-muted-foreground">{t.noPreview}</p>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function DetailBody({ asset, onClose }: { asset: AssetDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const allowed = ALLOWED_RIGHTS_BY_KIND[asset.kind];
  const [rights, setRights] = React.useState<RightsStatusValue>(asset.rights_status);
  const [attribution, setAttribution] = React.useState(asset.attribution_text ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  React.useEffect(() => {
    setRights(asset.rights_status);
    setAttribution(asset.attribution_text ?? '');
  }, [asset.rights_status, asset.attribution_text]);

  const attributionChanged = attribution.trim() !== (asset.attribution_text ?? '');
  const rightsChanged = rights !== asset.rights_status;
  const needsAttribution =
    rights === 'VERIFIED_OPEN' && asset.source.license_type.startsWith('CC_BY') && attribution.trim() === '';
  const referenced = asset.referenced_by.length > 0;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['admin', 'assets'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'asset', asset.id] });
    void qc.invalidateQueries({ queryKey: ['admin', 'license-summary'] });
  }

  const save = useMutation({
    mutationFn: () =>
      assetsApi.update(asset.id, {
        ...(rightsChanged ? { rights_status: rights } : {}),
        ...(attributionChanged ? { attribution_text: attribution.trim() === '' ? null : attribution.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(t.saved);
      setConfirm(false);
      setError(null);
      refresh();
    },
    onError: (e) => {
      setConfirm(false);
      setError(apiErrorMessage(e));
    },
  });

  const remove = useMutation({
    mutationFn: () => assetsApi.remove(asset.id),
    onSuccess: () => {
      toast.success(t.deleted);
      setRemoving(false);
      refresh();
      onClose();
    },
    onError: (e) => {
      setRemoving(false);
      setError(apiErrorMessage(e));
      refresh();
    },
  });

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsAttribution) {
      setError(id.apiErrors.ATTRIBUTION_REQUIRED);
      document.getElementById('detail-attribution')?.focus();
      return;
    }
    if (rightsChanged) setConfirm(true);
    else save.mutate();
  }

  const ext = safeExternal(asset.external_url);

  return (
    <div className="grid gap-5 px-4 pb-6">
      <FormErrorSummary message={error} />

      <section aria-labelledby="detail-preview" className="grid gap-2">
        <h3 id="detail-preview" className="text-sm font-semibold">
          {t.preview}
        </h3>
        <Preview asset={asset} />
      </section>

      <section aria-labelledby="detail-meta" className="grid gap-2">
        <h3 id="detail-meta" className="text-sm font-semibold">
          {t.meta}
        </h3>
        <dl className="grid gap-2 text-sm">
          <Meta label={id.assets.list.colTitle}>{asset.title}</Meta>
          <Meta label={t.code}>{asset.asset_code ? <code className="font-mono break-all">{asset.asset_code}</code> : '-'}</Meta>
          <Meta label={t.kind}>{id.assets.kinds[asset.kind] ?? asset.kind}</Meta>
          <Meta label={t.source}>
            <span className="inline-flex flex-wrap items-center gap-2">
              {asset.source.code} - {asset.source.name} <LicenseBadge type={asset.source.license_type} />
            </span>
          </Meta>
          <Meta label={id.assets.list.colRights}>
            <RightsBadge status={asset.rights_status} />
          </Meta>
          {asset.mime_type ? <Meta label={t.mime}>{asset.mime_type}</Meta> : null}
          {asset.size_bytes !== null ? <Meta label={t.size}>{formatBytes(asset.size_bytes)}</Meta> : null}
          {asset.duration_sec !== null ? <Meta label={t.duration}>{asset.duration_sec} dtk</Meta> : null}
          {ext ? (
            <Meta label={t.url}>
              <a href={ext} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
                {ext}
              </a>
            </Meta>
          ) : null}
          {asset.external_ref ? <Meta label={t.ref}>{asset.external_ref}</Meta> : null}
          <Meta label={t.verifiedAt}>
            {asset.license_verified_at ? (
              <>
                {formatDateTime(asset.license_verified_at)}
                {asset.license_verified_by_name ? ` - ${fmt(t.verifiedBy, { name: asset.license_verified_by_name })}` : ''}
              </>
            ) : (
              t.notVerified
            )}
          </Meta>
          <Meta label={t.createdAt}>{formatDateTime(asset.created_at)}</Meta>
        </dl>
      </section>

      <section aria-labelledby="detail-used" className="grid gap-2">
        <h3 id="detail-used" className="text-sm font-semibold">
          {t.usedBy}
        </h3>
        {referenced ? (
          <ul className="grid gap-2 text-sm">
            {asset.referenced_by.map((r) => (
              <li key={`${r.entity_type}-${r.entity_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <span className="min-w-0 break-words">
                  <span className="text-muted-foreground">{t.entityTypes[r.entity_type] ?? r.entity_type}:</span> {r.label}{' '}
                  <span className="text-muted-foreground">({r.status})</span>
                </span>
                <Link
                  href="/admin/konten/kurikulum"
                  className="font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t.curriculumLink}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t.notUsed}</p>
        )}
      </section>

      <form onSubmit={onSave} noValidate className="grid gap-3" aria-label={t.rightsLabel}>
        <div className="grid gap-1.5">
          <Label htmlFor="detail-rights">{t.rightsLabel}</Label>
          <Select value={rights} onValueChange={(v) => setRights(v as RightsStatusValue)} disabled={allowed.length === 1}>
            <SelectTrigger id="detail-rights" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowed.map((r) => (
                <SelectItem key={r} value={r}>
                  {id.assets.rights[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{t.rightsHint}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="detail-attribution">{t.attributionLabel}</Label>
          <Input
            id="detail-attribution"
            value={attribution}
            maxLength={500}
            aria-invalid={needsAttribution || undefined}
            aria-describedby={needsAttribution ? 'detail-attribution-hint' : undefined}
            onChange={(e) => setAttribution(e.target.value)}
          />
          {needsAttribution ? (
            <p id="detail-attribution-hint" role="note" className="text-sm text-destructive">
              {t.attributionNeeded}
            </p>
          ) : null}
        </div>
        <Button type="submit" loading={save.isPending} disabled={!rightsChanged && !attributionChanged}>
          {t.saveRights}
        </Button>
      </form>

      <div className="grid gap-2 border-t pt-4">
        <Button type="button" variant="destructive" disabled={referenced} onClick={() => setRemoving(true)}>
          <Trash2 aria-hidden="true" />
          {t.delete}
        </Button>
        {referenced ? <p className="text-sm text-muted-foreground">{t.deleteDisabled}</p> : null}
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.confirmTitle}
        body={fmt(t.confirmBody, {
          title: asset.title,
          source: asset.source.code,
          license: id.assets.licenseTypes[asset.source.license_type] ?? asset.source.license_type,
          from: id.assets.rights[asset.rights_status] ?? asset.rights_status,
          to: id.assets.rights[rights] ?? rights,
        })}
        confirmLabel={t.confirmAction}
        pending={save.isPending}
        onConfirm={() => save.mutate()}
      />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t.deleteTitle}
        body={fmt(t.deleteBody, { title: asset.title })}
        confirmLabel={t.delete}
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

export function AssetDetailSheet({ assetId, onClose }: { assetId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['admin', 'asset', assetId],
    queryFn: () => assetsApi.get(assetId as string),
    enabled: assetId !== null,
  });
  return (
    <Sheet open={assetId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription className="break-words">{q.data?.title ?? id.common.loading}</SheetDescription>
        </SheetHeader>
        {q.isPending ? (
          <div className="grid gap-3 px-4" role="status" aria-label={id.common.loading}>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : q.isError ? (
          <div className="px-4">
            <ErrorState onRetry={() => void q.refetch()} />
          </div>
        ) : (
          <DetailBody asset={q.data} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
