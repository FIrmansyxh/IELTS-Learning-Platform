import { AuthenticatedLayout } from '@/components/shell/authenticated-layout';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
