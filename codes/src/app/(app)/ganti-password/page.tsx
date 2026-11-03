import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.auth.changePassword.title };

export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
