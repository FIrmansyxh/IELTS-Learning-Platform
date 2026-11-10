'use client';

import * as React from 'react';
import { BookA, Eye, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TERMS, TERM_CATEGORY_LABEL, type TermCategory } from '@/lib/glossary-terms';
import { usePersistentToggle } from '@/lib/use-persistent-toggle';
import { PATTERN_HINT, VERBS, type VerbEntry } from '@/lib/verb-forms';
import { cn } from '@/lib/utils';

type FormKey = 'v2' | 'v3' | 'ing' | 's';
const FORM_COLUMNS: Array<{ key: FormKey; label: string; sub: string }> = [
  { key: 'v2', label: 'V2', sub: 'Past' },
  { key: 'v3', label: 'V3', sub: 'Past participle' },
  { key: 'ing', label: 'V-ing', sub: 'Sedang / gerund' },
  { key: 's', label: 'V-s/es', sub: 'He / she / it' },
];

const chip = (on: boolean) =>
  cn(
    'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
    on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
  );

type VerbFilter = 'ALL' | 'IRREGULAR' | 'REGULAR';

function VerbTable() {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<VerbFilter>('ALL');
  const [hideV2, setHideV2] = usePersistentToggle('ielts.glossary.hide.v2', false);
  const [hideV3, setHideV3] = usePersistentToggle('ielts.glossary.hide.v3', false);
  const [hideIng, setHideIng] = usePersistentToggle('ielts.glossary.hide.ing', false);
  const [hideS, setHideS] = usePersistentToggle('ielts.glossary.hide.s', false);
  const [revealed, setRevealed] = React.useState<ReadonlySet<string>>(new Set());

  const hidden: Record<FormKey, boolean> = { v2: hideV2, v3: hideV3, ing: hideIng, s: hideS };
  const setHidden: Record<FormKey, (v: boolean) => void> = { v2: setHideV2, v3: setHideV3, ing: setHideIng, s: setHideS };
  const anyHidden = hideV2 || hideV3 || hideIng || hideS;

  const irregularCount = VERBS.filter((v) => v.irregular).length;
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return VERBS.filter((v) => {
      if (filter === 'IRREGULAR' && !v.irregular) return false;
      if (filter === 'REGULAR' && v.irregular) return false;
      if (!q) return true;
      return v.v1.includes(q) || v.arti.toLowerCase().includes(q) || v.v2.includes(q) || v.v3.includes(q);
    });
  }, [query, filter]);

  const toggleHidden = (k: FormKey) => {
    setHidden[k](!hidden[k]);
    setRevealed(new Set());
  };
  const reveal = (key: string) => setRevealed((cur) => new Set(cur).add(key));

  const cell = (v: VerbEntry, k: FormKey) => {
    const text = v[k];
    const key = `${v.v1}:${k}`;
    if (hidden[k] && !revealed.has(key)) {
      return (
        <button
          type="button"
          onClick={() => reveal(key)}
          aria-label={`Tampilkan ${k.toUpperCase()} dari ${v.v1}`}
          className="inline-flex min-h-8 min-w-14 items-center justify-center gap-1 rounded-md border border-dashed px-2 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Eye className="size-3.5" aria-hidden="true" />
          <span aria-hidden="true">?</span>
        </button>
      );
    }
    return <span className="font-medium">{text}</span>;
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-card p-4 text-sm">
        <p className="font-semibold">5 bentuk kata kerja</p>
        <p className="mt-1 text-muted-foreground">
          <strong className="text-foreground">V1</strong> dasar (go) · <strong className="text-foreground">V2</strong> past simple (went) ·{' '}
          <strong className="text-foreground">V3</strong> past participle (gone) · <strong className="text-foreground">V-ing</strong> (going) ·{' '}
          <strong className="text-foreground">V-s/es</strong> untuk he / she / it di present simple (goes).
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kata kerja atau arti (mis. go, membeli)"
            aria-label="Cari kata kerja atau arti"
            className="pl-9"
          />
        </div>
        <div role="group" aria-label="Jenis kata kerja" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')} className={chip(filter === 'ALL')}>
            Semua <span className="text-xs opacity-80">{VERBS.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'IRREGULAR'} onClick={() => setFilter('IRREGULAR')} className={chip(filter === 'IRREGULAR')}>
            Tidak beraturan <span className="text-xs opacity-80">{irregularCount}</span>
          </button>
          <button type="button" aria-pressed={filter === 'REGULAR'} onClick={() => setFilter('REGULAR')} className={chip(filter === 'REGULAR')}>
            Beraturan <span className="text-xs opacity-80">{VERBS.length - irregularCount}</span>
          </button>
        </div>
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Mode hafalan: sembunyikan kolom, ketuk kotak ? untuk melihat jawabannya</p>
          <div role="group" aria-label="Sembunyikan kolom" className="flex flex-wrap items-center gap-2">
            {FORM_COLUMNS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={hidden[c.key]}
                onClick={() => toggleHidden(c.key)}
                className={chip(hidden[c.key])}
              >
                Sembunyikan {c.label}
              </button>
            ))}
            {anyHidden ? (
              <button
                type="button"
                onClick={() => {
                  setHideV2(false);
                  setHideV3(false);
                  setHideIng(false);
                  setHideS(false);
                  setRevealed(new Set());
                }}
                className="text-sm font-medium text-primary underline underline-offset-2"
              >
                Tampilkan semua
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground" role="status" data-testid="verb-count">
        {rows.length} kata kerja
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Tidak ada kata kerja yang cocok.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[640px] table-auto text-left text-sm" data-testid="verb-table">
            <caption className="sr-only">Tabel 5 bentuk kata kerja umum</caption>
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  V1 <span className="block normal-case tracking-normal opacity-80">Dasar</span>
                </th>
                {FORM_COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className="px-3 py-2.5 font-semibold">
                    {c.label} <span className="block normal-case tracking-normal opacity-80">{c.sub}</span>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Arti
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((v) => (
                <tr key={v.v1} className="align-top hover:bg-muted/40" data-testid={`verb-row-${v.v1}`}>
                  <th scope="row" className="px-3 py-2.5 text-base font-bold text-primary">
                    {v.v1}
                    {v.irregular ? (
                      <Badge variant="outline" className="ml-2 align-middle text-[10px]" title={PATTERN_HINT[v.pattern]}>
                        {v.pattern}
                      </Badge>
                    ) : null}
                  </th>
                  {FORM_COLUMNS.map((c) => (
                    <td key={c.key} className="px-3 py-2.5">
                      {cell(v, c.key)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {v.arti}
                    {v.note ? <span className="mt-0.5 block text-xs">{v.note}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Pola tak beraturan: <strong>A-A-A</strong> (tiga sama), <strong>A-B-A</strong> (V1 = V3), <strong>A-B-B</strong> (V2 = V3),{' '}
        <strong>A-B-C</strong> (ketiganya beda). Kata kerja beraturan cukup ditambah -ed. Ejaan mengikuti Inggris Amerika bila berbeda.
      </p>
    </div>
  );
}

function TermList() {
  const [query, setQuery] = React.useState('');
  const [cat, setCat] = React.useState<TermCategory | 'ALL'>('ALL');
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return TERMS.filter((t) => {
      if (cat !== 'ALL' && t.category !== cat) return false;
      if (!q) return true;
      return t.term.toLowerCase().includes(q) || t.arti.toLowerCase().includes(q) || t.penjelasan.toLowerCase().includes(q);
    });
  }, [query, cat]);
  const cats: Array<TermCategory | 'ALL'> = ['ALL', 'GRAMMAR', 'KOSAKATA', 'IELTS'];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari istilah (mis. noun, skimming)"
            aria-label="Cari istilah"
            className="pl-9"
          />
        </div>
        <div role="group" aria-label="Kategori istilah" className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={chip(cat === c)}>
              {c === 'ALL' ? 'Semua' : TERM_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground" role="status" data-testid="term-count">
        {rows.length} istilah
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Tidak ada istilah yang cocok.</p>
      ) : (
        <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <li key={t.term} className="grid gap-1.5 rounded-xl border bg-card p-4" data-testid="term-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-primary">{t.term}</h3>
                <Badge variant="secondary">{TERM_CATEGORY_LABEL[t.category]}</Badge>
              </div>
              <p className="text-sm font-semibold">{t.arti}</p>
              <p className="text-sm text-muted-foreground">{t.penjelasan}</p>
              {t.contoh ? <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-sm italic">{t.contoh}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GlossaryView() {
  return (
    <div className="grid w-full gap-5">
      <header className="grid gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BookA className="size-6 text-primary" aria-hidden="true" />
          Glosarium
        </h1>
        <p className="max-w-4xl text-muted-foreground">
          Tabel 5 bentuk kata kerja umum untuk dihafalkan, dan daftar istilah grammar, kosakata, serta IELTS beserta artinya.
        </p>
      </header>
      <Tabs defaultValue="verbs">
        <TabsList>
          <TabsTrigger value="verbs">Verb Forms</TabsTrigger>
          <TabsTrigger value="terms">Istilah</TabsTrigger>
        </TabsList>
        <TabsContent value="verbs" className="pt-4">
          <VerbTable />
        </TabsContent>
        <TabsContent value="terms" className="pt-4">
          <TermList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
