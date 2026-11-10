'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  BookOpen,
  Clock,
  Headphones,
  Mic,
  PenTool,
  Play,
  RotateCcw,
} from 'lucide-react';
import { simulationsApi } from '@/lib/api/simulations';
import type { SimulationSection } from '@/contracts/simulation';
import { fmt, id } from '@/i18n/id';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

const SECTION_ICONS: Record<SimulationSection, React.ComponentType<{ className?: string }>> = {
  LISTENING: Headphones,
  READING: BookOpen,
  WRITING: PenTool,
  SPEAKING: Mic,
};

export function SimulationBuilder() {
  const router = useRouter();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['simulations', 'options'],
    queryFn: () => simulationsApi.getOptions(),
  });

  const [selectedSections, setSelectedSections] = React.useState<SimulationSection[]>([
    'WRITING',
    'SPEAKING',
  ]);
  const [abandoning, setAbandoning] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Bawaan: semua section yang tersedia tercentang (tes lengkap); learner membuang centang yang tidak diinginkan.
  React.useEffect(() => {
    if (data?.sections) {
      const avail = data.sections.filter((s) => s.available).map((s) => s.section);
      if (avail.length > 0) setSelectedSections(avail);
    }
  }, [data]);

  const createMutation = useMutation({
    mutationFn: (sections: SimulationSection[]) => simulationsApi.createSimulation({ sections }),
    onSuccess: (res) => {
      router.push(`/simulasi/${res.attempt_id}`);
    },
    onError: (err: unknown) => {
      setCreateError((err as { message?: string })?.message || 'Gagal memulai simulasi');
    },
  });

  const handleToggle = (sec: SimulationSection, available: boolean) => {
    if (!available) return;
    setSelectedSections((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec],
    );
  };

  const handlePreset = (preset: 'all' | 'readingWriting' | 'writingOnly') => {
    if (!data?.sections) return;
    const availMap = new Map(data.sections.map((s) => [s.section, s.available]));
    if (preset === 'all') {
      const allAvail = (['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as SimulationSection[]).filter(
        (s) => availMap.get(s),
      );
      setSelectedSections(allAvail);
    } else if (preset === 'readingWriting') {
      const rw = (['READING', 'WRITING'] as SimulationSection[]).filter((s) => availMap.get(s));
      setSelectedSections(rw);
    } else if (preset === 'writingOnly') {
      if (availMap.get('WRITING')) setSelectedSections(['WRITING']);
    }
  };

  const handleAbandon = async (attemptId: string) => {
    if (!confirm(id.simulation.activeBanner.abandonConfirm)) return;
    setAbandoning(true);
    try {
      await simulationsApi.abandonSimulation(attemptId);
      await refetch();
    } catch (e: unknown) {
      alert((e as { message?: string })?.message || 'Gagal membatalkan simulasi');
    } finally {
      setAbandoning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl py-12 text-center">
        <AlertCircle className="mx-auto size-12 text-destructive" />
        <h2 className="mt-4 text-xl font-bold">Gagal memuat opsi simulasi</h2>
        <Button className="mt-4" onClick={() => refetch()}>
          Coba Lagi
        </Button>
      </div>
    );
  }

  // Hitung total durasi waktu (non-speaking)
  let totalSeconds = 0;
  for (const secName of selectedSections) {
    const opt = data.sections.find((s) => s.section === secName);
    if (opt?.time_limit_seconds) {
      totalSeconds += opt.time_limit_seconds;
    }
  }
  const totalMinutes = Math.ceil(totalSeconds / 60);

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
            {id.simulation.title}
          </h1>
          <Badge variant="outline" className="text-xs">
            GT Mode
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{id.simulation.chooseSectionsDesc}</p>
        <p className="mt-2 inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {id.simulation.disclaimer}
        </p>
      </div>

      {/* Banner Sesi Berjalan */}
      {data.in_progress_attempt_id && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-amber-900 dark:text-amber-200">
              {id.simulation.activeBanner.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild size="sm">
              <Link href={`/simulasi/${data.in_progress_attempt_id}`}>
                <Play className="mr-2 size-4" />
                {id.simulation.activeBanner.resume}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={abandoning}
              onClick={() => handleAbandon(data.in_progress_attempt_id!)}
            >
              <RotateCcw className="mr-2 size-4" />
              {id.simulation.activeBanner.abandon}
            </Button>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground" id="sim-select-hint">
        {id.simulation.selectHint}
      </p>

      {/* Preset Cepat */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Pilihan Cepat:</span>
        <Button variant="outline" size="sm" onClick={() => handlePreset('all')}>
          {id.simulation.presets.all}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handlePreset('readingWriting')}>
          {id.simulation.presets.readingWriting}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handlePreset('writingOnly')}>
          {id.simulation.presets.writingOnly}
        </Button>
      </div>

      {/* 4 Kartu Section */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.sections.map((sec) => {
          const Icon = SECTION_ICONS[sec.section];
          const isSelected = selectedSections.includes(sec.section);
          const isAvailable = sec.available;

          return (
            <Card
              key={sec.section}
              onClick={() => handleToggle(sec.section, isAvailable)}
              className={`relative cursor-pointer transition-all ${
                !isAvailable
                  ? 'cursor-not-allowed border-dashed bg-muted/30 opacity-60'
                  : isSelected
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'hover:border-primary/50'
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex size-9 items-center justify-center rounded-lg ${
                        isSelected && isAvailable
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        {id.simulation.sections[sec.section]}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {sec.question_count} soal
                        {sec.time_limit_seconds ? ` • ${Math.round(sec.time_limit_seconds / 60)} mnt` : ' • Mandiri'}
                      </CardDescription>
                    </div>
                  </div>
                  {isAvailable ? (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggle(sec.section, isAvailable)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={fmt(id.simulation.includeSection, { name: id.simulation.sections[sec.section] })}
                      className="size-6"
                    />
                  ) : (
                    <Checkbox
                      checked={false}
                      disabled
                      aria-label={fmt(id.simulation.includeSection, { name: id.simulation.sections[sec.section] })}
                      className="size-6"
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  {id.simulation.sectionDesc[sec.section]}
                </p>
                {!isAvailable && sec.unavailable_detail && (
                  <p className="mt-2 rounded bg-muted/60 p-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    {sec.unavailable_detail}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {createError && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {createError}
        </div>
      )}

      {/* Ringkasan & Tombol Mulai */}
      <Card className="bg-card">
        <CardContent className="flex flex-col items-center justify-between gap-4 p-5 sm:flex-row">
          <div className="flex items-center gap-3">
            <Clock className="size-5 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">{id.simulation.summary.totalTime}</p>
              <p className="text-lg font-bold">
                {totalMinutes > 0 ? fmt(id.simulation.summary.minutes, { min: totalMinutes }) : 'Fleksibel'}
              </p>
            </div>
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={selectedSections.length === 0 || createMutation.isPending}
            onClick={() => createMutation.mutate(selectedSections)}
          >
            {createMutation.isPending ? id.simulation.summary.starting : id.simulation.summary.startBtn}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
