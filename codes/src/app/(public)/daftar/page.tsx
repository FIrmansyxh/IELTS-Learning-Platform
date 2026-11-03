import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.auth.register.title };

export default function RegisterPage() {
  return <RegisterForm />;
}
