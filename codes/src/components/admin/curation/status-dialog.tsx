'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { curationApi, type StatusEntity } from '@/lib/api/curation';
import type { Blocker, ReviewStatusValue } from '@/lib/api/curation-contract';
import { apiErrorMessage } from '@/lib/api/errors';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { BlockersList } from './blockers-list';
import { NativeSelect } from './fields';
import { STATUS_TRANSITIONS } from './status';

const t = id.curation.statusDialog;

export type StatusTarget = {
  entity: StatusEntity;
  entityId: string;
  label: string;
  current: ReviewStatusValue;
  /** `origin = AI_GENERATED_REVIEWED` (K2): konfirmasi reviu wajib sebelum PUBLISHED. */
  needsAiConfirm?: boolean;
};

/** Ubah `{entity_type}:{entity_id}` dari `details[].path` PUBLISH_BLOCKED menjadi penghalang. */
export function blockersFromDetails(details: Array<{ path: string; code: string; message: string}>): Blocker[] {
  // Detail galat 409 bersifat strict (path/code/message) dan tidak membawa `asset_id`; tautan aset jatuh ke daftar belum diverifikasi.
  return details.map((d) => {
    const i = d.path.indexOf(':');
    return {
      code: d.code,
      entity_type: i >= 0 ? d.path.slice(0, i) : d.path,
      entity_id: i >= 0 ? d.path.slice(i + 1) : '',
      detail: d.message,
    };
  });
}

function Body({ target, onClose }: { target: StatusTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const options = STATUS_TRANSITIONS[target.current];
  const [next, setNext] = React.useState<ReviewStatusValue>(options[0] ?? target.current);
  const [confirmed, setConfirmed] = React.useState(false);
  const [serverAsksConfirm, setServerAsksConfirm] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [blockers, setBlockers] = React.useState<Blocker[]>([]);

  const showConfirm = next === 'PUBLISHED' && (target.needsAiConfirm === true || serverAsksConfirm);
  const mut = useMutation({
    mutationFn: () => curationApi.changeStatus(target.entity, target.entityId, { status: next, ...(showConfirm ? { confirm_reviewed: confirmed } : {}) }),
    onSuccess: () => {
      toast.success(fmt(t.success, { status: id.curation.status[next] ?? next }));
      void qc.invalidateQueries({ queryKey: ['admin', 'curriculum'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-sets'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-set', target.entityId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'curation-sub-module', target.entityId] });
      onClose();
    },
    onError: (e) => {
      setBlockers([]);
      if (isApiError(e) && e.code === 'PUBLISH_BLOCKED') {
        setBlockers(blockersFromDetails(e.details));
        setError(t.blockedTitle);
        return;
      }
      if (isApiError(e) && e.code === 'REVIEW_CONFIRMATION_REQUIRED') setServerAsksConfirm(true);
      setError(apiErrorMessage(e));
    },
  });

  if (options.length === 0) return <p className="text-sm text-muted-foreground">{t.noTransitions}</p>;
  const blockedByConfirm = showConfirm && !confirmed;

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setBlockers([]);
        mut.mutate();
      }}
    >
      <FormErrorSummary message={error} />
      {blockers.length > 0 ? (
        <div className="grid gap-2" data-testid="publish-blockers">
          <p className="text-sm text-muted-foreground">{t.blockedBody}</p>
          <BlockersList blockers={blockers} />
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="status-next">{t.select}</Label>
        <NativeSelect id="status-next" value={next} onChange={(e) => setNext(e.target.value as ReviewStatusValue)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {id.curation.status[o]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {next === 'PUBLISHED' ? <p className="text-sm text-muted-foreground">{t.publishWarn}</p> : null}
      {next === 'ARCHIVED' ? <p className="text-sm text-muted-foreground">{t.archiveWarn}</p> : null}
      {showConfirm ? (
        <div className="grid gap-1">
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox id="status-ai-confirm" checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} />
            <Label htmlFor="status-ai-confirm" className="font-normal">
              {t.aiConfirm}
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">{t.aiConfirmHint}</p>
        </div>
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {id.common.cancel}
          </Button>
        </DialogClose>
        <Button type="submit" loading={mut.isPending} disabled={blockedByConfirm}>
          {t.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Dialog "Ubah status" (modul, sub-modul, atau set). Penghalang PUBLISH_BLOCKED ditampilkan sebagai daftar bertaut. */
export function StatusDialog({ target, onClose }: { target: StatusTarget | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {target ? (
          <>
            <DialogHeader>
              <DialogTitle>{t.title}</DialogTitle>
              <DialogDescription>
                {fmt(t.description, { label: target.label, from: id.curation.status[target.current] ?? target.current })}
              </DialogDescription>
            </DialogHeader>
            <Body key={`${target.entity}-${target.entityId}-${target.current}`} target={target} onClose={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
