import type { Metadata } from 'next';
import { AuditPanel } from '@/components/admin/audit-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.admin.audit.title };

export default function Page() {
  return <AuditPanel />;
}
