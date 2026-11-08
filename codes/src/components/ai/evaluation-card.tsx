'use client';

import React, { useState } from 'react';
import { id } from '@/i18n';
import type { EvaluationDTO, RecordingDTO } from '@/contracts/ai';
import { Button } from '@/components/ui/button';

export interface EvaluationCardProps {
  evaluation: EvaluationDTO;
  responseText?: string | null;
  recording?: RecordingDTO | null;
  submissionId?: string;
  onRecordingDeleted?: () => void;
}

export function EvaluationCard({
  evaluation,
  responseText,
  recording,
  submissionId,
  onRecordingDeleted,
}: EvaluationCardProps) {
  const [isDeletingRecording, setIsDeletingRecording] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [recordingDeleted, setRecordingDeleted] = useState(false);

  const {
    overall_band,
    method,
    criteria,
    strengths_id,
    improvements_id,
    corrections,
    band7_rewrite,
    flags,
    disclaimer,
  } = evaluation;

  const isSelf = method === 'SELF_ASSESSMENT';

  const hasFlags =
    flags.injection_suspected ||
    flags.score_capped ||
    flags.non_english_suspected ||
    flags.high_band_capped ||
    flags.low_audio_quality;

  const handleDeleteRecording = async () => {
    if (!submissionId) return;
    if (!confirm('Rekaman akan dihapus permanen. Transkrip dan skor tetap tersimpan. Lanjutkan?')) {
      return;
    }
    setIsDeletingRecording(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/v1/submissions/${submissionId}/recording`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message || 'Gagal menghapus rekaman.');
      }
      setRecordingDeleted(true);
      onRecordingDeleted?.();
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus rekaman.'
      );
    } finally {
      setIsDeletingRecording(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Disclaimer Notice Banner */}
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">{disclaimer || id.ai.disclaimer}</span>
        </div>
        <span className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/60">
          {method === 'EXTERNAL_AI' ? 'AI Eksternal (input manual)' : isSelf ? 'Self-Assessment' : 'AI Local'}
        </span>
      </div>

      {/* Flags Notice if applicable */}
      {hasFlags && (
        <div className="rounded-lg border border-orange-300 bg-orange-50/80 dark:border-orange-900 dark:bg-orange-950/30 p-4 text-xs text-orange-900 dark:text-orange-200 flex flex-col gap-1.5">
          <h5 className="font-semibold">{id.ai.evaluation.flagsNotice}</h5>
          <ul className="list-disc list-inside space-y-0.5">
            {flags.injection_suspected && <li>{id.ai.evaluation.flagInjection}</li>}
            {flags.score_capped && flags.cap_reason === 'word_count' && (
              <li>{id.ai.evaluation.flagWordCountCap}</li>
            )}
            {flags.score_capped && flags.cap_reason === 'duration' && (
              <li>Skor dibatasi karena durasi bicara kurang dari batas minimum.</li>
            )}
            {(flags.non_english_suspected || flags.cap_reason === 'non_english') && (
              <li>{id.ai.evaluation.flagNonEnglishCap}</li>
            )}
            {flags.high_band_capped && <li>{id.ai.evaluation.flagHighBandCap}</li>}
            {flags.low_audio_quality && (
              <li>Kualitas rekaman rendah; hasil penilaian kurang akurat.</li>
            )}
          </ul>
        </div>
      )}

      {/* Main Score & Criteria Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
          <div>
            <h3 className="text-base font-semibold text-foreground">{id.ai.evaluation.overallBand}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rata-rata 4 kriteria band descriptors
            </p>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-primary tracking-tight">
              {overall_band.toFixed(1)}
            </span>
            <span className="text-sm font-medium text-muted-foreground">/ 9.0</span>
          </div>
        </div>

        {/* 4 Criteria Grid */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {id.ai.evaluation.criteriaHeading}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {criteria.map((c) => (
              <div
                key={c.key}
                className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{c.name}</span>
                  <div className="flex items-center gap-2">
                    {c.key === 'pronunciation' && flags.pronunciation_estimated && (
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/60"
                        title="Dinilai dari transkrip dan keyakinan pengenalan suara; kurang akurat."
                      >
                        Pronunciation diperkirakan
                      </span>
                    )}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      Band {c.band.toFixed(1)}
                    </span>
                  </div>
                </div>
                {c.comment_id && (
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {c.comment_id}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strengths & Improvements */}
      {(strengths_id.length > 0 || improvements_id.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strengths_id.length > 0 && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-950 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 shadow-xs flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                {id.ai.evaluation.strengthsHeading}
              </h4>
              <ul className="space-y-1.5 text-xs text-emerald-950 dark:text-emerald-200">
                {strengths_id.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                    <span className="whitespace-pre-wrap">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {improvements_id.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-950 bg-amber-50/50 dark:bg-amber-950/20 p-5 shadow-xs flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {id.ai.evaluation.improvementsHeading}
              </h4>
              <ul className="space-y-1.5 text-xs text-amber-950 dark:text-amber-200">
                {improvements_id.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-600 dark:text-amber-400 font-bold">•</span>
                    <span className="whitespace-pre-wrap">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Menuju Band 7: Corrections */}
      {corrections && corrections.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs flex flex-col gap-4">
          <h4 className="text-sm font-semibold text-foreground">
            {id.ai.evaluation.correctionsHeading}
          </h4>
          <div className="space-y-3">
            {corrections.map((corr, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex flex-col gap-2 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 line-through text-destructive/80 font-mono text-[11px] bg-destructive/10 px-2 py-1 rounded">
                    {corr.original}
                  </div>
                  <span className="text-muted-foreground hidden sm:inline">→</span>
                  <div className="flex-1 text-emerald-700 dark:text-emerald-400 font-medium font-mono text-[11px] bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 rounded">
                    {corr.improved}
                  </div>
                </div>
                {corr.reason_id && (
                  <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                    💡 {corr.reason_id}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Band 7 Rewrite */}
      {band7_rewrite && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-xs flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">
            {id.ai.evaluation.rewriteHeading}
          </h4>
          <p className="text-xs text-foreground/90 font-serif leading-relaxed whitespace-pre-wrap p-3 rounded-md bg-background/80 border border-border/60">
            {band7_rewrite}
          </p>
        </div>
      )}

      {/* Original student response text collapsible/view */}
      {responseText && (
        <details className="rounded-lg border border-border bg-muted/10 p-4 text-xs">
          <summary className="font-medium text-muted-foreground cursor-pointer select-none">
            Lihat Transkrip / Jawaban yang Dikirim
          </summary>
          <p className="mt-3 text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap pt-2 border-t border-border/40">
            {responseText}
          </p>
        </details>
      )}

      {/* Audio Recording Playback & Management if available */}
      {recording && recording.available && !recordingDeleted && submissionId && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Rekaman Suara Anda
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {recording.retention_expires_at
                  ? `Dihapus otomatis pada ${new Date(recording.retention_expires_at).toLocaleDateString('id-ID')}`
                  : 'Tersedia di penyimpanan aman'}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isDeletingRecording}
              onClick={handleDeleteRecording}
            >
              {isDeletingRecording ? 'Menghapus...' : 'Hapus Rekaman'}
            </Button>
          </div>

          <audio
            controls
            src={`/api/v1/submissions/${submissionId}/recording`}
            className="w-full h-10"
            aria-label="Pemutar rekaman suara"
          />

          {deleteError && (
            <p className="text-xs text-destructive">{deleteError}</p>
          )}
        </div>
      )}
    </div>
  );
}
