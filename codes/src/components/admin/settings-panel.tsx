'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { Setting } from '@/lib/api/types';
import { fmt, id } from '@/i18n/id';
import { adminApi } from '@/lib/api/admin';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage, detailMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';

export function groupSettings(settings: Setting[]): Array<{ group: string; label: string; items: Setting[] }> {
  const map = new Map<string, Setting[]>();
  for (const s of settings) {
    const prefix = s.key.split('.')[0] ?? '';
    map.set(prefix, [...(map.get(prefix) ?? []), s]);
  }
  return [...map.entries()].map(([group, items]) => ({
    group,
    label: id.admin.settings.groups[group] ?? id.admin.settings.groupOther,
    items,
  }));
}

function displayValue(s: Setting, v: Setting['value']): string {
  if (s.type === 'enum') return id.admin.settings.enumValues[String(v)] ?? String(v);
  return String(v);
}

function SettingRow({ setting }: { setting: Setting }) {
  const qc = useQueryClient();
  const initial = setting.type === 'bool' ? Boolean(setting.value) : String(setting.value);
  const [value, setValue] = React.useState<string | boolean>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = `setting-${setting.key}`;
  const errId = `${inputId}-err`;

  React.useEffect(() => {
    setValue(setting.type === 'bool' ? Boolean(setting.value) : String(setting.value));
  }, [setting.value, setting.type]);

  const dirty = value !== initial;

  const save = useMutation({
    mutationFn: (v: number | string | boolean) => adminApi.updateSetting(setting.key, v),
    onSuccess: (updated) => {
      setError(null);
      toast.success(id.admin.settings.saved);
      qc.setQueryData<Setting[]>(['admin', 'settings'], (old) =>
        old ? old.map((s) => (s.key === updated.key ? updated : s)) : old,
      );
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'VALIDATION_ERROR' && e.details[0]) {
        setError(detailMessage(e.details[0].code, e.details[0].message));
      } else {
        setError(apiErrorMessage(e));
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (setting.type === 'int') {
      const raw = String(value).trim();
      const n = Number(raw);
      if (!/^-?\d+$/.test(raw)) return setError(id.form.intRequired);
      if ((setting.min != null && n < setting.min) || (setting.max != null && n > setting.max)) {
        return setError(fmt(id.form.intRange, { min: setting.min ?? '-', max: setting.max ?? '-' }));
      }
      return save.mutate(n);
    }
    save.mutate(setting.type === 'bool' ? Boolean(value) : String(value));
  }

  const options = setting.options ?? [String(setting.value)];

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 border-b py-4 last:border-b-0 sm:grid-cols-[1fr_220px_auto] sm:items-start">
      <div className="grid gap-1">
        <Label htmlFor={inputId} className="font-mono text-sm">
          {setting.key}
        </Label>
        <p className="text-sm text-muted-foreground">{setting.description}</p>
        <p className="text-xs text-muted-foreground">
          {fmt(id.admin.settings.default, { value: displayValue(setting, setting.default) })}
          {setting.type === 'int' && setting.min != null && setting.max != null
            ? ` · ${fmt(id.admin.settings.range, { min: setting.min, max: setting.max })}`
            : ''}
          {setting.updated_at ? ` · ${fmt(id.admin.settings.lastUpdated, { date: formatDateTime(setting.updated_at) })}` : ''}
        </p>
      </div>
      <div className="grid gap-1.5">
        {setting.type === 'int' ? (
          <Input
            id={inputId}
            inputMode="numeric"
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
          />
        ) : setting.type === 'enum' ? (
          <Select value={String(value)} onValueChange={setValue}>
            <SelectTrigger id={inputId} className="w-full" aria-invalid={error ? true : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {id.admin.settings.enumValues[o] ?? o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex min-h-11 items-center">
            <Switch id={inputId} checked={Boolean(value)} onCheckedChange={setValue} />
          </div>
        )}
        {error ? (
          <p id={errId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={!dirty}
        loading={save.isPending}
        aria-label={fmt(id.admin.settings.saveRowFor, { key: setting.key })}
      >
        {id.common.save}
      </Button>
    </form>
  );
}

export function SettingsPanel() {
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });
  const groups = React.useMemo(() => (settings.data ? groupSettings(settings.data) : []), [settings.data]);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-3xl font-bold">{id.admin.settings.title}</h1>
        <p className="mt-1 text-muted-foreground">{id.admin.settings.description}</p>
      </header>
      {settings.isPending ? (
        <div className="grid gap-4" role="status" aria-label={id.common.loading}>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : settings.isError ? (
        <ErrorState onRetry={() => void settings.refetch()} />
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">{id.admin.settings.empty}</p>
      ) : (
        groups.map((g) => (
          <Card key={g.group}>
            <CardHeader>
              <h2 className="text-lg font-semibold">{g.label}</h2>
            </CardHeader>
            <CardContent>
              {g.items.map((s) => (
                <SettingRow key={s.key} setting={s} />
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
