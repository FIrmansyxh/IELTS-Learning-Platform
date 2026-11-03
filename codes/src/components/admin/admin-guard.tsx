'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/use-auth';
import { id } from '@/i18n/id';

/** Pengguna `learner` yang membuka /admin/** dialihkan ke `/` dengan pesan 403 (UX; server tetap menolak). */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const isLearner = me.data?.role === 'learner';

  React.useEffect(() => {
    if (!isLearner) return;
    const t = setTimeout(() => router.replace('/'), 1500);
    return () => clearTimeout(t);
  }, [isLearner, router]);

  if (!me.data) return null;
  if (isLearner) {
    return (
      <div role="alert" className="mx-auto grid max-w-md gap-3 rounded-lg border bg-card p-6 text-center">
        <h1 className="text-2xl font-bold">{id.forbidden.title}</h1>
        <p className="text-muted-foreground">{id.forbidden.body}</p>
        <Button asChild>
          <Link href="/">{id.forbidden.back}</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
