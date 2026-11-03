'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { IMPORT_MAX_MB } from '@/contracts/import';
import { fmt, id } from '@/i18n/id';
import { isApiError, type ApiErrorDetail } from '@/lib/api/client';
import { apiErrorMessage, detailMessage } from '@/lib/api/errors';
import { IMPORT_TEMPLATE_URLS, importsApi } from '@/lib/api/imports';
import { formatBytes } from '@/lib/format';
import { FileDropzone } from '../file-dropzone';

const t = id.importer.upload;

export function detectFormat(name: string): 'JSON' | 'CSV' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) return 'JSON';
  if (lower.endsWith('.csv')) return 'CSV';
  return null;
}

function ContractDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useQuery({ queryKey: ['admin', 'import-contract'], queryFn: importsApi.contract, enabled: open, staleTime: 300_000 });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.contractTitle}</DialogTitle>
          <DialogDescription>{q.data ? fmt(t.contractVersion, { v: q.data.contract_version }) : t.contractLoading}</DialogDescription>
        </DialogHeader>
        {q.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(q.error)}
          </p>
        ) : q.data ? (
          <pre
            tabIndex={0}
            aria-label={t.contractTitle}
            className="max-h-[60dvh] overflow-auto rounded-md border bg-muted p-3 text-xs focus-visible:ring-2 focus-visible:ring-ring"
          >
            {JSON.stringify(q.data.json_schema, null, 2)}
          </pre>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function StepUpload() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [problems, setProblems] = React.useState<ApiErrorDetail[]>([]);
  const [existingBatch, setExistingBatch] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [contractOpen, setContractOpen] = React.useState(false);

  const upload = useMutation({
    mutationFn: (f: File) => importsApi.upload({ format: detectFormat(f.name) ?? 'JSON', file: f }, { onProgress: setProgress }),
    onSuccess: (b) => router.push(`/admin/impor/${b.id}`),
    onError: (e) => {
      setProgress(null);
      setProblems([]);
      setExistingBatch(null);
      if (isApiError(e) && e.code === 'IMPORT_FILE_INVALID') {
        setProblems(e.details);
        setFormError(apiErrorMessage(e));
      } else if (isApiError(e) && e.code === 'DUPLICATE_BATCH') {
        setExistingBatch(e.details[0]?.message ?? null);
        setFormError(apiErrorMessage(e));
      } else if (isApiError(e) && e.code === 'VALIDATION_ERROR' && e.details.length > 0) {
        setProblems(e.details);
        setFormError(apiErrorMessage(e));
      } else {
        setFormError(apiErrorMessage(e));
      }
    },
  });

  function pick(f: File | null) {
    setFile(f);
    setFormError(null);
    setProblems([]);
    setExistingBatch(null);
    if (!f) return setFileError(null);
    if (!detectFormat(f.name)) return setFileError(t.typeInvalid);
    if (f.size > IMPORT_MAX_MB * 1024 * 1024) return setFileError(fmt(t.tooBig, { size: formatBytes(f.size) }));
    setFileError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!file) return setFileError(t.fileRequired);
    if (fileError) return;
    setProgress(0);
    upload.mutate(file);
  }

  const uploading = upload.isPending;
  const format = file ? detectFormat(file.name) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-labelledby="import-upload-heading">
      <h2 id="import-upload-heading" className="text-xl font-semibold">
        {t.heading}
      </h2>

      <FileDropzone
        large
        inputId="import-file"
        file={file}
        onFile={pick}
        accept=".json,.csv,application/json,text/csv"
        disabled={uploading}
        prompt={t.dropzone}
        pickLabel={t.pick}
        replaceLabel={t.replace}
        hint={t.limits}
        describedBy={fileError ? 'import-file-error' : undefined}
        invalid={Boolean(fileError)}
      />
      {format === 'CSV' ? <p className="text-sm text-muted-foreground">{t.csvNote}</p> : null}
      {fileError ? (
        <p id="import-file-error" role="alert" className="text-sm text-destructive">
          {fileError}
        </p>
      ) : null}

      <FormErrorSummary message={formError} />
      {existingBatch ? (
        <Link href={`/admin/impor/${existingBatch}`} className="text-sm font-semibold underline underline-offset-2">
          {t.openExisting}
        </Link>
      ) : null}
      {problems.length > 0 ? (
        <div className="grid gap-1 text-sm">
          <p className="font-medium">{t.problems}</p>
          <ul className="grid gap-1" aria-label={t.problems}>
            {problems.map((d, i) => (
              <li key={`${d.code}-${i}`} className="rounded-md border p-2 break-words">
                <code className="font-mono text-xs">{d.code}</code> {detailMessage(d.code, d.message)}
                {d.path ? <span className="text-muted-foreground"> ({d.path})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <a
          href={IMPORT_TEMPLATE_URLS.json}
          download
          className="inline-flex min-h-11 items-center gap-1.5 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="size-4" aria-hidden="true" />
          {t.templateJson}
        </a>
        <a
          href={IMPORT_TEMPLATE_URLS.csv}
          download
          className="inline-flex min-h-11 items-center gap-1.5 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="size-4" aria-hidden="true" />
          {t.templateCsv}
        </a>
        <button
          type="button"
          onClick={() => setContractOpen(true)}
          className="inline-flex min-h-11 items-center font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.contract}
        </button>
      </div>

      {uploading && progress !== null ? (
        <div className="grid gap-1.5" role="status">
          <Progress value={progress} aria-label={fmt(t.uploading, { n: progress })} />
          <p className="text-sm text-muted-foreground">{fmt(t.uploading, { n: progress })}</p>
        </div>
      ) : null}

      <div>
        <Button type="submit" size="lg" loading={uploading} disabled={!file || Boolean(fileError)}>
          {t.submit}
        </Button>
      </div>

      <ContractDialog open={contractOpen} onOpenChange={setContractOpen} />
    </form>
  );
}
