import { CheckCircle2, CircleDot, FastForward, Lock, Sparkles, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type ProgressStatusValue = 'LOCKED' | 'UNLOCKED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

type Meta = { icon: LucideIcon; label: string; circle: string; text: string; line: string };

/** Pemetaan status -> ikon + label + warna token (design-system 5.8). Status tidak pernah hanya warna. */
export const STATUS_META: Record<ProgressStatusValue, Meta> = {
  LOCKED: {
    icon: Lock,
    label: id.status.LOCKED,
    circle: 'border-dashed border-[var(--color-locked)] bg-muted text-muted-foreground',
    text: 'text-muted-foreground',
    line: 'border-dashed border-[var(--color-locked)]',
  },
  UNLOCKED: {
    icon: CircleDot,
    label: id.status.UNLOCKED,
    circle: 'border-[var(--color-progress)] bg-[var(--color-primary-subtle)] text-[var(--color-progress)]',
    text: 'text-[var(--color-progress)]',
    line: 'border-solid border-[var(--color-progress)]',
  },
  IN_PROGRESS: {
    icon: CircleDot,
    label: id.status.IN_PROGRESS,
    circle: 'border-[var(--color-progress)] bg-[var(--color-primary-subtle)] text-[var(--color-progress)]',
    text: 'text-[var(--color-progress)]',
    line: 'border-solid border-[var(--color-progress)]',
  },
  COMPLETED: {
    icon: CheckCircle2,
    label: id.status.COMPLETED,
    circle: 'border-[var(--color-done)] bg-card text-[var(--color-done-text)]',
    text: 'text-[var(--color-done-text)]',
    line: 'border-solid border-[var(--color-done)]',
  },
  SKIPPED: {
    icon: FastForward,
    label: id.status.SKIPPED,
    circle: 'border-[var(--color-secondary)] bg-card text-[var(--color-secondary-text)]',
    text: 'text-[var(--color-secondary-text)]',
    line: 'border-solid border-[var(--color-secondary)]',
  },
};

export function StatusBadge({ status, className }: { status: ProgressStatusValue; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn('h-6 gap-1 px-2.5 text-xs font-semibold', meta.text, className)}>
      <Icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

/** C-23: Modul/Tier sudah selesai tetapi ada sub-modul yang dipublikasikan belakangan. */
export function NewContentBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('h-6 gap-1 px-2.5 text-xs font-semibold text-[var(--color-progress)]', className)}>
      <Sparkles aria-hidden="true" />
      {id.tree.newContent}
    </Badge>
  );
}
