import { Archive, CheckCircle2, CircleDashed, Eye, Globe, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { id } from '@/i18n/id';
import type { ReviewStatusValue } from '@/lib/api/curation-contract';
import { cn } from '@/lib/utils';

/** Teks selalu token berkontras AA (foreground/muted/done-text); ikon yang membawa warna pembeda tambahan. */
const META: Record<ReviewStatusValue, { icon: LucideIcon; className: string; iconClassName?: string }> = {
  DRAFT: { icon: CircleDashed, className: 'text-muted-foreground' },
  IN_REVIEW: { icon: Eye, className: 'text-foreground', iconClassName: 'text-[var(--color-primary)]' },
  APPROVED: { icon: CheckCircle2, className: 'text-foreground', iconClassName: 'text-[var(--color-secondary-text)]' },
  PUBLISHED: { icon: Globe, className: 'text-[var(--color-done-text)]' },
  ARCHIVED: { icon: Archive, className: 'text-muted-foreground' },
};

/** Status reviu: selalu ikon + teks Indonesia (tidak bergantung warna). */
export function ReviewStatusBadge({ status, className }: { status: ReviewStatusValue; className?: string }) {
  const m = META[status];
  const Icon = m.icon;
  return (
    <Badge variant="outline" data-status={status} className={cn('h-6 gap-1 px-2.5 font-semibold', m.className, className)}>
      <Icon aria-hidden="true" className={m.iconClassName} />
      {id.curation.status[status] ?? status}
    </Badge>
  );
}

/** Perpindahan status yang diizinkan (K1, SPEC-020). Hanya untuk daftar pilihan; server tetap memutuskan (409). */
export const STATUS_TRANSITIONS: Record<ReviewStatusValue, ReviewStatusValue[]> = {
  DRAFT: ['IN_REVIEW', 'PUBLISHED'],
  IN_REVIEW: ['APPROVED', 'PUBLISHED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['ARCHIVED', 'DRAFT'],
  ARCHIVED: ['DRAFT'],
};
