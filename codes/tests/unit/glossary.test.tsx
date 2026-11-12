/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GlossaryView } from '@/components/glossary/glossary-view';
import { TERMS } from '@/lib/glossary-terms';
import { VERBS, toEd, toIng, toS } from '@/lib/verb-forms';

const verb = (v1: string) => VERBS.find((v) => v.v1 === v1)!;

describe('aturan Verb Forms', () => {
  it('bentuk -ing: buang e, gandakan konsonan, ie -> ying, pertahankan ee', () => {
    expect(toIng('make')).toBe('making');
    expect(toIng('have')).toBe('having');
    expect(toIng('run')).toBe('running');
    expect(toIng('begin')).toBe('beginning');
    expect(toIng('forget')).toBe('forgetting');
    expect(toIng('stop')).toBe('stopping');
    expect(toIng('see')).toBe('seeing');
    expect(toIng('be')).toBe('being');
    expect(toIng('die')).toBe('dying');
    expect(toIng('open')).toBe('opening'); // tekanan di awal: tidak digandakan
    expect(toIng('visit')).toBe('visiting');
  });
  it('bentuk -s/es', () => {
    expect(toS('go')).toBe('goes');
    expect(toS('do')).toBe('does');
    expect(toS('have')).toBe('has');
    expect(toS('watch')).toBe('watches');
    expect(toS('push')).toBe('pushes');
    expect(toS('study')).toBe('studies');
    expect(toS('play')).toBe('plays');
    expect(toS('buy')).toBe('buys');
    expect(toS('fly')).toBe('flies');
  });
  it('V2/V3 beraturan', () => {
    expect(toEd('arrive')).toBe('arrived');
    expect(toEd('carry')).toBe('carried');
    expect(toEd('stay')).toBe('stayed');
    expect(toEd('plan')).toBe('planned');
    expect(toEd('prefer')).toBe('preferred');
    expect(toEd('travel')).toBe('traveled');
    expect(toEd('work')).toBe('worked');
  });
});

describe('data verb forms', () => {
  it('memuat 5 bentuk lengkap, arti terisi, tanpa duplikat V1', () => {
    expect(VERBS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(VERBS.map((v) => v.v1)).size).toBe(VERBS.length);
    for (const v of VERBS) {
      for (const f of [v.v1, v.v2, v.v3, v.ing, v.s, v.arti]) expect(f.trim(), v.v1).not.toBe('');
      expect(v.ing.endsWith('ing'), v.v1).toBe(true);
    }
  });
  it('kata kerja kunci benar (bentuk tak beraturan umum)', () => {
    expect(verb('go')).toMatchObject({ v2: 'went', v3: 'gone', ing: 'going', s: 'goes', pattern: 'A-B-C' });
    expect(verb('buy')).toMatchObject({ v2: 'bought', v3: 'bought', pattern: 'A-B-B' });
    expect(verb('put')).toMatchObject({ v2: 'put', v3: 'put', pattern: 'A-A-A', ing: 'putting' });
    expect(verb('come')).toMatchObject({ v2: 'came', v3: 'come', pattern: 'A-B-A', ing: 'coming' });
    expect(verb('study')).toMatchObject({ v2: 'studied', v3: 'studied', s: 'studies', pattern: 'BERATURAN' });
    expect(verb('be')).toMatchObject({ v2: 'was / were', v3: 'been', ing: 'being' });
  });
  it('urut abjad', () => {
    const names = VERBS.map((v) => v.v1);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('GlossaryView', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('menampilkan tabel 5 bentuk dan mencari berdasarkan kata atau arti', () => {
    render(<GlossaryView />);
    const row = screen.getByTestId('verb-row-go');
    expect(within(row).getByText('went')).toBeTruthy();
    expect(within(row).getByText('gone')).toBeTruthy();
    expect(within(row).getByText('going')).toBeTruthy();
    expect(within(row).getByText('goes')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Cari kata kerja atau arti'), { target: { value: 'membeli' } });
    expect(screen.getByTestId('verb-count').textContent).toBe('1 kata kerja');
    expect(screen.getByTestId('verb-row-buy')).toBeTruthy();
  });

  it('filter tidak beraturan hanya menampilkan verb tak beraturan', () => {
    render(<GlossaryView />);
    fireEvent.click(screen.getByRole('button', { name: /^Tidak beraturan/ }));
    expect(screen.queryByTestId('verb-row-work')).toBeNull();
    expect(screen.getByTestId('verb-row-write')).toBeTruthy();
  });

  it('filter pola A-B-C, A-B-A, A-B-B, A-A-A, dan Beraturan, lengkap dengan penjelasan', () => {
    render(<GlossaryView />);
    const guide = () => screen.getByTestId('pattern-guide').textContent ?? '';
    expect(guide()).toContain('Apa arti A-B-C');
    fireEvent.click(screen.getByRole('button', { name: /^A-B-C/ }));
    expect(screen.getByTestId('verb-row-go')).toBeTruthy();
    expect(screen.queryByTestId('verb-row-buy')).toBeNull();
    expect(guide()).toContain('Ketiga bentuk berbeda semua');
    fireEvent.click(screen.getByRole('button', { name: /^A-B-A/ }));
    expect(screen.getByTestId('verb-row-come')).toBeTruthy();
    expect(screen.queryByTestId('verb-row-go')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^A-B-B/ }));
    expect(screen.getByTestId('verb-row-buy')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^A-A-A/ }));
    expect(screen.getByTestId('verb-row-put')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Beraturan/ }));
    expect(screen.getByTestId('verb-row-work')).toBeTruthy();
    expect(screen.queryByTestId('verb-row-put')).toBeNull();
    expect(screen.getByTestId('verb-count').textContent).toMatch(/^\d+ kata kerja$/);
  });

  it('filter huruf: klik B hanya menampilkan kata berawalan B, klik lagi atau Semua huruf mengembalikan', () => {
    render(<GlossaryView />);
    const all = Number(screen.getByTestId('verb-count').textContent?.split(' ')[0]);
    // Alfabet ditampilkan utuh; huruf tanpa kata kerja dinonaktifkan.
    expect((screen.getByRole('button', { name: 'Tidak ada kata kerja berawalan huruf Z' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan kata kerja berawalan huruf B' }));
    const rows = screen.getAllByTestId(/^verb-row-/);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(all);
    expect(rows.every((r) => r.getAttribute('data-testid')!.replace('verb-row-', '').startsWith('b'))).toBe(true);
    expect(screen.queryByTestId('verb-row-go')).toBeNull();
    expect(screen.getByTestId('verb-count').textContent).toBe(`${rows.length} kata kerja`);
    // Huruf lain tetap tersedia, dan digabung dengan filter pola.
    fireEvent.click(screen.getByRole('button', { name: /^A-B-B/ }));
    expect(screen.getByTestId('verb-row-buy')).toBeTruthy();
    expect(screen.queryByTestId('verb-row-bring')).toBeTruthy();
    expect(screen.queryByTestId('verb-row-build')).toBeTruthy();
    expect(screen.queryByTestId('verb-row-catch')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan kata kerja berawalan huruf B' }));
    expect(screen.getByTestId('verb-row-catch')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Semua \d/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan kata kerja berawalan huruf C' }));
    expect(screen.queryByTestId('verb-row-go')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Semua huruf' }));
    expect(screen.getByTestId('verb-count').textContent).toBe(`${all} kata kerja`);
  });

  it('mode hafalan: sembunyikan V2, ketuk untuk membuka, dan reset', () => {
    render(<GlossaryView />);
    fireEvent.click(screen.getByRole('button', { name: 'V2' }));
    const row = screen.getByTestId('verb-row-go');
    expect(within(row).queryByText('went')).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Tampilkan V2 dari go' }));
    expect(within(row).getByText('went')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan semua' }));
    expect(within(screen.getByTestId('verb-row-run')).getByText('ran')).toBeTruthy();
  });

  it('tab Istilah: daftar, pencarian, dan filter kategori', () => {
    render(<GlossaryView />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Istilah' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: 'Istilah' }));
    expect(screen.getByTestId('term-count').textContent).toBe(`${TERMS.length} istilah`);
    fireEvent.change(screen.getByLabelText('Cari istilah'), { target: { value: 'skimming' } });
    expect(screen.getByTestId('term-count').textContent).toBe('1 istilah');
    fireEvent.change(screen.getByLabelText('Cari istilah'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'IELTS' }));
    expect(screen.getAllByTestId('term-card').every((c) => c.textContent?.includes('IELTS'))).toBe(true);
  });

  it('audio: mengucapkan 5 bentuk berurutan dengan pelan, melewati bentuk yang disembunyikan', () => {
    vi.useFakeTimers();
    const spoken: Array<{ text: string; rate: number }> = [];
    class FakeUtterance {
      text: string;
      rate = 1;
      lang = '';
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel: () => undefined,
        speak: (u: FakeUtterance) => {
          spoken.push({ text: u.text, rate: u.rate });
          u.onend?.();
        },
      },
    });
    try {
      render(<GlossaryView />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Dengarkan lafal go' })[0]!);
      vi.advanceTimersByTime(10_000);
      expect(spoken.map((s) => s.text)).toEqual(['go', 'went', 'gone', 'going', 'goes']);
      expect(spoken.every((s) => s.rate < 0.8)).toBe(true);

      spoken.length = 0;
      fireEvent.click(screen.getByRole('button', { name: 'V3' }));
      fireEvent.click(screen.getAllByRole('button', { name: 'Dengarkan lafal go' })[0]!);
      vi.advanceTimersByTime(10_000);
      expect(spoken.map((s) => s.text)).toEqual(['go', 'went', 'going', 'goes']);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(window, 'speechSynthesis');
    }
  });
});
