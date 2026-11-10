import { Home, Map, User, History, Shuffle, GraduationCap, type LucideIcon } from 'lucide-react';
import { id } from '@/i18n/id';

export type NavItem = {
  href: string;
  label: string;
  /** Label ringkas untuk bottom nav mobile (satu baris); nama aksesibel tetap `label`. */
  shortLabel?: string;
  icon: LucideIcon;
  /** Rute yang sudah dibangun. Rute lain tampil `disabled` + Tooltip "Segera hadir". */
  enabled: boolean;
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
  { href: '/latihan/campur', label: id.nav.mix, shortLabel: id.nav.mixShort, icon: Shuffle, enabled: true, matchPrefix: '/latihan' },
  { href: '/simulasi', label: id.nav.simulation, shortLabel: id.nav.simulationShort, icon: GraduationCap, enabled: true, matchPrefix: '/simulasi' },
  { href: '/riwayat', label: id.nav.history, icon: History, enabled: true, matchPrefix: '/riwayat' },
  { href: '/profil', label: id.nav.profile, icon: User, enabled: true, matchPrefix: '/profil' },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/';
  const prefix = item.matchPrefix ?? item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
