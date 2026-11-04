'use client';

import { CheckCircle2, Circle, Headphones, Loader2, Mic, PenLine, BookOpen } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fmt, id } from '@/i18n/id';
import type { Section } from '@/lib/api/boss-contract';
import { cn } from '@/lib/utils';

const SKILL_ICON = { LISTENING: Headphones, READING: BookOpen, WRITING: PenLine, SPEAKING: Mic } as const;

export function skillName(skill: string): string {
  return id.boss.intro.skills[skill] ?? skill;
}

/** Judul layar yang menerima fokus saat layar baru tampil (pembaca layar mengumumkan perpindahan section). */
function useFocusOnMount() {
  const ref = React.useRef<HTMLHeadingElement | null>(null);
  React.useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

function SectionList({ sections, currentId }: { sections: Section[]; currentId: string | null }) {
  return (
    <ol aria-label={id.boss.gate.listTitle} className="grid gap-2 text-sm">
      {sections.map((s) => {
        const Icon = SKILL_ICON[s.skill];
        const current = s.assessment_set_id === currentId;
        return (
          <li
            key={s.assessment_set_id}
            aria-current={current ? 'step' : undefined}
            className={cn('flex items-center gap-3 rounded-md border px-3 py-2', current && 'border-primary bg-accent font-semibold')}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {s.phase === 'DONE' ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
              {id.boss.gate.phase[s.phase]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Layar transisi sebelum section dimulai (SPEC-014 `SectionGate`): tenang, tanpa kontrol selain "Mulai Section". */
export function SectionGate({
  section,
  sections,
  starting,
  error,
  onStart,
}: {
  section: Section;
  sections: Section[];
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const headingRef = useFocusOnMount();
  const Icon = SKILL_ICON[section.skill];
  const total = sections.length;
  return (
    <main id="main" className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto grid max-w-2xl gap-5 rounded-xl border bg-card p-5 sm:p-6" data-testid="section-gate">
        <p className="text-sm font-semibold text-muted-foreground">{fmt(id.boss.gate.sectionOf, { n: section.order, total })}</p>
        <h1 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-2xl font-bold outline-none">
          <Icon className="size-6 shrink-0" aria-hidden="true" />
          {section.title}
        </h1>
        <p className="text-sm">
          {fmt(id.boss.gate.duration, { m: minutes(section.time_limit_seconds) })} · {fmt(id.boss.gate.questions, { q: section.question_count })}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{id.boss.gate.rules[section.skill]}</li>
          <li>{section.counts_toward_gate ? id.boss.gate.deciding : id.boss.gate.advisory}</li>
          <li>{id.boss.gate.timerNote}</li>
          <li>{id.boss.gate.noBack}</li>
        </ul>
        <SectionList sections={sections} currentId={section.assessment_set_id} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button size="lg" className="w-full sm:w-fit" loading={starting} onClick={onStart}>
          {starting ? id.boss.gate.starting : id.boss.gate.start}
        </Button>
      </div>
    </main>
  );
}

/**
 * Layar setelah section selesai: "Section {nama} selesai" + "Lanjut" (tanpa tombol kembali). Section terakhir
 * menampilkan "Lihat Hasil", yang mengirim attempt. `timedOut` memunculkan Dialog "Waktu section habis".
 */
export function SectionDone({
  section,
  next,
  timedOut,
  finishing,
  error,
  onContinue,
  onFinish,
}: {
  section: Section;
  next: Section | null;
  timedOut: boolean;
  finishing: boolean;
  error: string | null;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const headingRef = useFocusOnMount();
  const [dialogOpen, setDialogOpen] = React.useState(timedOut);
  return (
    <main id="main" className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto grid max-w-2xl gap-5 rounded-xl border bg-card p-5 sm:p-6" data-testid="section-done">
        <h1 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-2xl font-bold outline-none">
          <CheckCircle2 className="size-6 shrink-0 text-[var(--color-done-text)]" aria-hidden="true" />
          {fmt(id.boss.done.title, { name: section.title })}
        </h1>
        {next ? (
          <>
            <p className="text-sm">{fmt(id.boss.done.next, { name: next.title })}</p>
            <Button size="lg" className="w-full sm:w-fit" onClick={onContinue}>
              {id.boss.done.continue}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm">{id.boss.done.allDone}</p>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button size="lg" className="w-full sm:w-fit" loading={finishing} onClick={onFinish}>
              {finishing ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {id.boss.done.seeResult}
            </Button>
          </>
        )}
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.boss.done.timeUpTitle}</DialogTitle>
            <DialogDescription>{id.boss.done.timeUpBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)}>{id.boss.done.timeUpOk}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
