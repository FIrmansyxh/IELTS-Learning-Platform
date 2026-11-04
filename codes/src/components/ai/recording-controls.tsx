'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmt, id } from '@/i18n/id';
import { aiApi } from '@/lib/api/ai';
import type { Submission } from '@/lib/api/ai-contract';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';
import { submissionKey } from './use-ai';

/** Pemutar "Dengarkan rekaman", tanggal retensi, dan penghapusan rekaman (transkrip & skor tetap). */
export function RecordingControls({ submission }: { submission: Submission }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const recording = submission.recording;

  const del = useMutation({
    mutationFn: () => aiApi.deleteRecording(submission.id),
    onSuccess: () => {
      setOpen(false);
      toast.success(id.ai.speaking.deleted);
      qc.setQueryData(submissionKey(submission.id), (old: Submission | undefined) =>
        old && old.recording
          ? { ...old, recording: { ...old.recording, available: false, purged_at: new Date().toISOString(), retention_expires_at: null } }
          : old,
      );
      void qc.invalidateQueries({ queryKey: submissionKey(submission.id) });
    },
    onError: (e) => {
      setOpen(false);
      toast.error(apiErrorMessage(e));
    },
  });

  if (!recording) return null;
  if (!recording.available) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="recording-gone">
        {id.ai.speaking.recordingGone}
      </p>
    );
  }
  return (
    <section aria-labelledby="rec-title" className="grid gap-3 rounded-lg border p-4" data-testid="recording-controls">
      <h3 id="rec-title" className="text-lg font-semibold">
        {id.ai.speaking.playRecording}
      </h3>
      <audio controls preload="none" src={aiApi.recordingUrl(submission.id)} aria-label={id.ai.speaking.playRecording} className="w-full" />
      {recording.retention_expires_at ? (
        <p className="text-sm text-muted-foreground">{fmt(id.ai.speaking.retention, { date: formatDate(recording.retention_expires_at) })}</p>
      ) : null}
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden="true" />
          {id.ai.speaking.deleteRecording}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.ai.speaking.deleteTitle}</DialogTitle>
            <DialogDescription>{id.ai.speaking.deleteBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={del.isPending}>
              {id.common.cancel}
            </Button>
            <Button variant="destructive" loading={del.isPending} onClick={() => del.mutate()}>
              {id.ai.speaking.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
