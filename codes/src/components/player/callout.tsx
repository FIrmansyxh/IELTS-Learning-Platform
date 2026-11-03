import { AlertTriangle, Lightbulb } from 'lucide-react';
import type * as React from 'react';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type CalloutVariant = 'tips-examiner' | 'kesalahan-umum';

/** Callout artikel (design-system 5.7). Label teks selalu tampil; warna bukan satu-satunya penanda. */
export function Callout({ variant, children }: { variant: CalloutVariant; children: React.ReactNode }) {
  const tips = variant === 'tips-examiner';
  const Icon = tips ? Lightbulb : AlertTriangle;
  const label = tips ? id.player.calloutTips : id.player.calloutMistake;
  return (
    <aside
      data-callout={variant}
      aria-label={label}
      className={cn(
        'my-5 rounded-md border border-l-4 p-4',
        tips
          ? 'border-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_10%,var(--color-surface))]'
          : 'border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))]',
      )}
    >
      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4" aria-hidden="true" />
        <span>{label}</span>
      </p>
      <div className="grid gap-2 text-[0.95rem] [&>p]:m-0">{children}</div>
    </aside>
  );
}
