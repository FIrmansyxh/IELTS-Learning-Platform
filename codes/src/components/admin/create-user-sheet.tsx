'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { id } from '@/i18n/id';
import { adminApi } from '@/lib/api/admin';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage, applyValidationDetails } from '@/lib/api/errors';
import { adminCreateUserFormSchema, type AdminCreateUserFormValues } from '@/lib/forms';

const FIELDS = ['email', 'display_name', 'role'] as const;

export type CreatedUser = { email: string; temporaryPassword: string };

export function CreateUserSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (u: CreatedUser) => void;
}) {
  const qc = useQueryClient();
  const [formError, setFormError] = React.useState<string | null>(null);
  const form = useForm<AdminCreateUserFormValues>({
    resolver: zodResolver(adminCreateUserFormSchema),
    defaultValues: { email: '', display_name: '', role: 'learner' },
  });

  const create = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      const email = res.user.email;
      form.reset();
      onOpenChange(false);
      onCreated({ email, temporaryPassword: res.temporary_password });
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'EMAIL_TAKEN') {
        form.setError('email', { message: id.apiErrors.EMAIL_TAKEN }, { shouldFocus: true });
      } else if (applyValidationDetails(e, form.setError, FIELDS) === 0) {
        setFormError(apiErrorMessage(e));
      }
    },
  });

  function onSubmit(values: AdminCreateUserFormValues) {
    setFormError(null);
    create.mutate({ email: values.email.trim(), display_name: values.display_name.trim(), role: values.role });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{id.admin.users.createTitle}</SheetTitle>
          <SheetDescription>{id.admin.users.createDescription}</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4 px-4">
            <FormErrorSummary message={formError} />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{id.admin.users.fieldEmail}</FormLabel>
                  <FormControl>
                    <Input type="email" inputMode="email" autoComplete="off" {...field} />
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
                  <FormLabel>{id.admin.users.fieldName}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{id.admin.users.fieldRole}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="learner">{id.admin.users.learner}</SelectItem>
                      <SelectItem value="admin">{id.admin.users.admin}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SheetFooter className="px-0">
              <Button type="submit" size="lg" loading={create.isPending}>
                {create.isPending ? id.admin.users.createSubmitting : id.admin.users.createSubmit}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
