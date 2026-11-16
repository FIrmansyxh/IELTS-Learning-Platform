import { CheckCircle2, XCircle } from 'lucide-react';
import type { Feedback } from '@/contracts/attempts';
import { fmt, id } from '@/i18n/id';
import { cn } from '@/lib/utils';

/**
 * Panel umpan balik mode Latihan (design-system 5.12). Wadah `role="status"` selalu ada agar
 * pembaca layar mengumumkan isi yang muncul. Warna selalu disertai ikon dan teks.
 */
export function FeedbackPanel({ feedback }: { feedback: Feedback | null }) {
  const partial = feedback && !feedback.is_correct && feedback.score > 0;
  return (
    <div role="status" aria-live="polite" className="min-h-0">
      {feedback ? (
        <div
          data-state={feedback.is_correct ? 'correct' : 'wrong'}
          className={cn(
            'grid gap-2 rounded-lg border p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200',
            feedback.is_correct
              ? 'border-[var(--color-done)] bg-[color-mix(in_srgb,var(--color-done)_10%,var(--color-surface))]'
              : 'border-destructive bg-[color-mix(in_srgb,var(--color-error)_8%,var(--color-surface))]',
          )}
        >
          <p
            className={cn(
              'flex items-center gap-2 text-lg font-bold',
              feedback.is_correct ? 'text-[var(--color-done-text)]' : 'text-destructive',
            )}
          >
            {feedback.is_correct ? (
              <CheckCircle2 className="size-5" aria-hidden="true" />
            ) : (
              <XCircle className="size-5" aria-hidden="true" />
            )}
            {feedback.is_correct ? id.quiz.correct : id.quiz.wrong}
          </p>
          {partial ? (
            <p className="text-sm">{fmt(id.quiz.partial, { score: feedback.score, max: feedback.max_score })}</p>
          ) : null}
          {!feedback.is_correct ? (
            <div>
              <p className="text-sm font-semibold">{id.quiz.correctAnswer}</p>
              <ul lang="en" className="list-disc pl-5">
                {feedback.correct_answer.display.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {feedback.explanation_id ? (
            <div>
              <p className="text-sm font-semibold">{id.quiz.explanation}</p>
              <p className="whitespace-pre-line text-sm leading-relaxed">{feedback.explanation_id}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
