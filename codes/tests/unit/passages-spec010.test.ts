import { describe, expect, it } from 'vitest';
import { duplicateLabels, MAX_PASSAGES, parsePassages, splitPassages } from '@/server/content/passages';
import { parseContentPackage } from '@/server/content/validate';
import { pkg, Q, subItem } from '../fixtures/content/builders';

/** Vektor uji WAJIB SPEC-010 untuk sisi server (utilitas validator SPEC-004). */
const VECTOR = '# Judul\n\n[A] Para satu.\n\n[B] Para dua.\n===PASSAGE===\n# T2\n\nTanpa label.';

const drillIssues = (reading_passage_markdown: string, passage_no?: number) =>
  parseContentPackage(pkg({ sub_modules: [subItem({ active_drill: { time_limit_seconds: 300, reading_passage_markdown, questions: [Q.mcq({ passage_no })] } })] } as never));
const codes = (r: ReturnType<typeof parseContentPackage>) => (r.ok ? [] : r.errors.map((e) => e.code));

describe('SPEC-010 kontrak format teks bacaan (server)', () => {
  it('vektor uji: 2 teks; label paragraf teks 1 = A,B; teks 2 tanpa label', () => {
    const ps = parsePassages(VECTOR);
    expect(ps).toHaveLength(2);
    expect(ps[0]!.index).toBe(1);
    expect(ps[0]!.labels).toEqual(['A', 'B']);
    expect(ps[0]!.text.startsWith('# Judul')).toBe(true);
    expect(ps[1]!.labels).toEqual([]);
    expect(ps[1]!.text).toContain('# T2');
  });

  it('tanpa pemisah -> 1 teks; maksimum 3 teks', () => {
    expect(splitPassages('Hanya satu.\n\n[A] dua')).toHaveLength(1);
    expect(MAX_PASSAGES).toBe(3);
  });

  it('pemisah harus PERSIS ===PASSAGE=== pada barisnya sendiri', () => {
    expect(splitPassages('a\n===PASSAGE=== \nb')).toHaveLength(1);
    expect(splitPassages('a\n ===PASSAGE===\nb')).toHaveLength(1);
    expect(splitPassages('a\r\n===PASSAGE===\r\nb')).toHaveLength(2);
  });

  it('3 teks lolos; 4 teks (3 pemisah) -> too_many_passages; 5 teks juga', () => {
    const n = (k: number) => Array.from({ length: k }, (_, i) => `T${i + 1}`).join('\n===PASSAGE===\n');
    expect(codes(drillIssues(n(3)))).not.toContain('too_many_passages');
    expect(codes(drillIssues(n(4)))).toContain('too_many_passages');
    expect(codes(drillIssues(n(5)))).toContain('too_many_passages');
  });

  it('label ganda dalam satu teks -> duplicate_paragraph_label; label sama di teks berbeda diperbolehkan', () => {
    expect(codes(drillIssues('[A] Satu.\n\n[B] Dua.\n\n[A] Lagi.'))).toContain('duplicate_paragraph_label');
    expect(duplicateLabels(parsePassages('[A] x\n\n[A] y')[0]!)).toEqual(['A']);
    expect(codes(drillIssues('[A] Satu.\n===PASSAGE===\n[A] Satu lagi.'))).not.toContain('duplicate_paragraph_label');
  });

  it('label hanya huruf besar A-Z + satu spasi; [a] atau [AB] bukan label', () => {
    expect(parsePassages('[a] kecil\n\n[AB] dua\n\n[C]tanpaspasi\n\n[D] ok')[0]!.labels).toEqual(['D']);
  });

  it('passage_no melebihi jumlah teks atau tanpa teks -> passage_out_of_range', () => {
    expect(codes(drillIssues('Satu bagian.', 2))).toContain('passage_out_of_range');
    expect(codes(drillIssues('Satu bagian.', 1))).not.toContain('passage_out_of_range');
    expect(codes(drillIssues('A\n===PASSAGE===\nB', 2))).not.toContain('passage_out_of_range');
  });
});
