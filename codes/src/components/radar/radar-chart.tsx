'use client';

import * as React from 'react';
import { formatBand } from '@/components/band/band-display';
import { fmt, id } from '@/i18n/id';
import { RADAR_ORDER, type SkillScore } from '@/lib/api/skills-contract';
import { labelAt, pointAt, polygonPoints, RADAR, summarizeSkills } from '@/lib/radar';

const NARROW = '(max-width: 399px)';

/** true di viewport < 400px: label sumbu memakai singkatan (design-system 5.17). */
export function useIsNarrow(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(NARROW);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(NARROW).matches : false),
    () => false,
  );
}

/** Teks nilai per sumbu; proksi (Grammar/Vocab memakai tabel Reading) ditandai juga di grafik, bukan hanya di tabel. */
function tooltipOf(s: SkillScore): string {
  return fmt(s.is_proxy ? id.radar.tooltipProxy : id.radar.tooltip, { skill: id.radar.skills[s.skill] ?? s.skill, band: formatBand(s.estimated_band!) });
}

export function orderedSkills(skills: SkillScore[]): SkillScore[] {
  return RADAR_ORDER.map((name) => skills.find((s) => s.skill === name)).filter((s): s is SkillScore => s !== undefined);
}

export function radarSummary(skills: SkillScore[]): string {
  const { low, high } = summarizeSkills(skills);
  const name = (s: SkillScore) => id.radar.skills[s.skill] ?? s.skill;
  const lowText = low ? (low.estimated_band === null ? fmt(id.radar.summaryNoData, { skill: name(low) }) : fmt(id.radar.summaryItem, { skill: name(low), band: formatBand(low.estimated_band) })) : id.radar.summaryNone;
  const highText = high ? fmt(id.radar.summaryItem, { skill: name(high), band: formatBand(high.estimated_band!) }) : id.radar.summaryNone;
  return fmt(id.radar.summaryAria, { low: lowText, high: highText });
}

/**
 * Radar 6 sumbu SVG (skala band 0-9, cincin tiap 1,0). Satu seri (isi `primary` 20%, garis 2px, titik 8px dengan cincin
 * permukaan 2px), garis target putus-putus bila `targetBand` ada. Keterampilan tanpa band digambar 0 dan ditandai
 * di legenda. Tooltip nilai muncul saat hover/fokus/ketuk; semua nilai juga ada di tabel alternatif.
 */
export function RadarChart({ skills, targetBand }: { skills: SkillScore[]; targetBand: number | null }) {
  const narrow = useIsNarrow();
  const list = orderedSkills(skills);
  const [active, setActive] = React.useState<number | null>(null);
  const values = list.map((s) => s.estimated_band ?? 0);
  const noData = list.filter((s) => s.estimated_band === null);
  const label = (s: SkillScore) => (narrow ? id.radar.abbr[s.skill] : id.radar.skills[s.skill]) ?? s.skill;
  const rings = Array.from({ length: RADAR.max }, (_, k) => k + 1);
  const activeSkill = active !== null ? list[active] : undefined;
  const activePoint = active !== null && activeSkill?.estimated_band != null ? pointAt(active, activeSkill.estimated_band) : null;

  return (
    <figure className="m-0 grid gap-3" data-testid="radar-chart">
      <div className="relative mx-auto w-full max-w-[420px]" onMouseLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${RADAR.width} ${RADAR.height}`}
          role="img"
          aria-label={`${id.radar.chartAria} ${radarSummary(skills)}`}
          className="block h-auto w-full overflow-visible"
        >
          <g aria-hidden="true">
            {rings.map((r) => (
              <polygon
                key={r}
                points={polygonPoints(list.map(() => r))}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={r === RADAR.max ? 1.5 : 1}
              />
            ))}
            {list.map((s, i) => {
              const tip = pointAt(i, RADAR.max);
              return <line key={s.skill} x1={RADAR.cx} y1={RADAR.cy} x2={tip.x} y2={tip.y} stroke="var(--color-border)" strokeWidth={1} />;
            })}
          </g>

          {targetBand !== null ? (
            <polygon
              data-testid="radar-target"
              aria-hidden="true"
              points={polygonPoints(list.map(() => targetBand))}
              fill="none"
              stroke="var(--color-secondary-text)"
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinejoin="round"
            />
          ) : null}

          <g className="chart-enter" style={{ transformOrigin: `${RADAR.cx}px ${RADAR.cy}px` }}>
            <polygon
              data-testid="radar-area"
              aria-hidden="true"
              points={polygonPoints(values)}
              fill="var(--color-primary)"
              fillOpacity={0.2}
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {list.map((s, i) => {
              if (s.estimated_band === null) return null;
              const p = pointAt(i, s.estimated_band);
              const text = tooltipOf(s);
              return (
                <g key={s.skill}>
                  <circle cx={p.x} cy={p.y} r={4} fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} aria-hidden="true" />
                  {/* Area sentuh >= 24px di sekitar titik (8px). */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={14}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={text}
                    data-testid={`radar-point-${s.skill}`}
                    className="cursor-pointer outline-none focus-visible:stroke-[var(--color-primary)] focus-visible:stroke-2"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                    onClick={() => setActive(i)}
                  />
                </g>
              );
            })}
          </g>

          {list.map((s, i) => {
            const l = labelAt(i);
            const missing = s.estimated_band === null;
            return (
              <text
                key={s.skill}
                data-testid={`radar-label-${s.skill}`}
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                fontSize={12}
                fontWeight={600}
                fontStyle={missing ? 'italic' : 'normal'}
                fill={missing ? 'var(--color-text-muted)' : 'var(--color-text)'}
              >
                {label(s)}
                {s.is_proxy ? <tspan data-testid={`radar-proxy-${s.skill}`}>{id.radar.proxyMark}</tspan> : null}
              </text>
            );
          })}
        </svg>
        {activeSkill && activePoint ? (
          <div
            role="status"
            data-testid="radar-tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs font-semibold text-popover-foreground shadow-md"
            style={{ left: `${(activePoint.x / RADAR.width) * 100}%`, top: `${(activePoint.y / RADAR.height) * 100 - 3}%` }}
          >
            {tooltipOf(activeSkill)}
          </div>
        ) : null}
      </div>

      <figcaption className="grid gap-1.5 text-sm" data-testid="radar-legend">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label={id.radar.legendAbbr}>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-[var(--color-primary)]" />
            {id.radar.legendScore}
          </li>
          {targetBand !== null ? (
            <li className="flex items-center gap-2" data-testid="radar-target-legend">
              <svg aria-hidden="true" width="20" height="4" viewBox="0 0 20 4">
                <line x1="0" y1="2" x2="20" y2="2" stroke="var(--color-secondary-text)" strokeWidth="2" strokeDasharray="5 3" />
              </svg>
              {fmt(id.radar.legendTarget, { n: formatBand(targetBand) })}
            </li>
          ) : null}
        </ul>
        {list.some((s) => s.is_proxy) ? (
          <p className="text-muted-foreground" data-testid="radar-proxy-legend">
            {id.radar.legendProxy}
          </p>
        ) : null}
        {narrow ? (
          <p className="text-muted-foreground" data-testid="radar-abbr-legend">
            {RADAR_ORDER.map((k) => `${id.radar.abbr[k]} = ${id.radar.skills[k]}`).join(', ')}
          </p>
        ) : null}
        {noData.length > 0 ? (
          <p className="text-muted-foreground" data-testid="radar-nodata">
            {fmt(id.radar.noDataLegend, { list: noData.map((s) => id.radar.skills[s.skill] ?? s.skill).join(', ') })}
          </p>
        ) : null}
      </figcaption>
    </figure>
  );
}
