import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { labelParagraphs, PassageMarkdown } from './passage-markdown';

describe('PassageMarkdown (teks bacaan Reading)', () => {
  it('judul ## dan ### dirender sebagai heading, bukan teks mentah', () => {
    render(<PassageMarkdown markdown={'## Section 1: Teks Sehari-hari\n\n### Text A: Gym\n\nOpen daily.'} />);
    expect(screen.getByRole('heading', { name: 'Section 1: Teks Sehari-hari' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Text A: Gym' })).toBeInTheDocument();
    expect(screen.getByTestId('passage-markdown').textContent).not.toContain('##');
  });

  it('label paragraf [A] menjadi huruf tebal', () => {
    expect(labelParagraphs('[A] First.\r\n\r\n[B] Second.')).toBe('**A** First.\n\n**B** Second.');
    render(<PassageMarkdown markdown={'[A] First paragraph.'} />);
    expect(screen.getByText('A').tagName).toBe('STRONG');
  });

  it('HTML mentah tidak dirender', () => {
    render(<PassageMarkdown markdown={'Hello <img src=x onerror=alert(1)> world'} />);
    expect(document.querySelector('img')).toBeNull();
  });
});
