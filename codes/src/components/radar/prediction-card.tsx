import { Target } from 'lucide-react';
import { BandBadge, EstimasiNotice, formatBand } from '@/components/band/band-display';
import { Badge } from '@/components/ui/badge';
import { fmt, id } from '@/i18n/id';
import type { Prediction } from '@/lib/api/skills-contract';

const t = id.radar.prediction;

/** F-17-02: `sample_size` (sampel objektif terkecil L/R) dan `low_sample` (< 30) berasal dari Backend; opsional, jadi dibaca defensif. */
export function sampleInfo(prediction: Prediction): { n: number | null; small: boolean } {
  return { n: typeof prediction.sample_size === 'number' ? prediction.sample_size : null, small: prediction.low_sample === true };
}

/**
 * Kartu "Prediksi Band": `overall_band` bila lengkap, selain itu `indicative_band` berlabel "Indikatif".
 * Selalu disertai rentang, catatan dasar perhitungan, dan EstimasiNotice (design-system 10).
 */
export function PredictionCard({ prediction, targetBand }: { prediction: Prediction; targetBand: number | null }) {
  const band = prediction.overall_band ?? prediction.indicative_band;
  const indicative = !prediction.complete || prediction.overall_band === null;
  const sample = sampleInfo(prediction);
  const gap = band !== null && targetBand !== null ? Math.round((targetBand - band) * 2) / 2 : null;
  return (
    <section aria-labelledby="prediction-title" data-testid="prediction-card" className="grid content-start gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <h3 id="prediction-title" className="text-sm font-semibold text-muted-foreground">
        {t.title}
      </h3>
      {band === null ? (
        <div className="grid gap-1">
          <p className="font-semibold">{t.none}</p>
          <p className="text-sm text-muted-foreground">{t.noneBody}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <BandBadge band={band} size="lg" />
            {indicative ? <Badge variant="secondary" data-testid="indicative-badge">{id.radar.prediction.indicative}</Badge> : <Badge variant="outline">{t.overall}</Badge>}
          </div>
          {prediction.range_low !== null && prediction.range_high !== null ? (
            <p className="text-sm tabular-nums" data-testid="prediction-range">
              <span className="text-muted-foreground">{t.rangeLabel}: </span>
              <span className="font-semibold">
                {formatBand(prediction.range_low)}–{formatBand(prediction.range_high)}
              </span>
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground" data-testid="prediction-basis">
            {prediction.basis_note}
          </p>
          {sample.n !== null || sample.small ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="prediction-sample">
              {sample.n !== null ? <span className="tabular-nums">{fmt(t.sampleSize, { n: sample.n })}</span> : null}
              {sample.small ? (
                <Badge variant="outline" data-testid="small-sample-badge" title={t.smallSampleHint}>
                  {sample.n !== null ? fmt(t.smallSample, { n: sample.n }) : t.smallSampleNoN}
                </Badge>
              ) : null}
            </p>
          ) : null}
          {targetBand !== null ? (
            <p className="flex items-center gap-2 text-sm">
              <Target className="size-4 text-[var(--color-secondary-text)]" aria-hidden="true" />
              {fmt(t.target, { n: formatBand(targetBand) })}
              {gap !== null ? (
                <span className="text-muted-foreground">
                  {' · '}
                  {gap <= 0 ? t.gapReached : fmt(t.gap, { n: formatBand(gap) })}
                </span>
              ) : null}
            </p>
          ) : null}
        </>
      )}
      <EstimasiNotice />
    </section>
  );
}
