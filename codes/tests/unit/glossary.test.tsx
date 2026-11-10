/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('mode hafalan: sembunyikan V2, ketuk untuk membuka, dan reset', () => {
    render(<GlossaryView />);
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan V2' }));
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
});
