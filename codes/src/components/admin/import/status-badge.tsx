import { Ban, CheckCircle2, CircleDot, Eye, Loader2, Minus, Plus, RotateCcw, Upload, XCircle, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ImportItem, ImportStatusValue } from '@/contracts/import';
import { id } from '@/i18n/id';

const META: Record<ImportStatusValue, { icon: LucideIcon; className: string; spin?: boolean }> = {
  UPLOADED: { icon: Upload, className: 'text-[var(--color-progress)]' },
  VALIDATING: { icon: Loader2, className: 'text-[var(--color-progress)]', spin: true },
  PREVIEW_READY: { icon: Eye, className: 'text-[var(--color-accent-text)]' },
  PUBLISHING: { icon: Loader2, className: 'text-[var(--color-progress)]', spin: true },
  PUBLISHED: { icon: CheckCircle2, className: 'text-[var(--color-done-text)]' },
  FAILED: { icon: XCircle, className: 'border-destructive text-destructive' },
  CANCELLED: { icon: Ban, className: 'text-muted-foreground' },
  ROLLED_BACK: { icon: RotateCcw, className: 'text-muted-foreground' },
};

/** Status batch: ikon + teks. */
export function BatchStatusBadge({ status }: { status: ImportStatusValue }) {
  const m = META[status];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`h-6 gap-1 px-2.5 font-semibold ${m.className}`} data-status={status}>
      <Icon aria-hidden="true" className={m.spin ? 'motion-safe:animate-spin' : undefined} />
      {id.importer.statuses[status] ?? status}
    </Badge>
  );
}

export function ActionBadge({ action }: { action: ImportItem['action'] }) {
  if (!action) return null;
  const meta =
    action === 'CREATE'
      ? { icon: Plus, cls: 'text-[var(--color-done-text)]' }
      : action === 'UPDATE'
        ? { icon: CircleDot, cls: 'text-[var(--color-accent-text)]' }
        : { icon: Minus, cls: 'text-muted-foreground' };
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`h-6 gap-1 px-2.5 font-semibold ${meta.cls}`} data-action={action}>
      <Icon aria-hidden="true" />
      {id.importer.preview.action[action]}
    </Badge>
  );
}

