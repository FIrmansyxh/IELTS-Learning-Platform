/**
 * CLI validasi Bank Soal GT (SPEC-022): npm run bank:validate -- --dir content/gt-bank
 * Exit: 0 valid, 1 ada galat. Tidak membutuhkan database (bila berkas DB ada, dibuka read-only untuk konteks aset/ID).
 */
import './_env';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { bankContextReadonly, findBankFiles, formatBankIssue, validateBankDir } from '../src/server/content/bank-import';
import { databasePath } from '../src/server/db';
import { CONTENT_SOURCES } from './seed';

const { values } = parseArgs({ options: { dir: { type: 'string' } } });
if (!values.dir) {
  console.error('Flag --dir wajib (folder berisi *.json bank soal).');
  process.exit(1);
}

const staticSources = new Map(
  CONTENT_SOURCES.map((s) => [s.code, { licenseType: s.licenseType, shareAlike: s.shareAlike ?? false, mayStoreCopy: s.mayStoreCopy ?? false }]),
);
const dir = path.resolve(values.dir);
const found = await findBankFiles(dir);
if (found.issues.length > 0) {
  for (const i of found.issues) console.error(formatBankIssue(i));
  process.exit(1);
}
if (found.files.length === 0) {
  console.error(`Tidak ada berkas bank (*.json ber-bank_contract_version) di ${values.dir}`);
  process.exit(1);
}

const ctx = await bankContextReadonly(databasePath(), staticSources);
const r = await validateBankDir(dir, ctx, found.files);
for (const f of found.files) {
  const mine = r.errors.filter((e) => e.path.startsWith(`${f.file}:`));
  if (mine.length === 0) console.log(`OK    ${f.file}`);
  else {
    console.log(`GALAT ${f.file}`);
    for (const e of mine) console.log(`  - [${e.code}] ${e.path}: ${e.message}`);
  }
}
for (const e of r.errors.filter((x) => !found.files.some((f) => x.path.startsWith(`${f.file}:`)))) console.log(`GALAT [${e.code}] ${e.path}: ${e.message}`);
for (const w of r.warnings.slice(0, 5)) console.log(`  ~ [${w.code}] ${w.path}`);
const questionCount = r.banks.reduce((s, b) => s + b.questions.length, 0);
console.log(`\nTotal ${r.banks.length} bank, ${questionCount} soal valid, ${r.errors.length} galat, ${r.warnings.length} peringatan.`);
process.exit(r.errors.length > 0 ? 1 : 0);
