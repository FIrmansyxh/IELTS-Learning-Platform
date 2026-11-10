'use client';

import * as React from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { BarChart3, Table as TableIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BandBadge, EstimasiNotice } from '@/components/band/band-display';
import { useRadarData } from '@/hooks/use-skills';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import type { SkillRadarItemDTO } from '@/contracts/skills';
import { SKILL_COLOR } from '@/lib/chart-colors';

export function RadarCard({ className }: { className?: string }) {
  const { data, isLoading, isError, refetch } = useRadarData();
  const [viewMode, setViewMode] = React.useState<'chart' | 'table'>('chart');
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 400);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (isLoading) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className={cn('border-destructive/50', className)}>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="font-semibold text-destructive">{id.radar.loadFailed}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} aria-label="Coba lagi memuat radar">
            {id.radar.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { skills, target_band, prediction } = data;
  const hasAnyData = skills.some((s: SkillRadarItemDTO) => s.sample_size > 0);

  if (!hasAnyData) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{id.radar.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{id.radar.subtitle}</p>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">{id.radar.empty}</p>
        </CardContent>
      </Card>
    );
  }

  const displayBand = prediction.overall_band ?? prediction.indicative_band;

  // Bangun ringkasan aria-label untuk tabel/grafik
  const evaluatedSkills = skills.filter((s: SkillRadarItemDTO) => s.estimated_band !== null);
  let summaryAria = 'Data kesiapan 6 keterampilan IELTS';
  if (evaluatedSkills.length > 0) {
    const sorted = [...evaluatedSkills].sort(
      (a: SkillRadarItemDTO, b: SkillRadarItemDTO) => (a.estimated_band ?? 0) - (b.estimated_band ?? 0),
    );
    const lowest = sorted[0]!;
    const highest = sorted[sorted.length - 1]!;
    summaryAria = `Skor terendah: ${id.radar.skills[lowest.skill]} ${lowest.estimated_band?.toFixed(1)}; tertinggi: ${id.radar.skills[highest.skill]} ${highest.estimated_band?.toFixed(1)}`;
  } else {
    summaryAria = 'Belum cukup data untuk estimasi band penuh';
  }

  const chartData = skills.map((s: SkillRadarItemDTO) => {
    const rawLabel = isMobile ? id.radar.skillsShort[s.skill] : id.radar.skills[s.skill];
    const hasData = s.estimated_band !== null;
    return {
      skill: rawLabel,
      key: s.skill,
      fullSkill: id.radar.skills[s.skill],
      band: s.estimated_band ?? 0,
      target: target_band ?? 0,
      hasData,
      scorePercent: s.score_percent,
      sampleSize: s.sample_size,
      isProxy: s.is_proxy,
    };
  });

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div>
          <CardTitle>{id.radar.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{id.radar.subtitle}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setViewMode((m) => (m === 'chart' ? 'table' : 'chart'))}
          aria-label={viewMode === 'chart' ? id.radar.viewAsTable : id.radar.viewAsChart}
          className="shrink-0"
        >
          {viewMode === 'chart' ? (
            <>
              <TableIcon className="mr-1.5 size-4" />
              <span>{id.radar.viewAsTable}</span>
            </>
          ) : (
            <>
              <BarChart3 className="mr-1.5 size-4" />
              <span>{id.radar.viewAsChart}</span>
            </>
          )}
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Kartu Prediksi Band */}
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{id.radar.currentEstimate}</span>
              {!prediction.complete && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {id.radar.indicative}
                </Badge>
              )}
            </div>
            {displayBand !== null && (
              <BandBadge band={displayBand} size="lg" className="border-none bg-transparent p-0" />
            )}
            {prediction.range_low !== null && prediction.range_high !== null && (
              <p className="text-xs text-muted-foreground">
                Rentang: {prediction.range_low.toFixed(1)} – {prediction.range_high.toFixed(1)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{prediction.basis_note}</p>
          </div>

          {target_band !== null && (
            <div className="flex flex-col items-start rounded-md border bg-background/60 p-3 sm:items-end">
              <span className="text-xs text-muted-foreground">Target Band</span>
              <span className="font-heading text-2xl font-bold text-foreground">
                {target_band.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Tampilan Visual (Radar Chart atau Alternatif Tabel) */}
        {viewMode === 'chart' ? (
          <div className="relative w-full" aria-label={summaryAria} role="img">
          <div className="h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="72%">
                <defs>
                  <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <PolarGrid stroke="var(--color-border-strong)" strokeOpacity={0.7} />
                <PolarAngleAxis
                  dataKey="skill"
                  tick={(props: { x?: number | string; y?: number | string; textAnchor?: 'start' | 'middle' | 'end' | 'inherit'; payload?: { index?: number } }) => {
                    const item = chartData[props.payload?.index ?? 0];
                    return (
                      <text
                        x={props.x}
                        y={props.y}
                        textAnchor={props.textAnchor}
                        fontSize={12}
                        fontWeight={600}
                        fill={item ? SKILL_COLOR[item.key] : 'currentColor'}
                      >
                        {item?.skill}
                      </text>
                    );
                  }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 9]}
                  tickCount={4}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                  axisLine={false}
                />
                {target_band !== null && (
                  <Radar
                    name="Target Band"
                    dataKey="target"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    fill="transparent"
                    isAnimationActive={false}
                  />
                )}
                <Radar
                  name="Estimasi Band"
                  dataKey="band"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#radar-fill)"
                  isAnimationActive={false}
                  dot={{ r: 4, fill: 'var(--chart-2)', stroke: 'var(--color-surface)', strokeWidth: 1.5 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0]?.payload as typeof chartData[number];
                    if (!item) return null;
                    return (
                      <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
                        <p className="font-semibold text-popover-foreground">{item.fullSkill}</p>
                        <p className="text-muted-foreground">
                          Band:{' '}
                          {item.hasData
                            ? item.band.toFixed(1)
                            : `(${id.radar.insufficientData})`}
                        </p>
                        {item.scorePercent !== null && (
                          <p className="text-muted-foreground">
                            Skor: {item.scorePercent.toFixed(1)}%
                          </p>
                        )}
                        <p className="text-muted-foreground">Sampel: {item.sampleSize} soal</p>
                        {item.isProxy && (
                          <p className="text-[10px] text-amber-500 dark:text-amber-400">
                            * {id.radar.proxyNote}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-hidden="true">
              {chartData.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="size-2.5 rounded-full" style={{ background: SKILL_COLOR[d.key] }} />
                    {d.fullSkill}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{d.hasData ? d.band.toFixed(1) : '-'}</span>
                </li>
              ))}
            </ul>
            {isMobile && (
              <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>Lis = Listening</span>
                <span>Rea = Reading</span>
                <span>Wri = Writing</span>
                <span>Spk = Speaking</span>
                <span>Gra = Grammar</span>
                <span>Voc = Vocabulary</span>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-label={summaryAria}>
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{id.radar.table.skill}</th>
                  <th className="pb-2 font-medium">{id.radar.table.scorePercent}</th>
                  <th className="pb-2 font-medium">{id.radar.table.band}</th>
                  <th className="pb-2 font-medium">{id.radar.table.sample}</th>
                  <th className="pb-2 font-medium">{id.radar.table.notes}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {skills.map((s: SkillRadarItemDTO) => (
                  <tr key={s.skill} className="hover:bg-muted/40">
                    <td className="py-2.5 font-medium">{id.radar.skills[s.skill]}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {s.score_percent !== null ? `${s.score_percent.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-2.5">
                      {s.estimated_band !== null ? (
                        <span className="font-semibold text-foreground">
                          {s.estimated_band.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {id.radar.insufficientData}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{s.sample_size}</td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {s.is_proxy ? (
                        <Badge variant="outline" className="text-[10px]">
                          {id.radar.proxyNote}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <EstimasiNotice />
      </CardContent>
    </Card>
  );
}

