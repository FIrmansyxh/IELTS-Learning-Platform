import { AlertTriangle, Link2, PlaySquare, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RightsStatusValue } from '@/contracts/assets';
import { id } from '@/i18n/id';

const RIGHTS_META: Record<RightsStatusValue, { icon: LucideIcon; className: string }> = {
  UNVERIFIED: { icon: AlertTriangle, className: 'border-destructive text-destructive' },
  OWN_ORIGINAL: { icon: ShieldCheck, className: 'text-[var(--color-done-text)]' },
  VERIFIED_OPEN: { icon: ShieldCheck, className: 'text-[var(--color-done-text)]' },
  EMBED_ONLY: { icon: PlaySquare, className: 'text-[var(--color-progress)]' },
  LINK_ONLY: { icon: Link2, className: 'text-muted-foreground' },
};

/** Status hak: selalu ikon + teks (tidak bergantung warna saja). */
export function RightsBadge({ status }: { status: RightsStatusValue }) {
  const meta = RIGHTS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`h-6 gap-1 px-2.5 font-semibold ${meta.className}`} data-rights={status}>
      <Icon aria-hidden="true" />
      {id.assets.rights[status] ?? status}
    </Badge>
  );
}

export function LicenseBadge({ type }: { type: string }) {
  return (
    <Badge variant="secondary" className="h-6 px-2.5">
      {id.assets.licenseTypes[type] ?? type}
    </Badge>
  );
}

export function BlocksPublishNote() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive" title={id.assets.blocksPublishHint}>
      <AlertTriangle className="size-3.5" aria-hidden="true" />
      {id.assets.blocksPublish}
    </span>
  );
}
