'use client';

import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { fmt, id } from '@/i18n/id';

/** Persetujuan rekaman sebelum rekaman pertama; tombol lanjut aktif hanya setelah dicentang. */
export function ConsentDialog({
  open,
  retentionDays,
  pending,
  error,
  onAccept,
  onCancel,
}: {
  open: boolean;
  retentionDays: number | null;
  pending: boolean;
  error?: string | null;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = React.useState(false);
  React.useEffect(() => {
    if (!open) setChecked(false);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !pending ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{id.ai.consent.title}</DialogTitle>
          <DialogDescription>{fmt(id.ai.consent.body, { days: retentionDays ?? 90 })}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <Checkbox id="consent-check" checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          <Label htmlFor="consent-check" className="min-h-11 flex-1 cursor-pointer">
            {id.ai.consent.check}
          </Label>
        </div>
        <Link href="/profil" className="w-fit text-sm text-primary underline underline-offset-4">
          {id.ai.consent.settings}
        </Link>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {id.ai.consent.cancel}
          </Button>
          <Button onClick={onAccept} disabled={!checked} loading={pending}>
            {pending ? id.ai.consent.accepting : id.ai.consent.accept}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
