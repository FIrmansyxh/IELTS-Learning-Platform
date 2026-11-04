import Link from 'next/link';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'kurikulum', href: '/admin/konten/kurikulum', label: id.curation.nav.curriculum },
  { key: 'soal', href: '/admin/konten/soal', label: id.curation.nav.questions },
  { key: 'revisi', href: '/admin/konten/revisi', label: id.curation.nav.revisions },
] as const;

/** Navigasi antar halaman kurasi (rute terpisah, `aria-current="page"`). */
export function CurationTabs({ current }: { current: 'kurikulum' | 'soal' | 'revisi' }) {
  return (
    <nav aria-label={id.curation.tabsLabel} className="flex gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
            t.key === current ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
