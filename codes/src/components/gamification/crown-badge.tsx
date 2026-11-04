import { Crown } from 'lucide-react';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type CrownLevel = 'NONE' | 'SILVER' | 'GOLD';
export type CrownSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<CrownSize, string> = { sm: 'size-4', md: 'size-6', lg: 'size-12' };

/**
 * Mahkota Silver/Gold (design-system 5.18; ukuran 16/24/48). Dibedakan juga lewat label teks, bukan hanya warna.
 * `NONE` tidak dirender (peta hanya menampilkan node bermahkota) kecuali `showNone` (outline putus-putus).
 * `celebrate` memainkan animasi perolehan sekali (turun skala 0,8 -> 1, kilau); gerak dimatikan CSS saat reduced-motion.
 */
export function CrownBadge({
  crown,
  scorePercent,
  showLabel = true,
  showNone = false,
  size = 'sm',
  celebrate = false,
  className,
}: {
  crown: CrownLevel;
  scorePercent?: number;
  showLabel?: boolean;
  showNone?: boolean;
  size?: CrownSize;
  celebrate?: boolean;
  className?: string;
}) {
  if (crown === 'NONE') {
    if (!showNone) return null;
    return (
      <span role="img" aria-label={id.gamification.crown.noneAria} className={cn('inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground', className)}>
        <Crown aria-hidden="true" strokeDasharray="3 2" className={cn(SIZE_CLASS[size], 'fill-none stroke-[var(--color-text-muted)]')} />
        {showLabel ? <span aria-hidden="true">{id.gamification.crown.none}</span> : null}
      </span>
    );
  }
  const gold = crown === 'GOLD';
  const name = gold ? id.tree.crownGold : id.tree.crownSilver;
  const aria = scorePercent === undefined ? name : fmt(id.tree.crownAria, { name, n: scorePercent });
  return (
    <span
      role="img"
      aria-label={aria}
      data-crown={crown}
      className={cn(
        'inline-flex items-center gap-1 font-semibold',
        size === 'lg' ? 'text-base' : 'text-xs',
        gold ? 'text-[var(--color-accent-text)]' : 'text-[var(--color-text-2)]',
        className,
      )}
    >
      <span className={cn('relative inline-flex overflow-hidden rounded-sm', celebrate && 'crown-celebrate')}>
        <Crown
          aria-hidden="true"
          className={cn(
            SIZE_CLASS[size],
            gold
              ? 'fill-[var(--color-crown-gold)] stroke-[var(--color-crown-gold-edge)]'
              : 'fill-[var(--color-crown-silver)] stroke-[var(--color-crown-silver-edge)]',
          )}
        />
        {celebrate ? <span aria-hidden="true" data-testid="crown-shine" className="crown-shine pointer-events-none absolute inset-y-0 w-1/3 bg-white/70" /> : null}
      </span>
      {showLabel ? <span aria-hidden="true">{gold ? id.tree.crownGoldShort : id.tree.crownSilverShort}</span> : null}
    </span>
  );
}
