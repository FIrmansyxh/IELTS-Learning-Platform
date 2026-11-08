'use client';

import { Check, Copy, Mic } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { id } from '@/i18n/id';
import { ExternalScoreForm, type ExternalScoreContext } from './external-score-form';

/**
 * Kartu latihan Speaking (ADR-004): penilaian otomatis ditunda, jadi pengguna menyalin prompt ke
 * AI suara pihak ketiga (Claude, ChatGPT, Gemini) dan menjawab dengan mikrofon di sana.
 */
export function SpeakingExternalPromptCard({ prompt, context }: { prompt: string; context?: ExternalScoreContext }) {
  const t = id.quiz.speakingExternal;
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success(t.copied);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t.copyFailed);
    }
  }

  return (
    <div data-testid="speaking-external-prompt" className="grid gap-3 rounded-lg border bg-muted p-4">
      <div className="flex items-start gap-3">
        <Mic className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="grid gap-1">
          <p className="text-sm font-semibold">{t.title}</p>
          <p className="text-sm text-muted-foreground">{t.hint}</p>
        </div>
      </div>
      <div>
        <Button type="button" onClick={copy} variant="default" size="sm">
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? t.copied : t.copy}
        </Button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer select-none text-muted-foreground">{t.show}</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
          {prompt}
        </pre>
      </details>
      <p className="text-xs text-muted-foreground">{t.disclaimer}</p>
      {context ? <ExternalScoreForm context={context} /> : null}
    </div>
  );
}
