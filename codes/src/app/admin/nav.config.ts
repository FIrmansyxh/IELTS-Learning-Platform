import {
  Coins,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { id } from '@/i18n/id';

export type AdminNavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Navigasi Admin Disederhanakan:
 * Hanya mengelola Pengguna, Poin & Gamifikasi, serta Pengaturan Waktu & Sistem.
 * Modul kurikulum & bank soal bersifat FIXED dari kode/AI seed package.
 */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: id.nav.adminOverview, icon: LayoutDashboard },
  { href: '/admin/pengguna', label: id.nav.adminUsers, icon: Users },
  { href: '/admin/poin', label: id.nav.adminPoints, icon: Coins },
  { href: '/admin/pengaturan', label: id.nav.adminSettings, icon: Settings },
];

export function isAdminNavActive(href: string, pathname: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}
