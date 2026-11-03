'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ExternalKind } from '@/contracts/assets';
import { id } from '@/i18n/id';
import { assetsApi } from '@/lib/api/assets';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage, detailMessage } from '@/lib/api/errors';
import { parseYoutubeUrl } from '@/lib/youtube-url';

const t = id.assets.external;
type Kind = 'VIDEO_EMBED' | 'REFERENCE_LINK';
type FieldKey = 'title' | 'source_id' | 'external_url' | 'external_ref';
type Errors = Partial<Record<FieldKey, string>>;

export function ExternalAssetSheet({
  open,
  onOpenChange,
  onOpenExisting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenExisting?: (assetId: string) => void;
}) {
  const qc = useQueryClient();
  const sources = useQuery({ queryKey: ['admin', 'sources'], queryFn: assetsApi.sources, enabled: open });
  const [kind, setKind] = React.useState<Kind>('VIDEO_EMBED');
  const [title, setTitle] = React.useState('');
  const [sourceId, setSourceId] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [ref, setRef] = React.useState('');
  const [attribution, setAttribution] = React.useState('');
  const [errors, setErrors] = React.useState<Errors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [existingId, setExistingId] = React.useState<string | null>(null);

  function reset() {
    setKind('VIDEO_EMBED');
    setTitle('');
    setSourceId('');
    setUrl('');
    setRef('');
    setAttribution('');
    setErrors({});
    setFormError(null);
    setExistingId(null);
  }

  const create = useMutation({
    mutationFn: assetsApi.createExternal,
    onSuccess: () => {
      toast.success(t.success);
      void qc.invalidateQueries({ queryKey: ['admin', 'assets'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'sources'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'license-summary'] });
      reset();
      onOpenChange(false);
    },
    onError: (e) => {
      if (!isApiError(e)) {
        setFormError(apiErrorMessage(e));
        return;
      }
      const next: Errors = {};
      if (e.code === 'ASSET_ALREADY_EXISTS') {
        next.external_ref = apiErrorMessage(e);
        setExistingId(e.details[0]?.message ?? null);
      } else if (e.code === 'NOT_FOUND') {
        next.source_id = apiErrorMessage(e);
      } else if (e.code === 'VALIDATION_ERROR') {
        for (const d of e.details) {
          const root = d.path.split('.')[0] ?? '';
          if (root === 'title' || root === 'source_id' || root === 'external_url' || root === 'external_ref') {
            next[root] = detailMessage(d.code, d.message);
          }
        }
      }
      setErrors(next);
      setFormError(Object.keys(next).length === 0 ? apiErrorMessage(e) : null);
    },
  });

  function validate(): Errors {
    const next: Errors = {};
    const trimmed = title.trim();
    if (trimmed.length < 1 || trimmed.length > 200) next.title = id.assets.upload.titleRequired;
    if (!sourceId) next.source_id = id.assets.upload.sourceRequired;
    const u = url.trim();
    if (!/^https:\/\/\S+$/i.test(u) || u.length > 500) next.external_url = t.urlInvalid;
    else if (kind === 'VIDEO_EMBED') {
      const p = parseYoutubeUrl(u);
      if (!p.hostAllowed) next.external_url = id.fieldErrors.host_not_allowed;
      else if (ref.trim() === '' || !/^[A-Za-z0-9_-]{11}$/.test(ref.trim())) next.external_ref = t.refInvalid;
      else if (p.videoId && p.videoId !== ref.trim()) next.external_ref = id.fieldErrors.ref_mismatch;
    }
    return next;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setExistingId(null);
    const next = validate();
    setErrors(next);
    const first = (['title', 'source_id', 'external_url', 'external_ref'] as const).find((k) => next[k]);
    if (first) {
      document.getElementById(`ext-${first}`)?.focus();
      return;
    }
    create.mutate({
      kind,
      title: title.trim(),
      source_id: sourceId,
      external_url: url.trim(),
      ...(kind === 'VIDEO_EMBED' ? { external_ref: ref.trim() } : {}),
      ...(attribution.trim() ? { attribution_text: attribution.trim() } : {}),
    });
  }

  function err(key: FieldKey) {
    return errors[key] ? (
      <p id={`ext-${key}-error`} role="alert" className="text-sm text-destructive">
        {errors[key]}
        {key === 'external_ref' && existingId && onOpenExisting ? (
          <>
            {' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => {
                onOpenChange(false);
                onOpenExisting(existingId);
              }}
            >
              {id.assets.upload.openExisting}
            </button>
          </>
        ) : null}
      </p>
    ) : null;
  }
  const inv = (key: FieldKey) => ({
    'aria-invalid': Boolean(errors[key]) || undefined,
    'aria-describedby': errors[key] ? `ext-${key}-error` : undefined,
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription>{t.description}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 px-4 pb-4">
          <FormErrorSummary message={formError} />
          <div className="grid gap-1.5">
            <Label htmlFor="ext-kind">{t.fieldKind}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger id="ext-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ExternalKind.options.map((k) => (
                  <SelectItem key={k} value={k}>
                    {id.assets.kinds[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ext-title">{t.fieldTitle}</Label>
            <Input id="ext-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} {...inv('title')} />
            {err('title')}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ext-source_id">{t.fieldSource}</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger id="ext-source_id" className="w-full" {...inv('source_id')}>
                <SelectValue placeholder={id.assets.upload.fieldSourcePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {(sources.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err('source_id')}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ext-external_url">{t.fieldUrl}</Label>
            <Input
              id="ext-external_url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={url}
              maxLength={500}
              onChange={(e) => {
                const v = e.target.value;
                setUrl(v);
                if (kind === 'VIDEO_EMBED' && ref === '') {
                  const p = parseYoutubeUrl(v);
                  if (p.videoId) setRef(p.videoId);
                }
              }}
              {...inv('external_url')}
            />
            {err('external_url')}
          </div>
          {kind === 'VIDEO_EMBED' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="ext-external_ref">{t.fieldRef}</Label>
              <Input
                id="ext-external_ref"
                autoComplete="off"
                value={ref}
                maxLength={11}
                onChange={(e) => setRef(e.target.value)}
                {...inv('external_ref')}
              />
              <p className="text-sm text-muted-foreground">{t.fieldRefHint}</p>
              {err('external_ref')}
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="ext-attribution">{t.fieldAttribution}</Label>
            <Input id="ext-attribution" value={attribution} maxLength={500} onChange={(e) => setAttribution(e.target.value)} />
          </div>
          <SheetFooter className="px-0">
            <Button type="submit" size="lg" loading={create.isPending}>
              {t.submit}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
