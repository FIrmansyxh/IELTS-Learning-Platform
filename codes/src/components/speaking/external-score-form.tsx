'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EXTERNAL_TOOLS, type ExternalSpeakingEvaluationRequest } from '@/contracts/ai';
import { id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { speakingExternalApi } from '@/lib/api/speaking-external';
import {
  SPEAKING_CRITERIA,
  computeSpeakingOverall,
  parseExternalSpeakingResult,
  type SpeakingCriterion,
} from '@/lib/speaking-external-prompt';

/** Konteks soal Speaking; aturan sama dengan `POST /submissions/speaking` (tanpa audio). */
export type ExternalScoreContext = Pick<
  ExternalSpeakingEvaluationRequest,
  'kind' | 'attempt_id' | 'question_id' | 'sub_module_id'
>;

const BAND_CHOICES = Array.from({ length: 19 }, (_, i) => i / 2); // 0, 0.5, ... 9
const TOOL_LABEL: Record<(typeof EXTERNAL_TOOLS)[number], string> = {
  CLAUDE: 'Claude',
  CHATGPT: 'ChatGPT',
  GEMINI: 'Gemini',
  OTHER: 'Lainnya',
};
const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function ExternalScoreForm({ context, onSaved }: { context: ExternalScoreContext; onSaved?: () => void }) {
  const t = id.quiz.speakingExternal.form;
  const [pasted, setPasted] = React.useState('');
  const [parseMsg, setParseMsg] = React.useState<string | null>(null);
  const [scores, setScores] = React.useState<Partial<Record<SpeakingCriterion, number>>>({});
  const [tool, setTool] = React.useState<(typeof EXTERNAL_TOOLS)[number]>('CLAUDE');
  const [feedback, setFeedback] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const complete = SPEAKING_CRITERIA.every((c) => scores[c] !== undefined);
  const overall = complete ? computeSpeakingOverall(scores as Record<SpeakingCriterion, number>) : null;

  function autofill() {
    const r = parseExternalSpeakingResult(pasted);
    setScores((prev) => ({ ...prev, ...r.scores }));
    setParseMsg(r.problems.length === 0 ? t.parsedOk : t.parsedPartial);
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setSaving(true);
    try {
      await speakingExternalApi.record({
        ...context,
        tool,
        criteria_scores: scores as Record<SpeakingCriterion, number>,
        ...(feedback.trim() ? { feedback_text: feedback.trim().slice(0, 4000) } : {}),
      });
      setSaved(true);
      toast.success(t.saved);
      onSaved?.();
    } catch (err) {
      toast.error(isApiError(err) && err.status !== 0 ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form data-testid="external-score-form" onSubmit={save} className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{t.title}</h3>
        <p className="text-sm text-muted-foreground">{t.hint}</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ext-paste">{t.pasteLabel}</Label>
        <Textarea id="ext-paste" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={autofill} disabled={pasted.trim().length === 0}>
            {t.pasteBtn}
          </Button>
          {parseMsg ? (
            <p role="status" className="text-sm text-muted-foreground">
              {parseMsg}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SPEAKING_CRITERIA.map((c) => (
          <div key={c} className="grid gap-1">
            <Label htmlFor={`ext-${c}`}>{t.criteria[c]}</Label>
            <select
              id={`ext-${c}`}
              className={selectClass}
              value={scores[c] === undefined ? '' : String(scores[c])}
              onChange={(e) => {
                const v = e.target.value;
                setScores((prev) => ({ ...prev, [c]: v === '' ? undefined : Number(v) }));
                setSaved(false);
              }}
            >
              <option value="">{t.choose}</option>
              {BAND_CHOICES.map((b) => (
                <option key={b} value={b}>
                  {b.toFixed(1)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="grid gap-1">
        <Label htmlFor="ext-tool">{t.toolLabel}</Label>
        <select id="ext-tool" className={selectClass} value={tool} onChange={(e) => setTool(e.target.value as typeof tool)}>
          {EXTERNAL_TOOLS.map((x) => (
            <option key={x} value={x}>
              {TOOL_LABEL[x]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="ext-feedback">{t.feedbackLabel}</Label>
        <Textarea id="ext-feedback" rows={3} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p data-testid="external-overall" className="text-sm">
          {t.overall}: <strong>{overall === null ? '-' : overall.toFixed(1)}</strong>
        </p>
        <Button type="submit" disabled={!complete || saving}>
          {saving ? t.saving : t.save}
        </Button>
      </div>
      {saved ? (
        <p role="status" className="text-sm text-[var(--color-done-text)]">
          {t.saved}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t.manualNotice}</p>
    </form>
  );
}
