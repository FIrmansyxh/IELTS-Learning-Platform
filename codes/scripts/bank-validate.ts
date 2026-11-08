/**
 * CLI validasi Bank Soal GT (SPEC-022): npm run bank:validate -- --dir content/gt-bank
 * Exit: 0 valid, 1 ada galat. Tidak membutuhkan database.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateBankPackage } from '../src/server/content/bank-validate';

const { values } = parseArgs({ options: { dir: { type: 'string' } } });
if (!values.dir) {
  console.error('Flag --dir wajib (folder berisi *.json bank soal).');
  process.exit(1);
}

const files = readdirSync(values.dir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`Tidak ada berkas .json di ${values.dir}`);
  process.exit(1);
}

const seenIds = new Set<string>();
let errorCount = 0;
let warnCount = 0;
let questionCount = 0;
for (const f of files) {
  const raw: unknown = JSON.parse(readFileSync(path.join(values.dir, f), 'utf8'));
  const r = validateBankPackage(raw, seenIds);
  if (r.ok) {
    const n = r.data.banks.reduce((s, b) => s + b.questions.length, 0);
    questionCount += n;
    console.log(`OK    ${f}: ${r.data.banks.length} bank, ${n} soal`);
  } else {
    console.log(`GALAT ${f}`);
    for (const e of r.errors) console.log(`  - [${e.code}] ${e.path}: ${e.message}`);
  }
  errorCount += r.ok ? 0 : r.errors.length;
  warnCount += r.warnings.length;
  for (const w of r.warnings.slice(0, 5)) console.log(`  ~ [${w.code}] ${w.path}`);
}
console.log(`\nTotal ${questionCount} soal valid, ${errorCount} galat, ${warnCount} peringatan.`);
process.exit(errorCount > 0 ? 1 : 0);
