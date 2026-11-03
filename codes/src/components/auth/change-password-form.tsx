'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { PasswordInput } from '@/components/form/password-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useMe, useSetMe } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { authApi } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage, applyValidationDetails } from '@/lib/api/errors';
import { changePasswordFormSchema, passwordLength, type ChangePasswordFormValues } from '@/lib/forms';

const FIELDS = ['current_password', 'new_password'] as const;

export function ChangePasswordForm() {
  const router = useRouter();
  const me = useMe();
  const setMe = useSetMe();
  const forced = me.data?.must_change_password === true;
  const [formError, setFormError] = React.useState<string | null>(null);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { current_password: '', new_password: '' },
  });
  const count = passwordLength(form.watch('new_password') ?? '');

  const change = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: (user) => {
      setMe(user);
      toast.success(id.auth.changePassword.success);
      router.replace('/');
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'CURRENT_PASSWORD_INCORRECT') {
        form.setError('current_password', { message: id.apiErrors.CURRENT_PASSWORD_INCORRECT }, { shouldFocus: true });
      } else if (applyValidationDetails(e, form.setError, FIELDS) > 0) {
        form.setFocus(form.formState.errors.current_password ? 'current_password' : 'new_password');
      } else {
        setFormError(apiErrorMessage(e));
      }
    },
  });

  function onSubmit(values: ChangePasswordFormValues) {
    setFormError(null);
    change.mutate(values);
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <h1 className="text-2xl leading-tight font-bold">{id.auth.changePassword.title}</h1>
        <CardDescription>{id.auth.changePassword.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
            {forced ? (
              <p role="status" className="rounded-md border border-primary/40 bg-accent p-3 text-sm">
                {id.auth.changePassword.forced}
              </p>
            ) : null}
            <FormErrorSummary message={formError} />
            <FormField
              control={form.control}
              name="current_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{id.auth.changePassword.current}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{id.auth.changePassword.next}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormDescription aria-live="polite">
                    {id.auth.register.passwordHint} {fmt(id.auth.register.passwordCount, { n: count })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-sm text-muted-foreground">{id.auth.changePassword.otherSessions}</p>
            <Button type="submit" size="lg" loading={change.isPending}>
              {change.isPending ? id.auth.changePassword.submitting : id.auth.changePassword.submit}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
