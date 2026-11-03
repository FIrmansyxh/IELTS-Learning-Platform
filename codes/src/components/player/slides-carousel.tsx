'use client';

import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { SlideItem } from '@/contracts/player';
import { fmt, id } from '@/i18n/id';

/** Carousel slide (Embla). Gambar dimuat dari /api/v1/assets/{id}/file; slide berikutnya diprefetch. */
export function SlidesCarousel({ slides }: { slides: SlideItem[] }) {
  const ordered = React.useMemo(() => [...slides].sort((a, b) => a.order - b.order), [slides]);
  const [emblaRef, embla] = useEmblaCarousel({ loop: false, align: 'start' });
  const [index, setIndex] = React.useState(0);
  const total = ordered.length;

  React.useEffect(() => {
    if (!embla) return;
    const onSelect = () => setIndex(embla.selectedScrollSnap());
    onSelect();
    embla.on('select', onSelect);
    embla.on('reInit', onSelect);
    return () => {
      embla.off('select', onSelect);
      embla.off('reInit', onSelect);
    };
  }, [embla]);

  // Prefetch slide berikutnya.
  React.useEffect(() => {
    const next = ordered[index + 1];
    if (next && typeof Image !== 'undefined') {
      const img = new Image();
      img.src = next.url;
    }
  }, [index, ordered]);

  const prev = React.useCallback(() => embla?.scrollPrev(), [embla]);
  const next = React.useCallback(() => embla?.scrollNext(), [embla]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
  };

  const current = ordered[index];

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={id.player.slides.region}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="grid gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div ref={emblaRef} className="overflow-hidden rounded-lg border bg-muted">
        <div className="flex touch-pan-y">
          {ordered.map((s, i) => (
            <div
              key={s.asset_id}
              role="group"
              aria-roledescription="slide"
              aria-label={fmt(id.player.slides.slideLabel, { n: i + 1, total })}
              className="aspect-video min-w-0 shrink-0 grow-0 basis-full"
            >
              {/* Gambar berotorisasi dari API sendiri; optimizer next/image tidak dipakai (images.remotePatterns kosong). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.url}
                alt={s.alt}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="size-full object-contain"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="icon" onClick={prev} disabled={index === 0} aria-label={id.player.slides.prev}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p className="text-center text-sm" aria-live="polite">
          <span className="font-semibold">{fmt(id.player.slides.indicator, { n: index + 1, total })}</span>
          {current?.caption ? <span className="block text-muted-foreground">{current.caption}</span> : null}
        </p>
        <Button
          variant="outline"
          size="icon"
          onClick={next}
          disabled={index >= total - 1}
          aria-label={id.player.slides.next}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
