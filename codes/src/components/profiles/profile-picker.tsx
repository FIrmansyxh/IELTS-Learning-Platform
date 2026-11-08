'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserRound } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PROFILE_NAME_MAX, PROFILE_NAME_MIN, type ProfileSummary } from '@/contracts/profiles';
import { ME_KEY } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { profilesApi } from '@/lib/api/profiles';
import { safeNext } from '@/lib/safe-next';

const PROFILES_KEY = ['profiles'] as const;

/**
 * Layar "Siapa yang belajar?" (SPEC-025): pilih, buat, atau hapus profil lokal tanpa password.
 * Bila hanya ada satu profil dan pengguna tidak sedang berganti profil (`?pilih=1`), profil itu dibuka otomatis.
 */
export function ProfilePicker() {
  const t = id.profiles;
  const router = useRouter();
  const qc = useQueryClient();
  const search = useSearchParams();
  const next = safeNext(search.get('next'), '/');
  const explicit = search.get('pilih') === '1';

  const list = useQuery({ queryKey: PROFILES_KEY, queryFn: ({ signal }) => profilesApi.list(signal) });
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<ProfileSummary | null>(null);
  const autoTried = React.useRef(false);

  const enter = React.useCallback(
    async (profile: ProfileSummary) => {
      setBusyId(profile.id);
      try {
        const user = await profilesApi.select(profile.id);
        qc.clear();
        qc.setQueryData(ME_KEY, user);
        router.replace(next);
      } catch {
        toast.error(t.selectFailed);
        setBusyId(null);
      }
    },
    [qc, router, next, t.selectFailed],
  );

  // Satu profil dan bukan "ganti profil": langsung buka.
  const profiles = list.data?.profiles;
  React.useEffect(() => {
    if (autoTried.current || explicit || !profiles || profiles.length !== 1) return;
    autoTried.current = true;
    void enter(profiles[0]!);
  }, [profiles, explicit, enter]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < PROFILE_NAME_MIN || trimmed.length > PROFILE_NAME_MAX) {
      setNameError(t.nameInvalid);
      return;
    }
    setNameError(null);
    setCreating(true);
    try {
      const user = await profilesApi.create({ display_name: trimmed });
      qc.clear();
      qc.setQueryData(ME_KEY, user);
      router.replace(next);
    } catch (err) {
      if (isApiError(err) && err.code === 'PROFILE_NAME_TAKEN') setNameError(t.nameTaken);
      else if (isApiError(err) && err.code === 'PROFILE_LIMIT_REACHED') setNameError(fmt(t.limit, { n: list.data?.max_profiles ?? 10 }));
      else toast.error(t.createFailed);
      setCreating(false);
    }
  }

  if (list.isError) {
    return <ErrorState title={t.loadFailed} onRetry={() => void list.refetch()} />;
  }
  if (list.isPending) {
    return (
      <div className="space-y-3" role="status" aria-live="polite">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const full = list.data.profiles.length >= list.data.max_profiles;

  return (
    <div className="grid gap-6" data-testid="profile-picker">
      <header className="grid gap-1">
        <h1 className="font-heading text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </header>

      {list.data.profiles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="grid gap-3" aria-label={t.title}>
          {list.data.profiles.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                    <UserRound className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.display_name}</p>
                    <p className="text-xs text-muted-foreground">{fmt(t.completed, { n: p.completed_sub_modules })}</p>
                  </div>
                  <Button loading={busyId === p.id} disabled={busyId !== null} onClick={() => void enter(p)}>
                    {busyId === p.id ? t.choosing : t.choose}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t.deleteButton} ${p.display_name}`}
                    disabled={busyId !== null}
                    onClick={() => setToDelete(p)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.createTitle}</CardTitle>
          <CardDescription>{full ? fmt(t.limit, { n: list.data.max_profiles }) : t.nameHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} noValidate className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="profile-name">{t.nameLabel}</Label>
              <Input
                id="profile-name"
                value={name}
                maxLength={PROFILE_NAME_MAX + 10}
                autoComplete="off"
                disabled={full || creating}
                aria-invalid={nameError !== null}
                aria-describedby={nameError ? 'profile-name-error' : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
              {nameError ? (
                <p id="profile-name-error" role="alert" className="text-sm text-destructive">
                  {nameError}
                </p>
              ) : null}
            </div>
            <Button type="submit" loading={creating} disabled={full || name.trim().length === 0}>
              {creating ? t.creating : t.create}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t.localNotice}</p>

      <DeleteProfileDialog
        profile={toDelete}
        onClose={() => setToDelete(null)}
        onDeleted={() => {
          setToDelete(null);
          void qc.invalidateQueries({ queryKey: PROFILES_KEY });
        }}
      />
    </div>
  );
}

function DeleteProfileDialog({
  profile,
  onClose,
  onDeleted,
}: {
  profile: ProfileSummary | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = id.profiles;
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setTyped(''), [profile]);
  const matches = profile !== null && typed.trim().toLowerCase() === profile.display_name.trim().toLowerCase();

  async function remove() {
    if (!profile || !matches) return;
    setBusy(true);
    try {
      await profilesApi.remove(profile.id, typed);
      onDeleted();
    } catch (err) {
      toast.error(isApiError(err) && err.code === 'CONFIRM_NAME_MISMATCH' ? t.deleteMismatch : t.deleteFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={profile !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fmt(t.deleteTitle, { name: profile?.display_name ?? '' })}</DialogTitle>
          <DialogDescription>{t.deleteBody}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          <Label htmlFor="delete-confirm">{t.deleteConfirmLabel}</Label>
          <Input id="delete-confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{id.common.cancel}</Button>
          </DialogClose>
          <Button variant="destructive" disabled={!matches} loading={busy} onClick={() => void remove()}>
            {busy ? t.deleting : t.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
