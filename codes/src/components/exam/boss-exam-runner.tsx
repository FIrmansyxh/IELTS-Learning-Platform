'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Attempt } from '@/contracts/attempts';
import type { SectionDTO } from '@/contracts/exams';
import { attemptsApi } from '@/lib/api/attempts';
import { apiErrorMessage } from '@/lib/api/errors';
import { SectionGate } from './section-gate';
import { ExamSession } from './exam-runner';
import { ReadingWorkspace } from '@/components/reading/reading-workspace';
import { Skeleton } from '@/components/ui/skeleton';
import { id } from '@/i18n/id';

export function BossExamRunner({ attempt: initialAttempt }: { attempt: Attempt }) {
  const router = useRouter();
  const [currentAttempt, setCurrentAttempt] = React.useState<Attempt>(initialAttempt);
  const [starting, setStarting] = React.useState(false);
  const [submittingSection, setSubmittingSection] = React.useState(false);
  const [justCompletedSection, setJustCompletedSection] = React.useState<SectionDTO | null>(null);

  const sections = React.useMemo(() => {
    return ((currentAttempt.sections ?? []) as SectionDTO[]).slice().sort((a, b) => a.order - b.order);
  }, [currentAttempt.sections]);

  // Cari section yang sedang aktif atau perlu dikerjakan (phase !== 'DONE')
  const activeOrNextSection = React.useMemo(() => {
    return sections.find((s) => s.phase !== 'DONE') ?? null;
  }, [sections]);

  const nextSectionAfterCompleted = React.useMemo(() => {
    if (!justCompletedSection) return null;
    return sections.find((s) => s.order > justCompletedSection.order) ?? null;
  }, [justCompletedSection, sections]);

  // Submit attempt final ketika seluruh section telah selesai
  const finishAll = React.useCallback(async () => {
    try {
      await attemptsApi.submit(currentAttempt.id);
      router.replace(`/ujian/${currentAttempt.id}/hasil`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
      router.replace(`/ujian/${currentAttempt.id}/hasil`);
    }
  }, [currentAttempt.id, router]);

  // Handler mulai section (INTRO -> ACTIVE)
  const handleStartSection = React.useCallback(async () => {
    if (!activeOrNextSection || starting) return;
    setStarting(true);
    try {
      const data = await attemptsApi.startSection(
        currentAttempt.id,
        activeOrNextSection.assessment_set_id,
      );

      setCurrentAttempt((prev) => {
        const nextSections = ((prev.sections ?? []) as SectionDTO[]).map((s) =>
          s.assessment_set_id === data.section.assessment_set_id ? data.section : s,
        );

        return {
          ...prev,
          sections: nextSections,
          passage_markdown: data.passage_markdown,
          listening: data.listening,
          questions: data.questions,
          answers: data.answers.map((a) => ({
            question_id: a.question_id,
            response: a.response,
            feedback: null,
          })),
          deadline_at: data.section.deadline_at,
          remaining_seconds: data.section.remaining_seconds,
          server_now: data.server_now,
        };
      });
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setStarting(false);
    }
  }, [activeOrNextSection, starting, currentAttempt.id]);

  // Handler submit section aktif
  const handleSectionSubmit = React.useCallback(async () => {
    if (!activeOrNextSection || submittingSection) return;
    setSubmittingSection(true);
    try {
      const data = await attemptsApi.submitSection(
        currentAttempt.id,
        activeOrNextSection.assessment_set_id,
      );

      setJustCompletedSection(data.section);

      setCurrentAttempt((prev) => {
        const nextSections = ((prev.sections ?? []) as SectionDTO[]).map((s) => {
          if (s.assessment_set_id === data.section.assessment_set_id) return data.section;
          if (data.next_section && s.assessment_set_id === data.next_section.assessment_set_id) {
            return data.next_section;
          }
          return s;
        });

        return {
          ...prev,
          sections: nextSections,
        };
      });
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSubmittingSection(false);
    }
  }, [activeOrNextSection, submittingSection, currentAttempt.id]);

  // Transisi setelah modal DONE ditutup
  const handleNextAfterDone = React.useCallback(() => {
    if (!justCompletedSection) return;
    const hasNext = nextSectionAfterCompleted !== null;
    setJustCompletedSection(null);
    if (!hasNext) {
      void finishAll();
    }
  }, [justCompletedSection, nextSectionAfterCompleted, finishAll]);

  // 1. Tampilkan layar DONE jika baru saja menyelesaikan satu section
  if (justCompletedSection) {
    return (
      <SectionGate
        mode="DONE"
        section={justCompletedSection}
        totalSections={sections.length}
        nextSection={nextSectionAfterCompleted}
        onNext={handleNextAfterDone}
      />
    );
  }

  // 2. Jika seluruh section selesai tapi belum submit
  if (!activeOrNextSection) {
    return (
      <div className="mx-auto mt-10 grid max-w-md gap-4 text-center">
        <Skeleton className="h-40 w-full rounded-xl" />
        <p className="text-muted-foreground">{id.common.loading}</p>
      </div>
    );
  }

  // 3. Jika section berikutnya masih berstatus INTRO / PENDING
  if (activeOrNextSection.phase === 'PENDING') {
    return (
      <SectionGate
        mode="INTRO"
        section={activeOrNextSection}
        totalSections={sections.length}
        onStart={() => void handleStartSection()}
        starting={starting}
      />
    );
  }

  // 4. Jika section sedang aktif (ACTIVE)
  if (currentAttempt.passage_markdown) {
    return (
      <ReadingWorkspace
        key={activeOrNextSection.assessment_set_id}
        attempt={currentAttempt}
        onSectionSubmit={handleSectionSubmit}
        submitLabel={id.boss.finishSection}
      />
    );
  }

  return (
    <ExamSession
      key={activeOrNextSection.assessment_set_id}
      attempt={currentAttempt}
      onSectionSubmit={handleSectionSubmit}
      submitLabel={id.boss.finishSection}
    />
  );
}
