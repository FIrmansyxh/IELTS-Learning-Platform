import { Info } from 'lucide-react';
import type * as React from 'react';
import type { BandRow } from '@/contracts/band';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

/** Disclaimer bersama untuk semua tampilan band/AI (design-system 10). */
export function EstimasiNotice({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-sm text-muted-foreground', className)}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{id.band.estimasi}</span>
    </p>
  );
}

export function formatBand(band: number): string {
  return band.toFixed(1).replace('.', ',');
}

/** Angka band 1 desimal + label teks. */
export function BandBadge({ band, size = 'md', className }: { band: number; size?: 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-2 rounded-lg border bg-card px-3 py-1 font-heading font-bold tabular-nums',
        size === 'lg' ? 'text-5xl' : 'text-xl',
        className,
      )}
    >
      <span className="text-sm font-semibold text-muted-foreground">{id.band.table.band}</span>
      <span>{formatBand(band)}</span>
    </span>
  );
}

/** Kontainer yang menjamin EstimasiNotice selalu terlihat bersama tampilan band. */
export function BandResultBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-3', className)}>
      {children}
      <EstimasiNotice />
    </div>
  );
}

function rangeLabel(r: BandRow): string {
  return r.raw_min === r.raw_max ? fmt(id.band.table.rangeSingle, { a: r.raw_min }) : fmt(id.band.table.range, { a: r.raw_min, b: r.raw_max });
}

/**
 * Tabel "Skor mentah -> Band"; baris yang dicapai disorot (ikon + teks "Dicapai"). Di layar sempit
 * berubah menjadi daftar kartu.
 */
export function BandConversionTable({
  rows,
  achievedRaw,
  versionLabel,
}: {
  rows: BandRow[];
  /** Skor mentah (0-40) yang dicapai; baris yang memuatnya disorot. */
  achievedRaw?: number;
  versionLabel?: string;
}) {
  const sorted = [...rows].sort((a, b) => a.raw_min - b.raw_min);
  const hit = (r: BandRow) => achievedRaw !== undefined && achievedRaw >= r.raw_min && achievedRaw <= r.raw_max;
  return (
    <div className="grid gap-2">
      {versionLabel ? <p className="text-xs text-muted-foreground">{fmt(id.band.table.version, { label: versionLabel })}</p> : null}
      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">{id.band.table.caption}</caption>
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="px-3 py-2 font-semibold">
              {id.band.table.raw}
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              {id.band.table.band}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.raw_min} data-achieved={hit(r) || undefined} className={cn('border-b', hit(r) && 'bg-accent font-semibold')}>
              <td className="px-3 py-1.5 tabular-nums">{rangeLabel(r)}</td>
              <td className="px-3 py-1.5 tabular-nums">
                {formatBand(r.band)}
                {hit(r) ? <span className="ml-2 text-xs">({id.band.table.achieved})</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="grid gap-2 sm:hidden" aria-label={id.band.table.caption}>
        {sorted.map((r) => (
          <li
            key={r.raw_min}
            className={cn('flex items-center justify-between rounded-md border px-3 py-2 text-sm', hit(r) && 'border-primary bg-accent font-semibold')}
          >
            <span className="tabular-nums">
              {id.band.table.raw} {rangeLabel(r)}
            </span>
            <span className="tabular-nums">
              {formatBand(r.band)}
              {hit(r) ? ` (${id.band.table.achieved})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
