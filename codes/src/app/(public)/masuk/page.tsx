import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.auth.login.title };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
