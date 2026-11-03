'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { ADMIN_NAV_ITEMS, isAdminNavActive } from '@/app/admin/nav.config';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';

function Links({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="grid gap-1">
      {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isAdminNavActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-accent text-[var(--color-primary)]' : 'text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Sidebar admin (desktop) dan menu bottom sheet (mobile). Item ditambah lewat `nav.config.ts`. */
export function AdminNav() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <nav aria-label={id.nav.adminNav} className="hidden w-52 shrink-0 md:block">
        <Links />
      </nav>
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <Menu aria-hidden="true" />
              {id.nav.adminMenu}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader>
              <SheetTitle>{id.nav.adminMenu}</SheetTitle>
              <SheetDescription className="sr-only">{id.nav.adminNav}</SheetDescription>
            </SheetHeader>
            <nav aria-label={id.nav.adminNav} className="px-4 pb-6">
              <Links onNavigate={() => setOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
