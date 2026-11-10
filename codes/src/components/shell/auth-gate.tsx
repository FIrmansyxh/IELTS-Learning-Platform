'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/state-views';
import { useMe } from '@/hooks/use-auth';
import { id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';

/**
 * Penjaga sisi klien (UX). Otorisasi sebenarnya tetap di server (`requireUser`).
 * Tanpa profil terpilih (SPEC-025) -> `/pilih-profil?next=<path>`; galat 401 dari query mana pun juga
 * memicu pengalihan (mis. profil dihapus saat tab lain terbuka).
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

  // qc.clear() membuat useMe memuat ulang dan menerima 401 lagi; tanpa penanda ini pengalihan dipicu berulang
  // (permintaan /auth/me beruntun dan navigasi yang terus dibatalkan saat halaman tujuan lambat dimuat).
  const redirectedFrom = React.useRef<string | null>(null);
  const toPicker = React.useCallback(() => {
    if (redirectedFrom.current === here) return;
    redirectedFrom.current = here;
    qc.clear();
    router.replace(`/pilih-profil?next=${encodeURIComponent(here)}`);
  }, [qc, router, here]);

  React.useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      const err = event.action.error;
      if (isApiError(err) && err.code === 'UNAUTHENTICATED') toPicker();
    });
  }, [qc, toPicker]);

  const user = me.data;
  const unauthenticated = me.isError && isApiError(me.error) && me.error.code === 'UNAUTHENTICATED';

  React.useEffect(() => {
    if (unauthenticated) toPicker();
  }, [unauthenticated, toPicker]);

  if (me.isError && !unauthenticated) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState onRetry={() => void me.refetch()} />
      </div>
    );
  }

  if (!user || unauthenticated) {
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
