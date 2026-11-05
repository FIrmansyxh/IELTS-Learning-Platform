'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { Award, Coins, Flame, PlusCircle, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { id } from '@/i18n/id';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function PointsPanel() {
  const qc = useQueryClient();
  const [adjustTarget, setAdjustTarget] = React.useState<{ userId: string; name: string } | null>(null);
  const [pointsInput, setPointsInput] = React.useState<string>('50');
  const [noteInput, setNoteInput] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'points'],
    queryFn: () => adminApi.points(),
  });

  const adjustMutation = useMutation({
    mutationFn: (vars: { userId: string; points: number; note: string }) => adminApi.adjustPoints(vars),
    onSuccess: () => {
      toast.success(id.admin.points.adjustSuccess);
      setAdjustTarget(null);
      setNoteInput('');
      qc.invalidateQueries({ queryKey: ['admin', 'points'] });
    },
    onError: (e) => {
      if (isApiError(e)) {
        setError(apiErrorMessage(e));
      } else {
        setError(id.common.unexpected);
      }
    },
  });

  function handleOpenAdjust(user: { userId: string; displayName: string }) {
    setAdjustTarget({ userId: user.userId, name: user.displayName });
    setPointsInput('50');
    setNoteInput('');
    setError(null);
  }

  function handleSaveAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustTarget) return;
    const n = Number(pointsInput);
    if (!Number.isInteger(n) || n === 0) {
      setError(id.form.intRequired);
      return;
    }
    const note = noteInput.trim();
    if (!note) {
      setError(id.common.required);
      return;
    }
    adjustMutation.mutate({
      userId: adjustTarget.userId,
      points: n,
      note,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{id.admin.points.title}</h1>
          <p className="text-muted-foreground">{id.admin.points.description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {id.common.retry}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError || !data ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">{id.common.loadFailed}</CardTitle>
            <CardDescription>{id.common.loadFailedBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()}>{id.common.retry}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {/* Card 1: Pengguna dan Saldo Poin */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-amber-500" />
                    {id.admin.points.colUser} & {id.admin.points.colPoints}
                  </CardTitle>
                  <CardDescription>
                    Total {data.users.length} akun terdaftar di sistem.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{id.admin.points.colUser}</TableHead>
                      <TableHead>Peran</TableHead>
                      <TableHead className="text-right">{id.admin.points.colPoints}</TableHead>
                      <TableHead className="text-center">{id.admin.points.colStreak}</TableHead>
                      <TableHead className="text-right">{id.admin.points.colAction}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          {id.admin.points.tableEmpty}
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.users.map((u) => (
                        <TableRow key={u.userId}>
                          <TableCell>
                            <div className="font-medium">{u.displayName}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-base font-semibold text-amber-600 dark:text-amber-400">
                            {u.totalPoints.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                              <Flame className="h-3 w-3" />
                              {u.dailyStreakDays} hari (rekor {u.longestDailyStreak})
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenAdjust(u)}
                            >
                              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                              {id.admin.points.adjustBtn}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Riwayat Mutasi Buku Besar */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-indigo-500" />
                {id.admin.points.historyTitle}
              </CardTitle>
              <CardDescription>
                Catatan mutasi poin append-only dari aktivitas pengguna dan penyesuaian admin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Pengguna</TableHead>
                      <TableHead>Sumber</TableHead>
                      <TableHead className="text-right">Perubahan</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentLedger.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          Belum ada transaksi poin.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.recentLedger.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(item.createdAt)}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{item.userDisplayName}</span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={item.source === 'ADJUSTMENT' ? 'destructive' : 'outline'}
                              className="text-xs"
                            >
                              {item.source}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right font-mono font-bold ${item.points >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {item.points > 0 ? `+${item.points}` : item.points}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.note ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog Penyesuaian Poin */}
      <Dialog open={Boolean(adjustTarget)} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.admin.points.adjustTitle}</DialogTitle>
            <DialogDescription>
              Ubah saldo poin pengguna <strong>{adjustTarget?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAdjust} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="adjust-points-input">{id.admin.points.pointsAmount}</Label>
              <Input
                id="adjust-points-input"
                type="number"
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                placeholder="50 atau -20"
                required
              />
              <p className="text-xs text-muted-foreground">
                Gunakan angka positif untuk menambah, atau tanda minus (-) untuk mengurangi.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-note-input">{id.admin.points.note}</Label>
              <Input
                id="adjust-note-input"
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder={id.admin.points.notePlaceholder}
                maxLength={200}
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjustTarget(null)}
                disabled={adjustMutation.isPending}
              >
                {id.common.cancel}
              </Button>
              <Button type="submit" disabled={adjustMutation.isPending}>
                {adjustMutation.isPending ? id.common.loading : id.admin.points.saveAdjust}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
