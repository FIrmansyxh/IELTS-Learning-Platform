import Link from 'next/link';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'ujian', href: '/riwayat/ujian', label: id.history.tabExam },
  { key: 'penilaian', href: '/riwayat/penilaian', label: id.history.tabAi },
] as const;

/**
 * Tab "Ujian | Penilaian AI" untuk `/riwayat`. Setiap tab adalah rute sendiri, jadi dirender sebagai navigasi
 * tautan (`aria-current="page"`), bukan widget tab ARIA.
 */
export function HistoryTabs({ current }: { current: 'ujian' | 'penilaian' }) {
  return (
    <nav aria-label={id.history.tabsLabel} className="mb-6 flex gap-1 border-b">
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
