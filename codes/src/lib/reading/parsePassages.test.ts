import { describe, expect, it } from 'vitest';
import { parsePassages, PassageParseError } from './parsePassages';

describe('parsePassages', () => {
  it('vektor uji spesifikasi: 2 teks, judul, label, tanpa label', () => {
    const out = parsePassages('# Judul\n\n[A] Para satu.\n\n[B] Para dua.\n===PASSAGE===\n# T2\n\nTanpa label.');
    expect(out).toEqual([
      {
        passage_no: 1,
        title: 'Judul',
        paragraphs: [
          { index: 0, label: 'A', text: 'Para satu.' },
          { index: 1, label: 'B', text: 'Para dua.' },
        ],
      },
      { passage_no: 2, title: 'T2', paragraphs: [{ index: 0, label: null, text: 'Tanpa label.' }] },
    ]);
  });

  it('tanpa pemisah menghasilkan 1 teks; tanpa judul memakai "Teks {n}"', () => {
    const out = parsePassages('Satu.\n\nDua.');
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe('Teks 1');
    expect(out[0]!.paragraphs.map((p) => p.text)).toEqual(['Satu.', 'Dua.']);
  });

  it('4 pemisah melempar too_many_passages (juga 3 pemisah = 4 teks)', () => {
    const four = ['a', 'b', 'c', 'd', 'e'].join('\n===PASSAGE===\n');
    expect(() => parsePassages(four)).toThrowError(PassageParseError);
    try {
      parsePassages(four);
    } catch (e) {
      expect((e as PassageParseError).code).toBe('too_many_passages');
    }
    expect(() => parsePassages(['a', 'b', 'c', 'd'].join('\n===PASSAGE===\n'))).toThrow();
    expect(parsePassages(['a', 'b', 'c'].join('\n===PASSAGE===\n'))).toHaveLength(3);
  });

  it('label duplikat dalam satu teks melempar duplicate_paragraph_label; antar-teks boleh', () => {
    try {
      parsePassages('[A] x\n\n[A] y');
      expect.unreachable();
    } catch (e) {
      expect((e as PassageParseError).code).toBe('duplicate_paragraph_label');
    }
    expect(() => parsePassages('[A] x\n===PASSAGE===\n[A] y')).not.toThrow();
  });

  it('pemisah hanya bila baris PERSIS ===PASSAGE=== (spasi lain = teks biasa)', () => {
    expect(parsePassages('a\n ===PASSAGE===\nb')).toHaveLength(1);
  });

  it('label hanya satu huruf besar diikuti satu spasi; CRLF didukung', () => {
    const out = parsePassages('[a] kecil\r\n\r\n[AB] dua\r\n\r\n[C]tanpa spasi');
    expect(out[0]!.paragraphs.every((p) => p.label === null)).toBe(true);
  });
});

describe('parsePassages: normalisasi akhir baris & baris kosong (F-10-01)', () => {
  it('CRLF + label ganda tetap terdeteksi', () => {
    expect(() => parsePassages('[A] one\r\n\r\n[A] two')).toThrowError(PassageParseError);
  });
  it('CRLF sama dengan LF', () => {
    const lf = '# J\n\n[A] satu\n\n[B] dua\n===PASSAGE===\ntiga';
    expect(parsePassages(lf.replace(/\n/g, '\r\n'))).toEqual(parsePassages(lf));
  });
  it('baris kosong berisi spasi memisahkan paragraf; label dengan tab bukan label', () => {
    expect(parsePassages('satu\n  \ndua')[0]!.paragraphs.map((p) => p.text)).toEqual(['satu', 'dua']);
    expect(parsePassages('[A]\tsatu')[0]!.paragraphs[0]!.label).toBeNull();
  });
  it('pemisah di awal/akhir/berurutan menghasilkan bagian kosong yang tetap dihitung', () => {
    expect(parsePassages('one\n===PASSAGE===\n')).toHaveLength(2);
    expect(parsePassages('===PASSAGE===\nonly')).toHaveLength(2);
    expect(parsePassages('a\n===PASSAGE===\n===PASSAGE===\nb')).toHaveLength(3);
  });
});
