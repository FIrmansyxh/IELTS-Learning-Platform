/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownArticle } from '../../src/components/player/markdown-article';
import { enhanceLevels, enhanceMarkdown, enhanceSelfCheck } from '../../src/components/player/markdown-enhance';

const CEK = [
  '## 8. Ringkasan dan Cek Diri',
  '',
  '**Cek diri (tanpa melihat materi):**',
  '1. *Apa kepanjangan DRE?*',
  '2. *Berapa panjang jawaban Part 1 yang ideal?*',
  '3. *Pukul berapa "quarter to four"?*',
  '',
  '**Kunci:** 1. Direct answer, Reason, Example. 2. 2-4 kalimat. 3. 3.45.',
].join('\n');

describe('markdown-enhance', () => {
  it('Cek diri menjadi :::selfcheck dengan Q dan A yang sejajar (angka desimal pada kunci aman)', () => {
    const out = enhanceSelfCheck(CEK);
    expect(out).toContain(':::selfcheck');
    expect(out).toContain('Q| *Apa kepanjangan DRE?*');
    expect(out).toContain('A| Direct answer, Reason, Example.');
    expect(out).toContain('A| 3.45.');
    expect(out).not.toContain('**Kunci:**');
    expect(out).toContain('## 8. Ringkasan dan Cek Diri');
  });

  it('jumlah kunci tidak cocok: teks asli dibiarkan', () => {
    const bad = CEK.replace('2. 2-4 kalimat. 3. 3.45.', '2. 2-4 kalimat.');
    expect(enhanceSelfCheck(bad)).toBe(bad);
  });

  it('butir Band satu baris menjadi :::levels; butir bercabang dibiarkan', () => {
    const md = ['- **Band 5:** saya go.', '- **Band 6:** I went there.', '- **Band 7:** I went there last year, which was great.'].join('\n');
    const out = enhanceLevels(md);
    expect(out).toContain(':::levels');
    expect(out).toContain('Band 7| I went there last year, which was great.');
    const multi = ['- **Band 5:** a', '- **Band 7:** b', '  paragraf lanjutan'].join('\n');
    expect(enhanceLevels(multi)).toBe(multi);
  });

  it('idempoten dan tidak menyentuh teks tanpa pola', () => {
    expect(enhanceMarkdown('Teks biasa')).toBe('Teks biasa');
    const once = enhanceMarkdown(CEK);
    expect(enhanceMarkdown(once)).toBe(once);
  });
});

describe('blok interaktif di MarkdownArticle', () => {
  it('flow: langkah berurutan sebagai daftar bernomor', () => {
    render(<MarkdownArticle markdown={':::flow\nIntro | Parafrase soal\nBody | Satu ide per paragraf\nConclusion | Ulangi posisi\n:::'} />);
    const items = within(screen.getByRole('figure', { name: 'Diagram' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Intro');
    expect(items[2]).toHaveTextContent('Ulangi posisi');
  });

  it('timeline: penanda lampau, sekarang, akan datang dan baris tense', () => {
    render(<MarkdownArticle markdown={':::timeline\nSimple Past | past | I visited Bali in 2022\nPresent Perfect | past-now | I have lived here since 2018\nHabit | habit | I usually walk\n:::'} />);
    const fig = screen.getByRole('figure', { name: 'Garis waktu' });
    expect(fig).toHaveTextContent('Lampau');
    expect(fig).toHaveTextContent('Akan datang');
    expect(within(fig).getAllByRole('img')).toHaveLength(3);
  });

  it('compare dan layers merender isi tanpa HTML mentah', () => {
    const { container } = render(<MarkdownArticle markdown={':::compare\nFormal | Dear Sir or Madam; Yours faithfully\nInformal | Dear Sam; Take care\n:::\n\n:::layers\nTopic | Ide utama\nExample | Contoh spesifik\n:::'} />);
    expect(container).toHaveTextContent('Yours faithfully');
    expect(container).toHaveTextContent('Contoh spesifik');
    expect(container.querySelector('script')).toBeNull();
  });

  it('flip: ketuk kartu menampilkan sisi belakang', () => {
    render(<MarkdownArticle markdown={':::flip\nborrow | meminjam dari orang lain\nlend | meminjamkan\n:::'} />);
    const card = screen.getByRole('button', { name: /borrow/ });
    expect(card).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(card).toHaveTextContent('meminjam dari orang lain');
  });

  it('quiz: jawaban benar dan salah memberi umpan balik serta penjelasan', () => {
    render(<MarkdownArticle markdown={':::quiz\nQ| Pilih yang benar\no| She cans swim\nc| She can swim\ne| Modal tanpa -s\n:::'} />);
    fireEvent.click(screen.getByRole('button', { name: /She cans swim/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Belum tepat');
    expect(screen.getByRole('status')).toHaveTextContent('Modal tanpa -s');
    fireEvent.click(screen.getByRole('button', { name: /Coba lagi/ }));
    fireEvent.click(screen.getByRole('button', { name: /She can swim/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Benar');
  });

  it('checklist: mencentang menambah progres', () => {
    render(<MarkdownArticle markdown={':::checklist\nTiga poin tercakup\nRegister konsisten\n:::'} />);
    expect(screen.getByText('0 dari 2 butir selesai')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tiga poin tercakup' }));
    expect(screen.getByText('1 dari 2 butir selesai')).toBeInTheDocument();
  });

  it('Cek diri otomatis interaktif: tampilkan jawaban, nilai sendiri, skor, ulangi', () => {
    render(<MarkdownArticle markdown={CEK} />);
    expect(screen.queryByText(/Kunci:/)).toBeNull();
    expect(screen.getByText('Skor mandiri: 0 dari 3')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Tampilkan jawaban' })[0]!);
    expect(screen.getByText(/Direct answer, Reason, Example/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jawabanku benar' }));
    expect(screen.getByText('Skor mandiri: 1 dari 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ulangi/ }));
    expect(screen.getByText('Skor mandiri: 0 dari 3')).toBeInTheDocument();
  });

  it('contoh Band otomatis berupa tab: pilih level mengganti isi', () => {
    render(<MarkdownArticle markdown={['- **Band 5:** I go yesterday.', '- **Band 7:** I went there last year, which was wonderful.'].join('\n')} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('wonderful'); // level tertinggi tampil lebih dulu
    fireEvent.click(tabs[0]!);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('I go yesterday');
  });

  it('keamanan: HTML mentah di dalam blok tidak dirender sebagai elemen', () => {
    const { container } = render(<MarkdownArticle markdown={':::flow\nA | <script>alert(1)</script>\n:::'} />);
    expect(container.querySelector('script')).toBeNull();
  });
});
