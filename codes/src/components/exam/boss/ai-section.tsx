'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AiTaskSlot } from '@/components/quiz/question-renderer';
import { ExamShell } from '@/components/quiz/exam-shell';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import type { StartSectionData } from '@/lib/api/boss-contract';
import type { ExamSectionBinding } from '../exam-runner';

/** Jeda sebelum pengiriman otomatis (waktu habis) dicoba lagi setelah gagal. */
const AUTO_RETRY_MS = 3000;
const FAIL_TOAST = 'boss-section-submit-failed';

/**
 * Section Writing/Speaking Boss Stage: editor/perekam SPEC-012/013 dipakai apa adanya dengan `attempt_id` dan
 * `question_id` dari section. Hanya timer section dan tombol "Selesai Section" yang ditambahkan di sini.
 */
export function BossAiSection({
  attemptId,
  data,
  binding,
}: {
  attemptId: string;
  data: StartSectionData;
  binding: ExamSectionBinding;
}) {
  const sec = data.section;
  const skew = React.useRef(Date.parse(data.server_now) - Date.now());
  const deadline = sec.deadline_at ? Date.parse(sec.deadline_at) : null;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - (now + skew.current)) / 1000));
  const remainingRef = React.useRef(remaining);
  remainingRef.current = remaining;

  const bindingRef = React.useRef(binding);
  bindingRef.current = binding;
  const submittingRef = React.useRef(false);
  const nextAutoAt = React.useRef(0);

  const finish = React.useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const out = await bindingRef.current.submit();
      toast.dismiss(FAIL_TOAST);
      bindingRef.current.onSubmitted(out, remainingRef.current === 0);
    } catch (e) {
      if (isApiError(e) && ['ATTEMPT_EXPIRED', 'ATTEMPT_NOT_ACTIVE', 'SECTION_EXPIRED', 'SECTION_NOT_ACTIVE'].includes(e.code)) {
        bindingRef.current.onClosed();
        return;
      }
      nextAutoAt.current = Date.now() + AUTO_RETRY_MS;
      submittingRef.current = false;
      toast.error(isApiError(e) && e.code !== 'NETWORK_ERROR' ? apiErrorMessage(e) : id.boss.run.submitFailed, { id: FAIL_TOAST });
    }
  }, []);

  // Waktu section habis: kirim otomatis; bila gagal, coba lagi tiap AUTO_RETRY_MS.
  React.useEffect(() => {
    if (remaining === 0 && !submittingRef.current && Date.now() >= nextAutoAt.current) void finish();
  }, [remaining, now, finish]);

  const questions = data.questions.filter((q) => q.question_type === 'WRITING_TASK' || q.question_type === 'SPEAKING_TASK');
  return (
    <ExamShell
      title={sec.title}
      remainingSeconds={remaining}
      unansweredCount={0}
      onEnd={() => void finish()}
      labels={{
        end: id.boss.run.finishSection,
        endTitle: id.boss.run.endTitle,
        endBody: id.boss.run.endBodyAi,
        endConfirm: id.boss.run.endConfirm,
      }}
    >
      <div className="grid gap-8" role="region" aria-label={fmt(id.boss.run.sectionRegion, { name: sec.title })}>
        {questions.map((q, i) => (
          <section key={q.question_id} className="grid gap-3">
            {questions.length > 1 ? <h2 className="text-lg font-bold">{fmt(id.boss.run.taskN, { n: i + 1 })}</h2> : null}
            <AiTaskSlot
              kind={q.question_type === 'SPEAKING_TASK' ? 'SPEAKING' : 'WRITING'}
              question={q}
              attemptId={attemptId}
              remainingSec={remaining}
            />
          </section>
        ))}
      </div>
    </ExamShell>
  );
}
