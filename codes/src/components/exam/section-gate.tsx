'use client';

import * as React from 'react';
import { BookOpen, CheckCircle2, Clock, Headphones, HelpCircle, Mic, PenTool } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SectionDTO } from '@/contracts/exams';
import { fmt, id } from '@/i18n/id';

export interface SectionGateProps {
  mode: 'INTRO' | 'DONE';
  section: SectionDTO;
  totalSections: number;
  nextSection?: SectionDTO | null;
  onStart?: () => void;
  onNext?: () => void;
  starting?: boolean;
}

export function getSkillIcon(skill: SectionDTO['skill']) {
  switch (skill) {
    case 'LISTENING':
      return <Headphones className="size-6 text-primary" aria-hidden="true" />;
    case 'READING':
      return <BookOpen className="size-6 text-primary" aria-hidden="true" />;
    case 'WRITING':
      return <PenTool className="size-6 text-primary" aria-hidden="true" />;
    case 'SPEAKING':
      return <Mic className="size-6 text-primary" aria-hidden="true" />;
    default:
      return <HelpCircle className="size-6 text-primary" aria-hidden="true" />;
  }
}

export function SectionGate({
  mode,
  section,
  totalSections,
  nextSection,
  onStart,
  onNext,
  starting = false,
}: SectionGateProps) {
  const minutes = Math.max(1, Math.round(section.time_limit_seconds / 60));

  if (mode === 'DONE') {
    return (
      <div className="mx-auto grid max-w-xl gap-5 p-4 sm:p-6" data-testid="section-gate-done">
        <Card className="text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {fmt(id.boss.sectionDone, { title: section.title })}
            </CardTitle>
            <CardDescription>
              {nextSection
                ? `Section berikutnya: ${nextSection.title}`
                : 'Semua section telah selesai dikerjakan.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Button size="lg" className="w-full" onClick={onNext} data-testid="next-section-btn">
              {nextSection ? id.boss.nextSectionBtn : id.boss.finishExamBtn}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-xl gap-5 p-4 sm:p-6" data-testid="section-gate-intro">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {getSkillIcon(section.skill)}
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Section {section.order} / {totalSections}
              </span>
            </div>
            <Badge variant={section.counts_toward_gate ? 'default' : 'secondary'}>
              {section.counts_toward_gate ? id.boss.gateDeterminingBadge : id.boss.advisoryBadge}
            </Badge>
          </div>
          <CardTitle className="text-2xl font-bold">{section.title}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-4 text-sm pt-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="size-4" aria-hidden="true" />
              {minutes} menit
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <HelpCircle className="size-4" aria-hidden="true" />
              {section.question_count} soal
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            {section.skill === 'LISTENING' && (
              <p>Audio hanya diputar satu kali. Pastikan volume Anda terdengar dengan jelas.</p>
            )}
            {section.skill === 'READING' && (
              <p>Gunakan panel bacaan di sebelah kiri dan sorotan untuk membantu menjawab soal.</p>
            )}
            {section.skill === 'WRITING' && (
              <p>Perhatikan batas jumlah kata minimal dan susun esai dengan struktur yang jelas.</p>
            )}
            {section.skill === 'SPEAKING' && (
              <p>Rekam suara Anda dengan jelas setelah menyimak instruksi pada setiap bagian soal.</p>
            )}
          </div>
          <Button
            size="lg"
            className="w-full"
            loading={starting}
            onClick={onStart}
            data-testid="start-section-btn"
          >
            {id.boss.startSection}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

