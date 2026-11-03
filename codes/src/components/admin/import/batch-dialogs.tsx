'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Batch } from '@/contracts/import';
import { id } from '@/i18n/id';
import { isApiError, type ApiErrorDetail } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { importsApi } from '@/lib/api/imports';
import { ConfirmDialog } from '../dialogs';

const t = id.importer.history;

export function invalidateImports(qc: ReturnType<typeof useQueryClient>, batchId?: string) {
  void qc.invalidateQueries({ queryKey: ['admin', 'imports'] });
  if (batchId) void qc.invalidateQueries({ queryKey: ['admin', 'import', batchId] });
}

export function CancelBatchDialog({
  batch,
  onClose,
  onDone,
}: {
  batch: Batch | null;
  onClose: () => void;
  onDone?: (b: Batch) => void;
}) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: (b: Batch) => importsApi.cancel(b.id),
    onSuccess: (b) => {
      toast.success(t.cancelled);
      invalidateImports(qc, b.id);
      onClose();
      onDone?.(b);
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      if (batch) invalidateImports(qc, batch.id);
      onClose();
    },
  });
  return (
    <ConfirmDialog
      open={batch !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t.cancelTitle}
      body={t.cancelBody}
      confirmLabel={t.cancelAction}
      destructive
      pending={cancel.isPending}
      onConfirm={() => batch && cancel.mutate(batch)}
    />
  );
}

export function RollbackBatchDialog({
  batch,
  onClose,
  onDone,
}: {
  batch: Batch | null;
  onClose: () => void;
  onDone?: (b: Batch) => void;
}) {
  const qc = useQueryClient();
  const [blocked, setBlocked] = React.useState<ApiErrorDetail[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (batch === null) {
      setBlocked(null);
      setError(null);
    }
  }, [batch]);

  const rollback = useMutation({
    mutationFn: (b: Batch) => importsApi.rollback(b.id),
    onSuccess: (b) => {
      toast.success(t.rolledBack);
      invalidateImports(qc, b.id);
      onClose();
      onDone?.(b);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'ROLLBACK_BLOCKED') {
        setBlocked(e.details);
        setError(null);
      } else {
        setError(apiErrorMessage(e));
      }
    },
  });

  return (
    <Dialog open={batch !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{blocked ? t.rollbackBlockedTitle : t.rollbackTitle}</DialogTitle>
          <DialogDescription>{blocked ? t.rollbackBlockedBody : t.rollbackBody}</DialogDescription>
        </DialogHeader>
        {blocked ? (
          <ul className="grid max-h-60 gap-1 overflow-y-auto text-sm" aria-label={t.rollbackBlockedTitle}>
            {blocked.map((d) => (
              <li key={d.path} className="rounded-md border p-2 break-words">
                <code className="font-mono">{d.path}</code>: {d.message}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {blocked ? id.common.close : id.common.cancel}
            </Button>
          </DialogClose>
          {blocked ? null : (
            <Button type="button" variant="destructive" loading={rollback.isPending} onClick={() => batch && rollback.mutate(batch)}>
              {t.rollbackAction}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
