'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { RecordingControls } from './recording-controls';
import { SubmissionOutcome } from './submission-outcome';
import { useSubmissionPolling } from './use-ai';

/** Detail `/riwayat/penilaian/[submission_id]`: EvaluationCard + teks, atau status bila belum selesai. */
export function SubmissionDetail({ submissionId }: { submissionId: string }) {
  const q = useSubmissionPolling(submissionId);
  const s = q.data;
  const notFound = q.error && isApiError(q.error) && q.error.status === 404;
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <Button asChild variant="ghost" className="w-fit">
        <Link href="/riwayat/penilaian">
          <ArrowLeft aria-hidden="true" />
          {id.ai.history.back}
        </Link>
      </Button>
      <h1 className="text-3xl font-bold">{id.ai.history.detailTitle}</h1>
      {q.isPending ? (
        <div className="grid gap-3" role="status" aria-label={id.common.loading}>
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : notFound ? (
        <ErrorState title={id.ai.history.detailLoadFailed} body={id.apiErrors.NOT_FOUND} />
      ) : !s ? (
        <ErrorState title={id.ai.history.detailLoadFailed} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <section aria-labelledby="detail-prompt" className="grid gap-1 rounded-lg border bg-muted p-4">
            <h2 id="detail-prompt" className="text-sm font-semibold">
              {id.ai.history.promptTitle} - {id.ai.kinds[s.kind] ?? s.kind}
            </h2>
            <p lang="en" className="whitespace-pre-wrap break-words">
              {s.prompt_snapshot}
            </p>
          </section>
          <SubmissionOutcome submission={s} extra={<RecordingControls submission={s} />} />
        </>
      )}
    </div>
  );
}
