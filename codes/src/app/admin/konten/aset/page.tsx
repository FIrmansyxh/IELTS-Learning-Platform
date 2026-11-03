import type { Metadata } from 'next';
import { AssetsPanel } from '@/components/admin/assets-panel';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.assets.assetsTitle };

export default function Page() {
  return <AssetsPanel />;
}
