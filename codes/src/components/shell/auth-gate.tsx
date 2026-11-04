'use client';

import { clearExamStorage } from '@/lib/reading/storage';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/state-views';
import { useMe } from '@/hooks/use-auth';
import { id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';

const CHANGE_PASSWORD_PATH = '/ganti-password';

/**
 * Penjaga sisi klien (UX). Otorisasi sebenarnya tetap di server (`requireUser`).
 * - tanpa sesi -> `/masuk?next=<path>`
 * - `must_change_password` -> paksa `/ganti-password`
 * - galat 401/PASSWORD_CHANGE_REQUIRED dari query mana pun juga memicu pengalihan
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const qc = useQueryClient();
  const me = useMe();

  const here = React.useMemo(() => {
    const qs = search.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, search]);

  const toLogin = React.useCallback(() => {
    qc.clear();
    clearExamStorage();
    router.replace(`/masuk?next=${encodeURIComponent(here)}`);
  }, [qc, router, here]);

  // Galat otorisasi dari query mana pun (sesi dicabut admin, dsb.).
  React.useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      const err = event.action.error;
      if (!isApiError(err)) return;
      if (err.code === 'UNAUTHENTICATED') toLogin();
      if (err.code === 'PASSWORD_CHANGE_REQUIRED' && pathname !== CHANGE_PASSWORD_PATH) {
        router.replace(CHANGE_PASSWORD_PATH);
      }
    });
  }, [qc, toLogin, router, pathname]);

  const user = me.data;
  const unauthenticated = me.isError && isApiError(me.error) && me.error.code === 'UNAUTHENTICATED';

  React.useEffect(() => {
    if (unauthenticated) toLogin();
  }, [unauthenticated, toLogin]);

  React.useEffect(() => {
    if (user?.must_change_password && pathname !== CHANGE_PASSWORD_PATH) {
      router.replace(CHANGE_PASSWORD_PATH);
    }
  }, [user, pathname, router]);

  if (me.isError && !unauthenticated) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState onRetry={() => void me.refetch()} />
      </div>
    );
  }

  if (!user || unauthenticated || (user.must_change_password && pathname !== CHANGE_PASSWORD_PATH)) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6" role="status" aria-live="polite">
        <span className="sr-only">{id.auth.guard.checking}</span>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
