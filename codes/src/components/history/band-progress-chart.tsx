'use client';

import { Table2 } from 'lucide-react';
import * as React from 'react';
import { EstimasiNotice, formatBand } from '@/components/band/band-display';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmt, id } from '@/i18n/id';
import type { BandPrediction } from '@/lib/api/skills-contract';
import { formatDate } from '@/lib/format';

const t = id.history.exam;
const W = 340;
const H = 220;
const M = { left: 34, right: 14, top: 14, bottom: 30 };
const TICKS = [0, 3, 6, 9];

const xAt = (i: number, n: number) => (n <= 1 ? (M.left + (W - M.right)) / 2 : M.left + (i * (W - M.left - M.right)) / (n - 1));
const yAt = (band: number) => M.top + (1 - band / 9) * (H - M.top - M.bottom);

/**
 * Titik indikatif: ada komponen (Listening/Reading/Writing/Speaking) yang null, mis. Boss hanya berbasis L+R. Titik ini tidak
 * boleh dibaca setara titik lengkap, jadi digambar dengan bentuk berbeda (belah ketupat berongga) selain label teks.
 */
export function isIndicativePoint(p: BandPrediction): boolean {
  return Object.values(p.components).some((v) => v === null);
}

const tooltipText = (p: BandPrediction) =>
  fmt(isIndicativePoint(p) ? t.pointTooltipIndicative : t.pointTooltip, { date: formatDate(p.created_at), band: formatBand(p.overall_band) });

function Marker({ x, y, indicative }: { x: number; y: number; indicative: boolean }) {
  if (!indicative) {
    return <circle cx={x} cy={y} r={4} fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} aria-hidden="true" data-testid="band-point" data-kind="full" />;
  }
  const r = 5.5;
  return (
    <polygon
      points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
      fill="var(--color-surface)"
      stroke="var(--color-primary)"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="band-point"
      data-kind="indicative"
    />
  );
}

export function progressSummary(points: BandPrediction[]): string {
  if (points.length === 0) return t.chartEmpty;
  return fmt(t.chartSummary, {
    n: points.length,
    first: formatBand(points[0]!.overall_band),
    last: formatBand(points[points.length - 1]!.overall_band),
  });
}

/** Grafik garis "Perkembangan Band": satu seri, sumbu Y 0-9, sumbu X tanggal; tabel alternatif tersedia. */
export function BandProgressChart({ points }: { points: BandPrediction[] }) {
  const [asTable, setAsTable] = React.useState(false);
  const [active, setActive] = React.useState<number | null>(null);
  const n = points.length;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i, n).toFixed(1)},${yAt(p.overall_band).toFixed(1)}`).join(' ');
  const summary = progressSummary(points);
  const cur = active !== null ? points[active] : undefined;

  return (
    <section aria-labelledby="band-progress-title" className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5" data-testid="band-progress">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="band-progress-title" className="text-lg font-bold">
          {t.chartTitle}
        </h2>
        {n > 0 ? (
          <Button type="button" variant="outline" size="sm" aria-pressed={asTable} aria-controls="band-progress-view" onClick={() => setAsTable((v) => !v)}>
            <Table2 aria-hidden="true" />
            {asTable ? t.seeChart : t.seeTable}
          </Button>
        ) : null}
      </div>
      <div id="band-progress-view">
        {n === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="band-progress-empty">
            {t.chartEmpty}
          </p>
        ) : asTable ? (
          <div data-testid="band-progress-table" role="group" aria-label={summary}>
            <Table>
              <caption className="sr-only">{t.tableCaption}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t.colDate}</TableHead>
                  <TableHead scope="col" className="text-right">
                    {t.colOverall}
                  </TableHead>
                  <TableHead scope="col">{t.colKind}</TableHead>
                  <TableHead scope="col">{t.colTrigger}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.created_at)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatBand(p.overall_band)}</TableCell>
                    <TableCell data-testid="band-kind">{isIndicativePoint(p) ? t.kindIndicative : t.kindFull}</TableCell>
                    <TableCell>{t.triggers[p.trigger] ?? p.trigger}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <figure className="m-0 grid gap-2">
            <div className="relative mx-auto w-full max-w-[480px]" onMouseLeave={() => setActive(null)}>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.chartAria} ${summary}`} className="block h-auto w-full overflow-visible">
                <g aria-hidden="true">
                  {TICKS.map((b) => (
                    <g key={b}>
                      <line x1={M.left} x2={W - M.right} y1={yAt(b)} y2={yAt(b)} stroke="var(--color-border)" strokeWidth={1} />
                      <text x={M.left - 6} y={yAt(b) + 4} textAnchor="end" fontSize={12} fill="var(--color-text-muted)" className="tabular-nums">
                        {b}
                      </text>
                    </g>
                  ))}
                  <text x={xAt(0, n)} y={H - 8} textAnchor={n > 1 ? 'start' : 'middle'} fontSize={12} fill="var(--color-text-muted)">
                    {formatDate(points[0]!.created_at)}
                  </text>
                  {n > 1 ? (
                    <text x={xAt(n - 1, n)} y={H - 8} textAnchor="end" fontSize={12} fill="var(--color-text-muted)">
                      {formatDate(points[n - 1]!.created_at)}
                    </text>
                  ) : null}
                </g>
                {n > 1 ? <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" data-testid="band-line" /> : null}
                {points.map((p, i) => {
                  const label = tooltipText(p);
                  return (
                    <g key={p.id}>
                      <Marker x={xAt(i, n)} y={yAt(p.overall_band)} indicative={isIndicativePoint(p)} />
                      <circle
                        cx={xAt(i, n)}
                        cy={yAt(p.overall_band)}
                        r={14}
                        fill="transparent"
                        tabIndex={0}
                        role="img"
                        aria-label={label}
                        className="cursor-pointer outline-none focus-visible:stroke-[var(--color-primary)] focus-visible:stroke-2"
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onBlur={() => setActive((c) => (c === i ? null : c))}
                        onClick={() => setActive(i)}
                      />
                    </g>
                  );
                })}
              </svg>
              {cur ? (
                <div
                  role="status"
                  data-testid="band-tooltip"
                  className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs font-semibold text-popover-foreground shadow-md"
                  style={{ left: `${(xAt(active!, n) / W) * 100}%`, top: `${(yAt(cur.overall_band) / H) * 100 - 3}%` }}
                >
                  {tooltipText(cur)}
                </div>
              ) : null}
            </div>
            <figcaption className="grid gap-1.5 text-sm text-muted-foreground">
              <span>{summary}</span>
              {points.some(isIndicativePoint) ? (
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label={t.legendLabel} data-testid="band-legend">
                  <li className="flex items-center gap-2">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
                      <circle cx="7" cy="7" r="4" fill="var(--color-primary)" />
                    </svg>
                    {t.legendFull}
                  </li>
                  <li className="flex items-center gap-2">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
                      <polygon points="7,1.5 12.5,7 7,12.5 1.5,7" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                    {t.legendIndicative}
                  </li>
                </ul>
              ) : null}
            </figcaption>
          </figure>
        )}
      </div>
      <EstimasiNotice />
    </section>
  );
}
