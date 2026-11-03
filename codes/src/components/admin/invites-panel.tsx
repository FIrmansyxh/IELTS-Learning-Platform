'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormErrorSummary } from '@/components/form/form-error-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Invite } from '@/lib/api/types';
import { fmt, id } from '@/i18n/id';
import { adminApi } from '@/lib/api/admin';
import { apiErrorMessage, applyValidationDetails } from '@/lib/api/errors';
import { createInviteFormSchema, type CreateInviteFormValues } from '@/lib/forms';
import { formatDateTime } from '@/lib/format';
import { ConfirmDialog, SecretDialog } from './dialogs';
import { Pagination, ResponsiveList, type Column } from './responsive-list';

const PAGE_SIZE = 20;
const ALL = 'all';

function InviteStatusBadge({ status }: { status: Invite['status'] }) {
  const tone =
    status === 'active'
      ? 'text-[var(--color-done-text)]'
      : status === 'used'
        ? 'text-[var(--color-progress)]'
        : 'text-muted-foreground';
  return (
    <Badge variant="outline" className={tone}>
      {id.admin.invites.statuses[status]}
    </Badge>
  );
}

function CreateInviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (c: { code: string; expiresAt: string }) => void;
}) {
  const qc = useQueryClient();
  const [formError, setFormError] = React.useState<string | null>(null);
  const form = useForm<CreateInviteFormValues>({
    resolver: zodResolver(createInviteFormSchema),
    defaultValues: { expires_in_days: '7' },
  });
  const create = useMutation({
    mutationFn: adminApi.createInvite,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'invites'] });
      onOpenChange(false);
      onCreated({ code: res.code, expiresAt: res.expires_at });
    },
    onError: (e) => {
      if (applyValidationDetails(e, form.setError, ['expires_in_days']) === 0) setFormError(apiErrorMessage(e));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{id.admin.invites.createTitle}</DialogTitle>
          <DialogDescription>{id.admin.invites.createDescription}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={form.handleSubmit((v) => {
              setFormError(null);
              create.mutate({ expires_in_days: Number(v.expires_in_days) });
            })}
          >
            <FormErrorSummary message={formError} />
            <FormField
              control={form.control}
              name="expires_in_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{id.admin.invites.expiresIn}</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="numeric" min={1} max={30} {...field} />
                  </FormControl>
                  <FormDescription>{id.admin.invites.expiresHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={create.isPending}>
                {id.admin.invites.submit}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function InvitesPanel() {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<string>(ALL);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [code, setCode] = React.useState<{ code: string; expiresAt: string } | null>(null);
  const [revoking, setRevoking] = React.useState<Invite | null>(null);

  React.useEffect(() => setPage(1), [status]);

  const params = {
    page,
    page_size: PAGE_SIZE,
    status: status === ALL ? undefined : (status as Invite['status']),
  };
  const list = useQuery({
    queryKey: ['admin', 'invites', params],
    queryFn: () => adminApi.invites(params),
    placeholderData: (prev) => prev,
  });

  const revoke = useMutation({
    mutationFn: (inv: Invite) => adminApi.revokeInvite(inv.id),
    onSuccess: () => {
      toast.success(id.admin.invites.revoked);
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
  });

  const columns: Column<Invite>[] = [
    { key: 'status', header: id.admin.invites.colStatus, cell: (i) => <InviteStatusBadge status={i.status} /> },
    { key: 'created', header: id.admin.invites.colCreated, cell: (i) => formatDateTime(i.created_at) },
    { key: 'expires', header: id.admin.invites.colExpires, cell: (i) => formatDateTime(i.expires_at) },
    {
      key: 'usedBy',
      header: id.admin.invites.colUsedBy,
      cell: (i) => (i.used_by_email ? <span className="break-all">{i.used_by_email}</span> : '-'),
    },
    {
      key: 'usedAt',
      header: id.admin.invites.colUsedAt,
      cell: (i) => (i.used_at ? formatDateTime(i.used_at) : '-'),
    },
    {
      key: 'actions',
      header: id.common.actions,
      hideLabelOnCard: true,
      className: 'w-28 text-right',
      cell: (i) =>
        i.status === 'active' ? (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setRevoking(i)}>
              {id.admin.invites.revoke}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{id.admin.invites.title}</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          {id.admin.invites.create}
        </Button>
      </div>

      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="invites-status">{id.admin.invites.statusFilter}</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="invites-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{id.common.all}</SelectItem>
            {(['active', 'used', 'expired', 'revoked'] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {id.admin.invites.statuses[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ResponsiveList
        caption={id.admin.invites.title}
        columns={columns}
        rows={list.data?.data}
        rowKey={(i) => i.id}
        isLoading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyMessage={id.admin.invites.empty}
      />
      <Pagination meta={list.data?.meta} onPage={setPage} />

      <CreateInviteDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setCode} />
      <SecretDialog
        open={code !== null}
        onClose={() => setCode(null)}
        title={id.admin.invites.codeTitle}
        description={code ? fmt(id.admin.invites.codeExpires, { date: formatDateTime(code.expiresAt) }) : undefined}
        warning={id.admin.invites.codeWarning}
        secret={code?.code ?? ''}
        secretLabel={id.admin.invites.codeTitle}
        doneLabel={id.admin.users.tempDone}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={id.admin.invites.revokeTitle}
        body={id.admin.invites.revokeBody}
        confirmLabel={id.admin.invites.revoke}
        destructive
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
      />
    </div>
  );
}
