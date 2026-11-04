'use client';

import { useQuery } from '@tanstack/react-query';
import { Radar as RadarIcon, Table2 } from 'lucide-react';
import * as React from 'react';
import { ErrorState } from '@/components/common/state-views';
import { RADAR_KEY } from '@/components/gamification/use-stats';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { id } from '@/i18n/id';
import { skillsApi } from '@/lib/api/skills';
import { isRadarEmpty } from '@/lib/radar';
import { PredictionCard } from './prediction-card';
import { RadarChart } from './radar-chart';
import { RadarTable } from './radar-table';

/**
 * Kartu radar dashboard (slot SPEC-017, di bawah StatsCard): radar 6 sumbu + kartu prediksi + toggle tabel.
 * Loading = Skeleton setinggi chart; galat = kartu "Gagal memuat radar" + "Coba lagi"; kosong = pesan tanpa chart.
 */
export function RadarCard() {
  const [asTable, setAsTable] = React.useState(false);
  const q = useQuery({
    queryKey: RADAR_KEY,
    queryFn: ({ signal }) => skillsApi.radar(signal),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <Card data-testid="radar-card" className="md:col-span-2" aria-labelledby="radar-card-title">
      <CardHeader>
        <CardTitle id="radar-card-title" className="flex items-center gap-2 text-lg">
          <RadarIcon className="size-5 text-primary" aria-hidden="true" />
          {id.radar.title}
        </CardTitle>
        <CardDescription>{id.radar.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <div className="grid gap-4 md:grid-cols-2" role="status" aria-label={id.common.loading}>
            <Skeleton className="h-[296px] w-full" />
            <Skeleton className="h-[296px] w-full" />
          </div>
        ) : q.isError ? (
          <ErrorState title={id.radar.loadFailedTitle} body={id.radar.loadFailedBody} onRetry={() => void q.refetch()} />
        ) : isRadarEmpty(q.data.skills) ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="radar-empty">
            {id.radar.empty}
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 md:items-start">
            <div className="grid gap-3">
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={asTable}
                  aria-controls="radar-view"
                  onClick={() => setAsTable((v) => !v)}
                >
                  <Table2 aria-hidden="true" />
                  {asTable ? id.radar.seeChart : id.radar.seeTable}
                </Button>
              </div>
              <div id="radar-view">
                {asTable ? <RadarTable skills={q.data.skills} /> : <RadarChart skills={q.data.skills} targetBand={q.data.target_band} />}
              </div>
            </div>
            <PredictionCard prediction={q.data.prediction} targetBand={q.data.target_band} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
