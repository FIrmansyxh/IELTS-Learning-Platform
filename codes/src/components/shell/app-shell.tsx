'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { isNavActive, NAV_ITEMS, type NavItem } from '@/app/nav.config';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import { HeaderChips } from '@/components/gamification/header-chips';

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
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const items: NavItem[] = NAV_ITEMS;
  const mainRef = React.useRef<HTMLElement | null>(null);

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r bg-card p-4 lg:flex">
          <p className="mb-6 px-3 font-heading text-lg font-bold">{id.app.name}</p>
          <nav aria-label={id.nav.main} className="flex flex-col gap-1">
            {items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} variant="side" />
            ))}
          </nav>
        </aside>

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="min-w-0 px-4 py-6 pb-24 outline-none md:px-6 lg:ml-64 lg:px-8 lg:pb-8"
      >
        <div className="w-full max-w-7xl 2xl:max-w-[1536px]">
          <div className="mb-4 flex items-center justify-end pb-1">
            <HeaderChips />
          </div>
          {children}
        </div>
      </main>
      <RouteFocus target={mainRef} />

      <nav
        aria-label={id.nav.main}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} variant="bottom" />
        ))}
      </nav>
    </div>
  );
}
