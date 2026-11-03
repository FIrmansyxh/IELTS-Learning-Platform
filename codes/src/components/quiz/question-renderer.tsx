'use client';

import { Sparkles } from 'lucide-react';
import * as React from 'react';
import { id } from '@/i18n/id';
import type { RendererProps } from './answer-utils';
import { ErrorRecognitionRenderer } from './renderers/error-recognition-renderer';
import { McqRenderer, TriChoiceRenderer } from './renderers/choice-renderers';
import { MatchingRenderer } from './renderers/matching-renderer';
import { ReorderRenderer } from './renderers/reorder-renderer';
import { TextRenderer } from './renderers/text-renderer';

/** Slot soal Writing/Speaking: dinilai AI di Tab Terapkan, tidak memblokir tombol Lanjut. */
export function AiTaskSlot({ kind }: { kind: 'WRITING' | 'SPEAKING' }) {
  return (
    <div data-testid="ai-task-slot" data-kind={kind} className="flex items-start gap-3 rounded-lg border bg-muted p-4">
      <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm">{id.quiz.aiSlot}</p>
    </div>
  );
}

function Body(props: RendererProps) {
  switch (props.question.question_type) {
    case 'MCQ_SINGLE':
    case 'MCQ_MULTI':
      return <McqRenderer {...props} />;
    case 'TFNG':
    case 'YNNG':
      return <TriChoiceRenderer {...props} />;
    case 'FILL_IN_BLANK':
    case 'SHORT_ANSWER':
      return <TextRenderer {...props} />;
    case 'MATCHING_DROPDOWN':
    case 'MATCHING_DRAG':
      return <MatchingRenderer {...props} />;
    case 'SENTENCE_REORDER':
      return <ReorderRenderer {...props} />;
    case 'ERROR_RECOGNITION':
      return <ErrorRecognitionRenderer {...props} />;
    case 'WRITING_TASK':
      return <AiTaskSlot kind="WRITING" />;
    case 'SPEAKING_TASK':
      return <AiTaskSlot kind="SPEAKING" />;
  }
}

/**
 * Memilih renderer per tipe. Satu fieldset per soal; legend = kepala soal yang menerima fokus
 * saat berpindah soal.
 */
export const QuestionRenderer = React.forwardRef<HTMLLegendElement, RendererProps>(function QuestionRenderer(props, ref) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <legend ref={ref} tabIndex={-1} className="mb-1 text-lg font-semibold leading-snug outline-none">
        {props.question.prompt}
      </legend>
      <Body {...props} />
    </fieldset>
  );
});
