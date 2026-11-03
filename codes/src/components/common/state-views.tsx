import { AlertTriangle, Inbox } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';

export function ErrorState({
  title = id.common.loadFailed,
  body = id.common.loadFailedBody,
  onRetry,
  className,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-card p-5', className)}
    >
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
        <p className="font-semibold">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{body}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {id.common.retry}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  message,
  action,
  className,
}: {
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center', className)}>
      <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
