'use client';

import { Check, Flag } from 'lucide-react';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type NavigatorItem = { questionId: string; answered: boolean; flagged: boolean };

/**
 * Grid nomor soal untuk Mode Ujian (dipakai SPEC-008/014/015). Status = ikon + teks tersembunyi, bukan hanya warna.
 */
export function QuestionNavigatorGrid({
  items,
  currentIndex,
  onSelect,
}: {
  items: NavigatorItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label={id.quiz.exam.navigator}>
      <ol className="grid grid-cols-5 gap-2 sm:grid-cols-8">
        {items.map((it, i) => (
          <li key={it.questionId}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={i === currentIndex ? 'step' : undefined}
              aria-label={`${fmt(id.quiz.exam.goTo, { n: i + 1 })}, ${it.answered ? id.quiz.exam.answered : id.quiz.exam.empty}${it.flagged ? `, ${id.quiz.exam.flagged}` : ''}`}
              className={cn(
                'relative grid size-11 place-content-center rounded-md border text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                it.answered ? 'bg-accent' : 'bg-card',
                i === currentIndex && 'border-2 border-primary',
              )}
            >
              <span aria-hidden="true">{i + 1}</span>
              {it.answered ? (
                <Check className="absolute right-0.5 bottom-0.5 size-3 text-[var(--color-done-text)]" aria-hidden="true" />
              ) : null}
              {it.flagged ? (
                <Flag className="absolute top-0.5 right-0.5 size-3 text-[var(--color-accent-text)]" aria-hidden="true" />
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
