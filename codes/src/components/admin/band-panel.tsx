'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/state-views';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BandSkillName, BandTableListItem } from '@/contracts/band';
import { fmt, id } from '@/i18n/id';
import { bandApi } from '@/lib/api/band';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { validateBandRows, type EditableRow } from '@/lib/band-rows';

const LIST_KEY = ['admin', 'band-tables'] as const;
const t = id.band.admin;

type DraftRow = { raw_min: string; raw_max: string; band: string };

const toNum = (s: string): number | null => {
  const v = s.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function CreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [skill, setSkill] = React.useState<BandSkillName>('LISTENING');
  const [label, setLabel] = React.useState('');
  const [note, setNote] = React.useState('');
  const [rows, setRows] = React.useState<DraftRow[]>([{ raw_min: '0', raw_max: '40', band: '' }]);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const editable: EditableRow[] = rows.map((r) => ({ raw_min: toNum(r.raw_min), raw_max: toNum(r.raw_max), band: toNum(r.band) }));
  const issues = validateBandRows(editable);
  const labelOk = label.trim().length > 0;
  const valid = issues.length === 0 && labelOk && rows.length > 0;

  const copy = useMutation({
    mutationFn: () => bandApi.active(),
    onSuccess: (data) => {
      const table = skill === 'LISTENING' ? data.listening : skill === 'READING_GENERAL' ? data.reading_general : data.reading_academic;
      setRows(table.rows.map((r) => ({ raw_min: String(r.raw_min), raw_max: String(r.raw_max), band: String(r.band) })));
    },
    onError: () => toast.error(t.copyFailed),
  });

  const save = useMutation({
    mutationFn: () =>
      bandApi.create({
        skill,
        version_label: label.trim(),
        ...(note.trim() ? { source_note: note.trim() } : {}),
        rows: editable.map((r) => ({ raw_min: r.raw_min!, raw_max: r.raw_max!, band: r.band! })),
      }),
    onSuccess: () => {
      toast.success(t.created);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      setLabel('');
      setNote('');
      setServerError(null);
      onOpenChange(false);
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'VERSION_LABEL_TAKEN') setServerError(id.apiErrors.VERSION_LABEL_TAKEN!);
      else if (isApiError(e) && e.code === 'VALIDATION_ERROR' && e.details.length > 0) setServerError(e.details.map((d) => d.message).join(' '));
      else setServerError(apiErrorMessage(e));
    },
  });

  const setRow = (i: number, patch: Partial<DraftRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const rowIssue = (i: number) => issues.find((x) => x.row === i);
  const globalIssues = issues.filter((x) => x.row === null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t.sheetTitle}</SheetTitle>
          <SheetDescription>{t.sheetDescription}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4">
          <div className="grid gap-2">
            <Label htmlFor="band-skill">{t.fieldSkill}</Label>
            <Select value={skill} onValueChange={(v) => setSkill(v as BandSkillName)}>
              <SelectTrigger id="band-skill" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LISTENING">{t.skills.LISTENING}</SelectItem>
                <SelectItem value="READING_GENERAL">{t.skills.READING_GENERAL}</SelectItem>
                <SelectItem value="READING_ACADEMIC">{t.skills.READING_ACADEMIC}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="band-label">{t.fieldLabel}</Label>
            <Input id="band-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} aria-invalid={!labelOk || undefined} />
            {!labelOk ? <p className="text-sm text-muted-foreground">{t.labelRequired}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="band-note">{t.fieldNote}</Label>
            <Input id="band-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" loading={copy.isPending} onClick={() => copy.mutate()}>
              {t.copyActive}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { raw_min: '', raw_max: '', band: '' }])}>
              <Plus aria-hidden="true" />
              {t.addRow}
            </Button>
          </div>

          <ul className="grid gap-2" aria-label={t.sheetTitle}>
            {rows.map((r, i) => {
              const issue = rowIssue(i);
              const errId = `band-row-${i}-err`;
              return (
                <li key={i} className="grid gap-1">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                    {(['raw_min', 'raw_max', 'band'] as const).map((f) => (
                      <div key={f} className="grid gap-1">
                        <Label htmlFor={`band-row-${i}-${f}`} className={i === 0 ? '' : 'sr-only'}>
                          {f === 'raw_min' ? t.rowFrom : f === 'raw_max' ? t.rowTo : t.rowBand}
                        </Label>
                        <Input
                          id={`band-row-${i}-${f}`}
                          inputMode="decimal"
                          value={r[f]}
                          onChange={(e) => setRow(i, { [f]: e.target.value })}
                          aria-invalid={issue ? true : undefined}
                          aria-describedby={issue ? errId : undefined}
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={fmt(t.removeRow, { n: i + 1 })}
                      disabled={rows.length === 1}
                      onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  {issue ? (
                    <p id={errId} role="alert" className="text-sm text-destructive">
                      {issue.message}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {globalIssues.length > 0 ? (
            <div role="alert" className="grid gap-1 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              <p className="font-semibold">{t.issuesTitle}</p>
              <ul className="list-disc pl-5">
                {globalIssues.map((g) => (
                  <li key={g.message}>{g.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
        <SheetFooter>
          <Button size="lg" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t.saving : t.save}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {id.common.cancel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** /admin/band: daftar versi tabel band, buat versi baru, aktifkan, hapus (SPEC-009). */
export function BandPanel() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: LIST_KEY, queryFn: ({ signal }) => bandApi.adminList(signal), staleTime: 0 });
  const [creating, setCreating] = React.useState(false);
  const [target, setTarget] = React.useState<{ kind: 'activate' | 'remove'; row: BandTableListItem } | null>(null);

  const act = useMutation({
    mutationFn: async () => {
      if (!target) return;
      if (target.kind === 'activate') await bandApi.activate(target.row.id);
      else await bandApi.remove(target.row.id);
    },
    onSuccess: () => {
      toast.success(target?.kind === 'activate' ? t.activated : t.removed);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      setTarget(null);
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      setTarget(null);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
    },
  });

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t.create}
        </Button>
      </header>
      <p className="flex items-start gap-2 rounded-md border bg-accent p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t.banner}
      </p>

      {list.isPending ? (
        <Skeleton className="h-48 w-full" role="status" aria-label={id.common.loading} />
      ) : list.isError ? (
        <ErrorState title={t.loadFailed} onRetry={() => void list.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.colSkill}</TableHead>
                <TableHead>{t.colLabel}</TableHead>
                <TableHead>{t.colActive}</TableHead>
                <TableHead>{t.colRows}</TableHead>
                <TableHead>{t.colUsed}</TableHead>
                <TableHead>{t.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{t.skills[row.skill]}</TableCell>
                  <TableCell>{row.version_label}</TableCell>
                  <TableCell>
                    {row.is_active ? <Badge>{t.active}</Badge> : <span className="text-muted-foreground">{t.inactive}</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.row_count}</TableCell>
                  <TableCell className="tabular-nums">{row.used_by_attempts}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {!row.is_active ? (
                        <Button size="sm" variant="outline" onClick={() => setTarget({ kind: 'activate', row })}>
                          {t.activate}
                          <span className="sr-only">
                            {' '}
                            {row.version_label}
                          </span>
                        </Button>
                      ) : null}
                      {!row.is_active && row.used_by_attempts === 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => setTarget({ kind: 'remove', row })}>
                          {t.remove}
                          <span className="sr-only">
                            {' '}
                            {row.version_label}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateSheet open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={target !== null}
        title={target?.kind === 'activate' ? t.activateTitle : t.removeTitle}
        body={
          target
            ? target.kind === 'activate'
              ? fmt(t.activateBody, { skill: t.skills[target.row.skill] ?? target.row.skill })
              : fmt(t.removeBody, { label: target.row.version_label })
            : ''
        }
        confirmLabel={target?.kind === 'activate' ? t.activate : t.remove}
        destructive={target?.kind === 'remove'}
        busy={act.isPending}
        onConfirm={() => act.mutate()}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
