'use client';

import { CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SubModuleDetail } from '@/contracts/player';
import { SpeakingExternalPromptCard } from '@/components/speaking/external-prompt-card';
import { WritingTaskPanel } from '@/components/writing/writing-task-panel';
import { id } from '@/i18n/id';
import { buildSpeakingExternalPrompt } from '@/lib/speaking-external-prompt';

/** Slot Mini-Task AI (SPEC-012/013). Sebelum spec itu selesai: "Segera hadir" dinonaktifkan. */
export function MiniTaskAi({ taskType }: { taskType: 'AI_SHORT_WRITING' | 'AI_SHORT_SPEAKING' }) {
  return (
    <div data-testid="mini-task-ai" data-task-type={taskType} className="flex items-start gap-3 rounded-lg border bg-muted p-4">
      <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="grid gap-2">
        <p className="text-sm">{id.player.apply.aiBody}</p>
        <Button disabled aria-disabled="true" className="w-fit">
          {id.player.apply.aiSoon}
        </Button>
      </div>
    </div>
  );
}

/** Tab Terapkan: kartu Mini-Task; SELF_CHECK dapat ditandai selesai, tipe AI memakai slot. */
export function ApplyTab({
  detail,
  onMarkDone,
  marking,
}: {
  detail: SubModuleDetail;
  onMarkDone: () => void;
  marking: boolean;
}) {
  const task = detail.material.mini_task;
  const { progress } = detail;
  if (!task) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{id.player.apply.none}</p>;
  }
  const done = progress.mini_task_completed_at !== null;
  const learnDone = progress.learn_completed_at !== null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{id.player.apply.title}</CardTitle>
        <CardDescription className="whitespace-pre-line text-base text-foreground" lang="id">
          {task.prompt}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {task.success_criteria ? (
          <div>
            <p className="text-sm font-semibold">{id.player.apply.criteria}</p>
            <p className="text-sm text-muted-foreground">{task.success_criteria}</p>
          </div>
        ) : null}
        {task.task_type === 'SELF_CHECK' ? (
          done ? (
            <p role="status" className="flex items-center gap-2 font-medium text-[var(--color-done-text)]">
              <CheckCircle2 className="size-5" aria-hidden="true" />
              {id.player.apply.done}
            </p>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">{id.player.apply.selfCheckHint}</p>
              <Button
                size="lg"
                className="w-full sm:w-fit"
                disabled={!learnDone || marking}
                loading={marking}
                onClick={onMarkDone}
                aria-describedby={!learnDone ? 'apply-need-learn' : undefined}
              >
                {marking ? id.player.apply.marking : id.player.apply.markDone}
              </Button>
              {!learnDone ? (
                <p id="apply-need-learn" className="text-sm text-muted-foreground">
                  {id.player.apply.needLearn}
                </p>
              ) : null}
            </div>
          )
        ) : task.task_type === 'AI_SHORT_SPEAKING' ? (
          <SpeakingExternalPromptCard
            prompt={buildSpeakingExternalPrompt({ part: 1, prompt: task.prompt })}
            context={learnDone ? { kind: 'MINI_TASK_SPEAKING', sub_module_id: detail.sub_module.id } : undefined}
          />
        ) : task.task_type === 'AI_SHORT_WRITING' ? (
          learnDone ? (
            <WritingTaskPanel
              context={{ kind: 'MINI_TASK_WRITING', sub_module_id: detail.sub_module.id }}
              storageKey={`writing-draft:mini:${detail.sub_module.id}`}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{id.player.apply.needLearn}</p>
          )
        ) : (
          <MiniTaskAi taskType={task.task_type} />
        )}
      </CardContent>
    </Card>
  );
}
