'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { PasswordInput } from '@/components/form/password-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fmt, id } from '@/i18n/id';
import { authApi } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage, applyValidationDetails } from '@/lib/api/errors';
import { passwordLength, registerFormSchema, type RegisterFormValues } from '@/lib/forms';

const FIELDS = ['email', 'display_name', 'password', 'invite_code'] as const;

function RegisterFields({ mode }: { mode: 'open' | 'invite' }) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const requireInvite = mode === 'invite';
  const schema = React.useMemo(() => registerFormSchema(requireInvite), [requireInvite]);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', display_name: '', password: '', invite_code: '' },
  });
  const pwd = form.watch('password');
  const count = passwordLength(pwd ?? '');

  const register = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => {
      toast.success(id.auth.register.success);
      router.replace('/masuk');
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'EMAIL_TAKEN') {
        form.setError('email', { message: id.apiErrors.EMAIL_TAKEN }, { shouldFocus: true });
      } else if (isApiError(e) && e.code === 'INVITE_INVALID') {
        form.setError('invite_code', { message: id.apiErrors.INVITE_INVALID }, { shouldFocus: true });
      } else if (applyValidationDetails(e, form.setError, FIELDS) > 0) {
        const first = FIELDS.find((f) => form.formState.errors[f]);
        if (first) form.setFocus(first);
      } else {
        setFormError(apiErrorMessage(e));
      }
    },
  });

  function onSubmit(values: RegisterFormValues) {
    setFormError(null);
    register.mutate({
      email: values.email.trim(),
      display_name: values.display_name.trim(),
      password: values.password,
      ...(requireInvite ? { invite_code: values.invite_code.trim().toUpperCase() } : {}),
    });
  }

  const errorCount = Object.keys(form.formState.errors).length;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormErrorSummary
          message={formError ?? (errorCount > 1 ? fmt(id.form.errorSummary, { n: errorCount }) : null)}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{id.auth.register.email}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" inputMode="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="display_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{id.auth.register.displayName}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
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
              <FormLabel>{id.auth.register.password}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription className="flex items-center gap-1.5" aria-live="polite">
                {count >= 10 ? <Check className="size-4 text-[var(--color-done-text)]" aria-hidden="true" /> : null}
                <span>
                  {id.auth.register.passwordHint} {fmt(id.auth.register.passwordCount, { n: count })}
                </span>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {requireInvite ? (
          <FormField
            control={form.control}
            name="invite_code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{id.auth.register.inviteCode}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono" {...field} />
                </FormControl>
                <FormDescription>{id.auth.register.inviteHint}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <Button type="submit" size="lg" loading={register.isPending}>
          {register.isPending ? id.auth.register.submitting : id.auth.register.submit}
        </Button>
      </form>
    </Form>
  );
}

export function RegisterForm() {
  const config = useQuery({ queryKey: ['signup-config'], queryFn: authApi.signupConfig, staleTime: 30_000 });
  const mode = config.data?.mode;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl leading-tight font-bold">
          {mode === 'closed' ? id.auth.register.closedTitle : id.auth.register.title}
        </h1>
        {mode !== 'closed' ? <CardDescription>{id.auth.register.description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {config.isPending ? (
          <div className="grid gap-4" role="status" aria-label={id.auth.guard.checking}>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : config.isError ? (
          <ErrorState title={id.auth.register.configFailed} onRetry={() => void config.refetch()} />
        ) : mode === 'closed' ? (
          <p role="status" className="rounded-md border bg-muted p-4 text-sm">
            {id.auth.register.closed}
          </p>
        ) : (
          <RegisterFields mode={mode!} />
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {id.auth.register.haveAccount}{' '}
          <Link href="/masuk" className="font-medium text-[var(--color-primary)] underline-offset-4 hover:underline">
            {id.auth.register.loginLink}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
