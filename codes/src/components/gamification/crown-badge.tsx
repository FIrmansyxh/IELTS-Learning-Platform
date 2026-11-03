import { Crown } from 'lucide-react';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type CrownLevel = 'NONE' | 'SILVER' | 'GOLD';

/**
 * Mahkota Silver/Gold (design-system 5.18). Dibedakan juga lewat label teks, bukan hanya warna.
 * `NONE` tidak dirender pada peta (hanya node bermahkota yang menampilkan ikon).
 */
export function CrownBadge({
  crown,
  scorePercent,
  showLabel = true,
  className,
}: {
  crown: CrownLevel;
  scorePercent?: number;
  showLabel?: boolean;
  className?: string;
}) {
  if (crown === 'NONE') return null;
  const gold = crown === 'GOLD';
  const name = gold ? id.tree.crownGold : id.tree.crownSilver;
  const aria = scorePercent === undefined ? name : fmt(id.tree.crownAria, { name, n: scorePercent });
  return (
    <span
      role="img"
      aria-label={aria}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold',
        gold ? 'text-[var(--color-accent-text)]' : 'text-[var(--color-text-2)]',
        className,
      )}
    >
      <Crown
        aria-hidden="true"
        className={cn(
          'size-4',
          gold
            ? 'fill-[var(--color-crown-gold)] stroke-[var(--color-crown-gold-edge)]'
            : 'fill-[var(--color-crown-silver)] stroke-[var(--color-crown-silver-edge)]',
        )}
      />
      {showLabel ? <span aria-hidden="true">{gold ? id.tree.crownGoldShort : id.tree.crownSilverShort}</span> : null}
    </span>
  );
}
