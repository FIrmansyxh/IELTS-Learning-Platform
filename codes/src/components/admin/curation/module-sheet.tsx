'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { curationApi } from '@/lib/api/curation';
import type { CurriculumModule, UpdateModuleRequest } from '@/lib/api/curation-contract';
import { apiErrorMessage, detailMessage } from '@/lib/api/errors';
import { Field } from './fields';
import { useDiscardGuard } from './use-discard-guard';

const t = id.curation.subSheet;
const c = id.curation.curriculum;

function ModuleForm({ module: mod, onClose }: { module: CurriculumModule; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState(mod.title);
  const [order, setOrder] = React.useState(String(mod.order_index));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const dirty = title !== mod.title || order !== String(mod.order_index);
  const guard = useDiscardGuard(dirty, onClose, { title: t.discardTitle, body: t.discardBody, action: t.discardAction });

  const save = useMutation({
    mutationFn: (body: UpdateModuleRequest) => curationApi.updateModule(mod.id, body),
    onSuccess: () => {
      toast.success(t.saved);
      void qc.invalidateQueries({ queryKey: ['admin', 'curriculum'] });
      onClose();
    },
    onError: (e) => {
      const next: Record<string, string> = {};
      if (isApiError(e)) {
        for (const d of e.details) next[d.path.split('.')[0] ?? ''] = detailMessage(d.code, d.message);
        if (e.code === 'ORDER_INDEX_TAKEN') next.order_index = apiErrorMessage(e);
      }
      setErrors(next);
      setFormError(Object.keys(next).length > 0 ? t.errorSummary : apiErrorMessage(e));
    },
  });

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const next: Record<string, string> = {};
    const trimmed = title.trim();
    if (trimmed.length < 1 || trimmed.length > 150) next.title = id.fieldErrors.out_of_range!;
    const n = Number(order);
    if (!Number.isInteger(n) || n < 1) next.order_index = id.fieldErrors.out_of_range!;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError(t.errorSummary);
      return;
    }
    setFormError(null);
    const body: UpdateModuleRequest = {};
    if (trimmed !== mod.title) body.title = trimmed;
    if (n !== mod.order_index) body.order_index = n;
    if (Object.keys(body).length === 0) {
      setFormError(t.noChanges);
      return;
    }
    save.mutate(body);
  }

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && guard.requestClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t.moduleTitle}</SheetTitle>
            <SheetDescription>{fmt(c.module, { code: mod.module_code, title: mod.title })}</SheetDescription>
          </SheetHeader>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 px-4 pb-6">
            <FormErrorSummary message={formError} />
            <Field id="mod-title" label={t.fieldTitle} error={errors.title}>
              {(a) => <Input {...a} value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field id="mod-order" label={t.fieldOrder} error={errors.order_index}>
              {(a) => <Input {...a} type="number" inputMode="numeric" min={1} value={order} onChange={(e) => setOrder(e.target.value)} />}
            </Field>
            <Button type="submit" loading={save.isPending} disabled={!dirty}>
              {t.save}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
      {guard.dialog}
    </>
  );
}

/** Sheet sunting modul: judul dan nomor urut (kode modul dan status tidak dapat diubah di sini). */
export function ModuleSheet({ module: mod, onClose }: { module: CurriculumModule | null; onClose: () => void }) {
  if (!mod) return null;
  return <ModuleForm key={mod.id} module={mod} onClose={onClose} />;
}
