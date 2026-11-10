import { cn } from '@/lib/utils';

/** Bar progres berwarna (nilai 0-100) dengan semantik progressbar; warna lewat token CSS agar mengikuti tema. */
export function ColorBar({
  value,
  color,
  label,
  className,
}: {
  value: number;
  color: string;
  label: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}
