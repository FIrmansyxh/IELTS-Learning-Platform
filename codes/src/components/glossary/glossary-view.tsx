'use client';

import * as React from 'react';
import { BookA, BookOpen, Eye, EyeOff, Lightbulb, ListChecks, Search, SearchX, Square, Volume2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TERMS, TERM_CATEGORY_LABEL, type TermCategory } from '@/lib/glossary-terms';
import { usePersistentToggle } from '@/lib/use-persistent-toggle';
import { PATTERN_HINT, VERBS, type VerbEntry, type VerbPattern } from '@/lib/verb-forms';
import { cn } from '@/lib/utils';

type FormKey = 'v2' | 'v3' | 'ing' | 's';

/** Satu warna per bentuk, dipakai konsisten di ringkasan, kepala kolom, dan kartu (selalu disertai label teks). */
const FORM_STYLE: Record<'v1' | FormKey, { text: string; dot: string; border: string }> = {
  v1: { text: 'text-primary', dot: 'bg-primary', border: 'border-primary/40' },
  v2: { text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', border: 'border-amber-500/40' },
  v3: { text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', border: 'border-emerald-500/40' },
  ing: { text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', border: 'border-violet-500/40' },
  s: { text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500', border: 'border-rose-500/40' },
};

const FORM_COLUMNS: Array<{ key: FormKey; label: string; sub: string }> = [
  { key: 'v2', label: 'V2', sub: 'Past' },
  { key: 'v3', label: 'V3', sub: 'Past participle' },
  { key: 'ing', label: 'V-ing', sub: 'Sedang / gerund' },
  { key: 's', label: 'V-s/es', sub: 'He / she / it' },
];

const FORM_GUIDE: Array<{ key: 'v1' | FormKey; label: string; example: string; hint: string }> = [
  { key: 'v1', label: 'V1', example: 'go', hint: 'Bentuk dasar, juga dipakai setelah I / you / we / they' },
  { key: 'v2', label: 'V2', example: 'went', hint: 'Kejadian yang sudah lewat (past simple)' },
  { key: 'v3', label: 'V3', example: 'gone', hint: 'Dipakai dengan have / has dan kalimat pasif' },
  { key: 'ing', label: 'V-ing', example: 'going', hint: 'Sedang berlangsung, atau sebagai gerund' },
  { key: 's', label: 'V-s/es', example: 'goes', hint: 'Untuk he / she / it di present simple' },
];

const chip = (on: boolean) =>
  cn(
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
    on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
  );

type VerbFilter = 'ALL' | 'IRREGULAR' | VerbPattern;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const FILTERS: VerbFilter[] = ['ALL', 'BERATURAN', 'A-B-C', 'A-B-A', 'A-B-B', 'A-A-A', 'IRREGULAR'];
const FILTER_LABEL: Record<VerbFilter, string> = {
  ALL: 'Semua',
  BERATURAN: 'Beraturan',
  'A-B-C': 'A-B-C',
  'A-B-A': 'A-B-A',
  'A-B-B': 'A-B-B',
  'A-A-A': 'A-A-A',
  IRREGULAR: 'Tidak beraturan',
};
const matchesFilter = (v: VerbEntry, f: VerbFilter) => f === 'ALL' || (f === 'IRREGULAR' ? v.irregular : v.pattern === f);
const FILTER_COUNT = Object.fromEntries(FILTERS.map((f) => [f, VERBS.filter((v) => matchesFilter(v, f)).length])) as Record<VerbFilter, number>;

/** Penjelasan tiap pola; contoh diambil dari data (go, come, buy, put, work). */
const PATTERN_INFO: Record<VerbPattern, { title: string; rule: string; example: [string, string, string] }> = {
  BERATURAN: {
    title: 'Beraturan',
    rule: 'V2 dan V3 dibuat dengan menambah -ed (atau -d / -ied) dan hasilnya sama. Tidak perlu dihafal satu per satu.',
    example: ['work', 'worked', 'worked'],
  },
  'A-A-A': {
    title: 'Pola A-A-A',
    rule: 'Ketiga bentuk (V1, V2, V3) sama persis, jadi tidak ada yang berubah. Paling mudah dihafal.',
    example: ['put', 'put', 'put'],
  },
  'A-B-A': {
    title: 'Pola A-B-A',
    rule: 'V1 dan V3 sama; hanya V2 yang berbeda.',
    example: ['come', 'came', 'come'],
  },
  'A-B-B': {
    title: 'Pola A-B-B',
    rule: 'V2 dan V3 sama; hanya V1 yang berbeda. Kelompok ini paling banyak anggotanya.',
    example: ['buy', 'bought', 'bought'],
  },
  'A-B-C': {
    title: 'Pola A-B-C',
    rule: 'Ketiga bentuk berbeda semua. Perlu dihafal satu per satu.',
    example: ['go', 'went', 'gone'],
  },
};

function Triplet({ words }: { words: readonly [string, string, string] }) {
  const style = [FORM_STYLE.v1.text, FORM_STYLE.v2.text, FORM_STYLE.v3.text];
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-base font-bold">
      {words.map((w, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <span className="text-muted-foreground" aria-hidden="true">
              →
            </span>
          ) : null}
          <span className={style[i]}>{w}</span>
        </React.Fragment>
      ))}
    </p>
  );
}

/** Penjelasan pola yang mengikuti pilihan filter: umum untuk Semua/Tidak beraturan, rinci untuk satu pola. */
function PatternGuide({ filter }: { filter: VerbFilter }) {
  const single = filter !== 'ALL' && filter !== 'IRREGULAR' ? filter : null;
  const list: VerbPattern[] = filter === 'IRREGULAR' ? ['A-A-A', 'A-B-A', 'A-B-B', 'A-B-C'] : ['BERATURAN', 'A-A-A', 'A-B-A', 'A-B-B', 'A-B-C'];
  return (
    <div className="grid gap-3 rounded-xl bg-muted/50 p-3.5 sm:p-4" data-testid="pattern-guide">
      <div className="flex items-start gap-2.5">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">{single ? PATTERN_INFO[single].title : 'Apa arti A-B-C, A-B-A, dan seterusnya?'}</h2>
          <p className="text-sm text-muted-foreground">
            {single
              ? PATTERN_INFO[single].rule
              : 'Pola ini membandingkan tiga bentuk utama: V1 → V2 → V3. Huruf yang sama berarti kata yang sama, huruf yang berbeda berarti kata yang berbeda. Pilih satu pola di atas untuk melihat kata kerjanya.'}
          </p>
        </div>
      </div>
      {single ? (
        <div className="grid gap-1.5 rounded-lg border bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contoh (V1 → V2 → V3)</p>
          <Triplet words={PATTERN_INFO[single].example} />
          <p className="text-xs text-muted-foreground">
            Kata kerja lain: {VERBS.filter((v) => v.pattern === single && v.v1 !== PATTERN_INFO[single].example[0]).slice(0, 4).map((v) => v.v1).join(', ')}, dan seterusnya.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {list.map((p) => (
            <li key={p} className="grid content-start gap-1 rounded-lg border bg-background p-3">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{PATTERN_INFO[p].title}</span>
              <Triplet words={PATTERN_INFO[p].example} />
              <span className="text-xs leading-snug text-muted-foreground">{PATTERN_INFO[p].rule}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lafal lewat Web Speech bawaan peramban/perangkat (tanpa berkas audio atau layanan luar); nilai awal false agar render server dan klien sama. */
function useCanSpeak(): boolean {
  const [can, setCan] = React.useState(false);
  React.useEffect(() => {
    setCan(typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined');
  }, []);
  return can;
}

let speakRun = 0;

function stopSpeaking() {
  speakRun++;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* abaikan */
  }
}

/** Pilih suara Inggris terbaik yang tersedia (suara natural/online lebih jelas daripada suara dasar). */
function pickVoice(): SpeechSynthesisVoice | null {
  try {
    const score = (v: SpeechSynthesisVoice) =>
      (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|samantha|aria|jenny|zira|david/i.test(v.name) ? 1 : 0) + (/^en[-_]US/i.test(v.lang) ? 1 : 0);
    const voices = window.speechSynthesis.getVoices().filter((v) => /^en[-_](US|GB)/i.test(v.lang));
    return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
  } catch {
    return null;
  }
}

const SPEAK_RATE = 0.7;
const SPEAK_PAUSE_MS = 700;

/** Ucapkan kata satu per satu dengan jeda, pelan. Memanggil onDone di akhir atau saat gagal. */
function speakSequence(words: string[], onDone: () => void) {
  stopSpeaking();
  const run = speakRun;
  const voice = pickVoice();
  const next = (i: number) => {
    if (run !== speakRun) return;
    if (i >= words.length) {
      onDone();
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(words[i]);
      u.lang = voice?.lang ?? 'en-US';
      if (voice) u.voice = voice;
      u.rate = SPEAK_RATE;
      u.onend = () => setTimeout(() => next(i + 1), SPEAK_PAUSE_MS);
      u.onerror = () => {
        if (run === speakRun) onDone();
      };
      window.speechSynthesis.speak(u);
    } catch {
      onDone();
    }
  };
  next(0);
}

function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-12 pl-11 pr-11 text-base"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Hapus pencarian"
          className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ text, onReset }: { text: string; onReset: () => void }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed bg-card p-8 text-center">
      <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-base font-medium">{text}</p>
      <p className="text-sm text-muted-foreground">Coba kata lain, atau tampilkan semua daftar.</p>
      <button type="button" onClick={onReset} className={cn(chip(false), 'mt-1')}>
        Tampilkan semua
      </button>
    </div>
  );
}

function FormGuide() {
  return (
    <section aria-labelledby="verb-guide" className="grid gap-3 rounded-2xl border bg-card p-4 sm:p-5">
      <div>
        <h2 id="verb-guide" className="text-base font-semibold">
          Satu kata kerja, lima bentuk
        </h2>
        <p className="text-sm text-muted-foreground">Contoh dengan kata kerja go. Warna yang sama dipakai di tabel di bawah.</p>
      </div>
      <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {FORM_GUIDE.map((f) => (
          <li key={f.key} className={cn('grid content-start gap-1 rounded-xl border bg-background p-3', FORM_STYLE[f.key].border)}>
            <span className={cn('flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide', FORM_STYLE[f.key].text)}>
              <span className={cn('size-2 rounded-full', FORM_STYLE[f.key].dot)} aria-hidden="true" />
              {f.label}
            </span>
            <span className={cn('text-xl font-bold', FORM_STYLE[f.key].text)}>{f.example}</span>
            <span className="text-xs leading-snug text-muted-foreground">{f.hint}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function VerbTable() {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<VerbFilter>('ALL');
  const [letter, setLetter] = React.useState<string | null>(null);
  const [hideV2, setHideV2] = usePersistentToggle('ielts.glossary.hide.v2', false);
  const [hideV3, setHideV3] = usePersistentToggle('ielts.glossary.hide.v3', false);
  const [hideIng, setHideIng] = usePersistentToggle('ielts.glossary.hide.ing', false);
  const [hideS, setHideS] = usePersistentToggle('ielts.glossary.hide.s', false);
  const [revealed, setRevealed] = React.useState<ReadonlySet<string>>(new Set());
  const [speakingKey, setSpeakingKey] = React.useState<string | null>(null);
  const canSpeak = useCanSpeak();

  React.useEffect(() => () => stopSpeaking(), []);

  const hidden: Record<FormKey, boolean> = { v2: hideV2, v3: hideV3, ing: hideIng, s: hideS };
  const setHidden: Record<FormKey, (v: boolean) => void> = { v2: setHideV2, v3: setHideV3, ing: setHideIng, s: setHideS };
  const anyHidden = hideV2 || hideV3 || hideIng || hideS;

  // Daftar sebelum disaring huruf: dipakai untuk menentukan huruf yang tersedia pada pencarian/filter saat ini.
  const baseRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return VERBS.filter((v) => {
      if (!matchesFilter(v, filter)) return false;
      if (!q) return true;
      return v.v1.includes(q) || v.arti.toLowerCase().includes(q) || v.v2.includes(q) || v.v3.includes(q);
    });
  }, [query, filter]);

  const letters = React.useMemo(() => [...new Set(baseRows.map((v) => v.v1[0]!.toUpperCase()))], [baseRows]);
  // Huruf terpilih yang tidak punya kata pada pencarian/filter baru diabaikan, bukan menghasilkan daftar kosong.
  const activeLetter = letter !== null && letters.includes(letter) ? letter : null;
  const rows = React.useMemo(
    () => (activeLetter ? baseRows.filter((v) => v.v1[0]!.toUpperCase() === activeLetter) : baseRows),
    [baseRows, activeLetter],
  );

  const showAll = () => {
    setHideV2(false);
    setHideV3(false);
    setHideIng(false);
    setHideS(false);
    setRevealed(new Set());
  };
  const toggleHidden = (k: FormKey) => {
    setHidden[k](!hidden[k]);
    setRevealed(new Set());
  };
  const reveal = (key: string) => setRevealed((cur) => new Set(cur).add(key));
  const resetSearch = () => {
    setQuery('');
    setFilter('ALL');
    setLetter(null);
  };

  /** Ucapkan V1 lalu bentuk lain secara berurutan; bentuk yang sedang disembunyikan (mode hafalan) dilewati. */
  const toggleSpeak = (v: VerbEntry) => {
    if (speakingKey === v.v1) {
      stopSpeaking();
      setSpeakingKey(null);
      return;
    }
    const words = [
      v.v1,
      ...FORM_COLUMNS.filter((c) => !hidden[c.key] || revealed.has(`${v.v1}:${c.key}`)).flatMap((c) => v[c.key].split('/').map((w) => w.trim())),
    ];
    setSpeakingKey(v.v1);
    speakSequence(words, () => setSpeakingKey(null));
  };

  const cell = (v: VerbEntry, k: FormKey) => {
    const text = v[k];
    const key = `${v.v1}:${k}`;
    if (hidden[k] && !revealed.has(key)) {
      return (
        <button
          type="button"
          onClick={() => reveal(key)}
          aria-label={`Tampilkan ${k.toUpperCase()} dari ${v.v1}`}
          className="inline-flex min-h-10 min-w-16 items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/40 px-2.5 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Eye className="size-4" aria-hidden="true" />
          <span aria-hidden="true">?</span>
        </button>
      );
    }
    return <span className={cn('text-base font-semibold', FORM_STYLE[k].text)}>{text}</span>;
  };

  const speakButton = (v: VerbEntry, withLabel = false) => {
    if (!canSpeak) return null;
    const on = speakingKey === v.v1;
    return (
      <button
        type="button"
        onClick={() => toggleSpeak(v)}
        aria-pressed={on}
        aria-label={on ? `Hentikan suara ${v.v1}` : `Dengarkan lafal ${v.v1}`}
        title="Dengarkan kata kerja ini dan bentuk-bentuknya satu per satu, dengan suara pelan"
        className={cn(
          'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
          withLabel ? 'border px-3' : 'w-9',
          on && 'bg-accent text-foreground',
        )}
      >
        {on ? <Square className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        {withLabel ? <span className="text-xs font-medium">{on ? 'Berhenti' : 'Dengarkan'}</span> : null}
      </button>
    );
  };

  const patternBadge = (v: VerbEntry) =>
    v.irregular ? (
      <Badge variant="outline" className="text-[11px]" title={PATTERN_HINT[v.pattern]}>
        {v.pattern}
      </Badge>
    ) : null;

  return (
    <div className="grid gap-5">
      <FormGuide />

      <section aria-label="Cari dan saring" className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Cari kata kerja atau arti (mis. go, membeli)"
          label="Cari kata kerja atau arti"
        />
        <div role="group" aria-label="Jenis dan pola kata kerja" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)}>
              {FILTER_LABEL[f]} <span className="text-xs opacity-80">{FILTER_COUNT[f]}</span>
            </button>
          ))}
        </div>

        <PatternGuide filter={filter} />

        <div className="grid gap-2.5 rounded-xl bg-muted/50 p-3.5 sm:p-4">
          <div className="flex items-start gap-2.5">
            <ListChecks className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">Mode hafalan</h2>
              <p className="text-sm text-muted-foreground">
                Pilih bentuk yang ingin disembunyikan, tebak dulu, lalu ketuk kotak <span className="font-semibold">?</span> untuk melihat jawabannya.
              </p>
            </div>
          </div>
          <div role="group" aria-label="Pilih bentuk yang disembunyikan" className="flex flex-wrap items-center gap-2">
            {FORM_COLUMNS.map((c) => (
              <button key={c.key} type="button" aria-pressed={hidden[c.key]} onClick={() => toggleHidden(c.key)} className={chip(hidden[c.key])}>
                {hidden[c.key] ? <EyeOff className="size-4" aria-hidden="true" /> : null}
                {c.label}
              </button>
            ))}
            {anyHidden ? (
              <button type="button" onClick={showAll} className="min-h-11 px-2 text-sm font-medium text-primary underline underline-offset-2">
                Tampilkan semua
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground" role="status" data-testid="verb-count">
          {rows.length} kata kerja
        </p>
        {letters.length > 1 ? (
          <nav aria-label="Saring menurut huruf awal" className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setLetter(null)}
              aria-pressed={activeLetter === null}
              className={cn(
                'inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                activeLetter === null ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
              )}
            >
              Semua huruf
            </button>
            {ALPHABET.map((l) => {
              const available = letters.includes(l);
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!available}
                  onClick={() => setLetter(activeLetter === l ? null : l)}
                  aria-pressed={activeLetter === l}
                  aria-label={available ? `Tampilkan kata kerja berawalan huruf ${l}` : `Tidak ada kata kerja berawalan huruf ${l}`}
                  title={available ? undefined : 'Belum ada kata kerja umum berawalan huruf ini'}
                  className={cn(
                    'inline-flex size-9 items-center justify-center rounded-lg border text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    activeLetter === l ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                    !available && 'cursor-not-allowed opacity-35 hover:bg-background',
                  )}
                >
                  {l}
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Tidak ada kata kerja yang cocok." onReset={resetSearch} />
      ) : (
        <>
          {/* Layar sempit: satu kartu per kata kerja, tanpa gulir horizontal. */}
          <ul className="grid gap-3 md:hidden" aria-label="Daftar kata kerja">
            {rows.map((v) => (
              <li key={v.v1} data-testid={`verb-card-${v.v1}`} className="grid gap-3 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-xl font-bold', FORM_STYLE.v1.text)}>{v.v1}</span>
                      {patternBadge(v)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {v.arti}
                      {v.note ? <span className="mt-0.5 block text-xs">{v.note}</span> : null}
                    </p>
                  </div>
                  {speakButton(v, true)}
                </div>
                <dl className="grid grid-cols-2 gap-2">
                  {FORM_COLUMNS.map((c) => (
                    <div key={c.key} className="grid gap-1 rounded-lg bg-muted/50 px-3 py-2">
                      <dt className={cn('text-[11px] font-bold uppercase tracking-wide', FORM_STYLE[c.key].text)}>
                        {c.label} <span className="font-normal normal-case text-muted-foreground">{c.sub}</span>
                      </dt>
                      <dd>{cell(v, c.key)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>

          {/* Layar lebar: tabel dengan lebar baca yang dibatasi. */}
          <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
            <table className="w-full table-auto text-left text-sm" data-testid="verb-table">
              <caption className="sr-only">Tabel 5 bentuk kata kerja umum</caption>
              <thead className="bg-muted/60 text-xs uppercase tracking-wide">
                <tr>
                  <th scope="col" className={cn('px-4 py-3 font-bold', FORM_STYLE.v1.text)}>
                    V1 <span className="block font-normal normal-case tracking-normal text-muted-foreground">Dasar</span>
                  </th>
                  {FORM_COLUMNS.map((c) => (
                    <th key={c.key} scope="col" className={cn('px-4 py-3 font-bold', FORM_STYLE[c.key].text)}>
                      {c.label} <span className="block font-normal normal-case tracking-normal text-muted-foreground">{c.sub}</span>
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 font-bold text-muted-foreground">
                    Arti
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((v) => (
                  <tr key={v.v1} className="align-middle even:bg-muted/20 hover:bg-muted/50" data-testid={`verb-row-${v.v1}`}>
                    <th scope="row" className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('text-lg font-bold', FORM_STYLE.v1.text)}>{v.v1}</span>
                        {speakButton(v)}
                        {patternBadge(v)}
                      </span>
                    </th>
                    {FORM_COLUMNS.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        {cell(v, c.key)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-base text-muted-foreground">
                      {v.arti}
                      {v.note ? <span className="mt-0.5 block text-xs">{v.note}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Ejaan mengikuti Inggris Amerika bila berbeda. Suara berasal dari perangkatmu, jadi kualitasnya bisa berbeda di tiap perangkat.
      </p>
    </div>
  );
}

const CATEGORY_STYLE: Record<TermCategory, string> = {
  GRAMMAR: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  KOSAKATA: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  IELTS: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
};

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
    <div className="grid gap-5">
      <section aria-label="Cari dan saring" className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5">
        <SearchBox value={query} onChange={setQuery} placeholder="Cari istilah (mis. noun, skimming)" label="Cari istilah" />
        <div role="group" aria-label="Kategori istilah" className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={chip(cat === c)}>
              {c === 'ALL' ? 'Semua' : TERM_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </section>
      <p className="text-sm font-medium text-muted-foreground" role="status" data-testid="term-count">
        {rows.length} istilah
      </p>
      {rows.length === 0 ? (
        <EmptyState
          text="Tidak ada istilah yang cocok."
          onReset={() => {
            setQuery('');
            setCat('ALL');
          }}
        />
      ) : (
        <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((t) => (
            <li key={t.term} className="grid gap-2 rounded-2xl border bg-card p-4" data-testid="term-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-primary">{t.term}</h3>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', CATEGORY_STYLE[t.category])}>
                  {TERM_CATEGORY_LABEL[t.category]}
                </span>
              </div>
              <p className="text-base font-semibold">{t.arti}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{t.penjelasan}</p>
              {t.contoh ? (
                <p className="rounded-lg border-l-4 border-primary/50 bg-muted/60 px-3 py-2 text-sm italic">{t.contoh}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GlossaryView() {
  return (
    <div className="grid w-full gap-6">
      <header className="grid gap-1.5">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold sm:text-3xl">
          <BookA className="size-7 text-primary" aria-hidden="true" />
          Glosarium
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          Kamus mini untuk belajar: hafalkan 5 bentuk kata kerja umum, dan cari arti istilah grammar, kosakata, serta IELTS dalam bahasa
          Indonesia.
        </p>
      </header>
      <Tabs defaultValue="verbs">
        <TabsList className="h-auto p-1">
          <TabsTrigger value="verbs" className="min-h-10 gap-2 px-4 text-sm">
            <BookOpen className="size-4" aria-hidden="true" />
            Verb Forms
          </TabsTrigger>
          <TabsTrigger value="terms" className="min-h-10 gap-2 px-4 text-sm">
            <ListChecks className="size-4" aria-hidden="true" />
            Istilah
          </TabsTrigger>
        </TabsList>
        <TabsContent value="verbs" className="pt-5">
          <VerbTable />
        </TabsContent>
        <TabsContent value="terms" className="pt-5">
          <TermList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
