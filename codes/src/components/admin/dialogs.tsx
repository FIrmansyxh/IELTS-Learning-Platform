'use client';

import { Check, Copy, TriangleAlert } from 'lucide-react';
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
import { id } from '@/i18n/id';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dialog rahasia sekali tampil (password sementara, kode undangan). Nilai hanya hidup di state
 * pemanggil dan dihapus saat dialog ditutup; tidak disimpan di cache query maupun storage.
 */
export function SecretDialog({
  open,
  onClose,
  title,
  description,
  warning,
  secret,
  secretLabel,
  doneLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  warning: string;
  secret: string;
  secretLabel: string;
  doneLabel: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    const ok = await copyText(secret);
    if (ok) {
      setCopied(true);
      toast.success(id.common.copied);
    } else {
      toast.error(id.common.copyFailed);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="grid gap-3">
          <div role="alert" className="flex items-start gap-2 rounded-md border border-[var(--color-warning)] bg-[var(--color-surface-muted)] p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--color-accent-text)]" aria-hidden="true" />
            <p>{warning}</p>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{secretLabel}</span>
            <div className="flex items-center gap-2">
              <code
                data-testid="secret-value"
                className="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2.5 font-mono text-base tracking-wide break-all select-all"
              >
                {secret}
              </code>
              <Button type="button" variant="outline" onClick={onCopy} aria-label={`${id.common.copy} ${secretLabel}`}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? id.common.copied : id.common.copy}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">{doneLabel}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {id.common.cancel}
            </Button>
          </DialogClose>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
