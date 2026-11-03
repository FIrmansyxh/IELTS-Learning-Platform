'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AdminUser } from '@/lib/api/types';
import { useMe } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { adminApi } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { ConfirmDialog, SecretDialog } from './dialogs';
import { CreateUserSheet, type CreatedUser } from './create-user-sheet';
import { Pagination, ResponsiveList, type Column } from './responsive-list';
import { UnlockSheet } from './unlock-sheet';

const PAGE_SIZE = 20;
const ALL = 'all';

type PendingAction =
  | { kind: 'disable' | 'delete' | 'reset' | 'role'; user: AdminUser }
  | null;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function UserStatus({ user }: { user: AdminUser }) {
  if (user.deleted_at) return <Badge variant="outline">{id.admin.users.deleted}</Badge>;
  return user.status === 'ACTIVE' ? (
    <Badge variant="outline" className="text-[var(--color-done-text)]">
      {id.admin.users.active}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      {id.admin.users.disabled}
    </Badge>
  );
}

export function UsersPanel() {
  const qc = useQueryClient();
  const me = useMe();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState('');
  const [role, setRole] = React.useState<string>(ALL);
  const [status, setStatus] = React.useState<string>(ALL);
  const [includeDeleted, setIncludeDeleted] = React.useState(false);
  const debouncedQ = useDebounced(q.trim(), 300);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, setPending] = React.useState<PendingAction>(null);
  const [secret, setSecret] = React.useState<{ email: string; value: string } | null>(null);
  const [unlockFor, setUnlockFor] = React.useState<AdminUser | null>(null);

  React.useEffect(() => setPage(1), [debouncedQ, role, status, includeDeleted]);

  const params = {
    page,
    page_size: PAGE_SIZE,
    q: debouncedQ || undefined,
    role: role === ALL ? undefined : (role as 'learner' | 'admin'),
    status: status === ALL ? undefined : (status as 'ACTIVE' | 'DISABLED'),
    include_deleted: includeDeleted,
  };
  const list = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminApi.users(params),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });

  const update = useMutation({
    mutationFn: (v: { user: AdminUser; body: { role?: 'learner' | 'admin'; status?: 'ACTIVE' | 'DISABLED' } }) =>
      adminApi.updateUser(v.user.id, v.body),
    onSuccess: () => {
      toast.success(id.admin.users.updated);
      setPending(null);
      void invalidate();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setPending(null);
    },
  });
  const reset = useMutation({
    mutationFn: (user: AdminUser) => adminApi.resetPassword(user.id),
    onSuccess: (res, user) => {
      setPending(null);
      setSecret({ email: user.email, value: res.temporary_password });
      void invalidate();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setPending(null);
    },
  });
  const remove = useMutation({
    mutationFn: (user: AdminUser) => adminApi.deleteUser(user.id),
    onSuccess: () => {
      toast.success(id.admin.users.deletedToast);
      setPending(null);
      void invalidate();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setPending(null);
    },
  });

  function confirmPending() {
    if (!pending) return;
    const { kind, user } = pending;
    if (kind === 'disable') update.mutate({ user, body: { status: 'DISABLED' } });
    if (kind === 'role') update.mutate({ user, body: { role: user.role === 'admin' ? 'learner' : 'admin' } });
    if (kind === 'reset') reset.mutate(user);
    if (kind === 'delete') remove.mutate(user);
  }

  const dialogCopy = pending
    ? {
        disable: [id.admin.users.confirmDisableTitle, id.admin.users.confirmDisableBody],
        delete: [id.admin.users.confirmDeleteTitle, id.admin.users.confirmDeleteBody],
        reset: [id.admin.users.confirmResetTitle, id.admin.users.confirmResetBody],
        role: [id.admin.users.confirmRoleTitle, id.admin.users.confirmRoleBody],
      }[pending.kind]
    : null;

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: id.admin.users.colName, cell: (u) => <span className="font-medium">{u.display_name}</span> },
    { key: 'email', header: id.admin.users.colEmail, cell: (u) => <span className="break-all">{u.email}</span> },
    {
      key: 'role',
      header: id.admin.users.colRole,
      cell: (u) => (u.role === 'admin' ? id.admin.users.admin : id.admin.users.learner),
    },
    { key: 'status', header: id.admin.users.colStatus, cell: (u) => <UserStatus user={u} /> },
    {
      key: 'last',
      header: id.admin.users.colLastLogin,
      cell: (u) => (u.last_login_at ? formatDateTime(u.last_login_at) : id.common.never),
    },
    {
      key: 'actions',
      header: id.common.actions,
      hideLabelOnCard: true,
      className: 'w-14 text-right',
      cell: (u) => {
        const isSelf = me.data?.id === u.id;
        const gone = u.deleted_at !== null;
        if (gone) return null;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={fmt(id.admin.users.actionsFor, { name: u.display_name })}
                  title={isSelf ? id.admin.users.selfNote : undefined}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {u.status === 'ACTIVE' ? (
                  <DropdownMenuItem disabled={isSelf} onSelect={() => setPending({ kind: 'disable', user: u })}>
                    {id.admin.users.disable}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={isSelf}
                    onSelect={() => update.mutate({ user: u, body: { status: 'ACTIVE' } })}
                  >
                    {id.admin.users.enable}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={isSelf} onSelect={() => setPending({ kind: 'role', user: u })}>
                  {u.role === 'admin' ? id.admin.users.makeLearner : id.admin.users.makeAdmin}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isSelf} onSelect={() => setPending({ kind: 'reset', user: u })}>
                  {id.admin.users.resetPassword}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setUnlockFor(u)}>{id.admin.users.unlock}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isSelf}
                  onSelect={() => setPending({ kind: 'delete', user: u })}
                >
                  {id.admin.users.delete}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  const filtered = debouncedQ !== '' || role !== ALL || status !== ALL;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{id.admin.users.title}</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          {id.admin.users.add}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto] lg:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="users-q">{id.admin.users.searchLabel}</Label>
          <Input id="users-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="users-role">{id.admin.users.roleFilter}</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="users-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{id.common.all}</SelectItem>
              <SelectItem value="learner">{id.admin.users.learner}</SelectItem>
              <SelectItem value="admin">{id.admin.users.admin}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="users-status">{id.admin.users.statusFilter}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="users-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{id.common.all}</SelectItem>
              <SelectItem value="ACTIVE">{id.admin.users.active}</SelectItem>
              <SelectItem value="DISABLED">{id.admin.users.disabled}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox
            id="users-deleted"
            checked={includeDeleted}
            onCheckedChange={(c) => setIncludeDeleted(c === true)}
          />
          <Label htmlFor="users-deleted">{id.admin.users.includeDeleted}</Label>
        </div>
      </div>

      <ResponsiveList
        caption={id.admin.users.title}
        columns={columns}
        rows={list.data?.data}
        rowKey={(u) => u.id}
        rowLabel={(u) => u.display_name}
        isLoading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyMessage={filtered ? id.admin.users.emptyFiltered : id.admin.users.empty}
      />
      <Pagination meta={list.data?.meta} onPage={setPage} />

      <CreateUserSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(c: CreatedUser) => setSecret({ email: c.email, value: c.temporaryPassword })}
      />
      <UnlockSheet
        open={unlockFor !== null}
        onOpenChange={(o) => !o && setUnlockFor(null)}
        userId={unlockFor?.id ?? null}
        userName={unlockFor?.display_name ?? ''}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending && dialogCopy ? fmt(dialogCopy[0], { name: pending.user.display_name }) : ''}
        body={dialogCopy ? dialogCopy[1] : ''}
        confirmLabel={id.admin.users.confirm}
        destructive={pending?.kind === 'delete' || pending?.kind === 'disable'}
        pending={update.isPending || reset.isPending || remove.isPending}
        onConfirm={confirmPending}
      />
      <SecretDialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        title={id.admin.users.tempTitle}
        description={secret ? `${fmt(id.admin.users.tempFor, { email: secret.email })}. ${id.admin.users.tempMust}` : undefined}
        warning={id.admin.users.tempWarning}
        secret={secret?.value ?? ''}
        secretLabel={id.admin.users.tempTitle}
        doneLabel={id.admin.users.tempDone}
      />
    </div>
  );
}
