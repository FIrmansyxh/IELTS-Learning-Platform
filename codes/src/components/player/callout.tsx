import { AlertTriangle, Compass, Lightbulb } from 'lucide-react';
import type * as React from 'react';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type CalloutVariant = 'tips-examiner' | 'kesalahan-umum' | 'pengantar';

const VARIANTS: Record<CalloutVariant, { Icon: typeof Lightbulb; label: string; cls: string }> = {
  'tips-examiner': {
    Icon: Lightbulb,
    label: id.player.calloutTips,
    cls: 'border-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_10%,var(--color-surface))]',
  },
  'kesalahan-umum': {
    Icon: AlertTriangle,
    label: id.player.calloutMistake,
    cls: 'border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))]',
  },
  // Pembuka artikel (backlog C-20): penjelasan dasar sebelum materi inti.
  pengantar: {
    Icon: Compass,
    label: id.player.calloutIntro,
    cls: 'border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]',
  },
};

/** Callout artikel (design-system 5.7). Label teks selalu tampil; warna bukan satu-satunya penanda. */
export function Callout({ variant, children }: { variant: CalloutVariant; children: React.ReactNode }) {
  const { Icon, label, cls } = VARIANTS[variant];
  return (
    <aside
      data-callout={variant}
      aria-label={label}
      className={cn('my-5 rounded-md border border-l-4 p-4', cls)}
    >
      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4" aria-hidden="true" />
        <span>{label}</span>
      </p>
      <div className="grid gap-2 text-[0.95rem] [&>p]:m-0">{children}</div>
    </aside>
  );
}
