'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Monitor, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { LogoutButton } from '@/components/auth/logout-button';
import { ShortcutPref } from '@/components/auth/shortcut-pref';
import { RecordingPreferencesCard } from '@/components/profile/recording-preferences-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe, useSetMe } from '@/hooks/use-auth';
import { id } from '@/i18n/id';
import { authApi } from '@/lib/api/auth';
import { apiErrorMessage, applyValidationDetails } from '@/lib/api/errors';
import {
  profileFormSchema,
  targetBandFromForm,
  targetBandToForm,
  type ProfileFormValues,
} from '@/lib/forms';
import type { User } from '@/lib/api/types';

const BAND_OPTIONS = ['5', '5.5', '6', '6.5', '7'] as const;
const formatBand = (v: string) => Number(v).toFixed(1);

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const options = [
    { value: 'light', label: id.profile.themeLight, icon: Sun },
    { value: 'dark', label: id.profile.themeDark, icon: Moon },
    { value: 'system', label: id.profile.themeSystem, icon: Monitor },
  ];
  return (
    <fieldset>
      <legend className="mb-3 text-base font-semibold">{id.profile.themeTitle}</legend>
      <RadioGroup
        value={mounted ? (theme ?? 'system') : undefined}
        onValueChange={setTheme}
        className="grid gap-2 sm:grid-cols-3"
      >
        {options.map(({ value, label, icon: Icon }) => (
          <Label
            key={value}
            htmlFor={`theme-${value}`}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
          >
            <RadioGroupItem value={value} id={`theme-${value}`} />
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function ProfileForm({ user }: { user: User }) {
  const setMe = useSetMe();
  const [formError, setFormError] = React.useState<string | null>(null);
  const defaults: ProfileFormValues = {
    display_name: user.display_name,
    target_band: targetBandToForm(user.target_band),
  };
  const form = useForm<ProfileFormValues>({ resolver: zodResolver(profileFormSchema), defaultValues: defaults });

  const save = useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (updated) => {
      setMe(updated);
      form.reset({ display_name: updated.display_name, target_band: targetBandToForm(updated.target_band) });
      toast.success(id.profile.saved);
    },
    onError: (e) => {
      if (applyValidationDetails(e, form.setError, ['display_name', 'target_band']) === 0) {
        setFormError(apiErrorMessage(e));
      }
    },
  });

  function onSubmit(values: ProfileFormValues) {
    setFormError(null);
    // Hanya kirim field yang berubah (PATCH minimal satu field).
    const body: { display_name?: string; target_band?: 5 | 5.5 | 6 | 6.5 | 7 | null } = {};
    if (values.display_name.trim() !== user.display_name) body.display_name = values.display_name.trim();
    if (values.target_band !== defaults.target_band) body.target_band = targetBandFromForm(values.target_band);
    if (Object.keys(body).length === 0) return;
    save.mutate(body);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <FormErrorSummary message={formError} />
        <div className="grid gap-2">
          <Label htmlFor="profile-email">{id.profile.email}</Label>
          <Input id="profile-email" value={user.email} readOnly aria-readonly="true" />
        </div>
        <FormField
          control={form.control}
          name="display_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{id.profile.displayName}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="target_band"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{id.profile.targetBand}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">{id.profile.targetBandNone}</SelectItem>
                  {BAND_OPTIONS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {formatBand(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
            {id.common.save}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function ProfileCard() {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="grid gap-4" role="status" aria-label={id.common.loading}>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (me.isError) return <ErrorState title={id.profile.loadFailed} onRetry={() => void me.refetch()} />;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="text-3xl font-bold">{id.profile.title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{id.profile.cardTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm key={me.data.id + me.data.display_name + String(me.data.target_band)} user={me.data} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <ThemePicker />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <ShortcutPref />
        </CardContent>
      </Card>
      <RecordingPreferencesCard />
      <Card>
        <CardHeader>
          <CardTitle>{id.profile.securityTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/ganti-password">
              <KeyRound aria-hidden="true" />
              {id.profile.changePassword}
            </Link>
          </Button>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
