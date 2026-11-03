'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { PasswordInput } from '@/components/form/password-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ME_KEY } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { authApi } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { loginFormSchema, type LoginFormValues } from '@/lib/forms';
import { safeNext } from '@/lib/safe-next';

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      router.replace(user.must_change_password ? '/ganti-password' : safeNext(search.get('next')));
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'INVALID_CREDENTIALS') {
        // Pesan tunggal tanpa membedakan penyebab (SPEC-001).
        setFormError(id.auth.login.invalid);
      } else if (isApiError(e) && e.code === 'RATE_LIMITED') {
        setFormError(fmt(id.auth.login.rateLimited, { n: Math.max(1, Math.ceil((e.retryAfterSec ?? 60) / 60)) }));
      } else {
        setFormError(apiErrorMessage(e));
      }
      form.setFocus('email');
    },
  });

  function onSubmit(values: LoginFormValues) {
    setFormError(null);
    login.mutate({ email: values.email.trim(), password: values.password });
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl leading-tight font-bold">{id.auth.login.title}</h1>
        <CardDescription>{id.auth.login.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
            <FormErrorSummary message={formError} />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{id.auth.login.email}</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="username" inputMode="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{id.auth.login.password}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" size="lg" loading={login.isPending}>
              {login.isPending ? id.auth.login.submitting : id.auth.login.submit}
            </Button>
          </form>
        </Form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {id.auth.login.noAccount}{' '}
          <Link href="/daftar" className="font-medium text-[var(--color-primary)] underline-offset-4 hover:underline">
            {id.auth.login.registerLink}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
