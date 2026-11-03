import type { Metadata } from 'next';
import { Dashboard } from '@/components/home/dashboard';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.home.title };

export default function HomePage() {
  return <Dashboard />;
}
