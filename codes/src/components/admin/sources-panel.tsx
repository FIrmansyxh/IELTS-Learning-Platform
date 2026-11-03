'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LicenseType, SOURCE_CODE_PATTERN, type LicenseTypeValue, type Source } from '@/contracts/assets';
import { id } from '@/i18n/id';
import { assetsApi } from '@/lib/api/assets';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage, applyValidationDetails } from '@/lib/api/errors';
import { LicenseBadge } from './license-badges';
import { ResponsiveList, type Column } from './responsive-list';

const t = id.assets.sources;
const FIELDS = [
  'code',
  'name',
  'url',
  'license_type',
  'license_note',
  'attribution_template',
  'share_alike',
  'non_commercial_only',
  'may_store_copy',
] as const;

const formSchema = z.object({
  code: z.string().trim().regex(SOURCE_CODE_PATTERN, t.codeInvalid),
  name: z.string().trim().min(1, t.nameRequired).max(150, t.nameRequired),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), t.urlInvalid),
  license_type: LicenseType,
  license_note: z.string().trim().max(1000),
  attribution_template: z.string().trim().max(500),
  share_alike: z.boolean(),
  non_commercial_only: z.boolean(),
  may_store_copy: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

/** Jenis lisensi yang DILARANG menyimpan salinan (SPEC-018). */
export function storeCopyForbidden(type: LicenseTypeValue): boolean {
  return type === 'LINK_ONLY_COPYRIGHTED' || type === 'EMBED_TOS';
}

export function licenseWarning(type: LicenseTypeValue): string | null {
  if (type === 'CC_BY_NC') return t.warnNc;
  if (type === 'LINK_ONLY_COPYRIGHTED') return t.warnLinkOnly;
  if (type === 'EMBED_TOS') return t.warnEmbed;
  return null;
}

export function SourceSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [formError, setFormError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      url: '',
      license_type: 'OWN',
      license_note: '',
      attribution_template: '',
      share_alike: false,
      non_commercial_only: false,
      may_store_copy: false,
    },
  });
  const licenseType = form.watch('license_type');
  const warning = licenseWarning(licenseType);
  const forbidden = storeCopyForbidden(licenseType);

  function onLicenseChange(v: LicenseTypeValue) {
    form.setValue('license_type', v, { shouldValidate: true });
    form.setValue('share_alike', v === 'CC_BY_SA');
    form.setValue('non_commercial_only', v === 'CC_BY_NC');
    if (storeCopyForbidden(v)) form.setValue('may_store_copy', false);
  }

  const create = useMutation({
    mutationFn: assetsApi.createSource,
    onSuccess: () => {
      toast.success(t.created);
      void qc.invalidateQueries({ queryKey: ['admin', 'sources'] });
      form.reset();
      setFormError(null);
      onOpenChange(false);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'SOURCE_CODE_TAKEN') {
        form.setError('code', { message: id.apiErrors.SOURCE_CODE_TAKEN }, { shouldFocus: true });
      } else if (applyValidationDetails(e, form.setError, FIELDS) === 0) {
        setFormError(apiErrorMessage(e));
      }
    },
  });

  function onSubmit(v: FormValues) {
    setFormError(null);
    create.mutate({
      code: v.code,
      name: v.name,
      license_type: v.license_type,
      share_alike: v.share_alike,
      non_commercial_only: v.non_commercial_only,
      may_store_copy: forbidden ? false : v.may_store_copy,
      ...(v.url ? { url: v.url } : {}),
      ...(v.license_note ? { license_note: v.license_note } : {}),
      ...(v.attribution_template ? { attribution_template: v.attribution_template } : {}),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.sheetTitle}</SheetTitle>
          <SheetDescription>{t.sheetDescription}</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4 px-4 pb-4">
            <FormErrorSummary message={formError} />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fieldCode}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" autoCapitalize="characters" {...field} />
                  </FormControl>
                  <FormDescription>{t.fieldCodeHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fieldName}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fieldUrl}</FormLabel>
                  <FormControl>
                    <Input type="url" inputMode="url" autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>{t.fieldUrlHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="license_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fieldLicense}</FormLabel>
                  <Select value={field.value} onValueChange={(v) => onLicenseChange(v as LicenseTypeValue)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LicenseType.options.map((o) => (
                        <SelectItem key={o} value={o}>
                          {id.assets.licenseTypes[o]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {warning ? (
                    <p
                      role="note"
                      className="rounded-md border border-[var(--color-warning)] bg-[var(--color-surface-muted)] p-2 text-sm"
                    >
                      {warning}
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="license_note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fieldLicenseNote}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="attribution_template"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fieldAttribution}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(
              [
                ['share_alike', t.fieldShareAlike, false],
                ['non_commercial_only', t.fieldNonCommercial, false],
                ['may_store_copy', t.fieldMayStore, forbidden],
              ] as const
            ).map(([name, label, disabled]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem className="flex min-h-11 items-center gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        disabled={disabled}
                        onCheckedChange={(c) => field.onChange(c === true)}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">{label}</FormLabel>
                  </FormItem>
                )}
              />
            ))}
            <SheetFooter className="px-0">
              <Button type="submit" size="lg" loading={create.isPending}>
                {create.isPending ? t.submitting : t.submit}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

function YesNo({ value }: { value: boolean }) {
  return <span>{value ? id.assets.yes : id.assets.no}</span>;
}

export function SourcesPanel() {
  const [open, setOpen] = React.useState(false);
  const list = useQuery({ queryKey: ['admin', 'sources'], queryFn: assetsApi.sources });

  const columns: Column<Source>[] = [
    { key: 'code', header: t.colCode, cell: (s) => <code className="font-mono text-xs break-all">{s.code}</code> },
    { key: 'name', header: t.colName, cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'license', header: t.colLicense, cell: (s) => <LicenseBadge type={s.license_type} /> },
    { key: 'sa', header: t.colShareAlike, cell: (s) => <YesNo value={s.share_alike} /> },
    { key: 'nc', header: t.colNonCommercial, cell: (s) => <YesNo value={s.non_commercial_only} /> },
    { key: 'store', header: t.colMayStore, cell: (s) => <YesNo value={s.may_store_copy} /> },
    { key: 'count', header: t.colAssets, className: 'text-right', cell: (s) => s.asset_count },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{id.assets.sourcesTitle}</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" />
          {t.add}
        </Button>
      </div>
      <ResponsiveList
        caption={id.assets.sourcesTitle}
        columns={columns}
        rows={list.data}
        rowKey={(s) => s.id}
        isLoading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyMessage={t.empty}
        rowLabel={(s) => s.name}
      />
      <SourceSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}

