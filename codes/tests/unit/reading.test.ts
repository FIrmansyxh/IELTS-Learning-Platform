import { describe, expect, it } from 'vitest';
import { parsePassages, PassageParseError } from '@/lib/reading/parsePassages';

describe('parsePassages (SPEC-010)', () => {
  it('parses mandatory test vector correctly', () => {
    const input = '# Judul\n\n[A] Para satu.\n\n[B] Para dua.\n===PASSAGE===\n# T2\n\nTanpa label.';
    const result = parsePassages(input);

    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      passage_no: 1,
      title: 'Judul',
      paragraphs: [
        { index: 0, label: 'A', text: 'Para satu.' },
        { index: 1, label: 'B', text: 'Para dua.' },
      ],
    });

    expect(result[1]).toEqual({
      passage_no: 2,
      title: 'T2',
      paragraphs: [
        { index: 0, label: null, text: 'Tanpa label.' },
      ],
    });
  });

  it('handles input without separator as 1 passage and defaults title to "Teks 1"', () => {
    const input = 'Just a paragraph without title or label.\n\nSecond paragraph.';
    const result = parsePassages(input);

    expect(result).toHaveLength(1);
    expect(result[0]?.passage_no).toBe(1);
    expect(result[0]?.title).toBe('Teks 1');
    expect(result[0]?.paragraphs).toHaveLength(2);
    expect(result[0]?.paragraphs[0]).toEqual({
      index: 0,
      label: null,
      text: 'Just a paragraph without title or label.',
    });
  });

  it('throws too_many_passages if more than 3 passages are present', () => {
    const input = 'P1\n===PASSAGE===\nP2\n===PASSAGE===\nP3\n===PASSAGE===\nP4';
    expect(() => parsePassages(input)).toThrow(PassageParseError);
    expect(() => parsePassages(input)).toThrow('too_many_passages');
  });

  it('throws duplicate_paragraph_label on duplicate label in the same passage', () => {
    const input = '[A] Paragraph A\n\n[A] Another paragraph with A';
    expect(() => parsePassages(input)).toThrow(PassageParseError);
    expect(() => parsePassages(input)).toThrow('duplicate_paragraph_label');
  });

  it('allows same label in different passages', () => {
    const input = '# Text 1\n\n[A] Para in P1\n===PASSAGE===\n# Text 2\n\n[A] Para in P2';
    const result = parsePassages(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.paragraphs[0]?.label).toBe('A');
    expect(result[1]?.paragraphs[0]?.label).toBe('A');
  });

  it('returns empty array on empty markdown', () => {
    expect(parsePassages('')).toEqual([]);
    expect(parsePassages('   \n\n  ')).toEqual([]);
  });
});
