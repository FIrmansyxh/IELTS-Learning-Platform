import { ClipboardList, FileQuestion, FileUp, Files, LayoutDashboard, Library, ListTree, Settings, Table2, Ticket, Users, type LucideIcon } from 'lucide-react';
import { id } from '@/i18n/id';

export type AdminNavItem = { href: string; label: string; icon: LucideIcon };

/** Spec admin lain (009, 018, 019, 020) menambah item di sini. Halaman Revisi (020) dijangkau dari tab Kurasi. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: id.nav.adminOverview, icon: LayoutDashboard },
  { href: '/admin/pengguna', label: id.nav.adminUsers, icon: Users },
  { href: '/admin/undangan', label: id.nav.adminInvites, icon: Ticket },
  { href: '/admin/pengaturan', label: id.nav.adminSettings, icon: Settings },
  { href: '/admin/band', label: id.nav.adminBand, icon: Table2 },
  { href: '/admin/konten/sumber', label: id.nav.adminSources, icon: Library },
  { href: '/admin/konten/aset', label: id.nav.adminAssets, icon: Files },
  { href: '/admin/konten/kurikulum', label: id.nav.adminCurriculum, icon: ListTree },
  { href: '/admin/konten/soal', label: id.nav.adminQuestions, icon: FileQuestion },
  { href: '/admin/impor', label: id.nav.adminImport, icon: FileUp },
  { href: '/admin/audit', label: id.nav.adminAudit, icon: ClipboardList },
];

export function isAdminNavActive(href: string, pathname: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}
