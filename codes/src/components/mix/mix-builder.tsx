'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Check,
  Languages,
  Lock,
  Mic,
  PenLine,
  Shuffle,
  SpellCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/common/state-views';
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
import { Skeleton } from '@/components/ui/skeleton';
import { MIX_COUNT_MAX, MIX_COUNT_MIN, MIX_SKILLS, type MixMode } from '@/contracts/mix';
import type { BankListItem } from '@/contracts/question-bank';
import { fmt, id } from '@/i18n/id';
import { isApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { mixApi, parseMaxAvailable } from '@/lib/api/mix';
import { cn } from '@/lib/utils';
import {
  availableTypes,
  buildAutoRequest,
  buildManualRequest,
  clampCount,
  estimateCapacity,
  selectableBanks,
  skillQuestionCount,
} from './mix-utils';

export const MIX_BANKS_KEY = ['mix', 'banks'] as const;

const SKILL_ICON: Record<string, LucideIcon> = {
  GRAMMAR: SpellCheck,
  VOCAB: Languages,
  READING: BookOpen,
  WRITING: PenLine,
  SPEAKING: Mic,
};

const typeName = (t: string) => id.mix.typeNames[t] ?? t;

function Section({ title, hint, children, titleId }: { title: string; hint?: string; children: React.ReactNode; titleId: string }) {
  return (
    <section aria-labelledby={titleId} className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-label={id.common.loading} className="grid gap-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

export const MIX_ACTIVE_KEY = ['mix', 'active'] as const;

/** Sesi campur yang masih berjalan menurut server (`GET /mix-sessions/active`), atau null. */
function useActiveSession() {
  const q = useQuery({
    queryKey: MIX_ACTIVE_KEY,
    queryFn: ({ signal }) => mixApi.active(signal),
    staleTime: 0,
    retry: false,
  });
  return q.data ?? null;
}

export function MixBuilder() {
  const router = useRouter();
  const params = useSearchParams();
  const presetBank = params.get('bank');
  const banksQuery = useQuery({
    queryKey: MIX_BANKS_KEY,
    queryFn: ({ signal }) => mixApi.banks(signal),
    staleTime: 60_000,
  });
  const active = useActiveSession();

  const [skills, setSkills] = React.useState<string[] | null>(null);
  const [types, setTypes] = React.useState<string[]>([]);
  const [bankCodes, setBankCodes] = React.useState<string[] | null>(null);
  const [count, setCount] = React.useState(10);
  const [diffMin, setDiffMin] = React.useState(1);
  const [diffMax, setDiffMax] = React.useState(5);
  const [serverMax, setServerMax] = React.useState<number | null>(null);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [pendingMode, setPendingMode] = React.useState<MixMode | null>(null);

  const all = banksQuery.data;
  const pool = React.useMemo(() => selectableBanks(all ?? []), [all]);
  const skillsWithBanks = React.useMemo(
    () => MIX_SKILLS.filter((s) => pool.some((b) => b.skill === s)),
    [pool],
  );

  // Nilai awal: semua skill yang punya bank; `?bank=` (saran hasil) memilih bank itu saja.
  const presetApplied = React.useRef(false);
  React.useEffect(() => {
    if (!all || presetApplied.current) return;
    presetApplied.current = true;
    const preset = presetBank ? pool.find((b) => b.bank_code === presetBank) : undefined;
    if (preset) {
      setSkills([preset.skill]);
      setBankCodes([preset.bank_code]);
    } else {
      setSkills([...skillsWithBanks]);
      setBankCodes([]);
    }
  }, [all, pool, presetBank, skillsWithBanks]);

  const selectedSkills = React.useMemo(() => skills ?? [], [skills]);
  const visibleBanks = React.useMemo(() => pool.filter((b) => selectedSkills.includes(b.skill)), [pool, selectedSkills]);
  const chosenBanks = React.useMemo(
    () => visibleBanks.filter((b) => (bankCodes ?? []).includes(b.bank_code)),
    [visibleBanks, bankCodes],
  );
  const scopeBanks = chosenBanks.length > 0 ? chosenBanks : visibleBanks;
  const typeOptions = React.useMemo(() => availableTypes(scopeBanks), [scopeBanks]);
  const activeTypes = React.useMemo(
    () => types.filter((t) => typeOptions.some((o) => o.question_type === t)),
    [types, typeOptions],
  );
  const capacity = estimateCapacity(scopeBanks, new Set(activeTypes));
  const capByServer = serverMax === null ? MIX_COUNT_MAX : serverMax;
  const maxCount = Math.max(MIX_COUNT_MIN, Math.min(MIX_COUNT_MAX, capacity, capByServer));
  const effectiveCount = clampCount(count, maxCount);
  const lowCapacity = Math.min(capacity, capByServer) < MIX_COUNT_MIN;
  const hasAi = visibleBanks.some((b) => b.skill === 'WRITING' || b.skill === 'SPEAKING');

  const resetServerError = () => {
    setServerMax(null);
    setStartError(null);
  };

  const toggleSkill = (s: string) => {
    resetServerError();
    setSkills((cur) => {
      const list = cur ?? [];
      const next = list.includes(s) ? list.filter((x) => x !== s) : [...list, s];
      return next;
    });
    // Bank milik skill yang dimatikan ikut dilepas (filter bersifat AND di server).
    setBankCodes((cur) => (cur ?? []).filter((code) => pool.find((b) => b.bank_code === code)?.skill !== s));
  };
  const toggleType = (t: string) => {
    resetServerError();
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  };
  const toggleBank = (code: string) => {
    resetServerError();
    setBankCodes((cur) => ((cur ?? []).includes(code) ? (cur ?? []).filter((x) => x !== code) : [...(cur ?? []), code]));
  };

  const start = useMutation({
    mutationFn: (mode: MixMode) => {
      if (mode === 'AUTO_WEAKNESS') return mixApi.start(buildAutoRequest(effectiveCount));
      const kinds = [...new Set(chosenBanks.map((b) => b.bank_kind))];
      return mixApi.start(
        buildManualRequest({
          skills: selectedSkills,
          bankKinds: kinds,
          types: activeTypes,
          difficultyMin: diffMin,
          difficultyMax: diffMax,
          count: effectiveCount,
        }),
      );
    },
    onSuccess: (session) => {
      router.push(`/latihan/campur/${session.attempt_id}`);
    },
    onError: (e, mode) => {
      if (isApiError(e) && e.code === 'MIX_NOT_ENOUGH_QUESTIONS') {
        const n = parseMaxAvailable(e.details);
        setServerMax(n);
        setStartError(n !== null && n > 0 ? fmt(id.mix.notEnough, { n }) : id.mix.notEnoughNone);
        return;
      }
      setStartError(null);
      toast.error(apiErrorMessage(e) || id.mix.startFailed, {
        action: { label: id.common.retry, onClick: () => start.mutate(mode) },
      });
    },
  });

  const requestStart = (mode: MixMode) => {
    if (start.isPending) return;
    setStartError(null);
    if (active) setPendingMode(mode);
    else start.mutate(mode);
  };

  if (banksQuery.isPending) return <LoadingState />;
  if (banksQuery.isError) {
    return <ErrorState title={id.mix.loadFailed} onRetry={() => void banksQuery.refetch()} />;
  }
  if (pool.length === 0) {
    return (
      <div className="grid max-w-6xl gap-4">
        <Header />
        <EmptyState message={id.mix.empty} />
      </div>
    );
  }

  const canStart = selectedSkills.length > 0 && !lowCapacity && !start.isPending;
  const errorText = startError ?? (lowCapacity && selectedSkills.length > 0 ? id.mix.notEnoughNone : null);

  return (
    <div className="grid max-w-6xl gap-5">
      <Header />

      {active ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div>
            <p className="font-semibold">{id.mix.active.title}</p>
            <p className="text-sm text-muted-foreground">
              {fmt(id.mix.active.body, { answered: active.answered_count, total: active.question_count })}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/latihan/campur/${active.attempt_id}`}>{id.mix.active.resume}</Link>
          </Button>
        </div>
      ) : null}

      <Section title={id.mix.skillsTitle} hint={id.mix.skillsHint} titleId="mix-skills">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MIX_SKILLS.map((s) => {
            const Icon = SKILL_ICON[s] ?? BookOpen;
            const total = skillQuestionCount(pool, s);
            const selected = selectedSkills.includes(s);
            const disabled = total === 0;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => toggleSkill(s)}
                className={cn(
                  'relative flex min-h-24 flex-col items-start gap-1 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                  selected ? 'border-primary bg-primary/5' : 'bg-background hover:bg-accent',
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  {selected ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
                </span>
                <span className="font-semibold">{id.mix.skillNames[s]}</span>
                <span className="text-xs text-muted-foreground">
                  {disabled ? id.mix.skillNoBank : fmt(id.mix.skillQuestions, { n: total })}
                </span>
                {s === 'WRITING' || s === 'SPEAKING' ? (
                  <span className="text-xs text-muted-foreground">{id.mix.skillAiNote}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={id.mix.typesTitle} hint={id.mix.typesHint} titleId="mix-types">
        {typeOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{id.mix.typesNone}</p>
        ) : (
          <div role="group" aria-labelledby="mix-types" className="flex flex-wrap gap-2">
            {typeOptions.map((t) => {
              const on = activeTypes.includes(t.question_type);
              return (
                <button
                  key={t.question_type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(t.question_type)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                  )}
                >
                  {on ? <Check className="size-4" aria-hidden="true" /> : null}
                  {typeName(t.question_type)}
                  <span className={cn('text-xs tabular-nums', on ? 'opacity-80' : 'text-muted-foreground')}>{t.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={id.mix.banksTitle} hint={id.mix.banksHint} titleId="mix-banks">
        <ul className="grid gap-2">
          {(all ?? [])
            .filter((b) => selectedSkills.includes(b.skill) || !b.selectable_in_mix)
            .map((b) => (
              <BankRow
                key={b.bank_code}
                bank={b}
                checked={(bankCodes ?? []).includes(b.bank_code)}
                onToggle={() => toggleBank(b.bank_code)}
              />
            ))}
        </ul>
      </Section>

      <Section title={id.mix.countTitle} titleId="mix-count">
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="mix-count-input" className="text-sm font-medium">
              {id.mix.countAria}
            </label>
            <output htmlFor="mix-count-input" className="text-lg font-bold tabular-nums">
              {fmt(id.mix.countValue, { n: effectiveCount })}
            </output>
          </div>
          <input
            id="mix-count-input"
            type="range"
            min={MIX_COUNT_MIN}
            max={maxCount}
            step={1}
            value={effectiveCount}
            disabled={lowCapacity || maxCount <= MIX_COUNT_MIN}
            onChange={(e) => {
              setStartError(null);
              setCount(Number(e.target.value));
            }}
            aria-valuetext={fmt(id.mix.countValue, { n: effectiveCount })}
            className="h-11 w-full cursor-pointer accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{MIX_COUNT_MIN}</span>
            <span>{maxCount}</span>
          </div>
          {maxCount < MIX_COUNT_MAX && !lowCapacity ? (
            <p className="text-xs text-muted-foreground">{fmt(id.mix.countMax, { n: maxCount })}</p>
          ) : null}
        </div>
      </Section>

      <Section title={id.mix.difficultyTitle} hint={id.mix.difficultyHint} titleId="mix-difficulty">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            {id.mix.difficultyMinAria}
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={diffMin}
              onChange={(e) => {
                resetServerError();
                const v = Number(e.target.value);
                setDiffMin(v);
                if (v > diffMax) setDiffMax(v);
              }}
              aria-valuetext={String(diffMin)}
              className="h-11 w-full cursor-pointer accent-[var(--color-primary)]"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {id.mix.difficultyMaxAria}
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={diffMax}
              onChange={(e) => {
                resetServerError();
                const v = Number(e.target.value);
                setDiffMax(v);
                if (v < diffMin) setDiffMin(v);
              }}
              aria-valuetext={String(diffMax)}
              className="h-11 w-full cursor-pointer accent-[var(--color-primary)]"
            />
          </label>
        </div>
        <p className="text-sm font-medium tabular-nums" data-testid="mix-difficulty-range">
          {fmt(id.mix.difficultyRange, { min: diffMin, max: diffMax })}
        </p>
      </Section>

      {hasAi ? <p className="text-sm text-muted-foreground">{id.mix.aiNote}</p> : null}

      <div aria-live="polite" role="status" className="min-h-0">
        {selectedSkills.length === 0 ? <p className="text-sm text-destructive">{id.mix.needSkill}</p> : null}
        {errorText ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {errorText}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button size="lg" disabled={!canStart} loading={start.isPending && start.variables === 'MANUAL'} onClick={() => requestStart('MANUAL')}>
          {start.isPending && start.variables === 'MANUAL' ? id.mix.starting : id.mix.start}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={start.isPending || Math.min(pool.reduce((n, b) => n + b.question_count, 0), capByServer) < MIX_COUNT_MIN}
          loading={start.isPending && start.variables === 'AUTO_WEAKNESS'}
          onClick={() => requestStart('AUTO_WEAKNESS')}
        >
          <Sparkles aria-hidden="true" />
          {id.mix.auto}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{id.mix.autoHint}</p>
      <p className="text-sm text-muted-foreground">{id.mix.noPoints}</p>

      <Dialog open={pendingMode !== null} onOpenChange={(o) => !o && setPendingMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.mix.active.confirmTitle}</DialogTitle>
            <DialogDescription>{id.mix.active.confirmBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMode(null)}>
              {id.mix.active.confirmCancel}
            </Button>
            <Button
              onClick={() => {
                const mode = pendingMode;
                setPendingMode(null);
                if (mode) start.mutate(mode);
              }}
            >
              {id.mix.active.confirmStart}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Header() {
  return (
    <header className="grid gap-1">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Shuffle className="size-6 text-primary" aria-hidden="true" />
        {id.mix.title}
      </h1>
      <p className="text-muted-foreground">{id.mix.subtitle}</p>
    </header>
  );
}

function BankRow({ bank, checked, onToggle }: { bank: BankListItem; checked: boolean; onToggle: () => void }) {
  const locked = !bank.selectable_in_mix;
  const inputId = `mix-bank-${bank.bank_code}`;
  return (
    <li>
      <label
        htmlFor={inputId}
        className={cn(
          'flex min-h-11 items-start gap-3 rounded-lg border p-3',
          locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-accent',
          checked && 'border-primary bg-primary/5',
        )}
      >
        <input
          id={inputId}
          type="checkbox"
          className="mt-1 size-4 accent-[var(--color-primary)]"
          checked={checked}
          disabled={locked}
          onChange={onToggle}
        />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {bank.title}
            {bank.has_passage ? <Badge variant="secondary">{id.mix.bankPassage}</Badge> : null}
          </span>
          <span className="text-xs text-muted-foreground">
            {locked ? (
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3" aria-hidden="true" />
                {id.mix.bankListening}
              </span>
            ) : (
              <>
                {id.mix.skillNames[bank.skill] ?? bank.skill} · {fmt(id.mix.bankCount, { n: bank.question_count })}
              </>
            )}
          </span>
        </span>
      </label>
    </li>
  );
}
