'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { isNavActive, NAV_ITEMS, type NavItem } from '@/app/nav.config';
import { StatChips } from '@/components/gamification/stat-chips';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMe } from '@/hooks/use-auth';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';

function useVisibleItems(): NavItem[] {
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  return NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
}

function DisabledItem({ item, variant }: { item: NavItem; variant: 'side' | 'bottom' }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="link"
          aria-disabled="true"
          tabIndex={0}
          className={cn(
            'flex cursor-not-allowed items-center gap-3 rounded-md text-muted-foreground opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-ring',
            variant === 'side' ? 'min-h-11 px-3' : 'min-h-14 flex-1 flex-col justify-center gap-1 text-xs',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          <span>{item.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{id.nav.soon}</TooltipContent>
    </Tooltip>
  );
}

function NavLink({ item, pathname, variant }: { item: NavItem; pathname: string; variant: 'side' | 'bottom' }) {
  if (!item.enabled) return <DisabledItem item={item} variant={variant} />;
  const active = isNavActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variant === 'side'
          ? 'min-h-11 gap-3 px-3 text-sm font-medium hover:bg-accent'
          : 'min-h-14 flex-1 flex-col justify-center gap-1 text-xs font-medium',
        active ? 'text-[var(--color-primary)]' : 'text-muted-foreground hover:text-foreground',
        active && variant === 'side' && 'bg-accent',
      )}
    >
      {active && variant === 'bottom' ? (
        <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
      ) : null}
      <Icon className={cn('size-5', active && 'fill-primary/15')} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

/** Pindahkan fokus ke <main> setelah pindah rute (design-system 7). */
function RouteFocus({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    target.current?.focus({ preventScroll: false });
  }, [pathname, target]);
  return null;
}

/**
 * Kerangka aplikasi terautentikasi: sidebar desktop (>= lg) dan bottom nav mobile.
 * Saat `must_change_password` navigasi disembunyikan (hanya halaman ganti password).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const items = useVisibleItems();
  const me = useMe();
  const mainRef = React.useRef<HTMLElement | null>(null);
  const hideNav = me.data?.must_change_password === true;

  return (
    <div className="min-h-dvh">
      {!hideNav ? (
        <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-card p-4 lg:flex">
          <p className="mb-6 px-3 font-heading text-lg font-bold">{id.app.name}</p>
          <nav aria-label={id.nav.main} className="flex flex-col gap-1">
            {items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} variant="side" />
            ))}
          </nav>
        </aside>
      ) : null}

      {!hideNav ? (
        <header
          aria-label={id.gamification.chips.region}
          className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:ml-64"
        >
          <div className="mx-auto flex min-h-12 max-w-6xl items-center justify-end px-4 py-2 md:px-6 lg:px-8">
            <StatChips />
          </div>
        </header>
      ) : null}

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={cn(
          'mx-auto w-full max-w-6xl px-4 py-6 outline-none md:px-6 lg:px-8',
          !hideNav && 'pb-24 lg:ml-64 lg:w-auto lg:max-w-none lg:pb-8',
        )}
      >
        <div className={cn(!hideNav && 'lg:mx-auto lg:max-w-6xl')}>{children}</div>
      </main>
      <RouteFocus target={mainRef} />

      {!hideNav ? (
        <nav
          aria-label={id.nav.main}
          className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} variant="bottom" />
          ))}
        </nav>
      ) : null}
    </div>
  );
}
