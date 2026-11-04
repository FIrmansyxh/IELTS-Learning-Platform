'use client';

import { Sparkles } from 'lucide-react';
import * as React from 'react';
import { SpeakingTask } from '@/components/ai/speaking-task';
import { WritingTask } from '@/components/ai/writing-task';
import type { QuestionPublic } from '@/contracts/attempts';
import { id } from '@/i18n/id';
import type { RendererProps } from './answer-utils';
import { ErrorRecognitionRenderer } from './renderers/error-recognition-renderer';
import { McqRenderer, TriChoiceRenderer } from './renderers/choice-renderers';
import { MatchingRenderer } from './renderers/matching-renderer';
import { ReorderRenderer } from './renderers/reorder-renderer';
import { TextRenderer } from './renderers/text-renderer';

/**
 * Slot soal Writing/Speaking. Dalam attempt (ada `attemptId`) memuat editor/perekam AI penuh
 * (SPEC-012/013); tanpa konteks attempt hanya petunjuk ke Tab Terapkan. Tidak memblokir tombol Lanjut.
 */
export function AiTaskSlot({
  kind,
  question,
  attemptId,
  remainingSec,
}: {
  kind: 'WRITING' | 'SPEAKING';
  question?: QuestionPublic;
  attemptId?: string;
  remainingSec?: number | null;
}) {
  const ai = question?.ai_task ?? null;
  if (attemptId && question) {
    if (kind === 'WRITING') {
      return (
        <div data-testid="ai-task-slot" data-kind={kind}>
          <WritingTask
            context={{ type: 'attempt', attemptId, questionId: question.question_id, taskKind: ai?.task_kind === 'TASK1' ? 'TASK1' : 'TASK2' }}
            prompt={question.prompt}
            stimulusUrl={ai?.stimulus_url ?? null}
            minWords={ai?.min_words ?? null}
            remainingSec={remainingSec ?? null}
          />
        </div>
      );
    }
    const part = ai?.part === 1 || ai?.part === 3 ? ai.part : 2;
    return (
      <div data-testid="ai-task-slot" data-kind={kind}>
        <SpeakingTask
          context={{ type: 'attempt', attemptId, questionId: question.question_id, part }}
          prompt={question.prompt}
          cuePoints={ai?.cue_points}
          prepSeconds={ai?.prep_seconds}
          recordSeconds={ai?.record_seconds}
        />
      </div>
    );
  }
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
      return <AiTaskSlot kind="WRITING" question={props.question} attemptId={props.attemptId} remainingSec={props.remainingSec} />;
    case 'SPEAKING_TASK':
      return <AiTaskSlot kind="SPEAKING" question={props.question} attemptId={props.attemptId} remainingSec={props.remainingSec} />;
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
