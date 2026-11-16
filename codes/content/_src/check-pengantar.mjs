#!/usr/bin/env node
/**
 * Pemeriksa standar "Pengantar Dasar Materi" (backlog C-20) untuk sumber artikel di content/_src/<kode>.md.
 * Pemakaian: node content/_src/check-pengantar.mjs [kode ...]   (tanpa argumen = semua artikel)
 * Aturan yang sama dijaga tests/unit/content-articles.test.tsx terhadap content.json hasil build.
 *
 * Standar:
 *  1. Artikel dibuka `## Mulai dari Sini` (sebelum `## Tujuan Belajar`), 150-450 kata, berisi:
 *     - satu blok `:::pengantar` dengan tiga paragraf berlabel tebal:
 *       **Apa yang kamu pelajari?**, **Kenapa ini penting?**, **Bekal sebelum mulai:**
 *     - `### Istilah yang Akan Kamu Temui` + tabel 4-8 baris (Istilah | Arti sederhana | Contoh).
 *  2. Setiap bagian bernomor (`## N. ...`) dibuka paragraf biasa >= 20 kata
 *     (bukan tabel, diagram, daftar, kutipan, sub-judul, atau label tebal).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const INTRO_HEADING = '## Mulai dari Sini';
export const INTRO_LABELS = ['**Apa yang kamu pelajari?**', '**Kenapa ini penting?**', '**Bekal sebelum mulai:**'];
export const TERMS_HEADING = '### Istilah yang Akan Kamu Temui';
export const LEAD_MIN_WORDS = 20;

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const isPlainParagraph = (line) => !/^(#|\||:::|>|[-*+]\s|\d+\.\s|\*\*|```|---)/.test(line.trim());

/** Mengembalikan daftar pelanggaran (kosong = lolos). */
export function checkPengantar(markdown) {
  const issues = [];
  const md = markdown.replace(/\r\n/g, '\n');
  const lines = md.split('\n');

  if (!md.startsWith(`${INTRO_HEADING}\n`)) issues.push(`artikel harus dibuka dengan "${INTRO_HEADING}"`);
  const goalAt = md.indexOf('\n## Tujuan Belajar');
  const intro = goalAt > 0 ? md.slice(0, goalAt) : '';
  if (!intro) {
    issues.push('"## Tujuan Belajar" harus ada sesudah bagian pengantar');
  } else {
    const blocks = intro.match(/^:::pengantar\n([\s\S]*?)\n:::$/gm) ?? [];
    if (blocks.length !== 1) issues.push(`harus ada tepat satu blok :::pengantar di bagian pembuka (ditemukan ${blocks.length})`);
    for (const label of INTRO_LABELS) {
      if (!(blocks[0] ?? '').includes(label)) issues.push(`blok :::pengantar belum memuat paragraf ${label}`);
    }
    const termsAt = intro.indexOf(`\n${TERMS_HEADING}\n`);
    if (termsAt < 0) {
      issues.push(`bagian pembuka belum memuat "${TERMS_HEADING}"`);
    } else {
      const rows = intro
        .slice(termsAt)
        .split('\n')
        .filter((l) => l.trim().startsWith('|') && !/^\|\s*-/.test(l.trim()));
      const dataRows = rows.length - 1; // baris pertama = kepala tabel
      if (dataRows < 4 || dataRows > 8) issues.push(`tabel istilah harus 4-8 baris (ditemukan ${Math.max(dataRows, 0)})`);
    }
    const n = words(intro);
    if (n < 150 || n > 450) issues.push(`bagian pembuka harus 150-450 kata (sekarang ${n})`);
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^## \d+\./.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j += 1;
    const next = lines[j] ?? '';
    if (!isPlainParagraph(next) || words(next) < LEAD_MIN_WORDS) {
      issues.push(`"${lines[i]}" belum dibuka paragraf pengantar >= ${LEAD_MIN_WORDS} kata (baris berikutnya: "${next.slice(0, 40)}")`);
    }
  }
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const codes = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(here).filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f)).map((f) => f.replace(/\.md$/, '')).sort();
  let failed = 0;
  for (const code of codes) {
    const issues = checkPengantar(readFileSync(path.join(here, `${code}.md`), 'utf8'));
    if (issues.length === 0) {
      console.log(`${code}: OK`);
    } else {
      failed += 1;
      console.log(`${code}: ${issues.length} pelanggaran`);
      for (const m of issues) console.log(`   - ${m}`);
    }
  }
  console.log(failed === 0 ? `\nSemua ${codes.length} artikel lolos.` : `\n${failed} dari ${codes.length} artikel belum lolos.`);
  process.exit(failed === 0 ? 0 : 1);
}
