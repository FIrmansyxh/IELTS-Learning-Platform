'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  ASSET_CODE_PATTERN,
  UPLOAD_ACCEPT,
  UPLOAD_LIMITS_MB,
  UploadableKind,
  type UploadableKindValue,
} from '@/contracts/assets';
import { fmt, id } from '@/i18n/id';
import { assetsApi } from '@/lib/api/assets';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage, detailMessage } from '@/lib/api/errors';
import { formatBytes } from '@/lib/format';
import { FileDropzone } from './file-dropzone';

const t = id.assets.upload;

type FieldKey = 'kind' | 'title' | 'source_id' | 'asset_code' | 'attribution_text' | 'file';
type Errors = Partial<Record<FieldKey, string>>;

const FIELD_KEYS: readonly string[] = ['kind', 'title', 'source_id', 'asset_code', 'attribution_text', 'file'];
/** Kode detail server -> field yang menampilkan pesan. */
const DETAIL_FIELD: Record<string, FieldKey> = {
  file_required: 'file',
  multiple_files: 'file',
  audio_unreadable: 'file',
  docx_invalid: 'file',
  asset_code_invalid: 'asset_code',
  invalid_kind: 'kind',
};

function typesLabel(kind: UploadableKindValue): string {
  if (kind === 'DOCUMENT') return t.typesDocument;
  if (kind === 'AUDIO_LISTENING') return t.typesAudio;
  return t.typesImage;
}

export function UploadAssetSheet({
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
  const storable = (sources.data ?? []).filter((s) => s.may_store_copy);

  const [kind, setKind] = React.useState<UploadableKindValue>('SLIDE_IMAGE');
  const [title, setTitle] = React.useState('');
  const [sourceId, setSourceId] = React.useState('');
  const [assetCode, setAssetCode] = React.useState('');
  const [attribution, setAttribution] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [errors, setErrors] = React.useState<Errors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [duplicateId, setDuplicateId] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  function reset() {
    setKind('SLIDE_IMAGE');
    setTitle('');
    setSourceId('');
    setAssetCode('');
    setAttribution('');
    setFile(null);
    setProgress(null);
    setErrors({});
    setFormError(null);
    setDuplicateId(null);
    setFailed(false);
  }

  const upload = useMutation({
    mutationFn: () =>
      assetsApi.upload(
        {
          kind,
          title: title.trim(),
          source_id: sourceId,
          asset_code: assetCode.trim() || undefined,
          attribution_text: attribution.trim() || undefined,
          file: file as File,
        },
        { onProgress: setProgress },
      ),
    onSuccess: () => {
      toast.success(t.success);
      void qc.invalidateQueries({ queryKey: ['admin', 'assets'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'sources'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'license-summary'] });
      reset();
      onOpenChange(false);
    },
    onError: (e) => {
      setProgress(null);
      setFailed(true);
      if (!isApiError(e)) {
        setFormError(apiErrorMessage(e));
        return;
      }
      const next: Errors = {};
      switch (e.code) {
        case 'ASSET_CODE_TAKEN':
          next.asset_code = apiErrorMessage(e);
          break;
        case 'SOURCE_NOT_STORABLE':
          next.source_id = apiErrorMessage(e);
          break;
        case 'DUPLICATE_ASSET':
          next.file = apiErrorMessage(e);
          setDuplicateId(e.details[0]?.message ?? null);
          break;
        case 'PAYLOAD_TOO_LARGE':
        case 'UNSUPPORTED_FILE_TYPE':
        case 'MACRO_NOT_ALLOWED':
          next.file = apiErrorMessage(e);
          break;
        case 'NOT_FOUND':
          next.source_id = apiErrorMessage(e);
          break;
        case 'VALIDATION_ERROR': {
          for (const d of e.details) {
            const root = d.path.split('.')[0] ?? '';
            const key = DETAIL_FIELD[d.code] ?? (FIELD_KEYS.includes(root) ? (root as FieldKey) : undefined);
            if (key) next[key] = detailMessage(d.code, d.message);
          }
          break;
        }
        default:
          break;
      }
      setErrors(next);
      if (Object.keys(next).length === 0) setFormError(apiErrorMessage(e));
      else setFormError(null);
    },
  });

  function validate(): Errors {
    const next: Errors = {};
    const trimmed = title.trim();
    if (trimmed.length < 1 || trimmed.length > 200) next.title = t.titleRequired;
    if (!sourceId) next.source_id = t.sourceRequired;
    if (assetCode.trim() && !ASSET_CODE_PATTERN.test(assetCode.trim())) next.asset_code = id.fieldErrors.asset_code_invalid;
    if (!file) next.file = t.fileRequired;
    else if (file.size > UPLOAD_LIMITS_MB[kind] * 1024 * 1024) {
      next.file = fmt(t.fileTooBig, { size: formatBytes(file.size), mb: UPLOAD_LIMITS_MB[kind] });
    }
    return next;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setDuplicateId(null);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = (['title', 'source_id', 'asset_code', 'file'] as const).find((k) => next[k]);
      if (first) document.getElementById(`asset-${first}`)?.focus();
      return;
    }
    setProgress(0);
    upload.mutate();
  }

  const uploading = upload.isPending;
  const mb = UPLOAD_LIMITS_MB[kind];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o && uploading) return;
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
            <Label htmlFor="asset-kind">{t.fieldKind}</Label>
            <Select
              value={kind}
              disabled={uploading}
              onValueChange={(v) => {
                setKind(v as UploadableKindValue);
                setFile(null);
                setErrors((p) => ({ ...p, file: undefined }));
              }}
            >
              <SelectTrigger id="asset-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UploadableKind.options.map((k) => (
                  <SelectItem key={k} value={k}>
                    {id.assets.kinds[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="asset-file">{t.fieldFile}</Label>
            <FileDropzone
              inputId="asset-file"
              file={file}
              onFile={(f) => {
                setFile(f);
                setErrors((p) => ({ ...p, file: undefined }));
                setDuplicateId(null);
              }}
              accept={UPLOAD_ACCEPT[kind]}
              disabled={uploading}
              prompt={t.dropzone}
              pickLabel={t.pick}
              replaceLabel={t.replace}
              hint={fmt(t.limits, { mb, types: typesLabel(kind) })}
              describedBy={errors.file ? 'asset-file-error' : undefined}
              invalid={Boolean(errors.file)}
            />
            {errors.file ? (
              <p id="asset-file-error" role="alert" className="text-sm text-destructive">
                {errors.file}
                {duplicateId && onOpenExisting ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenExisting(duplicateId);
                      }}
                    >
                      {t.openExisting}
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="asset-title">{t.fieldTitle}</Label>
            <Input
              id="asset-title"
              value={title}
              maxLength={200}
              disabled={uploading}
              aria-invalid={Boolean(errors.title) || undefined}
              aria-describedby={errors.title ? 'asset-title-error' : undefined}
              onChange={(e) => setTitle(e.target.value)}
            />
            {errors.title ? (
              <p id="asset-title-error" role="alert" className="text-sm text-destructive">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="asset-source_id">{t.fieldSource}</Label>
            {sources.isSuccess && storable.length === 0 ? (
              <p role="note" className="text-sm text-muted-foreground">
                {t.noStorableSources}
              </p>
            ) : (
              <Select value={sourceId} disabled={uploading} onValueChange={setSourceId}>
                <SelectTrigger
                  id="asset-source_id"
                  className="w-full"
                  aria-invalid={Boolean(errors.source_id) || undefined}
                  aria-describedby={errors.source_id ? 'asset-source-error' : undefined}
                >
                  <SelectValue placeholder={t.fieldSourcePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {storable.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.source_id ? (
              <p id="asset-source-error" role="alert" className="text-sm text-destructive">
                {errors.source_id}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="asset-asset_code">{t.fieldCode}</Label>
            <Input
              id="asset-asset_code"
              value={assetCode}
              autoComplete="off"
              disabled={uploading}
              aria-invalid={Boolean(errors.asset_code) || undefined}
              aria-describedby={errors.asset_code ? 'asset-code-error' : 'asset-code-hint'}
              onChange={(e) => setAssetCode(e.target.value)}
            />
            <p id="asset-code-hint" className="text-sm text-muted-foreground">
              {t.fieldCodeHint}
            </p>
            {errors.asset_code ? (
              <p id="asset-code-error" role="alert" className="text-sm text-destructive">
                {errors.asset_code}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="asset-attribution">{t.fieldAttribution}</Label>
            <Input
              id="asset-attribution"
              value={attribution}
              maxLength={500}
              disabled={uploading}
              onChange={(e) => setAttribution(e.target.value)}
            />
          </div>

          {uploading && progress !== null ? (
            <div className="grid gap-1.5" role="status">
              <Progress value={progress} aria-label={fmt(t.uploading, { n: progress })} />
              <p className="text-sm text-muted-foreground">{fmt(t.uploading, { n: progress })}</p>
            </div>
          ) : null}

          <SheetFooter className="px-0">
            <Button type="submit" size="lg" loading={uploading}>
              {failed && !uploading ? t.retry : t.submit}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
