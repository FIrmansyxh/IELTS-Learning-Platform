import type { Metadata } from 'next';
import { InvitesPanel } from '@/components/admin/invites-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.admin.invites.title };

export default function Page() {
  return <InvitesPanel />;
}
