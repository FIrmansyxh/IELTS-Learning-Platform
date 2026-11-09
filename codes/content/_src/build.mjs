#!/usr/bin/env node
/**
 * Membangun content/gt-modules/<kode>/content.json dari sumber di content/_src/:
 *   <kode>.md          artikel materi (Markdown, callout :::tips-examiner / :::kesalahan-umum)
 *   <kode>.drill.mjs   export default { meta, mini_task, drill }  (soal ditulis sebagai objek JS)
 * Pemakaian: node content/_src/build.mjs [kode ...]   (tanpa argumen = semua yang punya .drill.mjs)
 * Folder ini sengaja di luar content/gt-modules agar tidak ikut diimpor start-local.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.join(here, '..', 'gt-modules');
const codes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(here).filter((f) => f.endsWith('.drill.mjs')).map((f) => f.replace('.drill.mjs', ''));

for (const code of codes) {
  const article = readFileSync(path.join(here, `${code}.md`), 'utf8').replace(/\r\n/g, '\n').trim();
  if (!existsSync(path.join(here, `${code}.drill.mjs`))) {
    // Mode artikel-saja: perbarui hanya materials.article_markdown pada content.json yang sudah ada
    // (drill dan mini-task dibiarkan, mis. 3.3.3 yang dipakai tes E2E).
    const file = path.join(outRoot, code, 'content.json');
    const existing = JSON.parse(readFileSync(file, 'utf8'));
    existing.sub_modules[0].materials.article_markdown = article;
    writeFileSync(file, JSON.stringify(existing, null, 2) + '\n');
    console.log(`${code}: ${article.split(/\s+/).length} kata (artikel saja) -> ${path.relative(process.cwd(), path.dirname(file))}`);
    continue;
  }
  const mod = (await import(pathToFileURL(path.join(here, `${code}.drill.mjs`)).href)).default;
  const { meta, mini_task, drill } = mod;
  const pkg = {
    contract_version: '1.1',
    sub_modules: [
      {
        ...meta,
        sub_module_code: code,
        passing_score_percent: meta.passing_score_percent ?? 75,
        origin: 'AI_GENERATED_REVIEWED',
        source_code: 'OWN',
        materials: { article_markdown: article, ...(mini_task ? { mini_task } : {}) },
        active_drill: {
          time_limit_seconds: drill.time_limit_seconds,
          pass_percent: 75,
          // Reading: maksimal 3 teks dipisah baris tunggal ===PASSAGE=== (kontrak SPEC-004).
          ...(drill.passages ? { reading_passage_markdown: drill.passages.map((p) => p.trim()).join('\n\n===PASSAGE===\n\n') } : {}),
          questions: drill.questions,
        },
      },
    ],
  };
  const dir = path.join(outRoot, code);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'content.json'), JSON.stringify(pkg, null, 2) + '\n');
  const words = article.split(/\s+/).length;
  console.log(`${code}: ${words} kata, ${drill.questions.length} soal -> ${path.relative(process.cwd(), dir)}`);
}
