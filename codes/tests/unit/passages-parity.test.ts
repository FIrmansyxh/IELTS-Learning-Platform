import { describe, expect, it } from 'vitest';
import { normalizeNewlines } from '@/lib/reading/passage-core';
import { parsePassages as clientParse, PassageParseError } from '@/lib/reading/parsePassages';
import { duplicateLabels, MAX_PASSAGES, parsePassages as serverParse, splitPassages } from '@/server/content/passages';
import { parseContentPackage } from '@/server/content/validate';
import { pkg, Q, subItem } from '../fixtures/content/builders';

/** Fixture dari QA W5 F-10-01 (a-d) + variasi. Server dan klien harus memecah IDENTIK (paritas). */
const FIXTURES: Record<string, string> = {
  'CRLF + label ganda': '[A] one\r\n\r\n[A] two',
  'baris kosong berisi spasi + label ganda': '[A] one\n  \n[A] two',
  'baris kosong berisi tab + label ganda': '[A] one\n\t\n[A] two',
  'label dengan tab bukan label': '[A]\tone\n\n[A]\ttwo',
  'pemisah di akhir': 'one\n===PASSAGE===\n',
  'pemisah di awal': '===PASSAGE===\nonly',
  'pemisah berurutan': 'one\n===PASSAGE===\n===PASSAGE===\ntwo',
  'CRLF dengan pemisah': '# T1\r\n\r\n[A] a\r\n===PASSAGE===\r\n# T2\r\n\r\n[A] b\r\n\r\n[B] c',
  'CR lama (Mac)': '[A] a\r\r[B] b\r===PASSAGE===\r[A] c',
  'empat bagian': 'a\n===PASSAGE===\nb\n===PASSAGE===\nc\n===PASSAGE===\nd',
  'tiga bagian valid': 'a\n===PASSAGE===\n[A] b\n\n[B] c\n===PASSAGE===\nd',
  'pemisah dengan spasi bukan pemisah': 'a\n===PASSAGE=== \nb',
  'label kecil/ganda huruf': '[a] x\n\n[AB] y\n\n[C]z\n\n[D] ok',
  'vektor spesifikasi': '# Judul\n\n[A] Para satu.\n\n[B] Para dua.\n===PASSAGE===\n# T2\n\nTanpa label.',
};

describe('paritas parser server vs klien (F-10-01)', () => {
  for (const [name, md] of Object.entries(FIXTURES)) {
    it(name, () => {
      const server = serverParse(md);
      const dups = server.flatMap((p) => duplicateLabels(p));
      expect(splitPassages(md)).toHaveLength(server.length);
      if (server.length > MAX_PASSAGES) {
        expect(() => clientParse(md)).toThrowError(expect.objectContaining({ code: 'too_many_passages' }));
      } else if (dups.length > 0) {
        expect(() => clientParse(md)).toThrowError(expect.objectContaining({ code: 'duplicate_paragraph_label' }));
        expect(() => clientParse(md)).toThrowError(PassageParseError);
      } else {
        const client = clientParse(md);
        expect(client.map((p) => p.passage_no)).toEqual(server.map((p) => p.index));
        expect(client.map((p) => p.paragraphs.flatMap((x) => (x.label ? [x.label] : [])))).toEqual(server.map((p) => p.labels));
      }
    });
  }

  it('normalisasi CRLF tunggal: CRLF/CR/LF memberi hasil sama di kedua sisi', () => {
    const lf = '# T1\n\n[A] a\n===PASSAGE===\n# T2\n\n[A] b\n\n[B] c';
    for (const variant of [lf.replace(/\n/g, '\r\n'), lf.replace(/\n/g, '\r')]) {
      expect(normalizeNewlines(variant)).toBe(lf);
      expect(clientParse(variant)).toEqual(clientParse(lf));
      expect(serverParse(variant)).toEqual(serverParse(lf));
    }
  });

  it('kasus QA yang dulu lolos validasi namun gagal tampil kini DITOLAK validator', () => {
    const issues = (md: string) => {
      const r = parseContentPackage(pkg({ sub_modules: [subItem({ active_drill: { time_limit_seconds: 300, reading_passage_markdown: md, questions: [Q.mcq({})] } })] } as never));
      return r.ok ? [] : r.errors.map((e) => e.code);
    };
    expect(issues(FIXTURES['CRLF + label ganda']!)).toContain('duplicate_paragraph_label');
    expect(issues(FIXTURES['baris kosong berisi spasi + label ganda']!)).toContain('duplicate_paragraph_label');
    expect(issues(FIXTURES['pemisah di akhir']!)).toContain('empty_passage');
    expect(issues(FIXTURES['pemisah di awal']!)).toContain('empty_passage');
    expect(issues(FIXTURES['pemisah berurutan']!)).toContain('empty_passage');
    expect(issues(FIXTURES['tiga bagian valid']!)).toEqual([]);
  });

  it('passage_no memetakan ke bagian yang sama di kedua sisi (bagian kosong dihitung)', () => {
    expect(serverParse('one\n===PASSAGE===\n')).toHaveLength(clientParse('one\n===PASSAGE===\n').length);
    expect(serverParse('===PASSAGE===\nonly')).toHaveLength(2);
  });
});
