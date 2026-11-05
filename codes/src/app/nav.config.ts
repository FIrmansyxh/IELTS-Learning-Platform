import { Home, Map, User, History, Shield, type LucideIcon } from 'lucide-react';
import { id } from '@/i18n/id';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rute yang sudah dibangun. Rute lain tampil `disabled` + Tooltip "Segera hadir". */
  enabled: boolean;
  adminOnly?: boolean;
  /** Awalan path yang menandai item aktif selain `href` persis. */
  matchPrefix?: string;
};

/**
 * Daftar rute navigasi utama. Spec lain mengaktifkan item dengan mengubah `enabled`
 * (mis. SPEC-007 untuk `/`, SPEC-017 untuk `/riwayat`).
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: id.nav.home, icon: Home, enabled: true },
  { href: '/peta', label: id.nav.map, icon: Map, enabled: true, matchPrefix: '/peta' },
  { href: '/riwayat', label: id.nav.history, icon: History, enabled: true, matchPrefix: '/riwayat' },
  { href: '/profil', label: id.nav.profile, icon: User, enabled: true, matchPrefix: '/profil' },
  { href: '/admin', label: id.nav.admin, icon: Shield, enabled: true, adminOnly: true, matchPrefix: '/admin' },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/';
  const prefix = item.matchPrefix ?? item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
