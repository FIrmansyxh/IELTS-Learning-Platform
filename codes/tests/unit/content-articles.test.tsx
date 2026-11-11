/** @vitest-environment jsdom */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { checkPengantar } from '../../content/_src/check-pengantar.mjs';
import { extractToc, MarkdownArticle } from '../../src/components/player/markdown-article';
import { enhanceMarkdown } from '../../src/components/player/markdown-enhance';

/**
 * Standar Materi Diperkaya (backlog C-12): artikel panjang dan terstruktur, banyak tabel dan contoh,
 * callout, serta drill bervariasi. Berlaku untuk sub-modul yang sudah ditulis ulang (MODUL_DIPERKAYA).
 */
const ROOT = path.resolve(__dirname, '..', '..', 'content', 'gt-modules');
/** Drill yang dikunci tes E2E (kunci jawaban dibaca dari content.json); hanya artikelnya yang diperkaya. */
const DRILL_DIKUNCI_E2E = new Set(['3.3.3']);
/** Semua paket di gt-modules (seluruh 40 sub-modul) wajib memenuhi standar C-12. */
const MODUL_DIPERKAYA = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

type Q = { question_type: string; question_id: string };
type Pkg = {
  sub_modules: Array<{
    sub_module_code: string;
    materials: { article_markdown: string; mini_task?: { task_type: string } };
    active_drill: { questions: Q[] };
  }>;
};

const load = (code: string): Pkg['sub_modules'][number] =>
  (JSON.parse(readFileSync(path.join(ROOT, code, 'content.json'), 'utf8')) as Pkg).sub_modules[0]!;

describe('Materi Diperkaya (C-12)', () => {
  it('semua kode yang diwajibkan punya content.json', () => {
    expect(MODUL_DIPERKAYA.length).toBe(40);
    for (const c of MODUL_DIPERKAYA) expect(existsSync(path.join(ROOT, c, 'content.json')), c).toBe(true);
  });

  it('folder gt-modules hanya berisi folder paket (start-local mengimpor semua isinya)', () => {
    for (const e of readdirSync(ROOT, { withFileTypes: true })) {
      expect(e.isDirectory(), e.name).toBe(true);
      expect(existsSync(path.join(ROOT, e.name, 'content.json')), e.name).toBe(true);
    }
  });

  for (const code of MODUL_DIPERKAYA) {
    describe(`sub-modul ${code}`, () => {
      const sm = load(code);
      const md = sm.materials.article_markdown;

      it('artikel >= 1.500 kata dan memuat 8 bagian bernomor/berjudul', () => {
        expect(md.split(/\s+/).length).toBeGreaterThanOrEqual(1500);
        const h2 = extractToc(md).filter((t) => t.level === 2);
        expect(h2.length).toBeGreaterThanOrEqual(8);
        expect(md).toMatch(/## Tujuan Belajar/);
        expect(md).toMatch(/Ringkasan 30 detik/);
        expect(md).toMatch(/Kesalahan Umum/);
        expect(md).toMatch(/Strategi IELTS/);
        expect(md).toMatch(/Contoh Jawaban Model/);
        expect(md).toMatch(/Cek Diri/);
      });

      it('pengantar dasar (C-20): pembuka "Mulai dari Sini" dan paragraf pengantar di tiap bagian bernomor', () => {
        expect(checkPengantar(md)).toEqual([]);
        // Pembuka adalah butir pertama daftar isi dan dirender sebagai callout berlabel "Pengantar".
        expect(extractToc(md)[0]?.text).toBe('Mulai dari Sini');
        const { container, unmount } = render(<MarkdownArticle markdown={md} />);
        const intro = container.querySelector('aside[data-callout="pengantar"]');
        expect(intro).not.toBeNull();
        expect(intro?.textContent ?? '').toMatch(/^Pengantar/);
        expect(intro?.querySelectorAll('p').length ?? 0).toBeGreaterThanOrEqual(4);
        unmount();
      });

      it('dirender tanpa sisa sintaks tabel/callout mentah, dengan banyak tabel dan >= 2 callout', () => {
        const { container } = render(<MarkdownArticle markdown={md} />);
        expect(container.querySelectorAll('table').length).toBeGreaterThanOrEqual(8);
        expect(container.textContent ?? '').not.toMatch(/\|---|:::tips|:::kesalahan/);
        expect(md.match(/:::tips-examiner/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
        expect(md.match(/:::kesalahan-umum/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
      });

      it('drill >= 12 soal, id unik, >= 5 tipe soal berbeda, ada mini-task (AI atau latihan mandiri)', () => {
        const qs = sm.active_drill.questions;
        expect(qs.length).toBeGreaterThanOrEqual(12);
        expect(new Set(qs.map((q) => q.question_id)).size).toBe(qs.length);
        expect(new Set(qs.map((q) => q.question_type)).size).toBeGreaterThanOrEqual(DRILL_DIKUNCI_E2E.has(code) ? 4 : 5);
        expect(['AI_SHORT_WRITING', 'AI_SHORT_SPEAKING', 'SELF_CHECK']).toContain(sm.materials.mini_task?.task_type);
      });
    });
  }

  it('materi interaktif (C-14): Cek diri menjadi komponen, tanpa sintaks directive mentah yang bocor', () => {
    for (const code of MODUL_DIPERKAYA) {
      const md = load(code).materials.article_markdown;
      const enhanced = enhanceMarkdown(md);
      expect(enhanced, `${code}: Cek diri gagal dikonversi`).toContain(':::selfcheck');
      expect(enhanced, `${code}: kunci masih tampil sebagai teks`).not.toContain('**Kunci:**');
      const { container, unmount } = render(<MarkdownArticle markdown={md} />);
      expect(container.textContent ?? '', `${code}: directive mentah bocor`).not.toMatch(/:::|Q\| |A\| /);
      expect(container.querySelector('figure[aria-label="Cek diri"]'), `${code}: komponen Cek diri tidak dirender`).not.toBeNull();
      unmount();
    }
  });

  it('diagram interaktif (C-14): materi utama memuat minimal 25 blok diagram/komponen', () => {
    let n = 0;
    for (const code of MODUL_DIPERKAYA) {
      n += (load(code).materials.article_markdown.match(/^:::(flow|timeline|layers|compare|flip|quiz|checklist)$/gm) ?? []).length;
    }
    expect(n).toBeGreaterThanOrEqual(25);
  });

  it('soal isian tidak membocorkan jawaban lewat kurung petunjuk (semua opsi di kurung = jawaban yang diterima)', () => {
    for (const e of readdirSync(ROOT, { withFileTypes: true })) {
      const sm = load(e.name) as unknown as { active_drill: { questions: Array<Q & { prompt: string; correct_answers?: string[] }> } };
      for (const q of sm.active_drill.questions) {
        if (q.question_type !== 'FILL_IN_BLANK') continue;
        const m = q.prompt.match(/\(([^)]*)\)\s*\.?$/);
        if (!m) continue;
        const answers = (q.correct_answers ?? []).map((x) => x.toLowerCase());
        const parts = m[1]!.split('/').map((x) => x.trim().toLowerCase());
        expect(parts.every((x) => answers.includes(x)), `${e.name} ${q.question_id} membocorkan jawaban: ${m[0]}`).toBe(false);
      }
      for (const q of sm.active_drill.questions) {
        if (q.question_type !== 'FILL_IN_BLANK') continue;
        const answers = (q.correct_answers ?? []).map((x) => x.toLowerCase());
        const quoted = [...q.prompt.matchAll(/"([^"]+)"/g)].map((x) => x[1]!.trim().toLowerCase());
        expect(quoted.filter((x) => answers.includes(x)), `${e.name} ${q.question_id} memuat jawaban di dalam tanda kutip`).toEqual([]);
      }
    }
  });

  it('peta tense di 1.1.2 memuat 16 bentuk termasuk Past Future (bukan patokan 12)', () => {
    const md = load('1.1.2').materials.article_markdown;
    for (const t of ['Past Future Perfect Continuous', 'Future Perfect Continuous', 'Present Perfect Continuous', 'Past Perfect Continuous'])
      expect(md).toContain(t);
    expect(md).toMatch(/16 bentuk/);
    expect(md).not.toMatch(/Peta 12 Tense/);
  });
});
