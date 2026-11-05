'use client';

import React, { useState } from 'react';
import { id } from '@/i18n';
import { Button } from '@/components/ui/button';

export interface SelfAssessmentFormProps {
  kind?: 'writing' | 'speaking';
  onSubmit: (scores: Record<string, number>) => Promise<void> | void;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

const WRITING_CRITERIA = [
  { key: 'task_response', name: 'Task Response', desc: 'Pemenuhan syarat tugas dan kejelasan posisi/argumen.' },
  { key: 'coherence', name: 'Coherence & Cohesion', desc: 'Kelancaran alur paragraf dan penggunaan kata penghubung.' },
  { key: 'lexical', name: 'Lexical Resource', desc: 'Variasi, ketepatan, dan keakuratan pemilihan kosakata.' },
  { key: 'grammar', name: 'Grammatical Range & Accuracy', desc: 'Variasi struktur kalimat dan keakuratan tata bahasa.' },
];

const BAND_OPTIONS = [
  4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0,
];

export function roundToHalfBand(mean: number): number {
  return Math.round(mean * 2) / 2;
}

export function SelfAssessmentForm({
  kind: _kind = 'writing',
  onSubmit,
  onCancel,
  isSubmitting = false,
}: SelfAssessmentFormProps) {
  void _kind;
  const [scores, setScores] = useState<Record<string, number>>({
    task_response: 6.0,
    coherence: 6.0,
    lexical: 6.0,
    grammar: 6.0,
  });

  const criteriaList = WRITING_CRITERIA;

  const currentMean =
    criteriaList.reduce((acc, c) => acc + (scores[c.key] ?? 6.0), 0) / criteriaList.length;
  const estimatedOverall = roundToHalfBand(currentMean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(scores);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-6 shadow-xs flex flex-col gap-6"
    >
      <div>
        <h3 className="text-base font-semibold text-foreground">{id.ai.selfAssessment.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{id.ai.selfAssessment.desc}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {criteriaList.map((c) => (
          <div
            key={c.key}
            className="rounded-lg border border-border/80 bg-muted/20 p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <label htmlFor={`criterion-${c.key}`} className="text-sm font-semibold text-foreground">
                {c.name}
              </label>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Band {(scores[c.key] ?? 6.0).toFixed(1)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{c.desc}</p>
            <select
              id={`criterion-${c.key}`}
              value={scores[c.key] ?? 6.0}
              onChange={(e) =>
                setScores((prev) => ({
                  ...prev,
                  [c.key]: parseFloat(e.target.value),
                }))
              }
              disabled={isSubmitting}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {BAND_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  Band {b.toFixed(1)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/40 p-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-muted-foreground">Estimasi Band Keseluruhan</span>
          <div className="text-2xl font-bold text-primary">{estimatedOverall.toFixed(1)}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground max-w-xs">
          {id.ai.selfAssessment.confirmNotice}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Batal
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Menyimpan...' : id.ai.selfAssessment.submitBtn}
        </Button>
      </div>
    </form>
  );
}
