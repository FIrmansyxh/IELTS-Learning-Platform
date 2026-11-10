'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Flame, Monitor, Moon, Sparkles, Target, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { SwitchProfileButton } from '@/components/auth/switch-profile-button';
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
import { useGamificationStats } from '@/hooks/use-gamification';
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
                  <SelectTrigger className="w-full">
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

function ProfileSummary({ user }: { user: User }) {
  const stats = useGamificationStats();
  const initials =
    user.display_name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?';
  const items = [
    { icon: Target, label: 'Target band', value: user.target_band !== null ? Number(user.target_band).toFixed(1) : 'Belum diatur' },
    { icon: Flame, label: 'Streak harian', value: stats.data ? `${stats.data.daily_streak_days} hari` : '-' },
    { icon: Sparkles, label: 'Total poin', value: stats.data ? stats.data.total_points.toLocaleString('id-ID') : '-' },
  ];
  return (
    <Card data-testid="profile-summary">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-16 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground"
          >
            {initials}
          </span>
          <p className="text-xl font-semibold">{user.display_name}</p>
        </div>
        <dl className="flex flex-1 flex-wrap gap-x-10 gap-y-3 sm:justify-end">
          {items.map(({ icon: Icon, label, value }) => (
            <div key={label} className="grid gap-0.5">
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </dt>
              <dd className="text-lg font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
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

  const user = me.data;
  return (
    <div className="grid w-full gap-6">
      <h1 className="text-3xl font-bold">{id.profile.title}</h1>
      <ProfileSummary user={user} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{id.profile.cardTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm key={user.id + user.display_name + String(user.target_band)} user={user} />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <ThemePicker />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{id.profile.profileSectionTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <SwitchProfileButton />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6">
          <Card>
            <CardContent>
              <ShortcutPref />
            </CardContent>
          </Card>
          <RecordingPreferencesCard />
        </div>
      </div>
    </div>
  );
}
