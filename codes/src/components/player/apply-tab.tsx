'use client';

import { CheckCircle2 } from 'lucide-react';
import { SpeakingTask } from '@/components/ai/speaking-task';
import { WritingTask } from '@/components/ai/writing-task';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SubModuleDetail } from '@/contracts/player';
import { id } from '@/i18n/id';

/** Mini-Task AI (SPEC-012/013): editor Writing atau perekam Speaking, dinilai penilai lokal. */
export function MiniTaskAi({
  taskType,
  subModuleId,
  prompt,
  onGraded,
}: {
  taskType: 'AI_SHORT_WRITING' | 'AI_SHORT_SPEAKING';
  subModuleId: string;
  prompt: string;
  onGraded?: () => void;
}) {
  return (
    <div data-testid="mini-task-ai" data-task-type={taskType} className="grid gap-3">
      {taskType === 'AI_SHORT_WRITING' ? (
        <WritingTask context={{ type: 'mini', subModuleId }} prompt={prompt} onGraded={onGraded} />
      ) : (
        <SpeakingTask context={{ type: 'mini', subModuleId }} prompt={prompt} onGraded={onGraded} />
      )}
    </div>
  );
}

/** Tab Terapkan: kartu Mini-Task; SELF_CHECK dapat ditandai selesai, tipe AI memakai slot. */
export function ApplyTab({
  detail,
  onMarkDone,
  marking,
  onGraded,
}: {
  detail: SubModuleDetail;
  onMarkDone: () => void;
  marking: boolean;
  /** Mini-Task AI mencapai GRADED: muat ulang progres sub-modul. */
  onGraded?: () => void;
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
        ) : done || learnDone ? (
          <>
            {done ? (
              <p role="status" className="flex items-center gap-2 font-medium text-[var(--color-done-text)]">
                <CheckCircle2 className="size-5" aria-hidden="true" />
                {id.player.apply.done}
              </p>
            ) : null}
            <MiniTaskAi taskType={task.task_type} subModuleId={detail.sub_module.id} prompt={task.prompt} onGraded={onGraded} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="apply-need-learn-ai">
            {id.player.apply.needLearn}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
