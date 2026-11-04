'use client';

import { CloudOff, Flag } from 'lucide-react';
import * as React from 'react';
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import { Button } from '@/components/ui/button';
import type { AnswerResponse, QuestionPublic } from '@/contracts/attempts';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export type QuestionRow = { q: QuestionPublic; number: number };

/**
 * Daftar soal satu kelompok (Teks pada Reading, Section pada Listening) untuk Mode Ujian.
 * Setiap soal memakai `QuestionRenderer` (SPEC-006); bendera `aria-pressed`; status "Belum tersimpan" = ikon + teks.
 */
export function QuestionGroupList({
  rows,
  responses,
  onChange,
  disabled,
  flagged,
  onToggleFlag,
  unsaved,
  currentId,
  onFocusQuestion,
  legendRefs,
}: {
  rows: QuestionRow[];
  responses: Record<string, AnswerResponse | null>;
  onChange: (questionId: string, next: AnswerResponse | null) => void;
  disabled: boolean;
  flagged: Set<string>;
  onToggleFlag: (questionId: string) => void;
  unsaved: Set<string>;
  currentId: string | undefined;
  onFocusQuestion: (questionId: string) => void;
  legendRefs: React.MutableRefObject<Map<string, HTMLLegendElement | null>>;
}) {
  return (
    <ol className="grid gap-4">
      {rows.map(({ q, number }) => {
        const isFlagged = flagged.has(q.question_id);
        return (
          <li
            key={q.question_id}
            id={`q-${q.question_id}`}
            aria-label={fmt(id.exam.run.questionNumber, { n: number })}
            data-testid={`question-${number}`}
            onFocusCapture={() => onFocusQuestion(q.question_id)}
            className={cn('grid gap-3 rounded-xl border bg-card p-4 sm:p-5', q.question_id === currentId && 'border-primary')}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-muted-foreground">{fmt(id.exam.run.questionNumber, { n: number })}</p>
              <div className="flex items-center gap-2">
                {unsaved.has(q.question_id) ? (
                  <p role="status" className="flex items-center gap-1 text-sm font-medium text-destructive">
                    <CloudOff className="size-4" aria-hidden="true" />
                    {id.exam.run.unsaved}
                  </p>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={isFlagged}
                  aria-label={`${isFlagged ? id.reading.unflagQuestion : id.reading.flagQuestion} ${number}`}
                  onClick={() => onToggleFlag(q.question_id)}
                >
                  <Flag aria-hidden="true" className={isFlagged ? 'fill-current' : ''} />
                  {isFlagged ? id.reading.unflagQuestion : id.reading.flagQuestion}
                </Button>
              </div>
            </div>
            <QuestionRenderer
              ref={(el) => {
                legendRefs.current.set(q.question_id, el);
              }}
              question={q}
              value={responses[q.question_id] ?? null}
              onChange={(next) => onChange(q.question_id, next)}
              disabled={disabled}
              feedback={null}
            />
          </li>
        );
      })}
    </ol>
  );
}
