import { AdminGuard } from '@/components/admin/admin-guard';
import { AdminNav } from '@/components/admin/admin-nav';
import { AuthenticatedLayout } from '@/components/shell/authenticated-layout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticatedLayout>
      <AdminGuard>
        <div className="grid gap-6 md:flex md:items-start md:gap-8">
          <AdminNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </AdminGuard>
    </AuthenticatedLayout>
  );
}
