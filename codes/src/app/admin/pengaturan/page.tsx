import type { Metadata } from 'next';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.admin.settings.title };

export default function Page() {
  return <SettingsPanel />;
}
