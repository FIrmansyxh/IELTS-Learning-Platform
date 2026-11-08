'use client';

import { Sparkles } from 'lucide-react';
import * as React from 'react';
import { SpeakingExternalPromptCard } from '@/components/speaking/external-prompt-card';
import { WritingTaskPanel } from '@/components/writing/writing-task-panel';
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
    case 'WRITING_TASK': {
      const taskKind = props.question.ai_task?.task_kind;
      if (!props.attemptId || !taskKind) return <AiTaskSlot kind="WRITING" />;
      return (
        <WritingTaskPanel
          context={{
            kind: taskKind === 'TASK1' ? 'WRITING_TASK1' : 'WRITING_TASK2',
            attempt_id: props.attemptId,
            question_id: props.question.question_id,
          }}
          minWords={props.question.ai_task?.min_words}
          storageKey={`writing-draft:${props.attemptId}:${props.question.question_id}`}
        />
      );
    }
    case 'SPEAKING_TASK': {
      const external = props.question.ai_task?.external_prompt;
      const part = props.question.ai_task?.part;
      const context =
        props.attemptId && (part === 1 || part === 2 || part === 3)
          ? ({ kind: `SPEAKING_PART${part}`, attempt_id: props.attemptId, question_id: props.question.question_id } as const)
          : undefined;
      return external ? <SpeakingExternalPromptCard prompt={external} context={context} /> : <AiTaskSlot kind="SPEAKING" />;
    }
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
