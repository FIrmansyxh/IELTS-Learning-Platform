import { Crown } from 'lucide-react';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type CrownLevel = 'NONE' | 'SILVER' | 'GOLD';

/**
 * Mahkota Silver/Gold (design-system 5.18, SPEC-016). Dibedakan juga lewat label teks, bukan hanya warna.
 * `NONE` tidak dirender secara default kecuali `renderEmpty = true`.
 */
export function CrownBadge({
  crown,
  size = 24,
  scorePercent,
  showLabel = true,
  renderEmpty = false,
  className,
}: {
  crown: CrownLevel;
  size?: 16 | 24 | 48;
  scorePercent?: number;
  showLabel?: boolean;
  renderEmpty?: boolean;
  className?: string;
}) {
  if (crown === 'NONE' && !renderEmpty) return null;

  const sizeClasses = {
    16: 'size-4',
    24: 'size-6',
    48: 'size-12',
  }[size];

  const gold = crown === 'GOLD';
  const silver = crown === 'SILVER';
  const name = gold
    ? id.tree.crownGold
    : silver
    ? id.tree.crownSilver
    : 'Belum meraih mahkota';

  const aria =
    scorePercent === undefined || crown === 'NONE'
      ? name
      : fmt(id.tree.crownAria, { name, n: Math.round(scorePercent) });

  return (
    <span
      role="img"
      aria-label={aria}
      data-testid="crown-badge"
      data-crown={crown}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold',
        gold
          ? 'text-amber-600 dark:text-amber-400'
          : silver
          ? 'text-slate-600 dark:text-slate-300'
          : 'text-muted-foreground',
        className,
      )}
    >
      <Crown
        aria-hidden="true"
        className={cn(
          sizeClasses,
          gold
            ? 'fill-amber-400 stroke-amber-600 drop-shadow-xs'
            : silver
            ? 'fill-slate-300 stroke-slate-500 drop-shadow-xs'
            : 'stroke-muted-foreground/35 stroke-[1.5] stroke-dashed fill-none',
        )}
      />
      {showLabel ? (
        <span aria-hidden="true">
          {gold ? id.tree.crownGoldShort : silver ? id.tree.crownSilverShort : 'Belum'}
        </span>
      ) : null}
    </span>
  );
}
