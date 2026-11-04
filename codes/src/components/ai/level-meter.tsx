import { id } from '@/i18n/id';
import { LEVEL_SEGMENTS, litSegments } from '@/lib/ai/recorder';
import { cn } from '@/lib/utils';

// Tinggi segmen berbeda sehingga level terbaca tanpa bergantung pada warna.
const HEIGHTS = [20, 28, 36, 44, 52, 60, 68, 76, 84, 92];

/** Level meter 10 segmen (`role="meter"`, `aria-valuenow` 0-10). */
export function LevelMeter({ level, className }: { level: number; className?: string }) {
  const lit = litSegments(level);
  return (
    <div
      role="meter"
      aria-label={id.ai.speaking.levelLabel}
      aria-valuemin={0}
      aria-valuemax={LEVEL_SEGMENTS}
      aria-valuenow={lit}
      data-testid="level-meter"
      className={cn('flex h-10 items-end gap-1', className)}
    >
      {HEIGHTS.map((h, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ height: `${h}%` }}
          className={cn('w-3 rounded-sm border', i < lit ? 'border-primary bg-primary' : 'border-border bg-muted')}
        />
      ))}
    </div>
  );
}
