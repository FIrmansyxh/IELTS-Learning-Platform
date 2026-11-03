import type { Metadata } from 'next';
import { UsersPanel } from '@/components/admin/users-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.admin.users.title };

export default function Page() {
  return <UsersPanel />;
}
