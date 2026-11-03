'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { UnlockLevel } from '@/lib/api/types';
import type { CurriculumTree } from '@/contracts/curriculum';
import { fmt, id } from '@/i18n/id';
import { adminApi } from '@/lib/api/admin';
import { apiErrorMessage } from '@/lib/api/errors';
import { curriculumApi } from '@/lib/api/curriculum';

export type UnlockTarget = { id: string; label: string; available: boolean };

/** Daftar target per level dari pohon kurikulum (struktur sama untuk semua pengguna). */
export function targetsFor(tree: CurriculumTree, level: UnlockLevel): UnlockTarget[] {
  const out: UnlockTarget[] = [];
  for (const tier of tree.tiers) {
    if (level === 'TIER') {
      out.push({ id: tier.id, label: fmt(id.tree.tierLabel, { n: tier.tier_number }) + `: ${tier.title}`, available: true });
      continue;
    }
    for (const mod of tier.modules) {
      if (level === 'MODULE') {
        out.push({
          id: mod.id,
          label: `${mod.module_code} ${mod.title}`,
          available: mod.content_state === 'AVAILABLE',
        });
        continue;
      }
      for (const sm of mod.sub_modules) {
        out.push({
          id: sm.id,
          label: `${sm.sub_module_code} ${sm.title}`,
          available: sm.content_state === 'AVAILABLE',
        });
      }
    }
  }
  return out;
}

const LEVELS: UnlockLevel[] = ['TIER', 'MODULE', 'SUB_MODULE'];

export function UnlockSheet({
  open,
  onOpenChange,
  userId,
  userName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userName: string;
}) {
  const [level, setLevel] = React.useState<UnlockLevel>('SUB_MODULE');
  const [target, setTarget] = React.useState<string>('');

  const tree = useQuery({
    queryKey: ['curriculum-tree'],
    queryFn: ({ signal }) => curriculumApi.tree(signal),
    enabled: open,
  });
  const targets = React.useMemo(() => (tree.data ? targetsFor(tree.data, level) : []), [tree.data, level]);

  const unlock = useMutation({
    mutationFn: (vars: { userId: string; level: UnlockLevel; targetId: string }) =>
      adminApi.unlockProgress(vars.userId, { level: vars.level, target_id: vars.targetId }),
    onSuccess: () => {
      toast.success(id.admin.users.unlockSuccess);
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setTarget('');
        onOpenChange(o);
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{id.admin.users.unlockTitle}</SheetTitle>
          <SheetDescription>{fmt(id.admin.users.unlockDescription, { name: userName })}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4">
          <div className="grid gap-2">
            <Label htmlFor="unlock-level">{id.admin.users.unlockLevel}</Label>
            <Select
              value={level}
              onValueChange={(v) => {
                setLevel(v as UnlockLevel);
                setTarget('');
              }}
            >
              <SelectTrigger id="unlock-level" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {id.admin.users.unlockLevels[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tree.isPending ? (
            <Skeleton className="h-11 w-full" />
          ) : tree.isError ? (
            <ErrorState title={id.admin.users.unlockTreeFailed} onRetry={() => void tree.refetch()} />
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="unlock-target">{id.admin.users.unlockTarget}</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="unlock-target" className="w-full">
                  <SelectValue placeholder={id.admin.users.unlockTargetPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id} disabled={!t.available}>
                      {t.label}
                      {t.available ? '' : ` ${id.admin.users.unlockUnavailable}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <SheetFooter>
          <Button
            type="button"
            size="lg"
            disabled={!target || !userId}
            loading={unlock.isPending}
            onClick={() => userId && unlock.mutate({ userId, level, targetId: target })}
          >
            {id.admin.users.unlockSubmit}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
