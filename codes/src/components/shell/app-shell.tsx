'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import * as React from 'react';
import { isNavActive, NAV_ITEMS, type NavItem } from '@/app/nav.config';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import { usePersistentToggle } from '@/lib/use-persistent-toggle';
import { HeaderChips } from '@/components/gamification/header-chips';

function DisabledItem({ item, variant, collapsed = false }: { item: NavItem; variant: 'side' | 'bottom'; collapsed?: boolean }) {
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
            variant === 'side'
              ? collapsed
                ? 'min-h-11 justify-center px-0'
                : 'min-h-11 px-3'
              : 'min-h-14 min-w-0 flex-1 flex-col justify-center gap-1 px-0.5 text-[11px] leading-none whitespace-nowrap',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          <span className={cn(collapsed && variant === 'side' && 'sr-only')}>
            {variant === 'bottom' ? (item.shortLabel ?? item.label) : item.label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{id.nav.soon}</TooltipContent>
    </Tooltip>
  );
}

function NavLink({
  item,
  pathname,
  variant,
  collapsed = false,
}: {
  item: NavItem;
  pathname: string;
  variant: 'side' | 'bottom';
  collapsed?: boolean;
}) {
  if (!item.enabled) return <DisabledItem item={item} variant={variant} collapsed={collapsed} />;
  const active = isNavActive(item, pathname);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={variant === 'bottom' && item.shortLabel ? item.label : undefined}
      className={cn(
        'relative flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variant === 'side'
          ? collapsed
            ? 'min-h-11 justify-center px-0 text-sm font-medium hover:bg-accent'
            : 'min-h-11 gap-3 px-3 text-sm font-medium hover:bg-accent'
          : 'min-h-14 min-w-0 flex-1 flex-col justify-center gap-1 px-0.5 text-[11px] leading-none font-medium whitespace-nowrap',
        active ? 'text-[var(--color-primary)]' : 'text-muted-foreground hover:text-foreground',
        active && variant === 'side' && 'bg-accent',
      )}
    >
      {active && variant === 'bottom' ? (
        <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
      ) : null}
      <Icon className={cn('size-5', active && 'fill-primary/15')} aria-hidden="true" />
      <span className={cn(collapsed && variant === 'side' && 'sr-only')}>
        {variant === 'bottom' ? (item.shortLabel ?? item.label) : item.label}
      </span>
    </Link>
  );
  if (collapsed && variant === 'side') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
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
  const [collapsed, setCollapsed] = usePersistentToggle('ielts.shell.collapsed', false);
  const showChips = !pathname.startsWith('/simulasi');

  return (
    <div className="min-h-dvh">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-10 hidden flex-col border-r bg-card transition-[width] duration-200 lg:flex',
          collapsed ? 'w-16 p-2' : 'w-64 p-4',
        )}
      >
        <div className={cn('mb-6 flex items-center', collapsed ? 'justify-center' : 'justify-between gap-2 px-3')}>
          {collapsed ? null : <p className="font-heading text-lg font-bold">{id.app.name}</p>}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? id.nav.expand : id.nav.collapse}
            aria-expanded={!collapsed}
            title={collapsed ? id.nav.expand : id.nav.collapse}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? <PanelLeftOpen className="size-5" aria-hidden="true" /> : <PanelLeftClose className="size-5" aria-hidden="true" />}
          </button>
        </div>
        <nav aria-label={id.nav.main} className="flex flex-col gap-1">
          {items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} variant="side" collapsed={collapsed} />
          ))}
        </nav>
      </aside>

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={cn(
          'min-w-0 px-4 pt-4 pb-24 outline-none transition-[margin] duration-200 md:px-6 md:pt-6 lg:px-8 lg:pb-8',
          collapsed ? 'lg:ml-16' : 'lg:ml-64',
        )}
      >
        <div className="mx-auto w-full max-w-[1800px]">
          {/* Chip streak/poin disembunyikan pada Simulasi: jangan sisakan baris kosong di atas konten. */}
          {showChips ? (
            <div className="mb-3 flex min-h-8 items-center justify-end">
              <HeaderChips />
            </div>
          ) : null}
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
