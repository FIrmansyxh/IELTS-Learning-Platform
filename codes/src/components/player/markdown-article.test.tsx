import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { extractToc, MarkdownArticle, safeHref, slugify } from './markdown-article';

describe('MarkdownArticle (keamanan render, security-standards 3.2)', () => {
  const hostile = [
    'Teks awal.',
    '',
    '<script>alert(1)</script>',
    '',
    '[xss](javascript:alert(1))',
    '',
    '![i](http://x/a.png)',
    '',
    '[aman](https://example.com/a) dan [surel](mailto:a@b.co)',
  ].join('\n');

  it('tidak membuat elemen <script>, tautan javascript: tanpa href, dan tanpa <img> dari Markdown', () => {
    const { container } = render(<MarkdownArticle markdown={hostile} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    const xss = screen.getByText('xss');
    expect(xss.closest('a')).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('tautan eksternal https membawa target _blank dan rel noopener noreferrer', () => {
    render(<MarkdownArticle markdown={hostile} />);
    const link = screen.getByRole('link', { name: 'aman' });
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'surel' })).toHaveAttribute('href', 'mailto:a@b.co');
  });

  it('directive :::tips-examiner menjadi Callout berlabel teks "Tips Examiner"', () => {
    render(<MarkdownArticle markdown={':::tips-examiner\nBaca soal dua kali.\n:::\n\n:::kesalahan-umum\nLupa -s.\n:::'} />);
    expect(screen.getByText('Tips Examiner')).toBeInTheDocument();
    expect(screen.getByText('Baca soal dua kali.')).toBeInTheDocument();
    expect(screen.getByText('Kesalahan Umum')).toBeInTheDocument();
  });

  it('":" biasa pada teks (mis. 3:ab) tidak hilang menjadi directive', () => {
    const { container } = render(<MarkdownArticle markdown="Rasio 3:ab dan Catatan: penting" />);
    expect(container.textContent).toContain('3:ab');
    expect(container.textContent).toContain('Catatan: penting');
  });

  it('heading mendapat id slug unik, h1 dirender sebagai h2, tabel dibungkus wadah scroll terkurung', () => {
    const md = '# Satu\n\n## Dua\n\n## Dua\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const { container } = render(<MarkdownArticle markdown={md} />);
    expect(container.querySelector('h1')).toBeNull();
    const ids = [...container.querySelectorAll('h2')].map((h) => h.id);
    expect(ids).toEqual(['satu', 'dua', 'dua-2']);
    expect(screen.getByRole('region', { name: /geser/i })).toContainElement(screen.getByRole('table'));
  });
});

describe('util artikel', () => {
  it('extractToc cocok dengan id render dan mengabaikan blok kode', () => {
    const toc = extractToc('## A b\n```\n## bukan\n```\n### C\n## A b');
    expect(toc.map((t) => [t.id, t.level])).toEqual([
      ['a-b', 2],
      ['c', 3],
      ['a-b-2', 2],
    ]);
  });
  it('safeHref hanya meloloskan https/http/mailto/anchor/relatif', () => {
    expect(safeHref('https://a.co')).toBeDefined();
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,x')).toBeUndefined();
    expect(safeHref('//evil.co')).toBeUndefined();
    expect(safeHref('#bagian')).toBe('#bagian');
    expect(slugify('Mengapa Pasif?')).toBe('mengapa-pasif');
  });
});
